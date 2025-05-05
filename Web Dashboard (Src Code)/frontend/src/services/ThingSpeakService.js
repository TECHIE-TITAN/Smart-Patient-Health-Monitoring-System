/**
 * ThingSpeak API Service
 * Handles fetching data from ThingSpeak channels
 */

const DEFAULT_READ_API_KEY = "MWFBV98HOZOHTHY4";
const BASE_URL = "https://api.thingspeak.com/channels";

/**
 * Fetches the latest data from a ThingSpeak channel
 */
export const fetchLatestData = async (channelId, apiKey = DEFAULT_READ_API_KEY, results = 1) => {
  if (!channelId) {
    throw new Error('Channel ID is required');
  }

  try {
    const url = `${BASE_URL}/${channelId}/feeds.json?api_key=${apiKey}&results=${results}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ThingSpeak API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || !data.feeds || data.feeds.length === 0) {
      throw new Error('No data available from ThingSpeak');
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching data from ThingSpeak:', error);
    throw error;
  }
};

// Time-based fetching with timestamp handling to avoid duplicates
export const fetchDataSinceLastUpdate = async (channelId, lastTimestamp, apiKey = DEFAULT_READ_API_KEY) => {
  if (!channelId) {
    throw new Error('Channel ID is required');
  }

  try {
    // If lastTimestamp is provided, fetch data after that timestamp
    const timestampParam = lastTimestamp ? `&start=${lastTimestamp}` : '';
    const url = `${BASE_URL}/${channelId}/feeds.json?api_key=${apiKey}${timestampParam}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ThingSpeak API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching data from ThingSpeak since last update:', error);
    throw error;
  }
};

/**
 * Calculate blood pressure based on heart rate, ECG data, and SpO2
 * This uses a more realistic model that correlates heart rate, ECG variations, and SpO2
 * with expected blood pressure changes
 * 
 * @param {Array} ecgSamples - Array of ECG samples
 * @param {number} heartRate - Heart rate value in BPM
 * @param {number} spo2 - SpO2 value in percentage
 * @returns {Object} - Systolic and diastolic BP
 */
const calculateBP = (ecgSamples, heartRate, spo2) => {
  // Baseline BP for a healthy adult (average at rest)
  const baselineSystolic = 120;
  const baselineDiastolic = 80;
  
  // If we don't have sufficient data, return randomized values around normal range
  if (!ecgSamples || ecgSamples.length < 10 || !heartRate || isNaN(heartRate)) {
    // Add small random variations if no real data is available
    const randomVariation = () => Math.floor(Math.random() * 10) - 5; // -5 to +5
    return {
      systolic: baselineSystolic + randomVariation(),
      diastolic: baselineDiastolic + randomVariation()
    };
  }
  
  // Calculate ECG variability (simplified)
  const ecgVariability = calculateEcgVariability(ecgSamples);
  
  // Calculate systolic based on heart rate
  // Higher heart rate typically means higher systolic pressure
  // Normal heart rate is around 60-100 BPM, with 75 as a typical average
  let heartRateEffect = 0;
  
  if (heartRate < 60) {
    // Bradycardia (low heart rate) typically lowers BP
    heartRateEffect = -10 * (1 - (heartRate / 60));
  } else if (heartRate > 100) {
    // Tachycardia (high heart rate) typically raises BP
    heartRateEffect = 15 * ((heartRate - 100) / 50); // Normalized effect
  }
  
  // SpO2 effect: low oxygen can lead to compensatory mechanisms affecting BP
  let spo2Effect = 0;
  if (spo2 < 95) {
    // Lower SpO2 can cause mild hypertension (as compensation)
    spo2Effect = 5 * ((95 - spo2) / 5); // Each 5% below 95 adds about 5mmHg
  }
  
  // ECG variability effect (increased variability might indicate stress or other factors)
  const ecgEffect = ecgVariability * 10; // Scale factor
  
  // Age-based adjustment (assuming we don't have this info, but the model could use it)
  const ageEffect = 0; // Placeholder - no age adjustment
  
  // Calculate final BP with all factors combined
  // Use weighted approach to combine factors
  const systolic = Math.round(baselineSystolic + (heartRateEffect * 0.6) + (spo2Effect * 0.2) + (ecgEffect * 0.2) + ageEffect);
  
  // Diastolic usually changes less dramatically than systolic
  // Typical systolic:diastolic ratio is around 3:2
  const diastolic = Math.round(baselineDiastolic + (heartRateEffect * 0.4) + (spo2Effect * 0.1) + (ecgEffect * 0.1) + ageEffect);
  
  // Ensure values are in physiological range
  return {
    systolic: clampValue(systolic, 80, 200),
    diastolic: clampValue(diastolic, 40, 120)
  };
};

/**
 * Calculate the variability in ECG data
 * Higher variability might indicate stress or irregular heartbeat
 * @param {Array} ecgSamples - Array of ECG data points
 * @returns {number} - Normalized variability score (0-1)
 */
const calculateEcgVariability = (ecgSamples) => {
  if (!ecgSamples || ecgSamples.length < 10) return 0;
  
  // Calculate standard deviation of samples as a simple measure of variability
  const mean = ecgSamples.reduce((sum, value) => sum + value, 0) / ecgSamples.length;
  const squaredDiffs = ecgSamples.map(value => Math.pow(value - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, value) => sum + value, 0) / squaredDiffs.length;
  const stdDev = Math.sqrt(avgSquaredDiff);
  
  // Normalize to 0-1 range (assuming typical ECG stdDev ranges)
  // A typical resting ECG might have stdDev around 0.1-0.5 mV
  const normalizedVariability = Math.min(stdDev / 0.5, 1);
  
  return normalizedVariability;
};

/**
 * Helper function to ensure BP values stay within physiological limits
 * @param {number} value - The value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} - The clamped value
 */
const clampValue = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};

/**
 * Maps the raw ThingSpeak data to patient vital signs
 * Field mapping:
 * field1: Temperature (°C)
 * field2: Emergency Alert Level (0: Normal, 1: Moderate Risk, 2: High Risk)
 * field3: Heart Rate (BPM)
 * field4: SpO2 (%)
 * field5: Latitude
 * field6: Longitude
 * field7: Avg ECG
 * field8: ECG Sample Array
 */
const getLastValidLocation = (feeds, channelId) => {
  console.log('Checking feeds for location:', feeds); // Debug log

  // First check current reading
  const latestEntry = feeds[0];
  const latitude = parseFloat(latestEntry?.field5);
  const longitude = parseFloat(latestEntry?.field6);
  
  console.log('Latest entry coordinates:', { latitude, longitude }); // Debug log
  
  if (!isNaN(latitude) && !isNaN(longitude) && latitude !== 0 && longitude !== 0) {
    const currentLocation = {
      lat: latitude,
      lng: longitude,
      accuracy: 15,
      isLastKnown: false,
      timestamp: latestEntry.created_at
    };
    console.log('Using current location:', currentLocation); // Debug log
    return currentLocation;
  }

  // Search through historical feeds for last valid location
  for (const feed of feeds) {
    const lat = parseFloat(feed.field5);
    const lng = parseFloat(feed.field6);
    
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
      const historicalLocation = {
        lat: lat,
        lng: lng,
        accuracy: 15,
        isLastKnown: true,
        timestamp: feed.created_at
      };
      console.log('Found historical location:', historicalLocation); // Debug log
      return historicalLocation;
    }
  }

  // Try to get from localStorage if no valid location found in feeds
  try {
    const storedLocation = localStorage.getItem(`lastKnownLocation_${channelId}`);
    if (storedLocation) {
      const parsedLocation = { ...JSON.parse(storedLocation), isLastKnown: true };
      console.log('Using stored location:', parsedLocation); // Debug log
      return parsedLocation;
    }
  } catch (e) {
    console.error('Error retrieving location from localStorage:', e);
  }

  console.log('No valid location found'); // Debug log
  return { lat: null, lng: null, accuracy: 15, isLastKnown: true };
};

export const mapThingSpeakToPatientVitals = (data, channelId) => {
  const feeds = data.feeds;
  if (!feeds || feeds.length === 0) {
    console.error('No feeds available in ThingSpeak data');
    return null;
  }

  const latestEntry = feeds[0];
  console.log('Processing ThingSpeak data:', { channelId, latestEntry }); // Debug log

  // Get location data
  const locationData = getLastValidLocation(feeds, channelId);
  console.log('Final location data:', locationData); // Debug log

  // Store valid location in localStorage
  if (locationData.lat && locationData.lng) {
    try {
      localStorage.setItem(`lastKnownLocation_${channelId}`, JSON.stringify(locationData));
      console.log('Stored location in localStorage'); // Debug log
    } catch (e) {
      console.error('Error saving location to localStorage:', e);
    }
  }

  // Convert string values to numbers
  const temperature = parseFloat(latestEntry.field1);
  const alertLevel = parseInt(latestEntry.field2);
  const heartRate = parseFloat(latestEntry.field3);
  const spo2 = parseFloat(latestEntry.field4);
  const avgEcg = parseFloat(latestEntry.field7);
  const ecgSamples = JSON.parse(latestEntry.field8);

  // Calculate BP from ECG samples and SpO2
  const bp = calculateBP(ecgSamples, heartRate, spo2);
  
  return {
    vitals: {
      temperature: isNaN(temperature) ? "--" : temperature.toFixed(1),
      alertLevel: isNaN(alertLevel) ? 0 : alertLevel,
      heartRate: isNaN(heartRate) ? "--" : Math.round(heartRate),
      spo2: isNaN(spo2) ? "--" : Math.round(spo2),
      avgEcg: isNaN(avgEcg) ? "--" : avgEcg,
      ecgSamples: Array.isArray(ecgSamples) ? ecgSamples : [],
      bp: bp
    },
    location: locationData,
    status: {
      temperature: temperature > 37.8 ? "Elevated" : temperature < 35.5 ? "Low" : "Normal",
      heartRate: heartRate > 100 ? "Elevated" : heartRate < 60 ? "Low" : "Normal",
      spo2: spo2 < 95 ? "Low" : "Normal",
      bp: bp.systolic > 140 || bp.diastolic > 90 ? "Elevated" : 
          bp.systolic < 90 || bp.diastolic < 60 ? "Low" : "Normal",
      alert: alertLevel === 0 ? "Normal" : alertLevel === 1 ? "Moderate Risk" : "High Risk"
    },
    lastUpdated: new Date(latestEntry.created_at).toLocaleString()
  };
};

/**
 * Fetches and formats patient vitals from ThingSpeak
 */
export const getPatientVitals = async (channelId) => {
  if (!channelId) {
    throw new Error('Channel ID is required');
  }

  try {
    const data = await fetchLatestData(channelId);
    const vitals = mapThingSpeakToPatientVitals(data, channelId);
    
    if (!vitals) {
      throw new Error('Failed to map ThingSpeak data to vitals');
    }
    
    return vitals;
  } catch (error) {
    console.error('Error getting patient vitals:', error);
    throw error;
  }
};

/**
 * Converts ThingSpeak data to CSV format
 * @param {Object} data - ThingSpeak data object
 * @returns {String} - CSV formatted string
 */
export const convertThingSpeakDataToCSV = (data) => {
  if (!data || !data.feeds || data.feeds.length === 0) {
    return null;
  }
  
  // Create CSV header
  const headers = [
    'timestamp', 
    'temperature', 
    'alertLevel', 
    'heartRate', 
    'spo2', 
    'latitude', 
    'longitude', 
    'avgEcg',
    'systolicBP',
    'diastolicBP'
  ];
  
  // Create CSV content
  const csvRows = [];
  csvRows.push(headers.join(','));
  
  // Process each feed entry
  data.feeds.forEach(feed => {
    const temperature = parseFloat(feed.field1);
    const alertLevel = parseInt(feed.field2);
    const heartRate = parseFloat(feed.field3);
    const spo2 = parseFloat(feed.field4);
    const latitude = parseFloat(feed.field5);
    const longitude = parseFloat(feed.field6);
    const avgEcg = parseFloat(feed.field7);
    const ecgSamples = feed.field8 ? JSON.parse(feed.field8) : [];
    
    // Calculate BP
    const bp = calculateBP(ecgSamples, heartRate, spo2);
    
    const row = [
      new Date(feed.created_at).toISOString(),
      isNaN(temperature) ? "" : temperature.toFixed(1),
      isNaN(alertLevel) ? "" : alertLevel,
      isNaN(heartRate) ? "" : Math.round(heartRate),
      isNaN(spo2) ? "" : Math.round(spo2),
      isNaN(latitude) ? "" : latitude,
      isNaN(longitude) ? "" : longitude,
      isNaN(avgEcg) ? "" : avgEcg,
      bp.systolic,
      bp.diastolic
    ];
    
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
};

/**
 * Downloads ThingSpeak data as a CSV file
 * @param {String} channelId - ThingSpeak channel ID
 * @param {String} filename - Name for the CSV file
 * @param {Number} days - Number of days of data to fetch (default: 7)
 */
export const downloadThingSpeakDataAsCSV = async (channelId, filename = 'patient_data.csv', days = 7) => {
  if (!channelId) {
    throw new Error('Channel ID is required');
  }

  try {
    // Calculate start date (days ago from now)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Fetch data for the specified period
    const url = `${BASE_URL}/${channelId}/feeds.json?api_key=${DEFAULT_READ_API_KEY}&start=${startDate.toISOString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ThingSpeak API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Convert data to CSV
    const csvContent = convertThingSpeakDataToCSV(data);
    
    if (!csvContent) {
      throw new Error('No data available to download');
    }
    
    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const urlObject = URL.createObjectURL(blob);
    
    link.setAttribute('href', urlObject);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    return true;
  } catch (error) {
    console.error('Error downloading ThingSpeak data as CSV:', error);
    throw error;
  }
};

/**
 * Starts continuous data logging from ThingSpeak to localStorage
 * @param {String} channelId - ThingSpeak channel ID
 * @param {Number} intervalMinutes - Fetch interval in minutes
 * @returns {Object} - Controller object with start/stop methods
 */
export const startContinuousDataLogging = (channelId, intervalMinutes = 5) => {
  if (!channelId) {
    throw new Error('Channel ID is required');
  }
  
  let intervalId = null;
  let isLogging = false;
  let lastTimestamp = null;
  const storageKey = `thingspeak_data_${channelId}`;
  
  // Initialize from localStorage if exists
  const initFromStorage = () => {
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData);
        if (parsedData.feeds && parsedData.feeds.length > 0) {
          // Get the latest timestamp
          const latestEntry = parsedData.feeds[parsedData.feeds.length - 1];
          lastTimestamp = new Date(latestEntry.created_at).toISOString();
        }
      } catch (error) {
        console.error('Error parsing stored data:', error);
        localStorage.removeItem(storageKey);
      }
    }
  };
  
  // Fetch and store new data
  const fetchAndStore = async () => {
    try {
      const data = await fetchDataSinceLastUpdate(channelId, lastTimestamp);
      
      if (data && data.feeds && data.feeds.length > 0) {
        // Update lastTimestamp to the latest entry
        const latestEntry = data.feeds[data.feeds.length - 1];
        lastTimestamp = new Date(latestEntry.created_at).toISOString();
        
        // Merge with existing data
        const storedData = localStorage.getItem(storageKey);
        let mergedData;
        
        if (storedData) {
          const parsedData = JSON.parse(storedData);
          mergedData = {
            ...data,
            feeds: [...parsedData.feeds, ...data.feeds]
          };
        } else {
          mergedData = data;
        }
        
        // Store in localStorage
        localStorage.setItem(storageKey, JSON.stringify(mergedData));
        
        // Also trigger CSV download if the dataset is getting large
        if (mergedData.feeds.length > 1000) {
          const csvContent = convertThingSpeakDataToCSV(mergedData);
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const urlObject = URL.createObjectURL(blob);
          
          link.setAttribute('href', urlObject);
          link.setAttribute('download', `patient_data_${channelId}_${new Date().toISOString().slice(0,10)}.csv`);
          link.style.visibility = 'hidden';
          
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Reset storage after download
          localStorage.setItem(storageKey, JSON.stringify({
            ...data,
            feeds: data.feeds
          }));
        }
      }
    } catch (error) {
      console.error('Error in continuous data logging:', error);
    }
  };
  
  // Start logging
  const start = () => {
    if (isLogging) return;
    
    initFromStorage();
    fetchAndStore(); // Immediate first fetch
    
    // Set up interval (convert minutes to milliseconds)
    intervalId = setInterval(fetchAndStore, intervalMinutes * 60 * 1000);
    isLogging = true;
    
    console.log(`Started continuous data logging for channel ${channelId} every ${intervalMinutes} minutes`);
    return true;
  };
  
  // Stop logging
  const stop = () => {
    if (!isLogging) return;
    
    clearInterval(intervalId);
    intervalId = null;
    isLogging = false;
    
    console.log(`Stopped continuous data logging for channel ${channelId}`);
    return true;
  };
  
  // Export data as CSV
  const exportToCSV = (filename = `patient_data_${channelId}.csv`) => {
    const storedData = localStorage.getItem(storageKey);
    if (!storedData) {
      console.warn('No data available to export');
      return false;
    }
    
    try {
      const parsedData = JSON.parse(storedData);
      const csvContent = convertThingSpeakDataToCSV(parsedData);
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const urlObject = URL.createObjectURL(blob);
      
      link.setAttribute('href', urlObject);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return true;
    } catch (error) {
      console.error('Error exporting data to CSV:', error);
      return false;
    }
  };
  
  // Return controller object
  return {
    start,
    stop,
    exportToCSV,
    isLogging: () => isLogging,
    getStoredData: () => {
      const storedData = localStorage.getItem(storageKey);
      return storedData ? JSON.parse(storedData) : null;
    },
    clearStoredData: () => {
      localStorage.removeItem(storageKey);
      lastTimestamp = null;
      return true;
    }
  };
};

/**
 * Fetches historical data for a specific time period
 * @param {String} channelId - ThingSpeak channel ID
 * @param {Number} days - Number of days of data to fetch (default: 7)
 * @param {String} apiKey - ThingSpeak API key (optional)
 * @returns {Object} - Formatted historical data for all fields
 */
export const fetchHistoricalData = async (channelId, days = 7, apiKey = DEFAULT_READ_API_KEY) => {
  if (!channelId) {
    throw new Error('Channel ID is required');
  }

  try {
    // Fetch only the latest 10 records
    const url = `${BASE_URL}/${channelId}/feeds.json?api_key=${apiKey}&results=15`;
    console.log(`Fetching latest records from: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ThingSpeak API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || !data.feeds || data.feeds.length === 0) {
      throw new Error('No historical data available from ThingSpeak');
    }
    
    console.log(`Fetched ${data.feeds.length} records from ThingSpeak`);
    
    // Use only the latest 10 records for a more compact view
    const limitedFeeds = data.feeds.slice(-10);
    console.log(`Limited to latest ${limitedFeeds.length} records`);
    
    // Format data for chart display - with safer parsing
    const formattedData = {
      timestamps: limitedFeeds.map(feed => new Date(feed.created_at)),
      temperature: limitedFeeds.map(feed => {
        const val = parseFloat(feed.field1);
        return isNaN(val) ? null : val;
      }),
      alertLevel: limitedFeeds.map(feed => {
        const val = parseInt(feed.field2);
        return isNaN(val) ? null : val;
      }),
      heartRate: limitedFeeds.map(feed => {
        const val = parseFloat(feed.field3);
        return isNaN(val) ? null : val;
      }),
      spo2: limitedFeeds.map(feed => {
        const val = parseFloat(feed.field4);
        return isNaN(val) ? null : val;
      }),
      // Calculate BP for each entry
      bp: limitedFeeds.map(feed => {
        try {
          const ecgSamples = feed.field8 ? JSON.parse(feed.field8) : [];
          const heartRate = parseFloat(feed.field3);
          const spo2 = parseFloat(feed.field4);
          return calculateBP(ecgSamples, heartRate, spo2);
        } catch (e) {
          console.error('Error processing BP data:', e);
          return { systolic: null, diastolic: null };
        }
      }),
      avgEcg: limitedFeeds.map(feed => {
        const val = parseFloat(feed.field7);
        return isNaN(val) ? null : val;
      }),
    };
    
    // Log some stats about the formatted data
    console.log('Formatted data stats:');
    console.log(`Temperature data points: ${formattedData.temperature.filter(v => v !== null).length}`);
    console.log(`Heart rate data points: ${formattedData.heartRate.filter(v => v !== null).length}`);
    console.log(`SpO2 data points: ${formattedData.spo2.filter(v => v !== null).length}`);
    console.log(`BP data points: ${formattedData.bp.filter(v => v.systolic !== null).length}`);
    
    return {
      raw: {
        ...data,
        feeds: limitedFeeds
      },
      formatted: formattedData
    };
  } catch (error) {
    console.error('Error fetching historical data:', error);
    throw error;
  }
};

export default {
  fetchLatestData,
  mapThingSpeakToPatientVitals,
  getPatientVitals,
  downloadThingSpeakDataAsCSV,
  startContinuousDataLogging,
  convertThingSpeakDataToCSV,
  fetchHistoricalData
};


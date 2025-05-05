import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { getPatientVitals, downloadThingSpeakDataAsCSV, fetchHistoricalData } from '../services/ThingSpeakService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import 'chartjs-adapter-date-fns'; // Add this import for time scale
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import './PatientDetail.css';
import MedicationReminder from './MedicationReminder';
import AudioAlert from './AudioAlert';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const PatientDetail = () => {
  const { id } = useParams();
  const [patientData, setPatientData] = useState(null);
  const [patientDetails, setPatientDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [manualAlertLevel, setManualAlertLevel] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [historicalData, setHistoricalData] = useState(null);
  const [loadingHistorical, setLoadingHistorical] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [prevBP, setPrevBP] = useState(null);
  const [bpChanging, setBpChanging] = useState(false);

  // ECG Chart configuration
  const ecgChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'ECG Waveform'
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Sample'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'mV'
        }
      }
    },
    animation: false // Disable animation for better performance
  };

  const prepareEcgChartData = (samples) => ({
    labels: samples.map((_, index) => index),
    datasets: [
      {
        label: 'ECG',
        data: samples,
        borderColor: 'rgb(75, 192, 192)',
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.1
      }
    ]
  });

  // Fetch patient details from backend
  useEffect(() => {
    const fetchPatientDetails = async () => {
      try {
        const response = await fetch('http://localhost:8000/');
        if (!response.ok) {
          throw new Error('Failed to fetch patient details');
        }
        
        const patients = await response.json();
        const currentPatient = patients.find(patient => patient.unique_id.toString() === id.toString());
        
        if (currentPatient) {
          setPatientDetails(currentPatient);
        } else {
          console.warn(`Patient with ID ${id} not found in patients list`);
        }
      } catch (error) {
        console.error("Error fetching patient details:", error);
      }
    };
    
    fetchPatientDetails();
  }, [id]);

  const fetchVitals = useCallback(async () => {
    if (!id) return;

    try {
      const vitalsData = await getPatientVitals(id);
      
      // Check if blood pressure has changed significantly
      if (patientData && patientData.vitals && patientData.vitals.bp) {
        const prevSystolic = patientData.vitals.bp.systolic;
        const prevDiastolic = patientData.vitals.bp.diastolic;
        const newSystolic = vitalsData.vitals.bp.systolic;
        const newDiastolic = vitalsData.vitals.bp.diastolic;
        
        // Calculate change percentage
        const systolicChange = Math.abs(newSystolic - prevSystolic);
        const diastolicChange = Math.abs(newDiastolic - prevDiastolic);
        
        // If either value changed by more than 5 mmHg, trigger animation
        if (systolicChange > 5 || diastolicChange > 3) {
          setBpChanging(true);
          // Reset animation after 5 seconds
          setTimeout(() => setBpChanging(false), 5000);
        }
        
        // Store previous BP values
        setPrevBP({ systolic: prevSystolic, diastolic: prevDiastolic });
      }
      
      setPatientData(prev => ({
        ...prev,
        ...vitalsData
      }));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching vitals:', error);
      setError(error.message);
      setLoading(false);
    }
  }, [id, patientData]);

  useEffect(() => {
    fetchVitals();
    const interval = setInterval(fetchVitals, 30000);
    return () => clearInterval(interval);
  }, [fetchVitals]);

  // Function to handle manual alert setting
  const handleSetAlert = (level) => {
    if (manualAlertLevel === level) {
      // If clicking the same level again, clear the alert
      setManualAlertLevel(null);
    } else {
      // Set to the selected level
      setManualAlertLevel(level);
    }
  };

  // Handle CSV download
  const handleDownloadCSV = async () => {
    if (!id) return;
    
    try {
      setIsDownloading(true);
      await downloadThingSpeakDataAsCSV(
        id, 
        `patient_${id}_data_${new Date().toISOString().slice(0,10)}.csv`, 
        7  // Get 7 days of data
      );
      setIsDownloading(false);
    } catch (error) {
      console.error('Error downloading CSV data:', error);
      setIsDownloading(false);
    }
  };

  // Fetch historical data
  useEffect(() => {
    const getHistoricalData = async () => {
      if (!id) return;

      try {
        setLoadingHistorical(true);
        const data = await fetchHistoricalData(id, 7); // Get 7 days of data
        setHistoricalData(data.formatted);
        setLoadingHistorical(false);
      } catch (error) {
        console.error('Error fetching historical data:', error);
        setLoadingHistorical(false);
      }
    };

    getHistoricalData();
  }, [id]);

  if (loading) return <div className="loading">Loading patient data...</div>;
  if (error) return <div className="error"><h3>Error loading patient data</h3><p>{error}</p></div>;
  if (!patientData) return <div className="error">No patient data available</div>;

  // Helper function to determine temperature status
  const getTemperatureStatus = (temp) => {
    // First check temperature ranges
    if (temp > 37.8) return 'elevated';
    if (temp < 35.5) return 'low';
    return 'normal';
  };

  // Helper function to get fever status based on alert level
  const getTemperatureWithFeverStatus = (temp, alertLevel) => {
    // If alert level indicates fever (level 3), return 'fever'
    if (alertLevel === 3) {
      return 'fever';
    }
    // Otherwise use regular temperature status
    return getTemperatureStatus(temp);
  };

  // Helper function to determine heart rate status
  const getHeartRateStatus = (hr) => {
    if (hr > 100) return 'elevated';
    if (hr < 60) return 'low';
    return 'normal';
  };

  // Helper function to get alert style class
  const getAlertClass = (alertLevel) => {
    switch(alertLevel) {
      case 0: return 'normal';
      case 1: return 'moderate-risk';
      case 2: return 'high-risk';
      case 3: return 'fever';
      default: return 'normal';
    }
  };

  // Function to get patient initials for avatar
  const getInitials = (name) => {
    if (!name) return "P";
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Determine effective alert level (manual override or data-driven)
  const effectiveAlertLevel = manualAlertLevel !== null ? manualAlertLevel : patientData.vitals.alertLevel;
  const alertStatusText = 
    effectiveAlertLevel === 0 ? "Normal" : 
    effectiveAlertLevel === 1 ? "Moderate Risk" : 
    effectiveAlertLevel === 2 ? "High Risk" :
    effectiveAlertLevel === 3 ? "Fever" : "Normal";

  // Chart options for historical data
  const getHistoricalChartOptions = (title, yAxisLabel, color) => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
          labels: {
            font: {
              size: 8
            }
          }
        },
        title: {
          display: false,
          text: title,
          color: 'rgb(100, 100, 100)',
          font: {
            size: 9,
          },
          padding: {
            top: 0,
            bottom: 2
          }
        },
        tooltip: {
          enabled: true,
          titleFont: {
            size: 9
          },
          bodyFont: {
            size: 9
          },
          titleMarginBottom: 2,
          padding: {
            top: 4,
            bottom: 4,
            left: 6,
            right: 6
          },
          callbacks: {
            title: (tooltipItems) => {
              const date = new Date(tooltipItems[0].parsed.x);
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'minute',
            displayFormats: {
              minute: 'HH:mm'
            },
            tooltipFormat: 'HH:mm'
          },
          title: {
            display: false
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 2, // Only show start and end points
            font: {
              size: 7
            },
            padding: 0,
            display: false // Hide x-axis ticks completely
          },
          grid: {
            display: false
          },
          border: {
            display: false
          }
        },
        y: {
          title: {
            display: false
          },
          beginAtZero: false,
          ticks: {
            font: {
              size: 7
            },
            maxTicksLimit: 3,
            padding: 0
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.03)',
            lineWidth: 0.5,
            drawBorder: false
          },
          border: {
            display: false
          }
        }
      },
      layout: {
        padding: {
          left: 0,
          right: 0,
          top: 2,
          bottom: 0
        }
      },
      elements: {
        line: {
          tension: 0.2,
          borderWidth: 1,
          fill: false
        },
        point: {
          radius: 0,
          hoverRadius: 2,
        }
      }
    };
  };

  // Prepare datasets for historical charts
  const prepareHistoricalChartData = (timestamps, values, label, color) => {
    // Filter out null/NaN values and their corresponding timestamps
    const validData = timestamps.map((time, index) => ({
      time,
      value: values[index]
    })).filter(item => item.value !== undefined && !isNaN(item.value) && item.value !== null);
    
    // Log data for debugging
    console.log(`Chart data for ${label}:`, validData.length, 'valid data points');
    
    return {
      labels: validData.map(item => item.time),
      datasets: [
        {
          label: label,
          data: validData.map(item => item.value),
          borderColor: color,
          backgroundColor: `${color}10`, // Very light transparency
          borderWidth: 1,
          fill: false,
          pointBorderWidth: 0
        }
      ]
    };
  };

  // Handle BP data for chart
  const prepareBPChartData = (timestamps, bpData) => {
    // Filter out null/NaN values
    const validData = timestamps.map((time, index) => ({
      time,
      systolic: bpData[index]?.systolic,
      diastolic: bpData[index]?.diastolic
    })).filter(item => 
      item.systolic !== undefined && !isNaN(item.systolic) && item.systolic !== null && 
      item.diastolic !== undefined && !isNaN(item.diastolic) && item.diastolic !== null
    );
    
    // Log data for debugging
    console.log('BP Chart data:', validData.length, 'valid data points');
    
    return {
      labels: validData.map(item => item.time),
      datasets: [
        {
          label: 'Systolic',
          data: validData.map(item => item.systolic),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0)',
          borderWidth: 1,
          fill: false,
          pointBorderWidth: 0
        },
        {
          label: 'Diastolic',
          data: validData.map(item => item.diastolic),
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0)',
          borderWidth: 1,
          fill: false,
          pointBorderWidth: 0
        }
      ]
    };
  };

  return (
    <div className="patient-detail">
      {effectiveAlertLevel > 0 && (
        <div className={`emergency-alert ${getAlertClass(effectiveAlertLevel)}`}>
          <AudioAlert 
            isActive={effectiveAlertLevel === 2 || effectiveAlertLevel === 3} 
            type={effectiveAlertLevel === 3 ? 'fever' : 'high-risk'} 
          />
          <h2>
            {effectiveAlertLevel === 1 ? 'MODERATE RISK ALERT' : 
             effectiveAlertLevel === 2 ? 'HIGH RISK ALERT' :
             effectiveAlertLevel === 3 ? 'FEVER ALERT' :
             'FEVER ALERT'}
          </h2>
          <p>
            {effectiveAlertLevel === 1 
              ? 'Patient shows moderate cardiac risk signs. Monitor carefully.' 
              : effectiveAlertLevel === 2
              ? 'EMERGENCY! Patient shows high cardiac risk signs. Immediate attention required!'
              : effectiveAlertLevel === 3
              ? 'Patient has fever with low cardiac risk. Monitor for changes.'
              : 'Patient has fever with high cardiac risk. Immediate medical intervention required!'}
          </p>
          {manualAlertLevel !== null && (
            <div className="manual-alert-indicator">Manually set by doctor</div>
          )}
        </div>
      )}

      {/* Patient Info Section */}
      <div className="patient-info-section">
        <div className="patient-info-header">
          <div className="patient-avatar">
            <div className="initials">{patientDetails ? getInitials(patientDetails.name) : "P"}</div>
          </div>
          <div className="patient-basic-info">
            <h1>{patientDetails ? patientDetails.name : `Patient #${id}`}</h1>
            <div className="info-grid">
              <div className="info-item">
                <div className="label">Patient ID</div>
                <div className="value">{patientDetails ? patientDetails.unique_id : id}</div>
              </div>
              <div className="info-item">
                <div className="label">Age</div>
                <div className="value">{patientDetails ? `${patientDetails.age} years` : 'N/A'}</div>
              </div>
              <div className="info-item">
                <div className="label">Phone</div>
                <div className="value">{patientDetails ? patientDetails.phone_number : 'N/A'}</div>
              </div>
              <div className="info-item">
                <div className="label">Status</div>
                <div className={`value status ${effectiveAlertLevel > 0 ? 
                  effectiveAlertLevel === 1 ? 'warning' : 'critical' : 'normal'}`}>
                  {alertStatusText}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Alert Controls */}
      <div className="manual-alert-controls">
        <h3>Manual Alert Controls</h3>
        <div className="alert-buttons">
          <button 
            className={`alert-btn moderate-risk ${manualAlertLevel === 1 ? 'active' : ''}`}
            onClick={() => handleSetAlert(1)}
          >
            Moderate Risk
          </button>
          <button 
            className={`alert-btn high-risk ${manualAlertLevel === 2 ? 'active' : ''}`}
            onClick={() => handleSetAlert(2)}
          >
            High Risk
          </button>
          <button 
            className={`alert-btn fever ${manualAlertLevel === 3 ? 'active' : ''}`}
            onClick={() => handleSetAlert(3)}
          >
            Fever
          </button>
          {manualAlertLevel !== null && (
            <button 
              className="alert-btn clear"
              onClick={() => setManualAlertLevel(null)}
            >
              Clear Alert
            </button>
          )}
        </div>
        <p className="alert-info">
          Use these buttons to manually set an alert level if you observe concerning symptoms not detected by sensors.
        </p>
      </div>

      <div className="vital-signs">
        <div className="vital-signs-header">
          <h2>Vital Signs</h2>
          <button 
            className={`download-csv-btn ${isDownloading ? 'loading' : ''}`}
            onClick={handleDownloadCSV}
            disabled={isDownloading}
          >
            {isDownloading ? 'Downloading...' : 'Download Historical Data (CSV)'}
          </button>
        </div>
        <div className="vitals-grid">
          <div className={`vital-card ${getTemperatureWithFeverStatus(patientData.vitals.temperature, effectiveAlertLevel) === 'fever' ? 'fever-card' : ''}`}>
            <h3>Temperature</h3>
            <p className={`value ${getTemperatureWithFeverStatus(patientData.vitals.temperature, effectiveAlertLevel)}`}>
              {patientData.vitals.temperature}°C
            </p>
          </div>
          
          <div className="vital-card">
            <h3>Emergency Alert Status</h3>
            <p className={`value ${getAlertClass(effectiveAlertLevel)}`}>
              {alertStatusText}
              {manualAlertLevel !== null && <span className="manual-indicator"> (Manual)</span>}
            </p>
          </div>
          
          <div className="vital-card">
            <h3>Heart Rate</h3>
            <p className={`value ${getHeartRateStatus(patientData.vitals.heartRate)}`}>
              {patientData.vitals.heartRate} BPM
            </p>
          </div>
          
          <div className="vital-card">
            <h3>SpO2</h3>
            <p className={`value ${patientData.vitals.spo2 < 95 ? 'low' : 'normal'}`}>
              {patientData.vitals.spo2}%
            </p>
          </div>

          <div className={`vital-card ${bpChanging ? 'bp-changing' : ''}`}>
            <h3>Blood Pressure</h3>
            <p className={`value ${patientData.status.bp}`}>
              {patientData.vitals.bp.systolic}/{patientData.vitals.bp.diastolic} mmHg
            </p>
            <div className="bp-indicators">
              <div className="bp-category">
                {patientData.vitals.bp.systolic > 140 || patientData.vitals.bp.diastolic > 90 ? 
                  <span className="bp-high">High</span> : 
                patientData.vitals.bp.systolic < 90 || patientData.vitals.bp.diastolic < 60 ? 
                  <span className="bp-low">Low</span> : 
                  <span className="bp-normal">Normal</span>
                }
              </div>
              <div className="bp-change-indicator">
                {patientData.vitals.heartRate > 100 ? 
                  <span className="bp-trend-up">↑ with elevated HR</span> :
                patientData.vitals.heartRate < 60 ? 
                  <span className="bp-trend-down">↓ with low HR</span> :
                  <span></span>
                }
              </div>
            </div>
          </div>

          <div className="vital-card">
            <h3>Average ECG</h3>
            <p className="value">
              {typeof patientData.vitals.avgEcg === 'number' 
                ? patientData.vitals.avgEcg.toFixed(2) 
                : patientData.vitals.avgEcg} mV
            </p>
          </div>

          {/* Location Card */}
          {patientData && (
            <div className="vital-card location-card">
              <h3>Patient Location</h3>
              {patientData.location && patientData.location.lat && patientData.location.lng ? (
                <>
                  <p>Latitude: {patientData.location.lat.toFixed(6)}</p>
                  <p>Longitude: {patientData.location.lng.toFixed(6)}</p>
                  <div className={`location-status ${patientData.location.isLastKnown ? 'stale' : 'active'}`}>
                    <span className={`status-indicator ${patientData.location.isLastKnown ? 'stale' : 'active'}`}></span>
                    {patientData.location.isLastKnown ? (
                      <>
                        Last known location
                        {patientData.location.timestamp && (
                          <span className="timestamp">
                            as of {new Date(patientData.location.timestamp).toLocaleString()}
                          </span>
                        )}
                      </>
                    ) : (
                      'Current location'
                    )}
                  </div>
                </>
              ) : (
                <div className="no-location-container">
                  <p className="no-location">Location tracking unavailable</p>
                  <p className="no-location-subtitle">Device may be indoor or location service is disabled</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Medication Reminder Section */}
      <MedicationReminder patientId={id} />

      {/* ECG Graph Section */}
      <div className="ecg-section">
        <h2>ECG Waveform</h2>
        <div className="ecg-chart-container">
          {patientData.vitals.ecgSamples.length > 0 ? (
            <Line
              options={ecgChartOptions}
              data={prepareEcgChartData(patientData.vitals.ecgSamples)}
            />
          ) : (
            <p>No ECG data available</p>
          )}
        </div>
      </div>

      {/* Weekly Records Section */}
      <div className="weekly-records-section">
        <div className="section-header">
          <h2>Vital Signs History</h2>
          <button 
            className="toggle-debug-btn"
            onClick={() => setShowDebugInfo(!showDebugInfo)}
          >
            {showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
          </button>
        </div>
        
        {loadingHistorical ? (
          <div className="loading-section">Loading historical data...</div>
        ) : !historicalData ? (
          <div className="error-section">No historical data available</div>
        ) : (
          <div className="historical-charts-container">
            {/* Debug info for troubleshooting */}
            {showDebugInfo && (
              <div className="debug-info">
                <p>Data: {historicalData.timestamps?.length || 0} pts</p>
                <p>Temp: {historicalData.temperature?.filter(v => v !== null).length || 0}</p>
                <p>HR: {historicalData.heartRate?.filter(v => v !== null).length || 0}</p>
                <p>SpO2: {historicalData.spo2?.filter(v => v !== null).length || 0}</p>
                <p>BP: {historicalData.bp?.filter(v => v.systolic !== null).length || 0}</p>
              </div>
            )}
            
            <div className="historical-charts-grid">
              {/* Heart Rate Chart */}
              <div className="chart-container">
                <h3>Heart Rate (BPM)</h3>
                <Line 
                  options={getHistoricalChartOptions('', 'BPM', 'rgb(54, 162, 235)')}
                  data={prepareHistoricalChartData(
                    historicalData.timestamps, 
                    historicalData.heartRate, 
                    'Heart Rate',
                    'rgb(54, 162, 235)'
                  )}
                />
              </div>
              
              {/* Blood Pressure Chart */}
              <div className="chart-container">
                <h3>Blood Pressure (mmHg)</h3>
                <Line 
                  options={{
                    ...getHistoricalChartOptions('', 'mmHg', 'rgb(153, 102, 255)'),
                    plugins: {
                      ...getHistoricalChartOptions('', 'mmHg', 'rgb(153, 102, 255)').plugins,
                      legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                          boxWidth: 4,
                          padding: 1,
                          usePointStyle: true,
                          pointStyle: 'circle',
                          font: {
                            size: 6
                          }
                        }
                      }
                    }
                  }}
                  data={prepareBPChartData(
                    historicalData.timestamps, 
                    historicalData.bp
                  )}
                />
              </div>
              
              {/* Temperature Chart */}
              <div className="chart-container">
                <h3>Temperature (°C)</h3>
                <Line 
                  options={getHistoricalChartOptions('', '°C', 'rgb(255, 99, 132)')}
                  data={prepareHistoricalChartData(
                    historicalData.timestamps, 
                    historicalData.temperature, 
                    'Temperature',
                    'rgb(255, 99, 132)'
                  )}
                />
              </div>
              
              {/* SpO2 Chart */}
              <div className="chart-container">
                <h3>SpO2 (%)</h3>
                <Line 
                  options={getHistoricalChartOptions('', '%', 'rgb(75, 192, 192)')}
                  data={prepareHistoricalChartData(
                    historicalData.timestamps, 
                    historicalData.spo2, 
                    'SpO2',
                    'rgb(75, 192, 192)'
                  )}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Map Section */}
      {patientData && patientData.location && patientData.location.lat && patientData.location.lng && (
        <div className="map-section">
          <h2>
            {patientData.location.isLastKnown 
              ? "Last Known Location" 
              : "Current Location"}
          </h2>
          <MapContainer
            center={[patientData.location.lat, patientData.location.lng]}
            zoom={13}
            style={{ height: '400px', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <Marker position={[patientData.location.lat, patientData.location.lng]}>
              <Popup>
                {patientData.location.isLastKnown 
                  ? "Last Known Location" 
                  : "Current Location"}
                <br />
                Recorded: {new Date(patientData.location.timestamp).toLocaleString()}
              </Popup>
            </Marker>
          </MapContainer>
        </div>
      )}

      <div className="update-info">
        <p>Last Updated: {patientData.lastUpdated}</p>
      </div>
    </div>
  );
};

export default PatientDetail;


import requests
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import scipy.signal as signal
import time
import json
import warnings
warnings.filterwarnings('ignore')

class HeartAttackDetector:
    def __init__(self):
        # ThingSpeak settings
        self.channel_id = "2895763"  # Replace with your ThingSpeak channel ID
        self.read_api_key = "MWFBV98HOZOHTHY4"  # Replace with your ThingSpeak Read API Key
        self.write_api_key = "RJ8ZDWY2PBQMPXU5"  # Replace with your Write API Key
        
        # Model parameters
        self.scaler = StandardScaler()
        self.model = LinearRegression()
        
        # Initialize data storage
        self.df = None
        self.risk_scores = []
        
        # Feature importance coefficients (based on medical literature)
        # These would ideally be learned from labeled training data
        self.feature_weights = {
            'st_elevation': 5.0,       # ST segment elevation is a strong indicator
            'hr_variance': 0.3,        # Sudden changes in heart rate
            'qrs_width': 2.0,          # QRS complex width abnormalities
            'qrs_amplitude': -0.01,    # Reduced QRS amplitude can indicate issues
            't_wave_inversion': 4.0,   # T wave inversion is a strong indicator
            'hr_spo2_ratio': 0.2,      # Relationship between HR and SpO2
            'spo2': -0.5,              # Low SpO2 contributes to risk
            'temperature': 0.1,        # Slight contribution from elevated temperature
            'rr_interval_variance': 0.8  # Heart rate variability
        }
        
        # Risk thresholds
        self.risk_threshold = 70.0  # Score above which to classify as high risk
        self.warning_threshold = 50.0  # Score above which to issue a warning
        
        print("Heart Attack Detector initialized")
    
    def fetch_data_from_thingspeak(self, results=5000):
        """
        Fetch sensor data from ThingSpeak
        
        Fields expected:
        1: Temperature (°C)
        2: Alert_Stat (0,1,2)
        3: Heart Rate (BPM)
        4: SpO2 (%)
        5: Latitude
        6: Longitude
        7: Average ECG value
        8: ECG samples as JSON array
        """
        print(f"Fetching {results} data points from ThingSpeak...")
        
        # Construct API URL
        url = f"https://api.thingspeak.com/channels/{self.channel_id}/feeds.json"
        params = {
            "api_key": self.read_api_key,
            "results": results
        }
        
        try:
            # Make API request
            response = requests.get(url, params=params)
            response.raise_for_status()  # Raise exception for HTTP errors
            data = response.json()
            
            # Extract feeds
            feeds = data['feeds']
            
            # Convert to DataFrame
            df = pd.DataFrame(feeds)
            
            # Convert timestamp to datetime
            df['created_at'] = pd.to_datetime(df['created_at'])
            
            # Convert fields to appropriate data types
            numeric_fields = ['field1', 'field2', 'field3', 'field4', 'field5', 'field6', 'field7']
            for field in numeric_fields:
                df[field] = pd.to_numeric(df[field], errors='coerce')
            
            # Rename columns for clarity
            df = df.rename(columns={
                'field1': 'temperature',
                'field2': 'alert_stat',
                'field3': 'heart_rate',
                'field4': 'spo2',
                'field5': 'latitude',
                'field6': 'longitude',
                'field7': 'ecg_avg'
            })
            
            # Parse ECG samples from JSON in field8
            df['ecg_samples'] = df['field8'].apply(lambda x: json.loads(x) if isinstance(x, str) else [])
            
            # Drop original field names
            df = df.drop(columns=[col for col in df.columns if col.startswith('field')])
            
            # Store data
            self.df = df
            
            print(f"Successfully fetched {len(df)} records")
            print(f"Date range: {df['created_at'].min()} to {df['created_at'].max()}")
            
            return df
            
        except Exception as e:
            print(f"Error fetching data: {e}")
            return None
        
    def send_alert_to_thingspeak(self):
        """Send alert status to ThingSpeak field2 (0=normal, 1=moderate, 2=high)"""
        if not hasattr(self, 'risk_scores') or len(self.risk_scores) == 0:
            print("No risk scores available to send")
            return False
            
        latest_risk = self.risk_scores.iloc[-1]
        risk_level = latest_risk['risk_level']
        
        alert_status = {
            'Low': 0,
            'Moderate': 1,
            'High': 2
        }.get(risk_level, 0)
        
        url = "https://api.thingspeak.com/update.json"
        params = {
            "api_key": self.write_api_key,
            "field2": alert_status  # Using field2 for alert status
        }
        
        try:
            response = requests.get(url, params=params)
            if response.status_code == 200:
                print(f"Sent alert status {alert_status} ({risk_level}) to ThingSpeak field2")
                return True
            else:
                print(f"Failed to send alert. Status code: {response.status_code}")
                return False
        except Exception as e:
            print(f"Error sending to ThingSpeak: {e}")
            return False
    
    def extract_ecg_features(self):
        """Extract features from ECG data for each time window"""
        if self.df is None or len(self.df) == 0:
            print("No data available for feature extraction")
            return False
        
        print("Extracting features from ECG data...")
        
        # Initialize feature columns
        self.df['st_elevation'] = np.nan
        self.df['qrs_width'] = np.nan
        self.df['qrs_amplitude'] = np.nan
        self.df['t_wave_inversion'] = np.nan
        self.df['rr_interval_variance'] = np.nan
        
        # Process each row with ECG samples
        for idx, row in self.df.iterrows():
            ecg_samples = row['ecg_samples']
            
            # Skip if no valid ECG samples
            if not ecg_samples or len(ecg_samples) < 20:
                continue
            
            # Convert to numpy array
            ecg_array = np.array(ecg_samples)
            
            # Apply basic filtering to remove noise
            # Using a bandpass filter between 0.5Hz and 40Hz (common for ECG)
            fs = 100  # Assuming sampling frequency of 100Hz
            nyquist = 0.5 * fs
            low = 0.5 / nyquist
            high = 40.0 / nyquist
            b, a = signal.butter(2, [low, high], btype='band')
            ecg_filtered = signal.filtfilt(b, a, ecg_array)
            
            # Baseline extraction (using moving average)
            window_size = int(0.2 * fs)  # 200ms window
            baseline = signal.savgol_filter(ecg_filtered, window_size, 2)
            
            # Baseline correction
            ecg_corrected = ecg_filtered - baseline
            
            # Find R peaks using a simple thresholding
            # In a real implementation, more sophisticated algorithms like Pan-Tompkins should be used
            threshold = 0.6 * np.max(ecg_corrected)
            r_peaks, _ = signal.find_peaks(ecg_corrected, height=threshold, distance=int(0.5*fs))
            
            # Extract QRS complex features
            if len(r_peaks) >= 2:
                # Calculate QRS width (duration)
                qrs_width = np.median([self._calculate_qrs_width(ecg_corrected, peak, fs) for peak in r_peaks])
                
                # Calculate QRS amplitude
                qrs_amplitude = np.median([ecg_corrected[peak] for peak in r_peaks])
                
                # Calculate RR intervals
                rr_intervals = np.diff(r_peaks) / fs  # Convert to seconds
                
                # Calculate RR interval variance
                rr_variance = np.var(rr_intervals) if len(rr_intervals) > 1 else 0
                
                # ST segment analysis
                st_measurements = []
                for peak in r_peaks:
                    if peak + int(0.12*fs) < len(ecg_corrected):  # Check if we have enough samples after R peak
                        # ST segment typically starts around 120ms after R peak
                        st_point = peak + int(0.12*fs)
                        st_segment = ecg_corrected[st_point:st_point+int(0.08*fs)]  # 80ms of ST segment
                        st_elevation = np.mean(st_segment)
                        st_measurements.append(st_elevation)
                
                # T wave analysis
                t_wave_measurements = []
                for peak in r_peaks:
                    if peak + int(0.3*fs) < len(ecg_corrected):  # Check if we have enough samples after R peak
                        # T wave typically peaks around 300ms after R peak
                        t_section = ecg_corrected[peak+int(0.2*fs):peak+int(0.4*fs)]
                        t_wave_amp = np.max(t_section) if np.max(t_section) > 0 else np.min(t_section)
                        t_wave_measurements.append(t_wave_amp)
                
                # Store the median values in the dataframe
                self.df.at[idx, 'qrs_width'] = qrs_width
                self.df.at[idx, 'qrs_amplitude'] = qrs_amplitude
                self.df.at[idx, 'rr_interval_variance'] = rr_variance
                self.df.at[idx, 'st_elevation'] = np.median(st_measurements) if st_measurements else np.nan
                self.df.at[idx, 't_wave_inversion'] = np.median(t_wave_measurements) if t_wave_measurements else np.nan
        
        # Calculate heart rate variance (rolling window)
        if len(self.df) > 5:
            self.df['hr_variance'] = self.df['heart_rate'].rolling(window=5).std()
            
        # Calculate HR/SpO2 ratio
        self.df['hr_spo2_ratio'] = self.df['heart_rate'] / self.df['spo2']
        
        # Drop rows with NaN values in critical features
        critical_features = ['qrs_amplitude', 'st_elevation', 't_wave_inversion']
        valid_data = self.df.dropna(subset=critical_features)
        
        print(f"Feature extraction complete. {len(valid_data)} valid data points with features.")
        return True
    
    def _calculate_qrs_width(self, ecg_signal, r_peak, fs):
        """Calculate QRS complex width"""
        # Look for Q wave (before R peak)
        q_idx = r_peak
        for i in range(r_peak, max(0, r_peak-int(0.1*fs)), -1):
            if ecg_signal[i] <= 0:
                q_idx = i
                break
        
        # Look for S wave (after R peak)
        s_idx = r_peak
        for i in range(r_peak, min(len(ecg_signal), r_peak+int(0.1*fs))):
            if ecg_signal[i] <= 0:
                s_idx = i
                break
        
        # Calculate width in seconds
        qrs_width = (s_idx - q_idx) / fs
        return qrs_width
    
    def apply_linear_regression(self):
        """Apply linear regression to calculate risk scores"""
        if self.df is None or len(self.df) == 0:
            print("No data available for analysis")
            return False
        
        print("Applying linear regression model for risk assessment...")
        
        # Select features for the model
        feature_cols = [
            'st_elevation', 'hr_variance', 'qrs_width', 'qrs_amplitude', 
            't_wave_inversion', 'hr_spo2_ratio', 'spo2', 'temperature',
            'rr_interval_variance'
        ]
        
        # Drop rows with missing values
        valid_data = self.df.dropna(subset=feature_cols)
        
        if len(valid_data) < 10:
            print(f"Not enough valid data points ({len(valid_data)}). Need at least 10.")
            return False
        
        # Get feature matrix
        X = valid_data[feature_cols].values
        
        # Normalize features
        X_scaled = self.scaler.fit_transform(X)
        
        # Apply linear regression using the predefined weights
        # In a real scenario, these weights would be learned from labeled data
        risk_scores = np.zeros(len(X_scaled))
        
        for i, feature in enumerate(feature_cols):
            if feature in self.feature_weights:
                weight = self.feature_weights[feature]
                risk_scores += X_scaled[:, i] * weight
        
        # Add intercept (baseline risk)
        risk_scores += 50  # Baseline score of 50
        
        # Scale to 0-100 range
        min_score = np.min(risk_scores)
        max_score = np.max(risk_scores)
        if max_score > min_score:
            risk_scores = 100 * (risk_scores - min_score) / (max_score - min_score)
        
        # Store risk scores in dataframe
        valid_data['risk_score'] = risk_scores
        
        # Classify risk levels
        valid_data['risk_level'] = 'Low'
        valid_data.loc[valid_data['risk_score'] > self.warning_threshold, 'risk_level'] = 'Moderate'
        valid_data.loc[valid_data['risk_score'] > self.risk_threshold, 'risk_level'] = 'High'
        
        # Store results for later use
        self.risk_scores = valid_data[['created_at', 'risk_score', 'risk_level']].copy()
        
        print("Risk assessment complete.")
        high_risk = valid_data[valid_data['risk_level'] == 'High']
        print(f"Detected {len(high_risk)} high risk indicators out of {len(valid_data)} valid data points.")
        
        return True
    
    def analyze_data(self):
        """Run the complete analysis pipeline"""
        # Extract ECG features from ECG Data
        success = self.extract_ecg_features()
        if not success:
            return False
        
        # Apply Linear Regression Model
        success = self.apply_linear_regression()
        if not success:
            return False
        
        # Send alert status after analysis
        self.send_alert_to_thingspeak()
        return True
    
    def visualize_results(self):
        """Visualize the analysis results"""
        if self.df is None or len(self.df) == 0 or len(self.risk_scores) == 0:
            print("No data available for visualization")
            return
        
        # Set up the figure
        plt.figure(figsize=(20, 15))
        
        # Plot 1: Heart Rate and SpO2
        plt.subplot(4, 1, 1)
        plt.plot(self.df['created_at'], self.df['heart_rate'], 'r-', label='Heart Rate (BPM)')
        plt.plot(self.df['created_at'], self.df['spo2'], 'b-', label='SpO2 (%)')
        plt.title('Heart Rate and SpO2')
        plt.legend()
        plt.grid(True)
        
        # Plot 2: ECG Average
        plt.subplot(4, 1, 2)
        plt.plot(self.df['created_at'], self.df['ecg_avg'], 'g-')
        plt.title('ECG Average Value')
        plt.grid(True)
        
        # Plot 3: ST Elevation and T Wave Inversion
        plt.subplot(4, 1, 3)
        plt.plot(self.df['created_at'], self.df['st_elevation'], 'm-', label='ST Elevation')
        plt.plot(self.df['created_at'], self.df['t_wave_inversion'], 'c-', label='T Wave')
        plt.title('ECG Features: ST Elevation and T Wave')
        plt.legend()
        plt.grid(True)
        
        # Plot 4: Risk Score
        plt.subplot(4, 1, 4)
        plt.plot(self.risk_scores['created_at'], self.risk_scores['risk_score'], 'k-')
        plt.axhline(y=self.risk_threshold, color='r', linestyle='--', label=f'High Risk Threshold ({self.risk_threshold})')
        plt.axhline(y=self.warning_threshold, color='y', linestyle='--', label=f'Warning Threshold ({self.warning_threshold})')
        plt.title('Heart Attack Risk Score')
        plt.ylabel('Risk Score (0-100)')
        plt.legend()
        plt.grid(True)
        
        plt.tight_layout()
        plt.show()
        
        # Display a sample of high risk periods
        high_risk = self.risk_scores[self.risk_scores['risk_level'] == 'High']
        if len(high_risk) > 0:
            print("\nHigh Risk Periods:")
            print(high_risk[['created_at', 'risk_score']].head(10))
        else:
            print("\nNo high risk periods detected.")
    
    def display_feature_importance(self):
        """Display the importance of different features in risk prediction"""
        plt.figure(figsize=(12, 6))
        features = list(self.feature_weights.keys())
        weights = list(self.feature_weights.values())
        
        # Sort by absolute weight
        sorted_indices = np.argsort([abs(w) for w in weights])[::-1]
        sorted_features = [features[i] for i in sorted_indices]
        sorted_weights = [weights[i] for i in sorted_indices]
        
        colors = ['g' if w >= 0 else 'r' for w in sorted_weights]
        
        plt.barh(sorted_features, sorted_weights, color=colors)
        plt.axvline(x=0, color='k', linestyle='-', alpha=0.3)
        plt.title('Feature Importance in Heart Attack Risk Model')
        plt.xlabel('Weight (Positive = Increases Risk, Negative = Decreases Risk)')
        plt.grid(True, axis='x')
        plt.tight_layout()
        plt.show()
    
    def get_latest_status(self):
        """Get the latest risk status"""
        if len(self.risk_scores) == 0:
            return None, None
        
        latest = self.risk_scores.iloc[-1]
        return latest['risk_level'], latest['risk_score']


# Example usage
if __name__ == "__main__":
    detector = HeartAttackDetector()
    
    # Set your ThingSpeak credentials
    detector.channel_id = "2895763"
    detector.read_api_key = "MWFBV98HOZOHTHY4"
    detector.write_api_key = "RJ8ZDWY2PBQMPXU5"
    
    # Fetch data from ThingSpeak
    data = detector.fetch_data_from_thingspeak(results=1000)
    
    if data is not None and len(data) > 0:
        # Analyze the data
        success = detector.analyze_data()
        
        if success:
            # Visualize the results
            detector.visualize_results()
            
            # Display feature importance
            detector.display_feature_importance()
            
            # Get latest status
            risk_level, risk_score = detector.get_latest_status()
            print(f"\nLatest Status: {risk_level} Risk (Score: {risk_score:.1f})")
            
            if risk_level == "High":
                print("WARNING: High risk of heart attack detected!")
                print("Recommended actions:")
                print("1. Contact emergency services immediately")
                print("2. Take aspirin if available and not contraindicated")
                print("3. Rest in a comfortable position")
            elif risk_level == "Moderate":
                print("CAUTION: Moderate risk detected.")
                print("Recommended actions:")
                print("1. Rest and monitor symptoms")
                print("2. Contact healthcare provider for guidance")
            else:
                print("No immediate cardiac concerns detected.")
    else:
        print("Unable to proceed with analysis due to insufficient data.")
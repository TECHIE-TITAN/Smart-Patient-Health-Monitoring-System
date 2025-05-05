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
        """Robust feature extraction with proper validation"""
        if self.df is None or len(self.df) == 0:
            print("No data available")
            return False

        print("\n=== Data Validation ===")
        print(f"Initial records: {len(self.df)}")
        
        # Initialize features
        features = [
            'st_elevation', 'qrs_width', 'qrs_amplitude',
            't_wave_inversion', 'rr_interval_variance',
            'hr_variance', 'hr_spo2_ratio'
        ]
        for col in features:
            self.df[col] = np.nan

        # Strict validation - require ALL critical fields
        critical_fields = ['ecg_avg', 'heart_rate', 'spo2']
        self.df = self.df.dropna(subset=critical_fields)
        print(f"Records with complete data: {len(self.df)}")

        if len(self.df) == 0:
            print("No valid records after NaN removal")
            return False

        # Calculate features
        median_ecg = self.df['ecg_avg'].median()
        
        self.df['qrs_width'] = 0.08  # Fixed normal value
        self.df['qrs_amplitude'] = self.df['ecg_avg'] * 0.25
        self.df['st_elevation'] = (self.df['ecg_avg'] > median_ecg * 1.3).astype(int)
        self.df['t_wave_inversion'] = (self.df['ecg_avg'] < 0).astype(int)
        self.df['rr_interval_variance'] = 60 / self.df['heart_rate'] * 0.15
        
        # Rolling features (require min_periods=1)
        self.df['hr_variance'] = self.df['heart_rate'].rolling(3, min_periods=1).std()
        self.df['hr_spo2_ratio'] = self.df['heart_rate'] / self.df['spo2']

        # Final validation - remove any remaining NaN
        self.df = self.df.dropna(subset=features)
        print(f"Final valid records: {len(self.df)}")
        print("Sample features:\n", self.df[features].head())

        return len(self.df) > 0
    
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
        """Safe linear regression with proper index alignment"""
        if self.df is None or len(self.df) < 10:
            print(f"Not enough data ({len(self.df) if self.df else 0} records)")
            return False

        feature_cols = [
            'st_elevation', 'hr_variance', 'qrs_width', 
            'qrs_amplitude', 't_wave_inversion', 'hr_spo2_ratio',
            'spo2', 'temperature', 'rr_interval_variance'
        ]
        
        # Create clean feature matrix
        X = self.df[feature_cols].copy()
        
        # 1. Replace infinities and validate
        X = X.replace([np.inf, -np.inf], np.nan)
        valid_mask = X.notna().all(axis=1)
        X_clean = X[valid_mask]
        
        if len(X_clean) < 10:
            print(f"Only {len(X_clean)} valid feature vectors after cleanup")
            return False

        # 2. Scale features
        try:
            X_scaled = self.scaler.fit_transform(X_clean)
        except Exception as e:
            print(f"Scaling failed: {str(e)}")
            return False

        # 3. Calculate risk scores only for clean rows
        risk_scores = np.zeros(len(X_clean))
        for i, feature in enumerate(feature_cols):
            if feature in self.feature_weights:
                weight = self.feature_weights[feature]
                risk_scores += X_scaled[:, i] * weight

        # Add baseline risk and scale to 0-100
        risk_scores += 50
        risk_scores = 100 * (risk_scores - np.min(risk_scores)) / (np.ptp(risk_scores) + 1e-10)  # Add small epsilon

        # 4. Align results with original dataframe
        self.df['risk_score'] = np.nan  # Initialize column
        self.df.loc[valid_mask, 'risk_score'] = risk_scores
        
        # 5. Classify risk levels
        self.df['risk_level'] = 'Low'
        self.df.loc[self.df['risk_score'] > self.warning_threshold, 'risk_level'] = 'Moderate'
        self.df.loc[self.df['risk_score'] > self.risk_threshold, 'risk_level'] = 'High'
        
        # Store valid results
        valid_data = self.df[valid_mask].copy()
        self.risk_scores = valid_data[['created_at', 'risk_score', 'risk_level']]
        
        print(f"Risk assessment complete. {len(valid_data)} valid predictions.")
        print(f"High risk cases: {sum(valid_data['risk_level'] == 'High')}")
        
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
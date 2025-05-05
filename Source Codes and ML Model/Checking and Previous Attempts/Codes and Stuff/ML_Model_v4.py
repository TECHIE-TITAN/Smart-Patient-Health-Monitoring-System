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
        
        # Feature importance coefficients
        self.feature_weights = {
            'st_elevation': 5.0,
            'hr_variance': 0.3,
            'qrs_width': 2.0,
            'qrs_amplitude': -0.01,
            't_wave_inversion': 4.0,
            'hr_spo2_ratio': 0.2,
            'spo2': -0.5,
            'temperature': 0.1,
            'rr_interval_variance': 0.8
        }
        
        # Risk thresholds
        self.risk_threshold = 70.0
        self.warning_threshold = 50.0
        
        # Fever detection
        self.fever_threshold = 37.5  # °C (adjust based on your normal body temp range)
        self.alert_mapping = {
            # (fever_status, heart_risk): signal
            (0, 0): 0,  # No fever, no heart risk
            (0, 1): 1,  # No fever, moderate heart risk
            (0, 2): 2,  # No fever, high heart risk
            (1, 0): 3,  # Fever, no heart risk
            (1, 1): 4,  # Fever, moderate heart risk
            (1, 2): 5   # Fever, high heart risk
        }
        
        print("Heart Attack Detector with Fever Alert initialized")
    
    def check_fever(self, temperature):
        """Determine fever status (0=normal, 1=fever)"""
        if pd.isna(temperature):
            return 0
        return 1 if temperature >= self.fever_threshold else 0
    
    def generate_combined_alert(self, risk_level, temperature):
        """Generate combined alert signal (0-5)"""
        fever_status = self.check_fever(temperature)
        
        # Map risk level to numerical value
        risk_code = 0  # Low
        if risk_level == "Moderate":
            risk_code = 1
        elif risk_level == "High":
            risk_code = 2
            
        return self.alert_mapping[(fever_status, risk_code)]
    
    def fetch_data_from_thingspeak(self, results=100):
        """Fetch sensor data from ThingSpeak"""
        print(f"Fetching {results} data points from ThingSpeak...")
        
        url = f"https://api.thingspeak.com/channels/{self.channel_id}/feeds.json"
        params = {
            "api_key": self.read_api_key,
            "results": results
        }
        
        try:
            response = requests.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            
            feeds = data['feeds']
            df = pd.DataFrame(feeds)
            df['created_at'] = pd.to_datetime(df['created_at'])
            
            numeric_fields = ['field1', 'field2', 'field3', 'field4', 'field5', 'field6', 'field7']
            for field in numeric_fields:
                df[field] = pd.to_numeric(df[field], errors='coerce')
            
            df = df.rename(columns={
                'field1': 'temperature',
                'field2': 'alert_stat',
                'field3': 'heart_rate',
                'field4': 'spo2',
                'field5': 'latitude',
                'field6': 'longitude',
                'field7': 'ecg_avg'
            })
            
            df['ecg_samples'] = df['field8'].apply(lambda x: json.loads(x) if isinstance(x, str) else [])
            df = df.drop(columns=[col for col in df.columns if col.startswith('field')])
            
            self.df = df
            print(f"Successfully fetched {len(df)} records")
            print(f"Date range: {df['created_at'].min()} to {df['created_at'].max()}")
            return df
            
        except Exception as e:
            print(f"Error fetching data: {e}")
            return None
        
    def send_alert_to_thingspeak(self):
        """Send combined alert status to ThingSpeak field2 (0-5)"""
        if not hasattr(self, 'risk_scores') or len(self.risk_scores) == 0:
            print("No risk scores available to send")
            return False
            
        latest_risk = self.risk_scores.iloc[-1]
        risk_level = latest_risk['risk_level']
        temperature = latest_risk['temperature'] if 'temperature' in latest_risk else np.nan
        
        alert_signal = self.generate_combined_alert(risk_level, temperature)
        
        url = "https://api.thingspeak.com/update.json"
        params = {
            "api_key": self.write_api_key,
            "field2": alert_signal
        }
        
        try:
            response = requests.get(url, params=params)
            if response.status_code == 200:
                print(f"Sent combined alert signal {alert_signal} (Risk: {risk_level}, Fever: {self.check_fever(temperature)})")
                return True
            else:
                print(f"Failed to send alert. Status code: {response.status_code}")
                return False
        except Exception as e:
            print(f"Error sending to ThingSpeak: {e}")
            return False
    
    def extract_ecg_features(self):
        """Extract features from ECG data"""
        if self.df is None or len(self.df) == 0:
            print("No data available for feature extraction")
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

        # Require critical fields
        critical_fields = ['ecg_avg', 'heart_rate', 'spo2', 'temperature']
        self.df = self.df.dropna(subset=critical_fields)
        print(f"Records with complete data: {len(self.df)}")

        if len(self.df) == 0:
            print("No valid records after NaN removal")
            return False

        # Calculate features
        median_ecg = self.df['ecg_avg'].median()
        
        self.df['qrs_width'] = 0.08
        self.df['qrs_amplitude'] = self.df['ecg_avg'] * 0.25
        self.df['st_elevation'] = (self.df['ecg_avg'] > median_ecg * 1.3).astype(int)
        self.df['t_wave_inversion'] = (self.df['ecg_avg'] < 0).astype(int)
        self.df['rr_interval_variance'] = 60 / self.df['heart_rate'] * 0.15
        
        # Rolling features
        self.df['hr_variance'] = self.df['heart_rate'].rolling(3, min_periods=1).std()
        self.df['hr_spo2_ratio'] = self.df['heart_rate'] / self.df['spo2']

        # Final validation
        self.df = self.df.dropna(subset=features)
        print(f"Final valid records: {len(self.df)}")
        return True
    
    def apply_linear_regression(self):
        """Apply linear regression model"""
        if self.df is None or len(self.df) < 10:
            print(f"Not enough data ({len(self.df) if self.df else 0} records)")
            return False

        feature_cols = [
            'st_elevation', 'hr_variance', 'qrs_width', 
            'qrs_amplitude', 't_wave_inversion', 'hr_spo2_ratio',
            'spo2', 'temperature', 'rr_interval_variance'
        ]
        
        X = self.df[feature_cols].replace([np.inf, -np.inf], np.nan).dropna()
        if len(X) < 10:
            print(f"Only {len(X)} valid feature vectors after cleanup")
            return False

        try:
            X_scaled = self.scaler.fit_transform(X)
        except Exception as e:
            print(f"Scaling failed: {str(e)}")
            return False

        risk_scores = np.zeros(len(X_scaled))
        for i, feature in enumerate(feature_cols):
            if feature in self.feature_weights:
                risk_scores += X_scaled[:, i] * self.feature_weights[feature]
        
        risk_scores += 50
        risk_scores = 100 * (risk_scores - np.min(risk_scores)) / (np.ptp(risk_scores) + 1e-10)

        valid_mask = X.index
        self.df['risk_score'] = np.nan
        self.df.loc[valid_mask, 'risk_score'] = risk_scores
        
        self.df['risk_level'] = 'Low'
        self.df.loc[self.df['risk_score'] > self.warning_threshold, 'risk_level'] = 'Moderate'
        self.df.loc[self.df['risk_score'] > self.risk_threshold, 'risk_level'] = 'High'
        
        self.risk_scores = self.df.loc[valid_mask, ['created_at', 'risk_score', 'risk_level', 'temperature']]
        
        print(f"Risk assessment complete. {len(self.risk_scores)} valid predictions.")
        print(f"High risk cases: {sum(self.risk_scores['risk_level'] == 'High')}")
        return True
    
    def analyze_data(self):
        """Run the complete analysis pipeline"""
        success = self.extract_ecg_features()
        if not success:
            return False
        
        success = self.apply_linear_regression()
        if not success:
            return False
        
        self.send_alert_to_thingspeak()
        return True
    
    def visualize_results(self):
        """Visualize the analysis results"""
        if self.df is None or len(self.df) == 0 or len(self.risk_scores) == 0:
            print("No data available for visualization")
            return
        
        plt.figure(figsize=(20, 15))
        
        # Plot 1: Vital Signs with Fever Indicators
        plt.subplot(4, 1, 1)
        plt.plot(self.df['created_at'], self.df['heart_rate'], 'r-', label='Heart Rate')
        plt.plot(self.df['created_at'], self.df['spo2'], 'b-', label='SpO2')
        
        # Add fever markers
        if 'temperature' in self.df:
            fever_mask = self.df['temperature'] >= self.fever_threshold
            plt.scatter(self.df['created_at'][fever_mask], 
                       self.df['heart_rate'][fever_mask], 
                       c='orange', marker='x', label='Fever Episodes')
        
        plt.title('Vital Signs with Fever Indicators')
        plt.legend()
        plt.grid(True)
        
        # Plot 2: Temperature
        plt.subplot(4, 1, 2)
        plt.plot(self.df['created_at'], self.df['temperature'], 'm-')
        plt.axhline(y=self.fever_threshold, color='r', linestyle='--', label='Fever Threshold')
        plt.title('Body Temperature')
        plt.ylabel('°C')
        plt.legend()
        plt.grid(True)
        
        # Plot 3: ECG Features
        plt.subplot(4, 1, 3)
        plt.plot(self.df['created_at'], self.df['st_elevation'], 'g-', label='ST Elevation')
        plt.plot(self.df['created_at'], self.df['t_wave_inversion'], 'c-', label='T Wave Inversion')
        plt.title('ECG Features')
        plt.legend()
        plt.grid(True)
        
        # Plot 4: Risk Score with Combined Alerts
        plt.subplot(4, 1, 4)
        plt.plot(self.risk_scores['created_at'], self.risk_scores['risk_score'], 'k-')
        plt.axhline(y=self.risk_threshold, color='r', linestyle='--', label='High Risk Threshold')
        plt.axhline(y=self.warning_threshold, color='y', linestyle='--', label='Warning Threshold')
        
        # Add alert signal markers
        if not self.risk_scores.empty:
            alerts = [self.generate_combined_alert(row['risk_level'], row['temperature']) 
                     for _, row in self.risk_scores.iterrows()]
            colors = ['green', 'yellow', 'red', 'blue', 'orange', 'purple']
            for i in range(6):
                mask = [a == i for a in alerts]
                plt.scatter(self.risk_scores['created_at'][mask], 
                           self.risk_scores['risk_score'][mask], 
                           c=colors[i], label=f'Alert {i}')
        
        plt.title('Risk Score with Combined Alerts')
        plt.ylabel('Risk Score (0-100)')
        plt.legend()
        plt.grid(True)
        
        plt.tight_layout()
        plt.show()
        
        # Print alert summary
        self.print_alert_summary()
    
    def print_alert_summary(self):
        """Print summary of all alert types"""
        if len(self.risk_scores) == 0:
            return
            
        print("\n=== Alert Summary ===")
        alerts = []
        for _, row in self.risk_scores.iterrows():
            alerts.append(self.generate_combined_alert(row['risk_level'], row['temperature']))
        
        alert_counts = {i: alerts.count(i) for i in range(6)}
        
        alert_descriptions = [
            "0: Normal (no fever, low risk)",
            "1: Moderate cardiac risk (no fever)",
            "2: High cardiac risk (no fever)",
            "3: Fever (low cardiac risk)",
            "4: Fever + moderate cardiac risk",
            "5: Fever + high cardiac risk (CRITICAL)"
        ]
        
        for alert, count in alert_counts.items():
            print(f"{alert_descriptions[alert]}: {count} occurrences")
        
        if alert_counts.get(5, 0) > 0:
            print("\nWARNING: Critical alerts detected! Immediate medical attention required.")
    
    def get_latest_status(self):
        """Get the latest combined status"""
        if len(self.risk_scores) == 0:
            return None, None, None
        
        latest = self.risk_scores.iloc[-1]
        temperature = latest['temperature'] if 'temperature' in latest else np.nan
        alert_signal = self.generate_combined_alert(latest['risk_level'], temperature)
        
        return latest['risk_level'], latest['risk_score'], alert_signal


# Example usage with enhanced status reporting
if __name__ == "__main__":
    detector = HeartAttackDetector()
    
    # Set your ThingSpeak credentials
    detector.channel_id = "2895763"
    detector.read_api_key = "MWFBV98HOZOHTHY4"
    detector.write_api_key = "RJ8ZDWY2PBQMPXU5"
    
    while True:
        print("\n" + "="*50)
        print(f"Running analysis at {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*50)
        
        # Fetch data from ThingSpeak
        data = detector.fetch_data_from_thingspeak(results=1000)
        
        if data is not None and len(data) > 0:
            # Analyze the data
            success = detector.analyze_data()
            
            if success:
                # Get latest status
                risk_level, risk_score, alert_signal = detector.get_latest_status()
                print(f"\nLatest Combined Status: Signal {alert_signal}")
                print(f"Details - Risk: {risk_level} (Score: {risk_score:.1f})")
                
                # Action recommendations (same as before)
                if alert_signal == 0:
                    print("Action: All vitals normal - routine monitoring")
                elif alert_signal == 1:
                    print("Action: Moderate cardiac risk - consult doctor when possible")
                elif alert_signal == 2:
                    print("ACTION: High cardiac risk! Seek immediate medical help")
                elif alert_signal == 3:
                    print("Action: Fever detected - monitor and consider antipyretics")
                elif alert_signal == 4:
                    print("ACTION: Fever with cardiac risk - urgent medical evaluation needed")
                elif alert_signal == 5:
                    print("EMERGENCY: Critical condition! Call emergency services immediately")
        else:
            print("Unable to proceed with analysis due to insufficient data.")
        
        # Wait 2 seconds before next iteration
        time.sleep(15)
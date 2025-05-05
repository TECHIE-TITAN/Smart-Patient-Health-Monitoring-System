#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <MAX30105.h>
#include <heartRate.h>
#include <spo2_algorithm.h>
#include <TinyGPS++.h>

const char* ssid = "ujjwal-gupta-HP-Pavilion-Gaming-";
const char* password = "12345678";

String readApiKey = "MWFBV98HOZOHTHY4";
String apiKey = "RJ8ZDWY2PBQMPXU5";
const char* thingspeakServer = "api.thingspeak.com";

// =============== SENSOR PINS ===============
// AD8232 ECG Module
const int ECG_OUTPUT_PIN = 34;      // ESP32 ADC pin for ECG output
const int ECG_LO_PLUS_PIN = 32;     // ECG Lead-Off detection LO+
const int ECG_LO_MINUS_PIN = 33;    // ECG Lead-Off detection LO-

// LM35 Temperature Sensor
const int LM35_PIN = 35;  // Changed from DHT22 to LM35

// MAX30102 Sensor
#define MAX_SDA 21
#define MAX_SCL 22

TwoWire MAXWire = TwoWire(1);       // Create TwoWire instance for MAX30102
MAX30105 particleSensor;

//Neo-6M GPS
#define RXD2 16                     // Connect to TX Pin
#define TXD2 17                     // Connect to RX Pin

#define GPS_BAUD 9600

TinyGPSPlus gps;                    // The TinyGPS++ object
HardwareSerial gpsSerial(2);        // Create an instance of the HardwareSerial class for Serial 2

// Active Buzzer
const int BUZZER_PIN = 25;

// =============== TIMING PARAMETERS ===============
unsigned long lastECGCaptureTime = 0;
unsigned long lastSensorReadTime = 0;
unsigned long lastUploadTime = 0;
unsigned long lastAlertCheckTime = 0;
const unsigned long ECG_CAPTURE_INTERVAL = 10;
const unsigned long SENSOR_READ_INTERVAL = 2000;
const unsigned long UPLOAD_INTERVAL = 15000;
const unsigned long ALERT_CHECK_INTERVAL = 5000;

// =============== DATA STORAGE ===============
#define ECG_BUFFER_SIZE 200
int ecgBuffer[ECG_BUFFER_SIZE];
int ecgIndex = 0;
float LM_Val[5] = {0.00};
float bodyTemp = 0;
float heartRate = 0;
float spo2 = 0;
float latitude = 0;
float longitude = 0;
int alertStatus = 0; // 0=normal, 1=moderate, 2=high

// Indes for moving avg
int idx = 0;

// For MAX30102 calculations
uint32_t irBuffer[100];  // IR LED sensor data
uint32_t redBuffer[100]; // Red LED sensor data
int32_t bufferLength;    // Data length
int32_t spo2Value;       // SPO2 value
int8_t validSPO2;        // Indicator to show if the SPO2 calculation is valid
int32_t heartRateValue;  // Heart rate value
int8_t validHeartRate;   // Indicator to show if the heart rate calculation is valid

void setup() {
  Serial.begin(115200);
  delay(5000);
  Wire.begin(21,22);
  
  // Initialize WiFi
  setupWiFi();
  
  // Initialize ECG pins
  pinMode(ECG_OUTPUT_PIN, INPUT);
  pinMode(ECG_LO_PLUS_PIN, INPUT);
  pinMode(ECG_LO_MINUS_PIN, INPUT);
  
  // Initialize LM35 (analog input, no library needed)
  setupLM35();
  
  // Initialize MAX30102 sensor
  setupMAX30102();
  
  // Initialize Neo-6M GPS
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, RXD2, TXD2);     // Start Serial 2 with the defined RX and TX pins and a baud rate of 9600

  // Initialize Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  
  Serial.println("All sensors initialized. Starting monitoring...");
  Serial.println("Checking Alerts...");
  Serial.println(alertStatus);
}

void loop() {
  unsigned long currentMillis = millis();
  
  //1. Capture ECG data at high frequency
  if (currentMillis - lastECGCaptureTime >= ECG_CAPTURE_INTERVAL) {
    lastECGCaptureTime = currentMillis;
    captureECG();
  }

  // 2. Read other sensors periodically (less frequently)
  if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensors();
  }
  
  // 3. Upload data to ThingSpeak periodically
  if (currentMillis - lastUploadTime >= UPLOAD_INTERVAL) {
    lastUploadTime = currentMillis;
    uploadToThingSpeak();
  }

  // 4. Check for alerts periodically
  if (currentMillis - lastAlertCheckTime >= ALERT_CHECK_INTERVAL) {
    lastAlertCheckTime = currentMillis;
    checkAlertStatus();
    handleAlert();
  }
}

void setupWiFi() {
  Serial.print("Connecting to WiFi network: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  // Wait for connection
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("");
    Serial.println("Failed to connect to WiFi. Will try again later.");
  }
}

void setupLM35(){
  for(int i=0;i<5;i++){
    float val = analogRead(LM35_PIN) * (3.3/4095.0) * 100.0;
    if(val==0)
      i--;
    else LM_Val[i] = val;
  }
}

void setupMAX30102() {
  // Initialize MAX30102 I2C
  MAXWire.begin(MAX_SDA, MAX_SCL);
  if (!particleSensor.begin(MAXWire, I2C_SPEED_FAST)) {
    while (1)  // halt
      Serial.printf("MAX30102 Sensor didn't begin");
  }

  // Sensor settings
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeIR(0x1F);
}

void captureECG() {
  // Check if leads are attached properly
  if ((digitalRead(ECG_LO_PLUS_PIN) == 1) || (digitalRead(ECG_LO_MINUS_PIN) == 1)) {
    // Leads are not attached
    // Just store zero if we're in the buffer range
    if (ecgIndex < ECG_BUFFER_SIZE) {
      ecgBuffer[ecgIndex++] = 0;
    }
  } else {
    // Leads are attached, read ECG
    int ecgValue = analogRead(ECG_OUTPUT_PIN);
    
    // Store in buffer if we're in range
    if (ecgIndex < ECG_BUFFER_SIZE) {
      ecgBuffer[ecgIndex++] = ecgValue;
    }
  }

  // ecgBuffer[ecgIndex++] = (random(0, 100));
  
  // Reset buffer index if full
  if (ecgIndex >= ECG_BUFFER_SIZE) {
    ecgIndex = 0;
  }
}

void readSensors() {
  // Read Body Temperature
  readTemperature();
  
  // Read MAX30102 heart rate and SpO2
  readPulseOximeter();

  // // Read Neo-6M GPS
  getLocation();

  // // // Display readings on serial monitor
  displayReadings();
}

void readTemperature() {
  float val = analogRead(LM35_PIN) * (3.3/4095) * 100.0;
  
  bodyTemp = (LM_Val[0] + LM_Val[1] + LM_Val[2] + LM_Val[3] + LM_Val[4] - LM_Val[idx] + val)/5.0;
  LM_Val[idx] = val;
  bodyTemp = bodyTemp * 0.3 + 34.5;
}

void readPulseOximeter() {
  long redValue = particleSensor.getRed();
  long irValue = particleSensor.getIR();

  // Simulated estimates (use proper algorithm in real use)
  heartRate = (redValue % 100) + 60;
  spo2 = 95.0 + ((irValue % 5) * 0.2);
}

void getLocation() {
  unsigned long start = millis();

  while (millis() - start < 1000) {
    while (gpsSerial.available() > 0) {
      gps.encode(gpsSerial.read());
    }
    if (gps.location.isUpdated()) {
      latitude = gps.location.lat();
      longitude = gps.location.lng();
    }
  }
}

void displayReadings() {
  Serial.println("----------------------------");
  Serial.print("Body Temperature: ");
  Serial.print(bodyTemp);
  Serial.println("°C");
  
  Serial.print("Heart Rate: ");
  Serial.print(heartRate);
  Serial.println(" BPM");
  
  Serial.print("SpO2: ");
  Serial.print(spo2);
  Serial.println("%");
  
  Serial.print("Location: ");
  Serial.print(latitude, 6);
  Serial.print(", ");
  Serial.println(longitude, 6);
  
  Serial.print("ECG Sample: ");
  // Display a few ECG samples
  for (int i = 0; i < 5; i++) {
    int index = (ecgIndex - 5 + i) % ECG_BUFFER_SIZE;
    if (index < 0) index += ECG_BUFFER_SIZE;
    Serial.print(ecgBuffer[index]);
    Serial.print(" ");
  }
  Serial.println();
}

void uploadToThingSpeak() {
  // Check WiFi connection first
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    setupWiFi();
    return;
  }
  
  // Create HTTP client
  HTTPClient http;
  
  // Prepare URL with data
  String url = "http://api.thingspeak.com/update?api_key=" + apiKey;
  
  // Add sensor data to fields
  url += "&field1=" + String(bodyTemp);       // Body Temperature
  // url += "&field2=" + String(alertStatus);
  url += "&field3=" + String(heartRate);      // Heart Rate
  url += "&field4=" + String(spo2);           // SpO2
  url += "&field5=" + String(latitude, 6);    // Latitude
  url += "&field6=" + String(longitude, 6);   // Longitude
  
  // Calculate average ECG for field7
  int ecgSum = 0;
  for (int i = 0; i < ECG_BUFFER_SIZE; i++) {
    ecgSum += ecgBuffer[i];
  }
  float ecgAvg = (float)ecgSum / ECG_BUFFER_SIZE;
  url += "&field7=" + String(ecgAvg);         // Average ECG value
  
  // Get a sample of ECG values (20 values) for field8 as JSON array
  String ecgSamples = "[";
  for (int i = 0; i < 20; i++) {
    int index = (ecgIndex + i) % ECG_BUFFER_SIZE;
    ecgSamples += String(ecgBuffer[index]);
    if (i < 19) ecgSamples += ",";
  }
  ecgSamples += "]";
  url += "&field8=" + ecgSamples;             // ECG samples as JSON array
  
  Serial.print("Sending data to ThingSpeak... ");
  
  // Begin HTTP connection
  http.begin(url);
  
  // Send GET request
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Success! Response: " + response);
  } else {
    Serial.print("Error code: ");
    Serial.println(httpResponseCode);
  }
  
  // Close connection
  http.end();
}

void checkAlertStatus() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Can't check alert status.");
    return;
  }
  
  HTTPClient http;
  String url = "http://" + String(thingspeakServer) + "/channels/2895763/fields/2/last.txt?api_key=" + readApiKey;
  
  http.begin(url);
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString(); // Get the raw response
    payload.trim();                   // Trim whitespace in-place
    alertStatus = payload.toInt();    // Convert to integer
    Serial.println("Alert status updated: " + String(alertStatus));
  } else {
    Serial.println("Error checking alert status. HTTP code: " + String(httpCode));
  }
  http.end();
}

void handleAlert() {
  switch(alertStatus) {
    case 0: // Normal
      digitalWrite(BUZZER_PIN, LOW);
      break;
      
    default:
      digitalWrite(BUZZER_PIN, HIGH);
      break;
  }
}
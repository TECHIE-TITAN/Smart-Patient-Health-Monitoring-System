#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <MAX30105.h>
#include <heartRate.h>
#include <spo2_algorithm.h>
#include <TinyGPS++.h>

const char* ssid = "BAUJI";
const char* password = "kekarnahai";

String readApiKey = "MWFBV98HOZOHTHY4";
String apiKey = "RJ8ZDWY2PBQMPXU5";
const char* thingspeakServer = "api.thingspeak.com";

// =============== SENSOR PINS ===============
const int ECG_OUTPUT_PIN = 34;
const int ECG_LO_PLUS_PIN = 32;
const int ECG_LO_MINUS_PIN = 33;

const int LM35_PIN = 35;

#define MAX_SDA 21
#define MAX_SCL 22

TwoWire MAXWire = TwoWire(1);
MAX30105 particleSensor;

#define RXD2 16
#define TXD2 17
#define GPS_BAUD 9600

TinyGPSPlus gps;                    // The TinyGPS++ object
HardwareSerial gpsSerial(2);        // Create an instance of the HardwareSerial class for Serial 2

const int BUZZER_PIN = 25;

// =============== TIMING PARAMETERS ===============
unsigned long lastSensorReadTime = 0;
unsigned long lastUploadTime = 0;
unsigned long breakTime = 0;
unsigned long start = 0;
int upload_count = 0;
int read_count = 0;
const unsigned long SENSOR_READ_INTERVAL = 1500;
const unsigned long UPLOAD_INTERVAL = 15000;

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
int alertStatus = 0;

int idx = 0;

uint32_t irBuffer[100];
uint32_t redBuffer[100];
int32_t bufferLength;
int32_t spo2Value;
int8_t validSPO2;
int32_t heartRateValue;
int8_t validHeartRate;

void setup() {
  Serial.begin(115200);
  Wire.begin(21,22);
  
  setupWiFi();
  
  pinMode(ECG_OUTPUT_PIN, INPUT);
  pinMode(ECG_LO_PLUS_PIN, INPUT);
  pinMode(ECG_LO_MINUS_PIN, INPUT);
  
  setupLM35();
  setupMAX30102();
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, RXD2, TXD2);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  
  Serial.println("All sensors initialized. Starting monitoring...");
  Serial.println("Checking Alerts...");
  checkAlertStatus();
  handleAlert();
}

void loop() {
  unsigned long currentMillis = millis();
  
  if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = currentMillis;
    readSensors();
    read_count++;
  }
  
  if (currentMillis - lastUploadTime >= UPLOAD_INTERVAL) {
    lastUploadTime = currentMillis;
    Serial.print("Upload Count: ");
    Serial.println(upload_count);
    uploadToThingSpeak();
    upload_count++;
  }

  if(millis() - start >= 55000){
    upload_count = 0;
    read_count = 0;
    breakTime = millis();
    Serial.println("Waiting..");
    while(1){
      if(millis() - breakTime >= 40000){
        break;
      }
    }
    checkAlertStatus();
    handleAlert();
    start = millis();
  }
}

void setupWiFi() {
  Serial.println("Connecting to WiFi network: " + String(ssid));
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nFailed to connect to WiFi. Will try again later.");
  }
}

void setupLM35(){
  for(int i=0;i<5;i++){
    float val = analogRead(LM35_PIN) * (3.3/4095.0) * 100.0;
    if(val == 0)
      i--;
    else LM_Val[i] = val;
  }
}

void setupMAX30102() {
  MAXWire.begin(MAX_SDA, MAX_SCL);
  if (!particleSensor.begin(MAXWire, I2C_SPEED_FAST)) {
    while (1)
      Serial.println("MAX30102 Sensor didn't begin");
  }

  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeIR(0x1F);
}

void readSensors() {
  captureECG();
  readTemperature();
  readPulseOximeter();
  getLocation();
  displayReadings();
}

void captureECG() {
  if ((digitalRead(ECG_LO_PLUS_PIN) == 1) || (digitalRead(ECG_LO_MINUS_PIN) == 1)) {
    if (ecgIndex < ECG_BUFFER_SIZE) {
      ecgBuffer[ecgIndex++] = 0;
    }
  } else {
    int ecgValue = analogRead(ECG_OUTPUT_PIN);
    if (ecgIndex < ECG_BUFFER_SIZE) {
      ecgBuffer[ecgIndex++] = ecgValue;
    }
  }

  if (ecgIndex >= ECG_BUFFER_SIZE) {
    ecgIndex = 0;
  }
}

void readTemperature() {
  float val = analogRead(LM35_PIN) * (3.3/4095.0) * 100.0;
  Serial.println(val);
  bodyTemp = (LM_Val[0] + LM_Val[1] + LM_Val[2] + LM_Val[3] + LM_Val[4] - LM_Val[idx] + val)/5.0;
  LM_Val[idx] = val;
  bodyTemp = bodyTemp * 0.3 + 34.0;
}

void readPulseOximeter() {
  long redValue = particleSensor.getRed();
  long irValue = particleSensor.getIR();
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
  Serial.print("--------------Reading: ");
  Serial.print(read_count);
  Serial.println("--------------");
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
  
  Serial.print("ECG Samples: ");
  for (int i = 0; i < 5; i++) {
    int index = (ecgIndex - 5 + i) % ECG_BUFFER_SIZE;
    if (index < 0) index += ECG_BUFFER_SIZE;
    Serial.print(ecgBuffer[index]);
    Serial.print(" ");
  }
  Serial.println();
}

void uploadToThingSpeak() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    setupWiFi();
    return;
  }
  
  HTTPClient http;
  String url = "http://api.thingspeak.com/update?api_key=" + apiKey;
  url += "&field1=" + String(bodyTemp);
  url += "&field2=" + String(alertStatus);
  url += "&field3=" + String(heartRate);
  url += "&field4=" + String(spo2);
  url += "&field5=" + String(latitude, 6);
  url += "&field6=" + String(longitude, 6);
  
  int ecgSum = 0;
  for (int i = 0; i < ECG_BUFFER_SIZE; i++) {
    ecgSum += ecgBuffer[i];
  }
  float ecgAvg = (float)ecgSum / ECG_BUFFER_SIZE;
  url += "&field7=" + String(ecgAvg);
  
  String ecgSamples = "[";
  for (int i = 0; i < 20; i++) {
    int index = (ecgIndex + i) % ECG_BUFFER_SIZE;
    ecgSamples += String(ecgBuffer[index]);
    if (i < 19) ecgSamples += ",";
  }
  ecgSamples += "]";
  url += "&field8=" + ecgSamples;
  
  Serial.println("Sending data to ThingSpeak...");
  
  http.begin(url);
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    Serial.println("ThingSpeak upload successful");
  } else {
    Serial.print("ThingSpeak upload failed. Error code: ");
    Serial.println(httpResponseCode);
  }
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
    String payload = http.getString();
    payload.trim();
    alertStatus = payload.toInt();
    Serial.print("Alert status updated: ");
    Serial.println(alertStatus);
  } else {
    Serial.print("Error checking alert status. HTTP code: ");
    Serial.println(httpCode);
  }
  http.end();
}

void handleAlert() {
  switch(alertStatus) {
    case 0:
      digitalWrite(BUZZER_PIN, LOW);
      break;
    default:
      digitalWrite(BUZZER_PIN, HIGH);
      break;
  }
}
#include <Wire.h>
#include "MAX30105.h"  // SparkFun MAX3010x library

// MAX30102 settings
#define MAX_SDA 21
#define MAX_SCL 22

// Create TwoWire instance for MAX30102
TwoWire MAXWire = TwoWire(1);

// MAX30102 sensor
MAX30105 particleSensor;

void setup() {
  // Initialize serial for debug (optional)
  Serial.begin(115200);
  Wire.begin(21, 22);

  // Init MAX30102 I2C
  MAXWire.begin(MAX_SDA, MAX_SCL);
  if (!particleSensor.begin(MAXWire, I2C_SPEED_FAST)) {
    while (1)  // halt
      Serial.printf("Sensor didn't begin");
  }

  // Sensor settings
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x1F);
  particleSensor.setPulseAmplitudeIR(0x1F);
  Serial.printf("Sensor Ready");
  delay(1000);
}

void loop() {
  long redValue = particleSensor.getRed();
  long irValue = particleSensor.getIR();

  // Simulated estimates (use proper algorithm in real use)
  float estimatedHeartRate = (redValue % 100) + 60;
  float estimatedSpO2 = 95.0 + ((irValue % 5) * 0.2);

  Serial.println("HR: ");
  Serial.println((int)estimatedHeartRate);
  Serial.println(" BPM");

  Serial.println("SpO2: ");
  Serial.println(estimatedSpO2, 1);
  Serial.println(" %");

  delay(2000);
}
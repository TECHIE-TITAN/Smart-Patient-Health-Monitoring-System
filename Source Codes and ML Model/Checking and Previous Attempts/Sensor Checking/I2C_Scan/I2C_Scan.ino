#include <Wire.h>

void setup() {
  Wire.begin(21, 22);  // Default SDA/SCL (can also do Wire.begin(SDA, SCL) for ESP32)
  Serial.begin(115200);
  delay(1000);
  Serial.println("Scanning for I2C devices...");

  byte count = 0;

  for (byte address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();

    if (error == 0) {
      Serial.print("I2C device found at 0x");
      if (address < 16) Serial.print("0");
      Serial.print(address, HEX);
      Serial.println();
      count++;
    } else if (error == 4) {
      Serial.print("Unknown error at 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
    }
  }

  if (count == 0) {
    Serial.println("No I2C devices found.");
  } else {
    Serial.print("Total devices found: ");
    Serial.println(count);
  }
}

void loop() {
  // Do nothing
}
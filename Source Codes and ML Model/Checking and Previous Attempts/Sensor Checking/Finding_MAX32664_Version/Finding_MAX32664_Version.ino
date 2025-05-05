#include <Wire.h>
#include "max32664.h"

#define SDA_PIN 21  // ESP32 I²C SDA
#define SCL_PIN 22  // ESP32 I²C SCL
#define MFIO_PIN 4  // Mode control
#define RST_PIN 5   // Reset pin
#define BUF_LEN 100  // Buffer length

max32664 bioHub(RST_PIN, MFIO_PIN, BUF_LEN);

void setup() {
    Serial.begin(115200);
    Wire.begin(SDA_PIN, SCL_PIN);

    Serial.println("Checking MAX32664 Version...");

    if (bioHub.hubBegin() != 0) {
        Serial.println("❌ Failed to communicate with MAX32664!");
        while (1);
    }

    Serial.println("✅ MAX32664 Connected!");

    // Read sensor hub firmware version
    if (bioHub.readSensorHubVersion()) {
        Serial.println("✅ Successfully read MAX32664 firmware version!");
    } else {
        Serial.println("❌ Failed to read MAX32664 firmware version.");
    }

    // Read algorithm version
    if (bioHub.readSensorHubAlgoVersion()) {
        Serial.println("✅ Successfully read MAX32664 algorithm version!");
    } else {
        Serial.println("❌ Failed to read MAX32664 algorithm version.");
    }

    // Identify MAX32664 Version
    uint8_t version = bioHub.readNumSamples();  // Check what this returns
    Serial.print("🔍 MAX32664 Version Detected: ");
    Serial.println(version);

    // Based on the firmware version, map to a MAX32664 variant
    switch (version) {
        case 0x00:
            Serial.println("➡️ MAX32664 Version A detected");
            break;
        case 0x01:
            Serial.println("➡️ MAX32664 Version B detected");
            break;
        case 0x02:
            Serial.println("➡️ MAX32664 Version C detected");
            break;
        case 0x03:
            Serial.println("➡️ MAX32664 Version D detected");
            break;
        default:
            Serial.println("⚠️ Unknown MAX32664 version!");
            break;
    }
}

void loop() {
    // No looping process needed
}

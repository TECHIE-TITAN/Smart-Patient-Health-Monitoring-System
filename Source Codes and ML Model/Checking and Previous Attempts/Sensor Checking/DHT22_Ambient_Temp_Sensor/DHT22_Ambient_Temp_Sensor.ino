#include <Adafruit_Sensor.h>
#include <DHT.h>
#include <DHT_U.h>

#define DHTPIN 16      // Connect DHT22 data pin to GPIO 4 (change as needed)
#define DHTTYPE DHT22 // Use DHT22 sensor

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  Serial.println("DHT22 Sensor Test");
  
  dht.begin();
}

void loop() {
  float temperature = dht.readTemperature();  // Read temperature in Celsius
  float humidity = dht.readHumidity();       // Read humidity

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  Serial.print("Temperature: ");
  Serial.print(temperature);
  Serial.println("°C");

  Serial.print("Humidity: ");
  Serial.print(humidity);
  Serial.println("%");

  delay(2000); // Wait 2 seconds before next reading
}

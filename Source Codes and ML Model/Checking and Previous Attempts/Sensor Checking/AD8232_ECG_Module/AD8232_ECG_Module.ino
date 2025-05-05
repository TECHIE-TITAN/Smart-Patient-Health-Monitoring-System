/* https://www.youtube.com/watch?v=0yO3gqeoMJg */

// AD8232 ECG Sensor with ESP32
// Reads ECG signal and detects if leads are disconnected

// Adjust these pins based on your ESP32 board layout
const int ECG_PIN = 34;      // Analog input for ECG signal (GPIO34 is ADC-capable)
const int LO_PLUS = 25;      // LO+ pin
const int LO_MINUS = 26;     // LO- pin

void setup() {
  Serial.begin(115200); // ESP32 can handle faster baud rates

  pinMode(LO_PLUS, INPUT);
  pinMode(LO_MINUS, INPUT);
}

void loop() {
  // Check for leads-off condition
  if (digitalRead(LO_PLUS) == 1 || digitalRead(LO_MINUS) == 1) {
    Serial.println("!");
  } else {
    int ecgValue = analogRead(ECG_PIN); // 0 to 4095 (12-bit ADC)
    Serial.println(ecgValue);
  }

  delay(100); // Minimal delay for fast data stream to Serial Plotter
}


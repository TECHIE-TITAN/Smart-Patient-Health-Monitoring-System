// const int LM_PIN = 35;
// float LM_Val[5] = {0.00};
// int idx = 0;
// float BodyTemp;

// void setup() {
//   // put your setup code here, to run once:
//   Serial.begin(115200);
//   delay(2000);
//   setupLM35();
// }

// void loop() {
//   // put your main code here, to run repeatedly:
//   ReadBodyTemp();
//   delay(500);
// }

// void setupLM35(){
//   for(int i=0;i<5;i++){
//     float val = analogRead(LM_PIN) * (3.3/4095.0) * 100.0;
//     if(val==0)
//       i--;
//     else LM_Val[i] = val;
//   }
// }

// void ReadBodyTemp(){
//   float val = analogRead(LM_PIN) * (3.3/4095) * 100.0;
//   Serial.print("Reading: ");
//   Serial.print(val);
  
//   if(val!=0){
//     BodyTemp = (LM_Val[0] + LM_Val[1] + LM_Val[2] + LM_Val[3] + LM_Val[4] - LM_Val[idx] + val)/5.0;
//     LM_Val[idx] = val;
//     BodyTemp = BodyTemp * 0.3 + 30.5;

//     idx = (idx + 1)%5;
//   }

//   Serial.print(" Celsius | BodyTemp: ");
//   Serial.print(BodyTemp);
//   Serial.println(" Celsius");
// }

const int lm35Pin = 35; // Use a reliable ADC1 pin

void setup() {
  Serial.begin(115200);
}

void loop() {
  int adcValue = analogRead(lm35Pin);
  float voltage = adcValue * (3.3 / 4095.0);
  float temperatureC = voltage * 100.0;

  Serial.print("ADC Value: "); Serial.print(adcValue);
  Serial.print(" | Voltage: "); Serial.print(voltage, 3);
  Serial.print(" V | Temp: "); Serial.print(temperatureC, 2);
  Serial.println(" °C");

  delay(1000);
}
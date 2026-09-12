/*
 * Hardware Test - Forest Fire Detection System
 * NodeMCU ESP8266
 *
 * Opens independently in Arduino IDE. Tests each sensor/component
 * individually BEFORE loading the full forest-fire firmware.
 *
 * WIRING:
 *   DHT11        -> D2  (GPIO4)  power: 3.3V, GND
 *   MQ-2 (smoke) -> A0  (analog) power: 5V (or 3.3V), GND
 *   IR Flame     -> D1  (GPIO5)  ACTIVE LOW (LOW = flame present)
 *   Piezo Buzzer -> D5  (GPIO14) (+ to SIG, - to GND)
 *   Red LED      -> D6  (GPIO12) (use 220 ohm resistor to GND)
 *
 * Open this folder in Arduino IDE -> Board: NodeMCU 1.0 ->
 * Upload -> Serial Monitor @ 115200 baud.
 */

#include <DHT.h>

#define DHTPIN      D2
#define DHTTYPE     DHT11
#define FLAME_PIN   D1
#define MQ2_PIN     A0
#define BUZZER_PIN  D5
#define LED_PIN     D6

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(FLAME_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  dht.begin();

  Serial.println();
  Serial.println("===========================================");
  Serial.println("  HARDWARE TEST - FOREST FIRE DETECTOR");
  Serial.println("===========================================");

  // Buzzer test: two short beeps
  Serial.println("TEST: Buzzer -> 2 beeps now");
  tone(BUZZER_PIN, 1000, 200); delay(400);
  tone(BUZZER_PIN, 1000, 200); delay(400);
  noTone(BUZZER_PIN);

  // LED test: 5 slow blinks
  Serial.println("TEST: LED -> 5 blinks now");
  for (int i = 0; i < 5; i++) {
    digitalWrite(LED_PIN, HIGH); delay(250);
    digitalWrite(LED_PIN, LOW);  delay(250);
  }

  Serial.println("Now reading sensors...");
  Serial.println("-------------------------------------------");
}

void loop() {
  bool valid = true;

  float tempC = dht.readTemperature();
  float hum   = dht.readHumidity();
  if (isnan(tempC) || isnan(hum)) {
    valid = false;
    tempC = 0; hum = 0;
  }

  int smoke = analogRead(MQ2_PIN);
  int flame = digitalRead(FLAME_PIN);

  Serial.print("DHT11  temp = ");
  if (valid) {
    Serial.print(tempC, 1);
    Serial.print(" C, humidity = ");
    Serial.print(hum, 1);
    Serial.println(" %");
  } else {
    Serial.println("*** FAIL: no reading (check 3.3V/GND + D2 wiring) ***");
  }

  Serial.print("MQ-2   smoke ADC = ");
  Serial.print(smoke);
  Serial.print(valid ? "   (fresh air: ~50-200, rises with smoke)\n" : "\n");

  Serial.print("Flame  digital = ");
  Serial.print(flame);
  Serial.println(flame == LOW ? " -> FLAME DETECTED" : " -> no flame (LOW = detected)");

  Serial.println("-------------------------------------------");
  delay(2000);
}
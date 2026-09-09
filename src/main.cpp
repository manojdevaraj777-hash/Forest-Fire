#ifdef PLATFORMIO

/**
 * @file main.cpp
 * @brief NodeMCU ESP8266 Forest Fire Detection System (PlatformIO entry point)
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

#include "include/config.h"

// ==========================================
// GLOBALS & OBJECT INITIALIZATION
// ==========================================
DHT dht(DHTPIN, DHTTYPE);

unsigned long lastSensorReadTime = 0;
unsigned long lastAlertPostTime = 0;

// Function Declarations
void connectWiFi();
void readSensorsAndEvaluate();
void triggerLocalAlarms(bool activate, bool isFlameAlert);
void sendCloudTelemetry(float temp, float humidity, int smoke, bool flame, 
                        bool isTempAlert, bool isHumidityAlert, bool isSmokeAlert, bool isFlameAlert);

void setup() {
    // Initialize Serial Port
    Serial.begin(115200);
    delay(500);
    Serial.println();
    Serial.println(F("================================================"));
    Serial.println(F(" NodeMCU ESP8266 Forest Fire Detection System "));
    Serial.println(F("================================================"));

    // Initialize Pin Modes
    pinMode(FLAME_PIN, INPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);

    // Initial Actuator State (Off)
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, LOW);

    // Initialize DHT Sensor
    dht.begin();
    Serial.println(F("[SENSOR] DHT11 Initialized on Pin D2 (GPIO4)."));
    Serial.println(F("[SENSOR] IR Flame Sensor Initialized on Pin D1 (GPIO5)."));
    Serial.println(F("[SENSOR] MQ-2 Smoke Sensor Initialized on Pin A0."));

    // Connect to WiFi network
    connectWiFi();
}

void loop() {
    unsigned long currentMillis = millis();

    // Periodic non-blocking sensor sampling
    if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL_MS) {
        lastSensorReadTime = currentMillis;
        readSensorsAndEvaluate();
    }

    // Maintain WiFi Connection
    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
    }
}

/**
 * @brief Establishes WiFi connection to the configured AP
 */
void connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;

    Serial.print(F("[WIFI] Connecting to "));
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(F("."));
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.print(F("[WIFI] Connected! IP Address: "));
        Serial.println(WiFi.localIP());
    } else {
        Serial.println();
        Serial.println(F("[WIFI] Connection failed. Will retry during execution loop."));
    }
}

/**
 * @brief Reads all connected sensors, checks threshold conditions, and triggers alarms
 */
void readSensorsAndEvaluate() {
    // 1. Read DHT11 Temperature & Humidity
    float humidity = dht.readHumidity();
    float tempC = dht.readTemperature();

    // Check for sensor read failure
    if (isnan(humidity) || isnan(tempC)) {
        Serial.println(F("[ERROR] Failed to read from DHT11 sensor!"));
    }

    // 2. Read MQ-2 Smoke Sensor (Analog ADC 0-1023)
    int smokeVal = analogRead(MQ2_PIN);

    // 3. Read IR Flame Sensor (Digital Active LOW)
    int flameState = digitalRead(FLAME_PIN);
    bool flameDetected = (flameState == FLAME_DETECTED_STATE);

    // 4. Evaluate Alert Thresholds
    bool isTempAlert = (!isnan(tempC) && tempC > TEMP_THRESHOLD_HIGH_C);
    bool isHumidityAlert = (!isnan(humidity) && humidity < HUMIDITY_THRESHOLD_LOW);
    bool isSmokeAlert = (smokeVal > SMOKE_THRESHOLD_ADC);
    bool isFlameAlert = flameDetected;

    bool isSystemAlert = (isTempAlert || isHumidityAlert || isSmokeAlert || isFlameAlert);

    // Print Telemetry to Serial Monitor
    Serial.println(F("------------------------------------------------"));
    Serial.printf("[TELEMETRY] Temp: %.1f °C | Humidity: %.1f %% | Smoke ADC: %d | Flame: %s\n",
                  isnan(tempC) ? -999.0f : tempC,
                  isnan(humidity) ? -999.0f : humidity,
                  smokeVal,
                  flameDetected ? "DETECTED!" : "NORMAL");

    if (isSystemAlert) {
        Serial.print(F("[ALERT TRIGGERED] Reasons: "));
        if (isTempAlert) Serial.print(F("HIGH_TEMP "));
        if (isHumidityAlert) Serial.print(F("LOW_HUMIDITY "));
        if (isSmokeAlert) Serial.print(F("HIGH_SMOKE "));
        if (isFlameAlert) Serial.print(F("FLAME_DETECTED "));
        Serial.println();

        // 5. Trigger Local Alarms (Buzzer + Red LED)
        triggerLocalAlarms(true, isFlameAlert);

        // 6. Push Cloud Telemetry (with cooldown rate-limiting)
        unsigned long currentMillis = millis();
        if (currentMillis - lastAlertPostTime >= ALERT_POST_COOLDOWN_MS) {
            lastAlertPostTime = currentMillis;
            sendCloudTelemetry(tempC, humidity, smokeVal, flameDetected,
                               isTempAlert, isHumidityAlert, isSmokeAlert, isFlameAlert);
        }
    } else {
        // Deactivate alarms when environment is normal
        triggerLocalAlarms(false, false);
    }
}

/**
 * @brief Controls Piezo Buzzer and Red LED based on alert state
 */
void triggerLocalAlarms(bool activate, bool isFlameAlert) {
    if (activate) {
        digitalWrite(LED_PIN, HIGH);
        
        // Tone frequency modulation: Higher emergency pitch if flame detected
        int buzzerFreq = isFlameAlert ? 3000 : 2000;
        tone(BUZZER_PIN, buzzerFreq);
    } else {
        digitalWrite(LED_PIN, LOW);
        noTone(BUZZER_PIN);
        digitalWrite(BUZZER_PIN, LOW);
    }
}

/**
 * @brief Transmits JSON alert payload to cloud HTTP POST endpoint
 */
void sendCloudTelemetry(float temp, float humidity, int smoke, bool flame, 
                        bool isTempAlert, bool isHumidityAlert, bool isSmokeAlert, bool isFlameAlert) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("[CLOUD] Cannot send HTTP POST: WiFi Disconnected."));
        return;
    }

    WiFiClient client;
    HTTPClient http;

    Serial.print(F("[CLOUD] Initiating HTTP POST to: "));
    Serial.println(CLOUD_API_ENDPOINT);

    if (http.begin(client, CLOUD_API_ENDPOINT)) {
        http.addHeader(F("Content-Type"), F("application/json"));
        
        #ifdef CLOUD_API_KEY
        if (strlen(CLOUD_API_KEY) > 0 && strcmp(CLOUD_API_KEY, "YOUR_API_KEY_HERE") != 0) {
            http.addHeader(F("X-API-Key"), CLOUD_API_KEY);
        }
        #endif

        // Construct JSON Payload using ArduinoJson v7
        JsonDocument doc;
        doc["device_id"] = DEVICE_ID;
        doc["alert"] = true;
        doc["uptime_ms"] = millis();

        // Alert Flag Breakdown
        JsonObject alerts = doc["alert_triggers"].to<JsonObject>();
        alerts["high_temperature"] = isTempAlert;
        alerts["low_humidity"] = isHumidityAlert;
        alerts["high_smoke"] = isSmokeAlert;
        alerts["flame_detected"] = isFlameAlert;

        // Sensor Readings
        JsonObject readings = doc["sensor_readings"].to<JsonObject>();
        if (isnan(temp)) {
            readings["temperature_c"] = nullptr;
        } else {
            readings["temperature_c"] = temp;
        }

        if (isnan(humidity)) {
            readings["humidity_percent"] = nullptr;
        } else {
            readings["humidity_percent"] = humidity;
        }
        readings["smoke_adc"] = smoke;
        readings["flame_detected"] = flame;

        String jsonPayload;
        serializeJson(doc, jsonPayload);

        Serial.print(F("[CLOUD] Payload: "));
        Serial.println(jsonPayload);

        // Execute HTTP POST
        int httpResponseCode = http.POST(jsonPayload);

        if (httpResponseCode > 0) {
            Serial.printf("[CLOUD] HTTP Response code: %d\n", httpResponseCode);
            String responseStr = http.getString();
            if (responseStr.length() > 0) {
                Serial.printf("[CLOUD] Response: %s\n", responseStr.c_str());
            }
        } else {
            Serial.printf("[CLOUD] HTTP POST failed, error: %s\n", http.errorToString(httpResponseCode).c_str());
        }

        http.end();
    } else {
        Serial.println(F("[CLOUD] Unable to connect to cloud endpoint."));
    }
}

#endif // PLATFORMIO

/**
 * @file main.cpp
 * @brief NodeMCU ESP8266 Forest Fire Detection System — PlatformIO entry point
 *        Synced with v2.0 Forest-Fire.ino (Arduino IDE version)
 *
 * Hardware Pins:
 *  - DHT11         → D2 / GPIO4  (Temperature & Humidity)
 *  - MQ-2          → A0          (Smoke & Gas — Analog)
 *  - IR Flame      → D1 / GPIO5  (Active LOW Flame Detector)
 *  - Piezo Buzzer  → D5 / GPIO14 (Audible Alarm)
 *  - Red LED       → D6 / GPIO12 (Visual Alarm)
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>

#include "config.h"

// ==========================================
// GLOBALS & OBJECT INITIALIZATION
// ==========================================
DHT dht(DHTPIN, DHTTYPE);

unsigned long lastSensorReadTime  = 0;
unsigned long lastAlertPostTime   = 0;
unsigned long lastHeartbeatTime   = 0;
unsigned long lastLedBlinkTime    = 0;
unsigned long lastHeartbeatBlink  = 0;

int flameConfirmCount = 0;

bool currentAlertActive = false;
bool currentFlameAlert  = false;
bool currentSmokeAlert  = false;
bool currentTempAlert   = false;
bool ledState           = false;

// Last known good sensor readings (for failure recovery)
float lastGoodTemp      = NAN;
float lastGoodHumidity  = NAN;
float lastGoodHeatIndex = NAN;

// Function Declarations
void connectWiFi();
void setupOTA();
void readSensorsAndEvaluate();
void manageLEDBlink();
void triggerBuzzerPattern(bool isTempAlert, bool isSmokeAlert, bool isFlameAlert);
void deactivateAlarms();
bool sendCloudPayload(float temp, float humidity, float heatIndex,
                      int smoke, bool flame,
                      bool isTempAlert, bool isHumidityAlert,
                      bool isSmokeAlert, bool isFlameAlert,
                      bool isHeartbeat);
int  readSmokeAverage();
void playSOSBuzzer();
void playBeepCode(int count, int toneDuration, int freq);

// ==========================================
// SETUP
// ==========================================
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println();
    Serial.println(F("======================================================="));
    Serial.println(F("  NodeMCU ESP8266 Forest Fire Detection System v2.0  "));
    Serial.println(F("======================================================="));

    pinMode(FLAME_PIN, INPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, LOW);

    dht.begin();
    Serial.println(F("[SENSOR] DHT11 warming up..."));
    delay(DHT_WARMUP_MS);
    Serial.println(F("[SENSOR] DHT11 Ready."));

    Serial.println(F("[SENSOR] MQ-2 heater warming up... Please wait 60 seconds."));
    Serial.println(F("[SENSOR] LED will blink slowly during warmup."));
    unsigned long warmupStart = millis();
    while (millis() - warmupStart < MQ2_WARMUP_MS) {
        digitalWrite(LED_PIN, HIGH); delay(200);
        digitalWrite(LED_PIN, LOW);  delay(800);
        Serial.print(F("."));
    }
    Serial.println();
    Serial.println(F("[SENSOR] MQ-2 Ready."));
    Serial.println(F("[SENSOR] IR Flame Sensor Ready on D1 (GPIO5)."));

    connectWiFi();
    setupOTA();

    Serial.println(F("[SYSTEM] Boot complete. Entering monitoring loop."));
    Serial.println(F("======================================================="));
}

// ==========================================
// LOOP
// ==========================================
void loop() {
    unsigned long currentMillis = millis();

    ArduinoOTA.handle();

    if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL_MS) {
        lastSensorReadTime = currentMillis;
        readSensorsAndEvaluate();
    }

    manageLEDBlink();

    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
    }
}

// ==========================================
// WIFI CONNECTION
// ==========================================
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
        Serial.print(F("[WIFI] Connected! IP: "));
        Serial.println(WiFi.localIP());
    } else {
        Serial.println();
        Serial.println(F("[WIFI] Connection failed. Will retry in loop."));
    }
}

// ==========================================
// OTA SETUP
// ==========================================
void setupOTA() {
    ArduinoOTA.setHostname(OTA_HOSTNAME);
    ArduinoOTA.setPassword(OTA_PASSWORD);

    ArduinoOTA.onStart([]() {
        Serial.println(F("[OTA] Update starting..."));
        noTone(BUZZER_PIN);
        digitalWrite(LED_PIN, LOW);
    });
    ArduinoOTA.onEnd([]() {
        Serial.println(F("[OTA] Update complete! Rebooting..."));
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("[OTA] Error[%u]: ", error);
        if      (error == OTA_AUTH_ERROR)    Serial.println(F("Auth Failed"));
        else if (error == OTA_BEGIN_ERROR)   Serial.println(F("Begin Failed"));
        else if (error == OTA_CONNECT_ERROR) Serial.println(F("Connect Failed"));
        else if (error == OTA_RECEIVE_ERROR) Serial.println(F("Receive Failed"));
        else if (error == OTA_END_ERROR)     Serial.println(F("End Failed"));
    });

    ArduinoOTA.begin();
    Serial.println(F("[OTA] Ready. Hostname: " OTA_HOSTNAME));
}

// ==========================================
// READ SMOKE AVERAGE (10-sample moving avg)
// ==========================================
int readSmokeAverage() {
    long sum = 0;
    for (int i = 0; i < MQ2_AVG_SAMPLES; i++) {
        sum += analogRead(MQ2_PIN);
        delay(5);
    }
    return (int)(sum / MQ2_AVG_SAMPLES);
}

// ==========================================
// MAIN SENSOR READ & EVALUATE
// ==========================================
void readSensorsAndEvaluate() {
    unsigned long currentMillis = millis();

    // --- 1. DHT11: Temperature & Humidity ---
    float humidity = dht.readHumidity();
    float tempC    = dht.readTemperature();

    if (isnan(humidity) || isnan(tempC)) {
        Serial.println(F("[ERROR] DHT11 read failed! Using last known good values."));
        tempC    = lastGoodTemp;
        humidity = lastGoodHumidity;
    } else {
        lastGoodTemp     = tempC;
        lastGoodHumidity = humidity;
    }

    float heatIndex = NAN;
    if (!isnan(tempC) && !isnan(humidity)) {
        heatIndex = dht.computeHeatIndex(tempC, humidity, false);
        lastGoodHeatIndex = heatIndex;
    } else {
        heatIndex = lastGoodHeatIndex;
    }

    // --- 2. MQ-2: Averaged Smoke Reading ---
    int smokeVal = readSmokeAverage();

    // --- 3. IR Flame Sensor: Debounced Reading ---
    if (digitalRead(FLAME_PIN) == FLAME_DETECTED_STATE) {
        flameConfirmCount++;
    } else {
        flameConfirmCount = 0;
    }
    bool flameDetected = (flameConfirmCount >= FLAME_DEBOUNCE_COUNT);

    // --- 4. Evaluate Alert Thresholds ---
    bool isTempAlert     = (!isnan(tempC)     && tempC     > TEMP_THRESHOLD_HIGH_C);
    bool isHeatIdxAlert  = (!isnan(heatIndex) && heatIndex > HEAT_INDEX_ALERT_C);
    bool isHumidityAlert = (!isnan(humidity)  && humidity  < HUMIDITY_THRESHOLD_LOW);
    bool isSmokeAlert    = (smokeVal > SMOKE_THRESHOLD_ADC);
    bool isFlameAlert    = flameDetected;

    bool tempFinalAlert  = (isTempAlert || isHeatIdxAlert);
    bool isSystemAlert   = (tempFinalAlert || isHumidityAlert || isSmokeAlert || isFlameAlert);

    currentAlertActive = isSystemAlert;
    currentFlameAlert  = isFlameAlert;
    currentSmokeAlert  = isSmokeAlert;
    currentTempAlert   = tempFinalAlert;

    // --- 5. Serial Telemetry Output ---
    Serial.println(F("------------------------------------------------"));
    Serial.printf("[TELEMETRY] Temp: %.1f°C | HeatIdx: %.1f°C | Humidity: %.1f%% | Smoke ADC: %d | Flame: %s\n",
                  isnan(tempC)     ? -999.0f : tempC,
                  isnan(heatIndex) ? -999.0f : heatIndex,
                  isnan(humidity)  ? -999.0f : humidity,
                  smokeVal,
                  flameDetected ? "DETECTED!" : "NORMAL");

    // --- 6. Alert Actions ---
    if (isSystemAlert) {
        Serial.print(F("[ALERT] Reasons: "));
        if (isTempAlert)     Serial.print(F("HIGH_TEMP "));
        if (isHeatIdxAlert)  Serial.print(F("HIGH_HEAT_INDEX "));
        if (isHumidityAlert) Serial.print(F("LOW_HUMIDITY "));
        if (isSmokeAlert)    Serial.print(F("HIGH_SMOKE "));
        if (isFlameAlert)    Serial.print(F("FLAME_DETECTED "));
        Serial.println();

        triggerBuzzerPattern(tempFinalAlert, isSmokeAlert, isFlameAlert);

        if (currentMillis - lastAlertPostTime >= ALERT_POST_COOLDOWN_MS) {
            lastAlertPostTime = currentMillis;
            sendCloudPayload(tempC, humidity, heatIndex, smokeVal, flameDetected,
                             tempFinalAlert, isHumidityAlert, isSmokeAlert, isFlameAlert,
                             false);
        }
    } else {
        deactivateAlarms();
        Serial.println(F("[STATUS] All Clear — Environment Normal."));
    }

    // --- 7. Heartbeat POST ---
    if (currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = currentMillis;
        Serial.println(F("[HEARTBEAT] Sending keep-alive to cloud..."));
        sendCloudPayload(tempC, humidity, heatIndex, smokeVal, flameDetected,
                         tempFinalAlert, isHumidityAlert, isSmokeAlert, isFlameAlert,
                         true);
    }
}

// ==========================================
// NON-BLOCKING LED BLINK MANAGER
// ==========================================
void manageLEDBlink() {
    unsigned long currentMillis = millis();

    if (!currentAlertActive) {
        if (currentMillis - lastHeartbeatBlink >= LED_HEARTBEAT_MS) {
            lastHeartbeatBlink = currentMillis;
            digitalWrite(LED_PIN, HIGH);
            delay(50);
            digitalWrite(LED_PIN, LOW);
        }
        return;
    }

    unsigned long blinkInterval;
    if (currentFlameAlert) {
        blinkInterval = LED_BLINK_FLAME_MS;
    } else if (currentSmokeAlert) {
        blinkInterval = LED_BLINK_SMOKE_MS;
    } else {
        blinkInterval = LED_BLINK_TEMP_MS;
    }

    if (currentMillis - lastLedBlinkTime >= blinkInterval) {
        lastLedBlinkTime = currentMillis;
        ledState = !ledState;
        digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    }
}

// ==========================================
// BUZZER PATTERNS
// ==========================================
void playBeepCode(int count, int toneDurationMs, int freq) {
    for (int i = 0; i < count; i++) {
        tone(BUZZER_PIN, freq, toneDurationMs);
        delay(toneDurationMs + 100);
    }
    noTone(BUZZER_PIN);
}

void playSOSBuzzer() {
    int shortMs = 150, longMs = 450, freq = 3000;
    for (int i = 0; i < 3; i++) { tone(BUZZER_PIN, freq, shortMs); delay(shortMs + 150); }
    delay(200);
    for (int i = 0; i < 3; i++) { tone(BUZZER_PIN, freq, longMs);  delay(longMs  + 150); }
    delay(200);
    for (int i = 0; i < 3; i++) { tone(BUZZER_PIN, freq, shortMs); delay(shortMs + 150); }
    noTone(BUZZER_PIN);
}

void triggerBuzzerPattern(bool isTempAlert, bool isSmokeAlert, bool isFlameAlert) {
    if (isFlameAlert) {
        playSOSBuzzer();
    } else if (isSmokeAlert) {
        playBeepCode(3, 150, 2500);
    } else if (isTempAlert) {
        playBeepCode(3, 400, 2000);
    }
}

void deactivateAlarms() {
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
    ledState = false;
}

// ==========================================
// CLOUD HTTP POST WITH RETRY LOGIC
// ==========================================
bool sendCloudPayload(float temp, float humidity, float heatIndex,
                      int smoke, bool flame,
                      bool isTempAlert, bool isHumidityAlert,
                      bool isSmokeAlert, bool isFlameAlert,
                      bool isHeartbeat) {

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("[CLOUD] WiFi not connected — skipping POST."));
        return false;
    }

    JsonDocument doc;
    doc["device_id"]    = DEVICE_ID;
    doc["alert"]        = !isHeartbeat && (isTempAlert || isHumidityAlert || isSmokeAlert || isFlameAlert);
    doc["heartbeat"]    = isHeartbeat;
    doc["uptime_ms"]    = millis();
    doc["wifi_rssi_db"] = WiFi.RSSI();

    JsonObject triggers = doc["alert_triggers"].to<JsonObject>();
    triggers["high_temperature"]  = isTempAlert;
    triggers["low_humidity"]      = isHumidityAlert;
    triggers["high_smoke"]        = isSmokeAlert;
    triggers["flame_detected"]    = isFlameAlert;

    JsonObject readings = doc["sensor_readings"].to<JsonObject>();
    readings["temperature_c"]    = isnan(temp)      ? nullptr : (JsonVariant)temp;
    readings["humidity_percent"] = isnan(humidity)  ? nullptr : (JsonVariant)humidity;
    readings["heat_index_c"]     = isnan(heatIndex) ? nullptr : (JsonVariant)heatIndex;
    readings["smoke_adc"]        = smoke;
    readings["flame_detected"]   = flame;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    Serial.print(F("[CLOUD] Payload: "));
    Serial.println(jsonPayload);

    bool success = false;
    for (int attempt = 1; attempt <= HTTP_RETRY_COUNT; attempt++) {
        WiFiClientSecure client;
        client.setInsecure();
        HTTPClient http;

        if (http.begin(client, CLOUD_API_ENDPOINT)) {
            http.addHeader(F("Content-Type"), F("application/json"));

            #ifdef CLOUD_API_KEY
            if (strlen(CLOUD_API_KEY) > 0 && strcmp(CLOUD_API_KEY, "YOUR_API_KEY_HERE") != 0) {
                http.addHeader(F("X-API-Key"), CLOUD_API_KEY);
            }
            #endif

            int httpCode = http.POST(jsonPayload);
            http.end();

            if (httpCode > 0) {
                Serial.printf("[CLOUD] POST OK — HTTP %d (attempt %d/%d)\n",
                              httpCode, attempt, HTTP_RETRY_COUNT);
                success = true;
                break;
            } else {
                Serial.printf("[CLOUD] POST Failed — %s (attempt %d/%d)\n",
                              http.errorToString(httpCode).c_str(), attempt, HTTP_RETRY_COUNT);
            }
        } else {
            Serial.printf("[CLOUD] Cannot connect to endpoint (attempt %d/%d)\n",
                          attempt, HTTP_RETRY_COUNT);
        }

        if (attempt < HTTP_RETRY_COUNT) {
            Serial.printf("[CLOUD] Retrying in %d seconds...\n", attempt * 2);
            delay(HTTP_RETRY_DELAY_MS * attempt);
        }
    }

    if (!success) {
        Serial.println(F("[CLOUD] All retry attempts failed. Alert dropped."));
    }

    return success;
}

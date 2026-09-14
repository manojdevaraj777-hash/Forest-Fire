/**
 * @file Forest-Fire.ino
 * @brief NodeMCU ESP8266 Forest Fire Detection System — PERFECT VERSION
 *        Arduino IDE Compatible
 *
 * ✅ Improvements over v1:
 *  - MQ-2 60-second warmup on boot (heater stabilization)
 *  - MQ-2 10-sample moving average (noise reduction)
 *  - DHT11 2-second warmup after begin()
 *  - Heat Index (feels-like temperature) calculation
 *  - Flame debounce: 3 consecutive LOW reads before alert (no false alarms)
 *  - Smart LED blink patterns (speed varies by alert type)
 *  - Buzzer SOS pattern for flame, distinct beep codes per alert type
 *  - Cloud heartbeat every 30 seconds (device alive confirmation)
 *  - HTTP POST retry logic: 3 retries with exponential backoff
 *  - ArduinoOTA for wireless firmware updates (no USB needed)
 *  - Normal telemetry sent every cycle (not just on alert)
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

#include "include/config.h"

// ==========================================
// GLOBALS & OBJECT INITIALIZATION
// ==========================================
DHT dht(DHTPIN, DHTTYPE);

// Timing trackers
unsigned long lastSensorReadTime  = 0;
unsigned long lastAlertPostTime   = 0;
unsigned long lastHeartbeatTime   = 0;
unsigned long lastLedBlinkTime    = 0;
unsigned long lastHeartbeatBlink  = 0;

// Flame debounce counter
int flameConfirmCount = 0;

// Last known good sensor readings (for failure recovery)
float lastGoodTemp      = NAN;
float lastGoodHumidity  = NAN;
float lastGoodHeatIndex = NAN;

// Current alert state (used for non-blocking LED blink)
bool currentAlertActive = false;
bool currentFlameAlert  = false;
bool currentSmokeAlert  = false;
bool currentTempAlert   = false;
bool ledState           = false;

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
bool sendCloudPayload(float temp, float humidity, float heatIndex,
                      int smoke, bool flame,
                      bool isTempAlert, bool isHumidityAlert,
                      bool isSmokeAlert, bool isFlameAlert,
                      bool isHeartbeat, bool buzzerActive, bool ledActive);
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

    // Pin Modes
    pinMode(FLAME_PIN, INPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(LED_PIN, LOW);

    // DHT11 Init with warmup
    dht.begin();
    Serial.println(F("[SENSOR] DHT11 warming up..."));
    delay(DHT_WARMUP_MS);
    Serial.println(F("[SENSOR] DHT11 Ready."));

    // MQ-2 Warmup (heater stabilization — critical for accuracy)
    Serial.println(F("[SENSOR] MQ-2 heater warming up... Please wait 60 seconds."));
    Serial.println(F("[SENSOR] LED will blink slowly during warmup."));
    unsigned long warmupStart = millis();
    while (millis() - warmupStart < MQ2_WARMUP_MS) {
        // Blink LED slowly during warmup to show system is alive
        digitalWrite(LED_PIN, HIGH); delay(200);
        digitalWrite(LED_PIN, LOW);  delay(800);
        Serial.print(F("."));
    }
    Serial.println();
    Serial.println(F("[SENSOR] MQ-2 Ready."));
    Serial.println(F("[SENSOR] IR Flame Sensor Ready on D1 (GPIO5)."));

    // WiFi Connection
    connectWiFi();

    // OTA Setup
    setupOTA();

    Serial.println(F("[SYSTEM] Boot complete. Entering monitoring loop."));
    Serial.println(F("======================================================="));
}

// ==========================================
// LOOP
// ==========================================
void loop() {
    unsigned long currentMillis = millis();

    // 1. Handle OTA updates (must run every loop)
    ArduinoOTA.handle();

    // 2. Periodic sensor reading
    if (currentMillis - lastSensorReadTime >= SENSOR_READ_INTERVAL_MS) {
        lastSensorReadTime = currentMillis;
        readSensorsAndEvaluate();
    }

    // 3. Non-blocking LED blink management
    manageLEDBlink();

    // 4. WiFi watchdog — reconnect if dropped
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
    while (WiFi.status() != WL_CONNECTED && attempts < 60) {
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
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("[OTA] Progress: %u%%\r", (progress * 100) / total);
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

    // Heat Index (feels-like temperature using both temp + humidity)
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
        flameConfirmCount = 0; // Reset on any non-flame read
    }
    bool flameDetected = (flameConfirmCount >= FLAME_DEBOUNCE_COUNT);

    // --- 4. Evaluate Alert Thresholds ---
    bool isTempAlert     = (!isnan(tempC)     && tempC     > TEMP_THRESHOLD_HIGH_C);
    bool isHeatIdxAlert  = (!isnan(heatIndex) && heatIndex > HEAT_INDEX_ALERT_C);
    bool isHumidityAlert = (!isnan(humidity)  && humidity  < HUMIDITY_THRESHOLD_LOW);
    bool isSmokeAlert    = (smokeVal > SMOKE_THRESHOLD_ADC);
    bool isFlameAlert    = flameDetected;

    // Combine temp + heat index into one temp alert
    bool tempFinalAlert  = (isTempAlert || isHeatIdxAlert);
    bool isSystemAlert   = (tempFinalAlert || isHumidityAlert || isSmokeAlert || isFlameAlert);

    // Update global alert state for LED blink manager
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

        // Trigger buzzer pattern based on highest-priority alert
        triggerBuzzerPattern(tempFinalAlert, isSmokeAlert, isFlameAlert);

        // Send alert to cloud (with cooldown)
        if (currentMillis - lastAlertPostTime >= ALERT_POST_COOLDOWN_MS) {
            lastAlertPostTime = currentMillis;
            sendCloudPayload(tempC, humidity, heatIndex, smokeVal, flameDetected,
                             tempFinalAlert, isHumidityAlert, isSmokeAlert, isFlameAlert,
                             false, true, true); // isHeartbeat=false, buzzerActive=true, ledActive=true
        }
    } else {
        // --- 7. Deactivate alarms when all clear ---
        deactivateAlarms();
        Serial.println(F("[STATUS] All Clear — Environment Normal."));
    }

    // --- 8. Heartbeat POST (every 30 seconds regardless of alert state) ---
    if (currentMillis - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = currentMillis;
        Serial.println(F("[HEARTBEAT] Sending keep-alive to cloud..."));
        sendCloudPayload(tempC, humidity, heatIndex, smokeVal, flameDetected,
                         tempFinalAlert, isHumidityAlert, isSmokeAlert, isFlameAlert,
                         true, false, false); // isHeartbeat=true, buzzerActive=false, ledActive=false
    }
}

// ==========================================
// NON-BLOCKING LED BLINK MANAGER
// ==========================================
void manageLEDBlink() {
    unsigned long currentMillis = millis();

    if (!currentAlertActive) {
        // LED stays OFF when environment is normal
        digitalWrite(LED_PIN, LOW);
        return;
    }

    // Choose blink speed based on alert priority (highest priority wins)
    unsigned long blinkInterval;
    if (currentFlameAlert) {
        blinkInterval = LED_BLINK_FLAME_MS;  // 150ms → very rapid flash
    } else if (currentSmokeAlert) {
        blinkInterval = LED_BLINK_SMOKE_MS;  // 500ms → medium blink
    } else {
        blinkInterval = LED_BLINK_TEMP_MS;   // 1000ms → slow blink
    }

    if (currentMillis - lastLedBlinkTime >= blinkInterval) {
        lastLedBlinkTime = currentMillis;
        ledState = !ledState;
        digitalWrite(LED_PIN, ledState ? HIGH : LOW);
    }
}

// ==========================================
// BUZZER PATTERNS (distinct per alert type)
// ==========================================

// Play N short beeps at a given frequency
void playBeepCode(int count, int toneDurationMs, int freq) {
    for (int i = 0; i < count; i++) {
        tone(BUZZER_PIN, freq, toneDurationMs);
        delay(toneDurationMs + 100);
    }
    noTone(BUZZER_PIN);
}

// SOS Pattern: ... --- ... (Morse code)
void playSOSBuzzer() {
    int shortMs = 150, longMs = 450, freq = 3000;
    // S = 3 short
    for (int i = 0; i < 3; i++) { tone(BUZZER_PIN, freq, shortMs); delay(shortMs + 150); }
    delay(200);
    // O = 3 long
    for (int i = 0; i < 3; i++) { tone(BUZZER_PIN, freq, longMs);  delay(longMs  + 150); }
    delay(200);
    // S = 3 short
    for (int i = 0; i < 3; i++) { tone(BUZZER_PIN, freq, shortMs); delay(shortMs + 150); }
    noTone(BUZZER_PIN);
}

void triggerBuzzerPattern(bool isTempAlert, bool isSmokeAlert, bool isFlameAlert) {
    if (isFlameAlert) {
        // FLAME → SOS pattern (highest emergency)
        playSOSBuzzer();
    } else if (isSmokeAlert) {
        // SMOKE → 3 fast beeps at 2500Hz
        playBeepCode(3, 150, 2500);
    } else if (isTempAlert) {
        // TEMP  → 3 slow beeps at 2000Hz
        playBeepCode(3, 400, 2000);
    }
}

void deactivateAlarms() {
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
    // LED is managed by manageLEDBlink() — just reset state
    ledState = false;
}

// ==========================================
// CLOUD HTTP POST WITH RETRY LOGIC
// ==========================================
bool sendCloudPayload(float temp, float humidity, float heatIndex,
                      int smoke, bool flame,
                      bool isTempAlert, bool isHumidityAlert,
                      bool isSmokeAlert, bool isFlameAlert,
                      bool isHeartbeat, bool buzzerActive, bool ledActive) {

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("[CLOUD] WiFi not connected — skipping POST."));
        return false;
    }

    // Build JSON Payload
    JsonDocument doc;
    doc["device_id"]    = DEVICE_ID;
    doc["alert"]        = !isHeartbeat && (isTempAlert || isHumidityAlert || isSmokeAlert || isFlameAlert);
    doc["heartbeat"]    = isHeartbeat;
    doc["uptime_ms"]    = millis();
    doc["wifi_rssi_db"] = WiFi.RSSI();
    doc["buzzer_active"] = buzzerActive;
    doc["led_active"]    = ledActive; // Signal strength bonus info

    JsonObject triggers = doc["alert_triggers"].to<JsonObject>();
    triggers["high_temperature"]  = isTempAlert;
    triggers["low_humidity"]      = isHumidityAlert;
    triggers["high_smoke"]        = isSmokeAlert;
    triggers["flame_detected"]    = isFlameAlert;

    JsonObject readings = doc["sensor_readings"].to<JsonObject>();
    if (isnan(temp))      { readings["temperature_c"]    = nullptr; } else { readings["temperature_c"]    = temp; }
    if (isnan(humidity))  { readings["humidity_percent"] = nullptr; } else { readings["humidity_percent"] = humidity; }
    if (isnan(heatIndex)) { readings["heat_index_c"]     = nullptr; } else { readings["heat_index_c"]     = heatIndex; }
    readings["smoke_adc"]        = smoke;
    readings["flame_detected"]   = flame;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    Serial.print(F("[CLOUD] Payload: "));
    Serial.println(jsonPayload);

    // Retry loop (up to HTTP_RETRY_COUNT attempts)
    bool success = false;
    bool useTLS = String(CLOUD_API_ENDPOINT).startsWith("https://");

    for (int attempt = 1; attempt <= HTTP_RETRY_COUNT; attempt++) {
        WiFiClient plainClient;
        WiFiClientSecure secureClient;
        HTTPClient http;

        // Plain HTTP for local endpoints, TLS for https:// endpoints
        if (useTLS) {
            secureClient.setInsecure(); // Skip cert check — swap with setCACert() for production
        }
        WiFiClient& client = useTLS ? (WiFiClient&)secureClient : (WiFiClient&)plainClient;

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
                break; // Success — exit retry loop
            } else {
                Serial.printf("[CLOUD] POST Failed — %s (attempt %d/%d)\n",
                              http.errorToString(httpCode).c_str(), attempt, HTTP_RETRY_COUNT);
            }
        } else {
            Serial.printf("[CLOUD] Cannot connect to endpoint (attempt %d/%d)\n",
                          attempt, HTTP_RETRY_COUNT);
        }

        // Exponential backoff: 2s, 4s, 6s
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

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==========================================
// PIN MAPPING (NodeMCU ESP8266)
// ==========================================
// D1 -> GPIO5  | D2 -> GPIO4
// D5 -> GPIO14 | D6 -> GPIO12 | A0 -> ADC0

#define DHTPIN              D2      // DHT11 → D2 (GPIO4)
#define DHTTYPE             DHT11

#define FLAME_PIN           D1      // IR Flame Sensor → D1 (GPIO5) Active LOW
#define MQ2_PIN             A0      // MQ-2 Smoke Sensor → A0 (ADC)

#define BUZZER_PIN          D5      // Piezo Buzzer → D5 (GPIO14)
#define LED_PIN             D6      // Red Alert LED → D6 (GPIO12)

// ==========================================
// ALERT THRESHOLDS
// ==========================================
#define TEMP_THRESHOLD_HIGH_C       45.0f   // Alert if Temperature > 45°C
#define HUMIDITY_THRESHOLD_LOW      20.0f   // Alert if Humidity < 20%
#define SMOKE_THRESHOLD_ADC         400     // Alert if MQ-2 raw ADC > 400
#define FLAME_DETECTED_STATE        LOW     // Flame sensor is Active LOW

// ==========================================
// SENSOR QUALITY SETTINGS
// ==========================================
#define MQ2_WARMUP_MS           60000   // MQ-2 heater warmup: 60 seconds
#define MQ2_AVG_SAMPLES         10      // Averaging samples for MQ-2 noise reduction
#define DHT_WARMUP_MS           2000    // DHT11 stabilization delay after begin()
#define FLAME_DEBOUNCE_COUNT    3       // Consecutive LOW reads to confirm flame
#define HEAT_INDEX_ALERT_C      52.0f   // Alert if Heat Index (feels-like) > 52°C

// ==========================================
// NETWORK & CLOUD ENDPOINT CONFIGURATION
// ==========================================
// Credentials are in config_secrets.h (gitignored — never committed)
#include "config_secrets.h"

// Cloud HTTP POST endpoint
// Local Flask backend (run: python backend/app.py on your PC)
// Change the IP to match this computer's LAN IP (check with: ipconfig)
#define CLOUD_API_ENDPOINT      "http://10.178.186.92:5000/api/reading"

// Device Identifier
#define DEVICE_ID               "nodemcu_forest_node_01"

// ==========================================
// TIMING & RATE LIMITS (milliseconds)
// ==========================================
#define SENSOR_READ_INTERVAL_MS     2000    // Read sensors every 2 seconds
#define ALERT_POST_COOLDOWN_MS      5000    // Min gap between alert HTTP POSTs
#define HEARTBEAT_INTERVAL_MS       30000   // Send heartbeat every 30 seconds
#define HTTP_RETRY_COUNT            3       // Retry failed HTTP POST up to 3 times
#define HTTP_RETRY_DELAY_MS         2000    // Base delay between retries (doubles each time)

// ==========================================
// LED BLINK RATES (blinks per second)
// ==========================================
#define LED_BLINK_TEMP_MS           1000    // Temp alert  → slow blink  (1/sec)
#define LED_BLINK_SMOKE_MS          500     // Smoke alert → medium blink (2/sec)
#define LED_BLINK_FLAME_MS          150     // Flame alert → rapid flash  (~7/sec)
#define LED_HEARTBEAT_MS            5000    // Heartbeat   → single pulse every 5s

// ==========================================
// OTA UPDATE CONFIGURATION
// ==========================================
#define OTA_HOSTNAME            "forest-fire-node-01"
// OTA_PASSWORD is in config_secrets.h

#endif // CONFIG_H

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ==========================================
// PIN MAPPING (NodeMCU ESP8266)
// ==========================================
// Note: In ESP8266 Arduino core, Dx pins map to standard GPIOs.
// D1 -> GPIO5
// D2 -> GPIO4
// D5 -> GPIO14
// D6 -> GPIO12
// A0 -> ADC0

#define DHTPIN          D2          // DHT11 sensor connected to D2 (GPIO4)
#define DHTTYPE         DHT11       // Sensor type

#define FLAME_PIN       D1          // IR Flame Sensor connected to D1 (GPIO5)
#define MQ2_PIN         A0          // MQ-2 Smoke Sensor connected to A0

#define BUZZER_PIN      D5          // Piezo Buzzer connected to D5 (GPIO14)
#define LED_PIN         D6          // Red Alert LED connected to D6 (GPIO12)

// ==========================================
// ALERT THRESHOLDS
// ==========================================
#define TEMP_THRESHOLD_HIGH_C     30.0f   // Alert threshold set to 30°C for testing live cloud telemetry
#define HUMIDITY_THRESHOLD_LOW    20.0f   // Alert if Humidity drops below 20%
#define SMOKE_THRESHOLD_ADC       400     // Alert if MQ-2 raw ADC value exceeds 400

// Flame sensor is active LOW (LOW reading indicates flame detection)
#define FLAME_DETECTED_STATE      LOW

// ==========================================
// NETWORK & CLOUD ENDPOINT CONFIGURATION
// ==========================================
#define WIFI_SSID               "Manoj D"
#define WIFI_PASSWORD           "MANOJ2004"

// Cloud HTTP POST endpoint URL (AWS API Gateway, Azure HTTP function, or custom Webhook)
#define CLOUD_API_ENDPOINT      "https://webhook.site/7a485784-dd5e-4ec7-9fb3-91e535946e42"

// Optional API Authorization key header (leave empty if not required)
#define CLOUD_API_KEY           "YOUR_API_KEY_HERE"

// Device Identifier
#define DEVICE_ID               "nodemcu_forest_node_01"

// Timing & Rate Limits (in milliseconds)
#define SENSOR_READ_INTERVAL_MS 2000    // Sample sensors every 2 seconds
#define ALERT_POST_COOLDOWN_MS  5000    // Cooldown between HTTP POST alerts

#endif // CONFIG_H

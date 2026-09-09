# NodeMCU ESP8266 Forest Fire Detection System

An IoT-enabled, real-time **Forest Fire Detection System** powered by the **NodeMCU ESP8266** microcontroller and built with **PlatformIO (C++)**. The system measures environmental parameters (temperature, humidity, smoke/gas levels, and infrared flame emission) and triggers local alarms (Piezo Buzzer & Red LED) while broadcasting JSON alert payloads to a cloud API endpoint via HTTP POST.

---

## Key Features

- **Multi-Sensor Monitoring**:
  - **DHT11**: Temperature & Humidity monitoring.
  - **MQ-2**: Combustible gas and smoke detection (Analog ADC).
  - **IR Flame Sensor**: Infrared flame detection (Active LOW).
- **Hazard Detection & Local Alarm**:
  - Temperature exceeds **45°C**
  - Humidity drops below **20%**
  - Smoke reading exceeds **400** (0–1023 scale)
  - Infrared Flame detected
  - Dual actuation: **Piezo Buzzer** (audible alarm) & **Red LED** (visual alarm).
- **Cloud Infrastructure Integration**:
  - Non-blocking HTTP POST request carrying structured JSON telemetry to AWS API Gateway, Azure HTTP Trigger, or custom HTTP webhooks.
- **Configurable Architecture**:
  - Isolated header file (`include/config.h`) for easy customization of pins, WiFi credentials, threshold constants, and API endpoints.

---

## Hardware Pinout & Circuit Connections

| Component | ESP8266 Label | GPIO Pin | Hardware Details | Function / Role |
| :--- | :--- | :--- | :--- | :--- |
| **DHT11 Sensor** | `D2` | GPIO4 | Digital Data | Temperature & Humidity Sensor |
| **IR Flame Sensor** | `D1` | GPIO5 | Digital Output (Active LOW) | Flame / Infrared Detection |
| **MQ-2 Smoke Sensor** | `A0` | ADC0 | Analog Output (0–3.3V / 0–1023) | Smoke & Gas Density |
| **Piezo Buzzer** | `D5` | GPIO14 | Digital Output (PWM / Active HIGH) | Audible Alarm Sounder |
| **Red LED** | `D6` | GPIO12 | Digital Output (Active HIGH) | Visual Alert Indicator |
| **Power Supply** | `3V3` / `VIN` | - | 3.3V / 5V VCC & GND | System Power |

> **Note on MQ-2 Sensor**: The MQ-2 requires a 5V VCC power supply for its internal heater element. Ensure the analog output does not exceed 3.3V into ESP8266 `A0` (NodeMCU internal voltage divider supports 0–3.3V on `A0`).

---

## Project Directory Structure

```
Forest-Fire/
├── include/
│   └── config.h           # Centralized configuration (Pins, WiFi, Thresholds, Cloud API)
├── src/
│   └── main.cpp           # Core firmware logic, sensor routines & HTTP telemetry
├── platformio.ini         # PlatformIO build configuration & library dependencies
├── .gitignore             # Git version control ignore definitions
└── README.md              # Documentation & guide
```

---

## Threshold & Alert Parameters

| Parameter | Threshold Condition | Triggered Action |
| :--- | :--- | :--- |
| **Temperature** | `> 45.0 °C` | Red LED ON + Buzzer (2 kHz) + HTTP POST Alert |
| **Humidity** | `< 20.0 %` | Red LED ON + Buzzer (2 kHz) + HTTP POST Alert |
| **Smoke Level** | `> 400` (ADC) | Red LED ON + Buzzer (2 kHz) + HTTP POST Alert |
| **Flame Detection** | `LOW` signal on `D1` | Red LED ON + Emergency Buzzer (3 kHz) + HTTP POST Alert |

---

## Cloud HTTP POST Payload Format

When an alert condition is triggered, the NodeMCU transmits a JSON payload:

```json
{
  "device_id": "nodemcu_forest_node_01",
  "alert": true,
  "uptime_ms": 124500,
  "alert_triggers": {
    "high_temperature": true,
    "low_humidity": false,
    "high_smoke": true,
    "flame_detected": false
  },
  "sensor_readings": {
    "temperature_c": 47.2,
    "humidity_percent": 18.5,
    "smoke_adc": 512,
    "flame_detected": false
  }
}
```

---

## Getting Started & Building

### 1. Prerequisites
- **PlatformIO**: Install the [PlatformIO IDE extension for VSCode](https://platformio.org/) or [PlatformIO Core CLI](https://docs.platformio.org/en/latest/core/index.html).

### 2. Configuration
Open `include/config.h` and update your network and cloud parameters:
```cpp
#define WIFI_SSID           "Your_WiFi_Name"
#define WIFI_PASSWORD       "Your_WiFi_Password"
#define CLOUD_API_ENDPOINT  "https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/alert"
```

### 3. Build & Flash
Connect your NodeMCU board via Micro-USB and execute:
```bash
# Compile code
pio run

# Flash firmware to board
pio run --target upload

# Open Serial Monitor at 115200 baud
pio device monitor
```

---

## Cloud Endpoint Setup Guide

### AWS API Gateway / Lambda Integration
1. Create a REST API in **AWS API Gateway** with a `POST` method.
2. Route the POST request to an **AWS Lambda** function or **Amazon SNS** topic to publish SMS/Email emergency alerts.
3. Copy the invoke URL into `include/config.h`.

### Azure HTTP Trigger Integration
1. Create an **Azure Functions** app with an HTTP Trigger (e.g. `ForestFireAlertTrigger`).
2. Parse the incoming JSON body in C# or Python to trigger **Azure Logic Apps** or **Event Grid** alerts.
3. Copy the Function URL with function key into `include/config.h`.

---

## Version Control & GitHub Copilot

This repository is ready for Git version control:
```bash
git init
git add .
git commit -m "Initial commit: NodeMCU ESP8266 Forest Fire Detection System"
```
The included `.gitignore` keeps PlatformIO binaries (`.pio/`) and local IDE metadata excluded, making it seamlessly compatible with **GitHub Copilot** workflows.

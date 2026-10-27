"""
Forest Fire Detection System — Cloud Backend
Flask + SQLite + Pushbullet + Google Gemini AI

Run:
    python app.py

Endpoints:
    POST /api/reading          — receive sensor JSON from NodeMCU
    GET  /api/readings         — latest readings as JSON
    GET  /api/alerts           — recent alerts as JSON
    GET  /api/action/suggest   — Action plan based on latest sensor data
    GET  /                     — web app (dashboard)
"""

import json
import os
import sqlite3
from datetime import datetime, timezone

from flask import Flask, request, jsonify, g

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "forest_fire.db")
PB_CONFIG_PATH = os.path.join(BASE_DIR, "pushbullet_config.json")

app = Flask(__name__, static_folder="webapp", static_url_path="")

# --- Pushbullet config ---
def load_secret(path, key_name="access_token"):
    try:
        with open(path) as f:
            return json.load(f).get(key_name, "")
    except Exception:
        return ""

PUSHBULLET_TOKEN = load_secret(PB_CONFIG_PATH)

_last_alert_state = {"high_temperature": False, "low_humidity": False,
                     "high_smoke": False, "flame_detected": False}


def send_pushbullet(title, body):
    if not PUSHBULLET_TOKEN:
        return False
    try:
        import urllib.request, urllib.error
        data = json.dumps({"type": "note", "title": title, "body": body}).encode("utf-8")
        req = urllib.request.Request("https://api.pushbullet.com/v2/pushes", data=data,
                                     headers={"Content-Type": "application/json",
                                              "Access-Token": PUSHBULLET_TOKEN})
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception:
        return False


def get_action_plan(sensor_data):
    temp = sensor_data.get("temperature_c") or 0
    hum = sensor_data.get("humidity_percent") or 100
    smoke = sensor_data.get("smoke_adc") or 0
    flame = bool(sensor_data.get("flame_detected"))
    
    if flame and smoke > 400:
        status = "CRITICAL EMERGENCY: ACTIVE WILDFIRE WITH HEAVY SMOKE"
        threat_level = "TIER 1 — MAXIMUM EMERGENCY"
        solution_title = "IMMEDIATE EVACUATION & ACTIVE FIRE SUPPRESSION PROTOCOL"
        explanation = f"Active open flame and heavy combustion gas (Smoke {smoke} ADC) detected simultaneously! Immediate flashover danger."
        actions = [
            "🚨 SOUND IMMEDIATE EVACUATION: Evacuate all personnel within a 500-meter perimeter upwind immediately.",
            "🚒 CALL EMERGENCY HOTLINE: Dial 101 / 911 / Forest Dept reporting ACTIVE FLAME & DENSE SMOKE at node coordinates.",
            "💨 MOVE UPWIND & CROSSWIND: Never escape downhill into gullies or downwind of advancing fire line.",
            "🧯 SUPPRESSION PROTOCOL: Deploy Class A/B pressurized water or foam extinguishers only if safe and flame is under 1 meter.",
            "🛰️ AIR & DRONE DISPATCH: Launch thermal aerial reconnaissance to map containment line.",
            "😷 RESPIRATORY PROTECTION: Don N95/P100 respirator masks against carbon monoxide & fine particulates."
        ]
    elif flame:
        status = "CRITICAL: ACTIVE FLAME DETECTED BY IR SENSOR"
        threat_level = "TIER 1 — IMMEDIATE FIRE HAZARD"
        solution_title = "FLAME LOCALIZATION & DIRECT EXTINGUISHING PROTOCOL"
        explanation = "The IR Optical Flame sensor detected immediate infrared radiation corresponding to open flame breakout."
        actions = [
            "🚨 EVACUATE IMMEDIATE ZONE: Clear a 200m safety radius around sensor node.",
            "🚒 DISPATCH RAPID RESPONSE UNIT: Alert wildfire rangers and station firefighting teams.",
            "🧯 TARGET FLAME BASE: Discharge dry chemical ABC fire extinguisher directly at the base of fuel.",
            "💧 CLEAR FUEL BREAK: Remove dry twigs, grass, and leaf litter in a 10m perimeter to starve fuel.",
            "📹 MONITOR SENSORS: Continuous sampling of temperature & smoke spikes."
        ]
    elif smoke > 400:
        status = "HIGH ALERT: HEAVY COMBUSTION SMOKE DETECTED (MQ-2 > 400 ADC)"
        threat_level = "TIER 2 — SMOLDERING / GAS HAZARD"
        solution_title = "SMOLDERING INVESTIGATION & CONTAINMENT PROTOCOL"
        explanation = f"MQ-2 sensor detected critical combustion density ({smoke} ADC). High risk of concealed root fire or smoldering timber."
        actions = [
            "🔍 DISPATCH SCOUT TEAM: Inspect sector for smoldering tree roots, agricultural burn, or campfire embers.",
            "💧 WET LINE DEPLOYMENT: Spray pressurized water along perimeter to douse subsurface embers.",
            "😷 RESPIRATORY HAZARD: Carbon monoxide and particulate levels are hazardous — wear protective masks.",
            "🌬️ WIND VECTOR CHECK: Measure wind speed; wind gusts can rapidly ignite smoldering embers into open crown fire.",
            "⚡ CHARGE WATER RESERVES: Stand by mobile water tankers and high-pressure hose units."
        ]
    elif temp > 45:
        status = "WARNING: EXTREME TEMPERATURE SPIKE (> 45°C)"
        threat_level = "TIER 3 — THERMAL ANOMALY"
        solution_title = "THERMAL PRE-IGNITION COOLING PROTOCOL"
        explanation = f"Ambient temperature spiked to {temp}°C, surpassing the safe threshold. Vegetation moisture is rapidly evaporating."
        actions = [
            "🌡️ THERMAL SURVEY: Check if proximity heat source or machinery friction caused spike.",
            "💧 PERIMETER HYDRATION: Dampen surrounding forest floor to raise fuel moisture above 30%.",
            "🚫 RESTRICT ACCESS: Suspend motorized traffic, hot work, and ignition sources in this sector.",
            "📡 CONTINUOUS SAMPLING: Keep telemetry link active to detect rapid thermal transitions."
        ]
    elif temp > 35 and hum < 30:
        status = "ELEVATED RISK: DRY & HOT FIRE WEATHER CONDITIONS"
        threat_level = "TIER 4 — FIRE WEATHER WATCH"
        solution_title = "PREVENTIVE WILDFIRE PATROL PROTOCOL"
        explanation = f"High temperature ({temp}°C) and low relative humidity ({hum}%) create prime conditions for spark ignition."
        actions = [
            "⚠️ INCREASE WATCH FREQUENCY: Transition sensor polling to high frequency.",
            "💧 VERIFY WATER TANKS: Confirm all emergency water reservoirs are 100% filled.",
            "🛰️ SATELLITE / DRONE PASS: Schedule perimeter recon over dry timber zones."
        ]
    else:
        status = "NORMAL: ALL SENSOR READINGS WITHIN SAFE THRESHOLDS"
        threat_level = "TIER 5 — SECURE"
        solution_title = "ROUTINE MONITORING PROTOCOL"
        explanation = "Environmental parameters are stable. All sensor readings are within baseline."
        actions = [
            "✅ Normal Operations: Temperature, Smoke, and IR optical sensors operating within baseline.",
            "🧹 Sensor Maintenance: Keep sensor optical lenses clean from dust and forest debris.",
            "🔋 Power & WiFi: Maintain consistent power and stable WiFi link."
        ]
        
    formatted = (
        f"🚨 STATUS: {status}\n"
        f"🛡️ THREAT LEVEL: {threat_level}\n"
        f"📋 IMMEDIATE SOLUTION: {solution_title}\n\n"
        f"ℹ️ ANALYSIS: {explanation}\n\n"
        f"⚡ IMMEDIATE EMERGENCY ACTION STEPS:\n" + "\n".join(f"   {a}" for a in actions)
    )
    return {
        "status": status,
        "threat_level": threat_level,
        "solution_title": solution_title,
        "explanation": explanation,
        "actions": actions,
        "formatted": formatted,
        "is_emergency": bool(flame or smoke > 400 or temp > 45)
    }


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS readings (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at       TEXT NOT NULL,
            device_id         TEXT NOT NULL,
            alert             INTEGER NOT NULL,
            heartbeat         INTEGER NOT NULL,
            uptime_ms         INTEGER,
            wifi_rssi_db      INTEGER,
            temperature_c     REAL,
            humidity_percent  REAL,
            heat_index_c      REAL,
            smoke_adc         INTEGER,
            flame_detected    INTEGER,
            high_temperature  INTEGER,
            low_humidity      INTEGER,
            high_smoke        INTEGER,
            flame_alert       INTEGER,
            buzzer_active     INTEGER DEFAULT 0,
            led_active        INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS alerts (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at       TEXT NOT NULL,
            device_id         TEXT NOT NULL,
            alert_type        TEXT NOT NULL,
            temperature_c     REAL,
            humidity_percent  REAL,
            heat_index_c      REAL,
            smoke_adc         INTEGER,
            flame_detected    INTEGER,
            wifi_rssi_db      INTEGER,
            uptime_ms         INTEGER,
            high_temperature  INTEGER DEFAULT 0,
            low_humidity      INTEGER DEFAULT 0,
            high_smoke        INTEGER DEFAULT 0,
            flame_alert       INTEGER DEFAULT 0
        );
        """
    )
    db.commit()
    # Add new columns if they don't exist (backward compatibility)
    for col in ["buzzer_active", "led_active"]:
        try:
            db.execute(f"ALTER TABLE readings ADD COLUMN {col} INTEGER DEFAULT 0")
        except Exception:
            pass  # Column already exists
    for col in ["heat_index_c", "wifi_rssi_db", "uptime_ms", "high_temperature", "low_humidity", "high_smoke", "flame_alert"]:
        try:
            db.execute(f"ALTER TABLE alerts ADD COLUMN {col} REAL" if col in ["heat_index_c", "wifi_rssi_db", "uptime_ms"] else f"ALTER TABLE alerts ADD COLUMN {col} INTEGER DEFAULT 0")
        except Exception:
            pass  # Column already exists
    db.commit()
    db.close()


@app.route("/")
def dashboard():
    return app.send_static_file("index.html")


@app.route("/api/reading", methods=["POST"])
def receive_reading():
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"error": "invalid JSON"}), 400

    readings = payload.get("sensor_readings", {})
    triggers = payload.get("alert_triggers", {})
    received_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    alert = payload.get("alert") or False
    buzzer_active = 1 if payload.get("buzzer_active") else 0
    led_active = 1 if payload.get("led_active") else 0

    active_types = []
    if triggers.get("high_temperature"): active_types.append("high_temperature")
    if triggers.get("low_humidity"): active_types.append("low_humidity")
    if triggers.get("high_smoke"): active_types.append("high_smoke")
    if triggers.get("flame_detected"): active_types.append("flame_detected")

    for atype in active_types:
        if not _last_alert_state.get(atype):
            _last_alert_state[atype] = True
            title = f"🔥 Forest Alert: {atype.replace('_', ' ').upper()}"
            body = (f"{payload.get('device_id')} — {atype.replace('_', ' ').upper()}\n"
                    f"Temp {readings.get('temperature_c', '?')}°C · "
                    f"Hum {readings.get('humidity_percent', '?')}% · "
                    f"Smoke {readings.get('smoke_adc', '?')}\n"
                    f"WiFi RSSI {payload.get('wifi_rssi_db')} dBm")
            send_pushbullet(title, body)
            db = get_db()
            db.execute(
                "INSERT INTO alerts (received_at, device_id, alert_type, temperature_c, humidity_percent, heat_index_c, smoke_adc, flame_detected, wifi_rssi_db, uptime_ms, high_temperature, low_humidity, high_smoke, flame_alert) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (received_at, payload.get("device_id", "unknown"), atype,
                 readings.get("temperature_c"), readings.get("humidity_percent"),
                 readings.get("heat_index_c"), readings.get("smoke_adc"),
                 1 if readings.get("flame_detected") else 0,
                 payload.get("wifi_rssi_db"), payload.get("uptime_ms"),
                 1 if triggers.get("high_temperature") else 0,
                 1 if triggers.get("low_humidity") else 0,
                 1 if triggers.get("high_smoke") else 0,
                 1 if triggers.get("flame_detected") else 0)
            )
            db.commit()

    for atype in list(_last_alert_state.keys()):
        if atype not in active_types:
            _last_alert_state[atype] = False

    db = get_db()
    db.execute(
        """INSERT INTO readings (received_at, device_id, alert, heartbeat, uptime_ms,
              wifi_rssi_db, temperature_c, humidity_percent, heat_index_c,
              smoke_adc, flame_detected, high_temperature, low_humidity,
              high_smoke, flame_alert, buzzer_active, led_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (received_at, payload.get("device_id", "unknown"),
         1 if alert else 0, 1 if payload.get("heartbeat") else 0,
         payload.get("uptime_ms"), payload.get("wifi_rssi_db"),
         readings.get("temperature_c"), readings.get("humidity_percent"),
         readings.get("heat_index_c"), readings.get("smoke_adc"),
         1 if readings.get("flame_detected") else 0,
         1 if triggers.get("high_temperature") else 0,
         1 if triggers.get("low_humidity") else 0,
         1 if triggers.get("high_smoke") else 0,
         1 if triggers.get("flame_detected") else 0,
         1 if payload.get("buzzer_active") else 0,
         1 if payload.get("led_active") else 0)
    )
    db.commit()
    return jsonify({"ok": True, "received_at": received_at})


@app.route("/api/readings")
def get_readings():
    rows = get_db().execute("SELECT * FROM readings ORDER BY id DESC LIMIT 100").fetchall()
    resp = jsonify([dict(r) for r in rows])
    resp.headers["X-Server-Time"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return resp


@app.route("/api/status")
def system_status():
    now_utc = datetime.now(timezone.utc)
    row = get_db().execute("SELECT * FROM readings ORDER BY id DESC LIMIT 1").fetchone()
    if not row:
        return jsonify({
            "status": "standby",
            "connected": False,
            "message": "Awaiting hardware connection. No sensor data in database.",
            "server_time": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        })
    r = dict(row)
    try:
        dt = datetime.fromisoformat(r["received_at"])
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_sec = (now_utc - dt).total_seconds()
    except Exception:
        age_sec = 999999

    connected = age_sec <= 75
    return jsonify({
        "status": "online" if connected else "offline",
        "connected": connected,
        "age_seconds": round(age_sec, 1),
        "latest_reading": r if connected else None,
        "server_time": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    })


@app.route("/api/clear", methods=["POST", "GET"])
def clear_database():
    db = get_db()
    db.execute("DELETE FROM readings")
    db.execute("DELETE FROM alerts")
    db.commit()
    return jsonify({"ok": True, "message": "All readings and alerts cleared. System in standby mode."})


@app.route("/api/alerts")
def get_alerts():
    rows = get_db().execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 50").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/action/suggest")
def action_suggest():
    rows = get_db().execute("SELECT * FROM readings ORDER BY id DESC LIMIT 1").fetchall()
    if not rows:
        return jsonify({
            "connected": False,
            "analysis": "STANDBY: No sensor data found.\n\nPlease connect your NodeMCU ESP8266 and sensors (DHT11, MQ-2, IR Flame) to stream live telemetry and generate automated safety protocols."
        }), 200
    r = dict(rows[0])
    
    try:
        dt = datetime.fromisoformat(r["received_at"])
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_sec = (datetime.now(timezone.utc) - dt).total_seconds()
    except Exception:
        age_sec = 999999

    if age_sec > 75:
        return jsonify({
            "connected": False,
            "analysis": f"HARDWARE OFFLINE: Last sensor reading was received {round(age_sec)} seconds ago.\n\nPlease ensure your NodeMCU is powered and connected to WiFi to stream live telemetry.",
            "is_emergency": False
        }), 200

    sensor_data = {
        "temperature_c": r["temperature_c"],
        "humidity_percent": r["humidity_percent"],
        "heat_index_c": r["heat_index_c"],
        "smoke_adc": r["smoke_adc"],
        "flame_detected": bool(r["flame_detected"]),
        "alert": bool(r["alert"])
    }
    plan = get_action_plan(sensor_data)
    return jsonify({
        "connected": True, 
        "analysis": plan["formatted"],
        "plan": plan,
        "is_emergency": plan["is_emergency"],
        "sensor_data": sensor_data
    })


if __name__ == "__main__":
    init_db()
    import socket
    host = socket.gethostbyname(socket.gethostname())
    print()
    print("=" * 55)
    print("  Forest Fire Cloud Backend — running")
    print(f"  Dashboard:  http://{host}:5000/")
    print(f"  POST here:  http://{host}:5000/api/reading")
    print(f"  Pushbullet: {'ON' if PUSHBULLET_TOKEN else 'OFF'}")
    print(f"  Action Plan: ON")
    print("=" * 55)
    print()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
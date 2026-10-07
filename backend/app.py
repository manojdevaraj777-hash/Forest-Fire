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
    flame = sensor_data.get("flame_detected") or False
    
    status = "NORMAL: No immediate fire risk detected."
    explanation = "Sensor readings are within normal operational limits."
    actions = [
        "Continue routine monitoring.",
        "Ensure sensors are clear of debris.",
        "Verify system power and connectivity."
    ]

    if flame:
        status = "CRITICAL: Open flame detected!"
        explanation = "The IR Flame sensor has detected an active fire source in the immediate vicinity."
        actions = [
            "IMMEDIATELY evacuate the area.",
            "Contact local fire emergency services (e.g., 911).",
            "Do not attempt to extinguish if the fire is large.",
            "Activate secondary site alarms.",
            "Review camera feeds if available."
        ]
    elif temp > 45 or smoke > 400:
        status = "WARNING: High risk of fire or active smoldering."
        explanation = f"Elevated levels detected. Temperature is {temp}°C, Smoke ADC is {smoke}."
        actions = [
            "Dispatch a scout or drone to inspect the location.",
            "Prepare fire suppression equipment.",
            "Alert local response teams of a potential hazard.",
            "Monitor wind direction to predict spread.",
            "Verify if these readings are caused by controlled burns."
        ]
    elif temp > 35 and hum < 30:
        status = "ELEVATED RISK: Dry and hot conditions."
        explanation = "The environment is highly susceptible to ignition."
        actions = [
            "Increase monitoring frequency.",
            "Restrict access to high-risk areas.",
            "Check equipment for potential overheating.",
            "Ensure emergency water reserves are full."
        ]
        
    return (
        f"1. STATUS: {status}\n"
        f"2. EXPLANATION: {explanation}\n"
        f"3. ACTIONS:\n" + "\n".join(f"   - {a}" for a in actions)
    )


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
    received_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
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
    return jsonify([dict(r) for r in rows])


@app.route("/api/alerts")
def get_alerts():
    rows = get_db().execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 50").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/action/suggest")
def action_suggest():
    rows = get_db().execute("SELECT * FROM readings ORDER BY id DESC LIMIT 1").fetchall()
    if not rows:
        return jsonify({"error": "no data"}), 404
    r = dict(rows[0])
    sensor_data = {
        "temperature_c": r["temperature_c"],
        "humidity_percent": r["humidity_percent"],
        "heat_index_c": r["heat_index_c"],
        "smoke_adc": r["smoke_adc"],
        "flame_detected": bool(r["flame_detected"]),
        "alert": bool(r["alert"])
    }
    analysis = get_action_plan(sensor_data)
    return jsonify({"analysis": analysis, "sensor_data": sensor_data})


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
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
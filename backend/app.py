"""
Forest Fire Detection System — Cloud Backend
Flask + SQLite + Pushbullet push notifications

Run:
    python app.py

Endpoints:
    POST /api/reading          — receive sensor JSON from NodeMCU (triggers push on alert)
    GET  /api/readings         — latest readings as JSON
    GET  /api/alerts           — recent alerts as JSON
    GET  /                     — responsive dashboard (phone + desktop)
"""

import json
import os
import sqlite3
from datetime import datetime, timezone

from flask import Flask, request, jsonify, g

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "forest_fire.db")
PB_CONFIG_PATH = os.path.join(BASE_DIR, "pushbullet_config.json")

app = Flask(__name__)

# --- Pushbullet config ---
def load_pushbullet_token():
    try:
        with open(PB_CONFIG_PATH) as f:
            cfg = json.load(f)
            return cfg.get("access_token", "")
    except Exception:
        return ""

PUSHBULLET_TOKEN = load_pushbullet_token()
_last_alert_state = {"high_temperature": False, "low_humidity": False,
                     "high_smoke": False, "flame_detected": False}


def send_pushbullet(title, body):
    if not PUSHBULLET_TOKEN:
        return False
    try:
        import urllib.request, urllib.error
        data = json.dumps({
            "type": "note",
            "title": title,
            "body": body
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://api.pushbullet.com/v2/pushes",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Access-Token": PUSHBULLET_TOKEN
            }
        )
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception:
        return False


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
            flame_alert       INTEGER
        );
        CREATE TABLE IF NOT EXISTS alerts (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            received_at       TEXT NOT NULL,
            device_id         TEXT NOT NULL,
            alert_type        TEXT NOT NULL,
            temperature_c     REAL,
            humidity_percent  REAL,
            smoke_adc         INTEGER,
            flame_detected    INTEGER
        );
        """
    )
    db.commit()
    db.close()


@app.route("/")
def dashboard():
    html = """
    <!doctype html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Forest Fire Detection — Dashboard</title>
        <meta http-equiv="refresh" content="10">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, Helvetica, sans-serif;
                   margin: 12px; background: #f5f7fa; color: #222; }
            h1 { color: #b22222; font-size: 1.4em; margin-bottom: 4px; }
            .sub { color: #666; font-size: 0.85em; margin-bottom: 12px; }
            .live-dot { display: inline-block; width: 10px; height: 10px;
                        background: #1e7e34; border-radius: 50%; margin-right: 6px; }
            table { border-collapse: collapse; width: 100%; background: #fff; }
            th, td { border: 1px solid #ddd; padding: 7px 5px; text-align: center; font-size: 0.9em; }
            th { background: #2c3e50; color: #fff; }
            th:nth-child(1), td:nth-child(1) { width: 90px; }
            th:nth-child(2), td:nth-child(2) { width: 90px; }
            .alert-row { background: #ffebee; }
            .ok-text { color: #1e7e34; font-weight: bold; }
            .alert-text { color: #b22222; font-weight: bold; }
            .status-box { background: #fff; border-left: 5px solid #1e7e34;
                          padding: 10px 14px; margin-bottom: 12px; font-size: 1.05em; }
            .status-box.warn { border-left-color: #b22222; background: #fff3f3; }
            @media (max-width: 600px) {
                th, td { padding: 4px 2px; font-size: 0.75em; }
                h1 { font-size: 1.1em; }
            }
        </style>
    </head>
    <body>
    <h1>&#128276; Forest Fire Detection</h1>
    <p class="sub"><span class="live-dot"></span>Live — NodeMCU &middot; auto-refreshes every 10 s</p>
    <div class="status-box" id="status-box">Loading...</div>
    <table>
        <tr>
            <th>Time</th><th>Device</th><th>Temp °C</th><th>Hum %</th>
            <th>Heat °C</th><th>Smoke</th><th>Flame</th>
            <th>WiFi</th><th>Status</th>
        </tr>
    """
    rows = get_db().execute(
        "SELECT * FROM readings ORDER BY id DESC LIMIT 30"
    ).fetchall()
    latest = rows[0] if rows else None
    if latest:
        reasons = []
        if latest["high_temperature"]: reasons.append("HIGH TEMP")
        if latest["low_humidity"]: reasons.append("LOW HUMIDITY")
        if latest["high_smoke"]: reasons.append("HIGH SMOKE")
        if latest["flame_alert"]: reasons.append("FLAME")
        if reasons:
            status_txt = " ⚠ " + ", ".join(reasons)
            status_class = "alert-text"
            box_border = "#b22222"
            box_bg = "#fff3f3"
        else:
            status_txt = "&#10003; All Clear"
            status_class = "ok-text"
            box_border = "#1e7e34"
            box_bg = "#f0fff4"
        temp = f'{latest["temperature_c"]:.1f}' if latest["temperature_c"] is not None else "-"
        hum = f'{latest["humidity_percent"]:.1f}' if latest["humidity_percent"] is not None else "-"
        hi = f'{latest["heat_index_c"]:.1f}' if latest["heat_index_c"] is not None else "-"
        flame = "YES" if latest["flame_detected"] else "no"
        html += f'''
        <div class="status-box warn" style="border-left-color:{box_border};background:{box_bg}">
            Latest: {temp}°C &middot; {hum}% &middot; Smoke {latest["smoke_adc"]} &middot; Flame {flame}<br>
            <span class="{status_class}">{status_txt}</span>
        </div>
        '''
    for r in rows:
        reasons = []
        if r["high_temperature"]: reasons.append("HIGH TEMP")
        if r["low_humidity"]: reasons.append("LOW HUMIDITY")
        if r["high_smoke"]: reasons.append("HIGH SMOKE")
        if r["flame_alert"]: reasons.append("FLAME")
        if reasons:
            status_txt = " ⚠ " + ", ".join(reasons)
            status_class = "alert-text"
        else:
            status_txt = "&#10003; OK"
            status_class = "ok-text"
        temp = f'{r["temperature_c"]:.1f}' if r["temperature_c"] is not None else "-"
        hum = f'{r["humidity_percent"]:.1f}' if r["humidity_percent"] is not None else "-"
        hi = f'{r["heat_index_c"]:.1f}' if r["heat_index_c"] is not None else "-"
        flame = "YES" if r["flame_detected"] else "no"
        html += (
            f"<tr class='{'alert-row' if reasons else ''}'>"
            f"<td>{r['received_at']}</td>"
            f"<td>{r['device_id']}</td>"
            f"<td>{temp}</td><td>{hum}</td><td>{hi}</td>"
            f"<td>{r['smoke_adc']}</td><td>{flame}</td>"
            f"<td>{r['wifi_rssi_db']}</td>"
            f"<td class='{status_class}'>{status_txt}</td>"
            "</tr>"
        )
    html += "</table></body></html>"
    return html


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

    # Build alert type list for push dedup
    active_types = []
    if triggers.get("high_temperature"): active_types.append("high_temperature")
    if triggers.get("low_humidity"): active_types.append("low_humidity")
    if triggers.get("high_smoke"): active_types.append("high_smoke")
    if triggers.get("flame_detected"): active_types.append("flame_detected")

    # Push on state transition false→true
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
            # Store alert in DB
            db = get_db()
            db.execute(
                "INSERT INTO alerts (received_at, device_id, alert_type, temperature_c, humidity_percent, smoke_adc, flame_detected) VALUES (?,?,?,?,?,?,?)",
                (received_at, payload.get("device_id", "unknown"), atype,
                 readings.get("temperature_c"), readings.get("humidity_percent"),
                 readings.get("smoke_adc"), 1 if readings.get("flame_detected") else 0)
            )
            db.commit()

    for atype in list(_last_alert_state.keys()):
        if atype not in active_types:
            _last_alert_state[atype] = False

    # Store telemetry
    db = get_db()
    db.execute(
        """INSERT INTO readings (received_at, device_id, alert, heartbeat, uptime_ms,
              wifi_rssi_db, temperature_c, humidity_percent, heat_index_c,
              smoke_adc, flame_detected, high_temperature, low_humidity,
              high_smoke, flame_alert) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (received_at, payload.get("device_id", "unknown"),
         1 if alert else 0, 1 if payload.get("heartbeat") else 0,
         payload.get("uptime_ms"), payload.get("wifi_rssi_db"),
         readings.get("temperature_c"), readings.get("humidity_percent"),
         readings.get("heat_index_c"), readings.get("smoke_adc"),
         1 if readings.get("flame_detected") else 0,
         1 if triggers.get("high_temperature") else 0,
         1 if triggers.get("low_humidity") else 0,
         1 if triggers.get("high_smoke") else 0,
         1 if triggers.get("flame_detected") else 0)
    )
    db.commit()
    return jsonify({"ok": True, "received_at": received_at})


@app.route("/api/readings")
def get_readings():
    rows = get_db().execute("SELECT * FROM readings ORDER BY id DESC LIMIT 100").fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/alerts")
def get_alerts():
    rows = get_db().execute(
        "SELECT * FROM alerts ORDER BY id DESC LIMIT 50"
    ).fetchall()
    return jsonify([dict(r) for r in rows])


if __name__ == "__main__":
    init_db()
    import socket
    host = socket.gethostbyname(socket.gethostname())
    print()
    print("=" * 55)
    print("  Forest Fire Cloud Backend — running")
    print(f"  Dashboard:  http://{host}:5000/")
    print(f"  POST here:  http://{host}:5000/api/reading")
    print(f"  Pushbullet: {'ON' if PUSHBULLET_TOKEN else 'OFF (add token to pushbullet_config.json)'}")
    print("=" * 55)
    print()
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
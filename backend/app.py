"""
Forest Fire Detection System — Cloud Backend
Flask + SQLite (zero-config, runs on your PC)

Run:
    python app.py

Endpoints:
    POST /api/reading          — receive sensor JSON from the NodeMCU
    GET  /api/readings         — latest readings as JSON
    GET  /                     — dashboard (browser)
"""

import os
import sqlite3
import json
from datetime import datetime, timezone

from flask import Flask, request, jsonify, g

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "forest_fire.db")

app = Flask(__name__)


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
        <title>Forest Fire Detection — Dashboard</title>
        <meta http-equiv="refresh" content="10">
        <style>
            body { font-family: Arial, sans-serif; margin: 30px; background:#f5f7fa; }
            h1 { color: #b22222; }
            table { border-collapse: collapse; width: 100%; background: #fff; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
            th { background: #2c3e50; color: #fff; }
            .alert { background: #b22222; color: #fff; font-weight: bold; }
            .ok    { color: #1e7e34; font-weight: bold; }
            .nm    { color: #888; }
        </style>
    </head>
    <body>
    <h1>🔥 Forest Fire Detection — Live Dashboard</h1>
    <p>Latest readings from the NodeMCU (auto-refreshes every 10 s)</p>
    <table>
        <tr>
            <th>Time</th><th>Device</th><th>Temp °C</th><th>Humidity %</th>
            <th>Heat Idx °C</th><th>Smoke ADC</th><th>Flame</th>
            <th>WiFi RSSI</th><th>Status</th>
        </tr>
    """
    rows = get_db().execute(
        "SELECT * FROM readings ORDER BY id DESC LIMIT 30"
    ).fetchall()
    for r in rows:
        status = "OK"
        class_ = "ok"
        if r["alert"]:
            reasons = []
            if r["high_temperature"]:
                reasons.append("HIGH TEMP")
            if r["low_humidity"]:
                reasons.append("LOW HUMIDITY")
            if r["high_smoke"]:
                reasons.append("HIGH SMOKE")
            if r["flame_alert"]:
                reasons.append("FLAME")
            status = " ⚠ " + ", ".join(reasons)
            class_ = "alert"
        temp = f'{r["temperature_c"]:.1f}' if r["temperature_c"] is not None else "-"
        hum = f'{r["humidity_percent"]:.1f}' if r["humidity_percent"] is not None else "-"
        hi = f'{r["heat_index_c"]:.1f}' if r["heat_index_c"] is not None else "-"
        flame = "YES" if r["flame_detected"] else "no"
        html += (
            "<tr>"
            f"<td>{r['received_at']}</td>"
            f"<td>{r['device_id']}</td>"
            f"<td>{temp}</td><td>{hum}</td><td>{hi}</td>"
            f"<td>{r['smoke_adc']}</td><td>{flame}</td>"
            f"<td>{r['wifi_rssi_db']}</td>"
            f"<td class='{class_}'>{status}</td>"
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

    db = get_db()
    db.execute(
        """
        INSERT INTO readings (
            received_at, device_id, alert, heartbeat, uptime_ms,
            wifi_rssi_db, temperature_c, humidity_percent, heat_index_c,
            smoke_adc, flame_detected, high_temperature, low_humidity,
            high_smoke, flame_alert
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            received_at,
            payload.get("device_id", "unknown"),
            1 if payload.get("alert") else 0,
            1 if payload.get("heartbeat") else 0,
            payload.get("uptime_ms"),
            payload.get("wifi_rssi_db"),
            readings.get("temperature_c"),
            readings.get("humidity_percent"),
            readings.get("heat_index_c"),
            readings.get("smoke_adc"),
            1 if readings.get("flame_detected") else 0,
            1 if triggers.get("high_temperature") else 0,
            1 if triggers.get("low_humidity") else 0,
            1 if triggers.get("high_smoke") else 0,
            1 if triggers.get("flame_detected") else 0,
        ),
    )
    db.commit()
    return jsonify({"ok": True, "received_at": received_at})


@app.route("/api/readings")
def get_readings():
    rows = get_db().execute(
        "SELECT * FROM readings ORDER BY id DESC LIMIT 100"
    ).fetchall()
    data = [dict(r) for r in rows]
    return jsonify(data)


if __name__ == "__main__":
    init_db()
    import socket

    host = socket.gethostbyname(socket.gethostname())
    print()
    print("=" * 55)
    print("  Forest Fire Cloud Backend — running")
    print(f"  Dashboard:  http://{host}:5000/")
    print(f"  POST here:  http://{host}:5000/api/reading")
    print("=" * 55)
    print()
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
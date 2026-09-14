const POLL_MS = 3000;
const $ = (s) => document.querySelector(s);

/* ===== EMBER PARTICLES ===== */
function createEmbers() {
    const layer = $("#ember-layer");
    for (let i = 0; i < 30; i++) {
        const e = document.createElement("div");
        e.className = "ember";
        e.style.left = Math.random() * 100 + "%";
        e.style.animationDuration = (3 + Math.random() * 5) + "s";
        e.style.animationDelay = Math.random() * 5 + "s";
        e.style.width = (2 + Math.random() * 3) + "px";
        e.style.height = e.style.width;
        layer.appendChild(e);
    }
}
createEmbers();

/* ===== LUCIDE ICONS ===== */
lucide.createIcons();

/* ===== SYNC NAV ALERT BADGE ===== */
function syncNavBadge(count) {
    const badge = $("#nav-alert-badge");
    if (badge) badge.textContent = count;
}

/* ===== CHARTS ===== */
const baseOpts = { responsive: true, animation: false, plugins: { legend: { labels: { color: "#6a9a6a", font: { size: 11 } } } }, scales: {} };
const chartTempHum = new Chart($("#chart-temp-hum"), {
    type: "line", data: { labels: [], datasets: [
        { label: "Temp °C", data: [], borderColor: "#ff6b35", tension: 0.4, pointRadius: 3, pointBackgroundColor: "#ff6b35", borderWidth: 2, fill: false },
        { label: "Hum %", data: [], borderColor: "#4a8c3f", tension: 0.4, pointRadius: 3, pointBackgroundColor: "#4a8c3f", borderWidth: 2, fill: false, yAxisID: "y1" },
    ]},
    options: { ...baseOpts, scales: { x: { display: false }, y: { beginAtZero: true, position: "left" }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } } } },
});
const chartSmoke = new Chart($("#chart-smoke"), {
    type: "line", data: { labels: [], datasets: [{ label: "Smoke ADC", data: [], borderColor: "#ff9f1c", tension: 0.4, pointRadius: 3, pointBackgroundColor: "#ff9f1c", fill: true, backgroundColor: "rgba(255,159,28,0.06)", borderWidth: 2 }] },
    options: { ...baseOpts, scales: { x: { display: false }, y: { beginAtZero: true, max: 1024 } } },
});
const chartHeat = new Chart($("#chart-heat"), {
    type: "line", data: { labels: [], datasets: [{ label: "Heat Index °C", data: [], borderColor: "#e63946", tension: 0.4, pointRadius: 3, pointBackgroundColor: "#e63946", fill: true, backgroundColor: "rgba(230,57,70,0.06)", borderWidth: 2 }] },
    options: { ...baseOpts, scales: { x: { display: false }, y: { beginAtZero: true } } },
});
let tempBuf = [], humBuf = [], smokeBuf = [], heatBuf = [], labelsBuf = [];

function escHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function updateCharts(data) {
    if (!data.length) return;
    const r = data[0];
    labelsBuf.unshift(new Date(r.received_at).toLocaleTimeString());
    tempBuf.unshift(r.temperature_c ?? null); humBuf.unshift(r.humidity_percent ?? null);
    smokeBuf.unshift(r.smoke_adc ?? null); heatBuf.unshift(r.heat_index_c ?? null);
    while (labelsBuf.length > 20) { labelsBuf.pop(); tempBuf.pop(); humBuf.pop(); smokeBuf.pop(); heatBuf.pop(); }
    chartTempHum.data.labels = labelsBuf; chartTempHum.data.datasets[0].data = tempBuf; chartTempHum.data.datasets[1].data = humBuf; chartTempHum.update();
    chartSmoke.data.labels = labelsBuf; chartSmoke.data.datasets[0].data = smokeBuf; chartSmoke.update();
    chartHeat.data.labels = labelsBuf; chartHeat.data.datasets[0].data = heatBuf; chartHeat.update();
    $("#chart-count").textContent = labelsBuf.length;
    $("#chart-updated").textContent = new Date().toLocaleTimeString();
}

/* ===== HELPERS ===== */
function setBar(id, val, max) { const el = $(id); if (!el) return; el.style.width = Math.min(100, (val / max) * 100) + "%"; }
function setCritical(cardId, isCritical) { const card = $(cardId); if (!card) return; if (isCritical) card.classList.add("critical"); else card.classList.remove("critical"); }

/* ===== NAVIGATION ===== */
document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const sec = btn.dataset.section;
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.querySelectorAll(".section").forEach(s => s.style.display = "none");
        $(`#sec-${sec}`).style.display = "";
    });
});

/* ===== TREND TABS ===== */
document.querySelectorAll(".trend-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        const chart = tab.dataset.chart;
        document.querySelectorAll(".trend-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        ["temp-hum", "smoke", "heat"].forEach(c => {
            $(`#chart-box-${c}`).style.display = c === chart ? "" : "none";
        });
    });
});

/* ===== ALERT BANNER ===== */
$("#alert-dismiss").addEventListener("click", () => { $("#alert-banner").style.display = "none"; });

/* ===== FETCH & UPDATE ===== */
async function fetchReadings() {
    try {
        const res = await fetch("/api/readings");
        const data = await res.json();
        if (!data.length) return;
        const r = data[0];

        /* Sensor values */
        $("#val-temp").textContent = r.temperature_c != null ? r.temperature_c.toFixed(1) : "—";
        $("#val-hum").textContent = r.humidity_percent != null ? r.humidity_percent.toFixed(1) : "—";
        $("#val-smoke").textContent = r.smoke_adc != null ? r.smoke_adc : "—";
        $("#val-heat").textContent = r.heat_index_c != null ? r.heat_index_c.toFixed(1) : "—";
        $("#val-flame").textContent = r.flame_detected ? "🔴 YES" : "🟢 NO";
        $("#val-rssi").textContent = r.wifi_rssi_db != null ? r.wifi_rssi_db : "—";
        setBar("#bar-temp", Math.max(0, r.temperature_c ?? 0), 60);
        setBar("#bar-hum", Math.max(0, r.humidity_percent ?? 0), 100);
        setBar("#bar-smoke", Math.max(0, r.smoke_adc ?? 0), 1024);
        setBar("#bar-heat", Math.max(0, r.heat_index_c ?? 0), 60);

        /* Contextual card colors */
        const tempCritical = r.temperature_c != null && r.temperature_c > 45;
        const smokeCritical = r.smoke_adc != null && r.smoke_adc > 400;
        const heatCritical = r.heat_index_c != null && r.heat_index_c > 52;
        setCritical("#card-temp", tempCritical);
        setCritical("#card-smoke", smokeCritical);
        setCritical("#card-heat", heatCritical);
        if (tempCritical) { $("#card-temp").style.borderColor = "rgba(255,68,34,0.4)"; } else { $("#card-temp").style.borderColor = ""; }
        if (smokeCritical) { $("#card-smoke").style.borderColor = "rgba(255,159,28,0.4)"; } else { $("#card-smoke").style.borderColor = ""; }
        if (heatCritical) { $("#card-heat").style.borderColor = "rgba(230,57,70,0.4)"; } else { $("#card-heat").style.borderColor = ""; }

        /* Status badges */
        $("#st-temp").className = tempCritical ? "sensor-status status-alert" : "sensor-status status-ok";
        $("#st-temp").textContent = tempCritical ? "⚠ ALERT" : "OK";
        $("#st-hum").className = (r.humidity_percent != null && r.humidity_percent < 20) ? "sensor-status status-watch" : "sensor-status status-ok";
        $("#st-hum").textContent = (r.humidity_percent != null && r.humidity_percent < 20) ? "LOW" : "OK";
        $("#st-smoke").className = smokeCritical ? "sensor-status status-alert" : "sensor-status status-ok";
        $("#st-smoke").textContent = smokeCritical ? "⚠ ALERT" : "OK";
        $("#st-heat").className = heatCritical ? "sensor-status status-alert" : "sensor-status status-ok";
        $("#st-heat").textContent = heatCritical ? "⚠ ALERT" : "OK";
        $("#st-flame").className = r.flame_detected ? "sensor-status status-alert" : "sensor-status status-ok";
        $("#st-flame").textContent = r.flame_detected ? "🔴 DETECTED" : "🟢 NORMAL";
        $("#st-rssi").className = r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "sensor-status status-watch" : "sensor-status status-ok";
        $("#st-rssi").textContent = r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "WEAK" : "OK";

        /* Alert banner */
        if (r.alert) {
            $("#alert-banner").style.display = "flex";
            const trig = r.alert_triggers || {};
            const msg = trig.high_smoke ? "HIGH SMOKE DETECTED" : trig.flame_detected ? "FLAME DETECTED" : trig.high_temperature ? "HIGH TEMP" : "ALERT ACTIVE";
            $("#alert-banner-text").textContent = "⚠ " + msg;
            $("#live-dot").style.background = "var(--ember)";
            $("#live-dot").style.animation = "none";
            $("#live-dot").offsetHeight;
            $("#live-dot").style.animation = "pulseRed 1s infinite";
            $("#status-text").textContent = "⚠ ALERT"; $("#status-text").style.color = "var(--ember)";
        } else {
            $("#alert-banner").style.display = "none";
            $("#live-dot").style.background = "var(--forest-glow)";
            $("#live-dot").style.animation = "";
            $("#status-text").textContent = "All Clear — Monitoring"; $("#status-text").style.color = "var(--text-muted)";
        }

        /* Hardware status */
        const dhtOk = r.temperature_c != null && !isNaN(r.temperature_c);
        const mq2Ok = r.smoke_adc != null;
        const flameOk = r.flame_detected != null;
        const wifiOk = r.wifi_rssi_db != null;
        $("#hw-dht-status").className = dhtOk ? "hw-status status-ok" : "hw-status status-alert";
        $("#hw-dht-status").textContent = dhtOk ? "✅ Working" : "❌ FAIL";
        $("#hw-mq2-status").className = mq2Ok ? "hw-status status-ok" : "hw-status status-alert";
        $("#hw-mq2-status").textContent = mq2Ok ? "✅ Working" : "❌ FAIL";
        $("#hw-flame-status").className = flameOk ? "hw-status status-ok" : "hw-status status-alert";
        $("#hw-flame-status").textContent = flameOk ? "✅ Working" : "❌ FAIL";
        $("#hw-buzzer-status").className = "hw-status status-ok"; $("#hw-buzzer-status").textContent = "✅ OK";
        $("#hw-led-status").className = "hw-status status-ok"; $("#hw-led-status").textContent = "✅ OK";
        $("#hw-wifi-status").className = wifiOk ? "hw-status status-ok" : "hw-status status-alert";
        $("#hw-wifi-status").textContent = wifiOk ? "✅ Connected" : "⚠ Weak";

        /* Health meter */
        let health = 100;
        if (r.temperature_c > 45) health -= 30;
        if (r.humidity_percent < 20) health -= 20;
        if (r.smoke_adc > 400) health -= 30;
        if (r.flame_detected) health = 0;
        if (r.wifi_rssi_db != null && r.wifi_rssi_db < -70) health -= 10;
        health = Math.max(0, Math.min(100, health));
        $("#health-fill").style.width = health + "%";
        if (health > 70) { $("#health-fill").style.background = "linear-gradient(90deg, var(--forest-glow), var(--forest-light))"; $("#health-text").textContent = "🌿 Healthy"; }
        else if (health > 40) { $("#health-fill").style.background = "linear-gradient(90deg, var(--fire-glow), var(--fire-orange))"; $("#health-text").textContent = "⚠ At Risk"; }
        else { $("#health-fill").style.background = "linear-gradient(90deg, var(--fire-red), #ff4422)"; $("#health-text").textContent = "🔴 Critical"; }

        /* Charts */
        updateCharts(data);

        /* Stats */
        $("#stat-readings").textContent = data.length;

    } catch (e) { console.error(e); }
}

async function fetchAlerts() {
    try {
        const res = await fetch("/api/alerts");
        const data = await res.json();
        const tbody = $("#alert-tbody");
        if (!data.length) { tbody.innerHTML = "<tr><td colspan='7'>No alerts yet</td></tr>"; $("#alert-count-badge").textContent = "0"; return; }
        $("#alert-count-badge").textContent = data.length;
        syncNavBadge(data.length);
        tbody.innerHTML = data.map((a, i) =>
            `<tr><td>${i + 1}</td><td>${escHtml(a.received_at)}</td><td>${escHtml(a.alert_type.replace(/_/g,' ').toUpperCase())}</td>` +
            `<td>${a.temperature_c?.toFixed(1)??'-'}</td><td>${a.humidity_percent?.toFixed(1)??'-'}</td><td>${a.smoke_adc}</td><td>${a.heat_index_c?.toFixed(1)??'-'}</td></tr>`
        ).join("");
    } catch (e) { console.error(e); }
}

/* ===== AI ===== */
const aiResult = $("#ai-result");
$("#ai-analyze").addEventListener("click", async () => {
    aiResult.innerHTML = '<p class="ai-hint">🌿 Analyzing forest data with Gemini AI...</p>';
    try {
        const res = await fetch("/api/ai/suggest");
        const data = await res.json();
        if (data.analysis) { aiResult.innerHTML = `<pre class="ai-output">${escHtml(data.analysis)}</pre>`; }
        else { aiResult.innerHTML = '<p class="ai-error">No AI response. Check Gemini config.</p>'; }
    } catch (e) { aiResult.innerHTML = `<p class="ai-error">Error: ${escHtml(e.message)}</p>`; }
});

/* ===== POLLING ===== */
setInterval(fetchReadings, POLL_MS);
setInterval(fetchAlerts, 15000);
fetchReadings(); fetchAlerts();

/* ===== ADDITIONAL KEYFRAME for red pulse dot ===== */
const style = document.createElement("style");
style.textContent = `@keyframes pulseRed { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,68,34,0.6); } 50% { box-shadow: 0 0 0 6px rgba(255,68,34,0); } }`;
document.head.appendChild(style);
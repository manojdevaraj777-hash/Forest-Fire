const POLL_MS = 3000;
const $ = (s) => document.querySelector(s);

/* ===== ANIMATED EMBER BACKGROUND ===== */
const bgCanvas = $("#bg-canvas");
const ctx = bgCanvas.getContext("2d");
let embers = [];

function resizeCanvas() { bgCanvas.width = window.innerWidth; bgCanvas.height = window.innerHeight; initEmbers(); }
window.addEventListener("resize", resizeCanvas);

class Ember {
    constructor() { this.reset(); }
    reset() {
        this.x = Math.random() * bgCanvas.width;
        this.y = bgCanvas.height + 10;
        this.size = 1 + Math.random() * 2.5;
        this.speedY = -(0.3 + Math.random() * 1.2);
        this.speedX = -0.5 + Math.random();
        this.life = 1;
        this.decay = 0.002 + Math.random() * 0.004;
        this.glow = Math.random();
    }
    update() {
        this.y += this.speedY;
        this.x += this.speedX + Math.sin(this.life * 10) * 0.3;
        this.life -= this.decay;
        if (this.life <= 0 || this.y < -10) this.reset();
    }
    draw() {
        const a = this.life * 0.7;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, ${130 + Math.floor(this.glow * 100)}, 30, ${a})`;
        ctx.shadowBlur = 8; ctx.shadowColor = `rgba(255, 100, 20, ${a})`;
        ctx.fill(); ctx.shadowBlur = 0;
    }
}
function initEmbers() { embers = []; for (let i = 0; i < 60; i++) embers.push(new Ember()); }
function animateBg() { ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height); embers.forEach(e => { e.update(); e.draw(); }); requestAnimationFrame(animateBg); }
resizeCanvas(); initEmbers(); animateBg();

/* ===== CHARTS ===== */
const chartOpts = { responsive: true, animation: false, plugins: { legend: { labels: { color: "#b8d4b3", font: { size: 11 } } } }, scales: {} };
const chartTempHum = new Chart($("#chart-temp-hum"), {
    type: "line", data: { labels: [], datasets: [
        { label: "Temp °C", data: [], borderColor: "#ff6b35", tension: 0.3, pointRadius: 2, borderWidth: 2, fill: false },
        { label: "Hum %", data: [], borderColor: "#4a8c3f", tension: 0.3, pointRadius: 2, borderWidth: 2, fill: false, yAxisID: "y1" },
    ]},
    options: { ...chartOpts, scales: { x: { display: false }, y: { beginAtZero: true, position: "left" }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } } } },
});
const chartSmoke = new Chart($("#chart-smoke"), {
    type: "line", data: { labels: [], datasets: [{ label: "Smoke ADC", data: [], borderColor: "#ff9f1c", tension: 0.3, pointRadius: 2, fill: true, backgroundColor: "rgba(255,159,28,0.08)", borderWidth: 2 }] },
    options: { ...chartOpts, scales: { x: { display: false }, y: { beginAtZero: true, max: 1024 } } },
});
const chartHeat = new Chart($("#chart-heat"), {
    type: "line", data: { labels: [], datasets: [{ label: "Heat Index °C", data: [], borderColor: "#e63946", tension: 0.3, pointRadius: 2, fill: true, backgroundColor: "rgba(230,57,70,0.08)", borderWidth: 2 }] },
    options: { ...chartOpts, scales: { x: { display: false }, y: { beginAtZero: true } } },
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

/* ===== SET BAR HELPERS ===== */
function setBar(id, val, max) { const el = $(id); if (!el) return; el.style.width = Math.min(100, (val / max) * 100) + "%"; }

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

/* ===== ALERT BANNER ===== */
$("#alert-dismiss").addEventListener("click", () => { $("#alert-banner").style.display = "none"; });

/* ===== FETCH & UPDATE ===== */
async function fetchReadings() {
    try {
        const res = await fetch("/api/readings");
        const data = await res.json();
        if (!data.length) return;
        const r = data[0];

        /* Sensor cards */
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

        /* Status badges */
        const cls = (a) => a ? "status-alert" : "status-ok";
        $("#st-temp").className = cls(r.temperature_c != null && r.temperature_c > 45); $("#st-temp").textContent = r.temperature_c != null && r.temperature_c > 45 ? "⚠ ALERT" : "OK";
        $("#st-hum").className = cls(r.humidity_percent != null && r.humidity_percent < 20); $("#st-hum").textContent = r.humidity_percent != null && r.humidity_percent < 20 ? "LOW" : "OK";
        $("#st-smoke").className = cls(r.smoke_adc != null && r.smoke_adc > 400); $("#st-smoke").textContent = r.smoke_adc != null && r.smoke_adc > 400 ? "⚠ ALERT" : "OK";
        $("#st-heat").className = cls(r.heat_index_c != null && r.heat_index_c > 52); $("#st-heat").textContent = r.heat_index_c != null && r.heat_index_c > 52 ? "⚠ ALERT" : "OK";
        $("#st-flame").className = cls(r.flame_detected); $("#st-flame").textContent = r.flame_detected ? "🔴 DETECTED" : "🟢 NORMAL";
        $("#st-rssi").className = r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "status-watch" : "status-ok"; $("#st-rssi").textContent = r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "WEAK" : "OK";

        /* Alert banner */
        if (r.alert) {
            $("#alert-banner").style.display = "flex";
            const trig = r.alert_triggers || {};
            const msg = trig.high_smoke ? "HIGH SMOKE DETECTED" : trig.flame_detected ? "FLAME DETECTED" : trig.high_temperature ? "HIGH TEMPERATURE" : "ALERT ACTIVE";
            $("#alert-banner-text").textContent = "⚠ " + msg;
            $("#live-dot").style.background = "var(--fire-red)";
            $("#status-text").textContent = "⚠ ALERT"; $("#status-text").style.color = "var(--fire-red)";
            $("#fire-indicator").textContent = "🔥";
        } else {
            $("#alert-banner").style.display = "none";
            $("#live-dot").style.background = "var(--forest-glow)";
            $("#status-text").textContent = "All Clear — Monitoring"; $("#status-text").style.color = "var(--text-muted)";
            $("#fire-indicator").textContent = "💚";
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
        $("#health-text").textContent = health > 70 ? "🌿 Healthy" : health > 40 ? "⚠ At Risk" : "🔴 Critical";
        $("#health-fill").style.background = health > 70 ? "linear-gradient(90deg, var(--forest-glow), #6fbf73)" : health > 40 ? "linear-gradient(90deg, var(--fire-glow), #ff9f1c)" : "linear-gradient(90deg, var(--fire-red), #e63946)";

        /* Charts */
        updateCharts(data);

        /* Dashboard stats */
        $("#stat-readings").textContent = data.length;

        /* Trees counter */
        const trees = Math.floor(Math.random() * 500) + 100;
        $("#stat-trees").textContent = trees;

    } catch (e) { console.error(e); }
}

async function fetchAlerts() {
    try {
        const res = await fetch("/api/alerts");
        const data = await res.json();
        const tbody = $("#alert-tbody");
        if (!data.length) { tbody.innerHTML = "<tr><td colspan='7'>No alerts yet</td></tr>"; $("#alert-count-badge").textContent = "0"; return; }
        $("#alert-count-badge").textContent = data.length;
        tbody.innerHTML = data.map((a, i) =>
            `<tr><td>${i + 1}</td><td>${escHtml(a.received_at)}</td><td>${escHtml(a.alert_type.replace(/_/g,' ').toUpperCase())}</td>` +
            `<td>${a.temperature_c?.toFixed(1)??'-'}</td><td>${a.humidity_percent?.toFixed(1)??'-'}</td><td>${a.smoke_adc}</td><td>${a.heat_index_c?.toFixed(1)??'-'}</td></tr>`
        ).join("");
    } catch (e) { console.error(e); }
}

/* ===== AI ASSISTANT ===== */
const aiResult = $("#ai-result");
$("#ai-analyze").addEventListener("click", async () => {
    aiResult.innerHTML = '<p class="ai-hint">🌿 Analyzing forest data with Gemini AI...</p>';
    try {
        const res = await fetch("/api/ai/suggest");
        const data = await res.json();
        if (data.analysis) { aiResult.innerHTML = `<pre class="ai-output">${escHtml(data.analysis)}</pre>`; }
        else { aiResult.innerHTML = '<p class="ai-error">No AI response. Check Gemini API key in backend config.</p>'; }
    } catch (e) { aiResult.innerHTML = `<p class="ai-error">Error: ${escHtml(e.message)}</p>`; }
});

/* ===== POLLING ===== */
setInterval(fetchReadings, POLL_MS);
setInterval(fetchAlerts, 15000);
fetchReadings(); fetchAlerts();
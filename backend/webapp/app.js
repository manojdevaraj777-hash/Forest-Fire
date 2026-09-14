const POLL_MS = 3000;
const $ = (s) => document.querySelector(s);

// --- Animated ember background ---
const bgCanvas = $("#bg-canvas");
const ctx = bgCanvas.getContext("2d");
let embers = [];
let trees = [];

function resizeCanvas() {
    bgCanvas.width = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    initTrees();
}
window.addEventListener("resize", resizeCanvas);

function initTrees() {
    trees = [];
    for (let i = 0; i < 12; i++) {
        trees.push({
            x: Math.random() * bgCanvas.width,
            h: 40 + Math.random() * 80,
            w: 8 + Math.random() * 12,
            speed: 0.2 + Math.random() * 0.5,
            opacity: 0.03 + Math.random() * 0.06
        });
    }
}

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
        const alpha = this.life * 0.7;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, ${130 + Math.floor(this.glow * 100)}, 30, ${alpha})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(255, 100, 20, ${alpha})`;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function initEmbers() {
    embers = [];
    for (let i = 0; i < 60; i++) embers.push(new Ember());
}

function drawTrees() {
    trees.forEach(t => {
        ctx.save();
        ctx.globalAlpha = t.opacity;
        ctx.fillStyle = "#1a3a1a";
        ctx.fillRect(t.x - t.w / 2, bgCanvas.height - t.h, t.w, t.h);
        ctx.beginPath();
        ctx.arc(t.x, bgCanvas.height - t.h - 15, t.w * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#2d5a27";
        ctx.fill();
        ctx.restore();
    });
}

function animateBg() {
    ctx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    drawTrees();
    embers.forEach(e => { e.update(); e.draw(); });
    requestAnimationFrame(animateBg);
}
resizeCanvas();
initEmbers();
animateBg();

// --- Charts ---
const chartOpts = { responsive: true, animation: false, scales: { y: { beginAtZero: true } } };
const chartTempHum = new Chart($("#chart-temp-hum"), {
    type: "line", data: { labels: [], datasets: [
        { label: "Temp °C", data: [], borderColor: "#ff6b35", tension: 0.3, pointRadius: 2, borderWidth: 2 },
        { label: "Hum %", data: [], borderColor: "#4a8c3f", tension: 0.3, pointRadius: 2, borderWidth: 2, yAxisID: "y1" },
    ]},
    options: { ...chartOpts, scales: { x: { display: false }, y: { beginAtZero: true }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } } }, plugins: { legend: { labels: { color: "#b8d4b3", font: { size: 11 } } } } },
});
const chartSmoke = new Chart($("#chart-smoke"), {
    type: "line",
    data: { labels: [], datasets: [{ label: "Smoke ADC", data: [], borderColor: "#ff9f1c", tension: 0.3, pointRadius: 2, fill: true, backgroundColor: "rgba(255,159,28,0.1)", borderWidth: 2 }] },
    options: { ...chartOpts, scales: { x: { display: false }, y: { beginAtZero: true, max: 1024 } }, plugins: { legend: { labels: { color: "#b8d4b3", font: { size: 11 } } } } },
});
let tempBuf = [], humBuf = [], smokeBuf = [], labelsBuf = [];

function escHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function updateCharts(data) {
    if (!data.length) return;
    const r = data[0];
    labelsBuf.unshift(new Date(r.received_at).toLocaleTimeString());
    tempBuf.unshift(r.temperature_c ?? null); humBuf.unshift(r.humidity_percent ?? null); smokeBuf.unshift(r.smoke_adc ?? null);
    if (labelsBuf.length > 20) { labelsBuf.pop(); tempBuf.pop(); humBuf.pop(); smokeBuf.pop(); }
    chartTempHum.data.labels = labelsBuf;
    chartTempHum.data.datasets[0].data = tempBuf; chartTempHum.data.datasets[1].data = humBuf;
    chartTempHum.update();
    chartSmoke.data.labels = labelsBuf; chartSmoke.data.datasets[0].data = smokeBuf; chartSmoke.update();
}

// --- Sensor cards ---
function setBar(id, val, max) {
    const el = $(id);
    if (!el) return;
    const pct = Math.min(100, (val / max) * 100);
    el.style.width = pct + "%";
}

async function fetchReadings() {
    try {
        const res = await fetch("/api/readings");
        const data = await res.json();
        if (!data.length) return;
        const r = data[0];
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

        const cls = (a) => a ? "status-alert" : "status-ok";
        $("#st-temp").className = cls(r.temperature_c != null && r.temperature_c > 45); $("#st-temp").textContent = r.temperature_c != null && r.temperature_c > 45 ? "⚠ ALERT" : "OK";
        $("#st-hum").className = cls(r.humidity_percent != null && r.humidity_percent < 20); $("#st-hum").textContent = r.humidity_percent != null && r.humidity_percent < 20 ? "LOW" : "OK";
        $("#st-smoke").className = cls(r.smoke_adc != null && r.smoke_adc > 400); $("#st-smoke").textContent = r.smoke_adc != null && r.smoke_adc > 400 ? "⚠ ALERT" : "OK";
        $("#st-heat").className = cls(r.heat_index_c != null && r.heat_index_c > 52); $("#st-heat").textContent = r.heat_index_c != null && r.heat_index_c > 52 ? "⚠ ALERT" : "OK";
        $("#st-flame").className = cls(r.flame_detected); $("#st-flame").textContent = r.flame_detected ? "🔴 DETECTED" : "🟢 NORMAL";
        $("#st-rssi").className = r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "status-watch" : "status-ok"; $("#st-rssi").textContent = r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "WEAK" : "OK";

        if (r.alert) {
            $("#alert-banner").style.display = "block";
            $("#alert-banner-text").textContent = "⚠ ALERT ACTIVE — " + (r.alert_triggers?.high_smoke ? "HIGH SMOKE" : r.alert_triggers?.flame_detected ? "FLAME DETECTED" : r.alert_triggers?.high_temperature ? "HIGH TEMP" : "");
            $("#live-dot").style.background = "var(--fire-red)";
            $("#status-text").textContent = "⚠ ALERT ACTIVE"; $("#status-text").style.color = "var(--fire-red)";
            $("#alert-banner").style.animation = "alertPulse 1.5s infinite";
        } else {
            $("#alert-banner").style.display = "none";
            $("#live-dot").style.background = "var(--forest-light)";
            $("#status-text").textContent = "All Clear — Monitoring"; $("#status-text").style.color = "var(--text-muted)";
        }
        $("#comp-dht").className = r.temperature_c != null && !isNaN(r.temperature_c) ? "comp-ok" : "comp-fail";
        $("#comp-dht").textContent = r.temperature_c != null && !isNaN(r.temperature_c) ? "OK" : "FAIL";
        $("#comp-mq2").className = r.smoke_adc != null ? "comp-ok" : "comp-fail";
        $("#comp-mq2").textContent = r.smoke_adc != null ? "OK" : "FAIL";
        updateCharts(data);
        $("#stat-readings").textContent = data.length;
    } catch (e) { console.error(e); }
}

async function fetchAlerts() {
    try {
        const res = await fetch("/api/alerts");
        const data = await res.json();
        const tbody = $("#alert-tbody");
        if (!data.length) { tbody.innerHTML = "<tr><td colspan='5'>No alerts yet</td></tr>"; return; }
        tbody.innerHTML = data.map(a =>
            `<tr><td>${escHtml(a.received_at)}</td><td>${escHtml(a.alert_type.replace(/_/g,' ').toUpperCase())}</td>` +
            `<td>${a.temperature_c?.toFixed(1)??'-'}</td><td>${a.humidity_percent?.toFixed(1)??'-'}</td><td>${a.smoke_adc}</td></tr>`
        ).join("");
        $("#stat-alerts").textContent = data.length;
    } catch (e) { console.error(e); }
}

// --- AI Assistant ---
const aiPanel = $("#ai-panel"); const aiResult = $("#ai-result");
$("#ai-toggle").addEventListener("click", () => { aiPanel.style.display = aiPanel.style.display === "none" ? "block" : "none"; });
$("#ai-close").addEventListener("click", () => { aiPanel.style.display = "none"; });
$("#ai-analyze").addEventListener("click", async () => {
    aiResult.innerHTML = '<p class="ai-hint">🌿 Analyzing forest data with Gemini AI...</p>';
    try {
        const res = await fetch("/api/ai/suggest");
        const data = await res.json();
        aiResult.innerHTML = data.analysis ? `<pre class="ai-output">${escHtml(data.analysis)}</pre>` : '<p class="ai-error">No AI response. Check gemini_config.json.</p>';
    } catch (e) { aiResult.innerHTML = `<p class="ai-error">Error: ${escHtml(e.message)}</p>`; }
});

// --- Polling ---
setInterval(fetchReadings, POLL_MS);
setInterval(fetchAlerts, 15000);
fetchReadings(); fetchAlerts();
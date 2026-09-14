const API = "";
const POLL_MS = 3000;

const $ = (s) => document.querySelector(s);

// --- Charts ---
const chartOpts = {
    responsive: true,
    animation: false,
    scales: { y: { beginAtZero: true } },
    plugins: { legend: { labels: { color: "#333", font: { size: 12 } } } },
};
const chartTempHum = new Chart($("#chart-temp-hum"), {
    type: "line",
    data: { labels: [], datasets: [
        { label: "Temp °C", data: [], borderColor: "#e74c3c", tension: 0.3, pointRadius: 2 },
        { label: "Hum %", data: [], borderColor: "#3498db", tension: 0.3, pointRadius: 2, yAxisID: "y1" },
    ]},
    options: { ...chartOpts, scales: { x: { display: false }, y: { beginAtZero: true }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false } } } },
});
const chartSmoke = new Chart($("#chart-smoke"), {
    type: "line",
    data: { labels: [], datasets: [{ label: "Smoke ADC", data: [], borderColor: "#f39c12", tension: 0.3, pointRadius: 2, fill: true, backgroundColor: "rgba(243,156,18,0.1)" }] },
    options: { ...chartOpts, scales: { x: { display: false }, y: { beginAtZero: true, max: 1024 } } },
});

let tempBuf = [], humBuf = [], smokeBuf = [], labelsBuf = [];

function updateCharts(readings) {
    if (!readings.length) return;
    const r = readings[0];
    const t = new Date(r.received_at).toLocaleTimeString();
    labelsBuf.unshift(t);
    tempBuf.unshift(r.temperature_c ?? null);
    humBuf.unshift(r.humidity_percent ?? null);
    smokeBuf.unshift(r.smoke_adc ?? null);
    if (labelsBuf.length > 30) { labelsBuf.pop(); tempBuf.pop(); humBuf.pop(); smokeBuf.pop(); }
    chartTempHum.data.labels = labelsBuf;
    chartTempHum.data.datasets[0].data = tempBuf;
    chartTempHum.data.datasets[1].data = humBuf;
    chartTempHum.update();
    chartSmoke.data.labels = labelsBuf;
    chartSmoke.data.datasets[0].data = smokeBuf;
    chartSmoke.update();
}

function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}

async function fetchReadings() {
    try {
        const res = await fetch("/api/readings");
        const data = await res.json();
        if (!data.length) return;
        const r = data[0];

        $("#val-temp").textContent = r.temperature_c != null ? r.temperature_c.toFixed(1) : "—";
        $("#val-hum").textContent = r.humidity_percent != null ? r.humidity_percent.toFixed(1) : "—";
        $("#val-smoke").textContent = r.smoke_adc ?? "—";
        $("#val-heat").textContent = r.heat_index_c != null ? r.heat_index_c.toFixed(1) : "—";
        $("#val-flame").textContent = r.flame_detected ? "🔴 YES" : "🟢 NO";
        $("#val-rssi").textContent = r.wifi_rssi_db != null ? r.wifi_rssi_db : "—";

        const st = (v, gt, lt) => v != null ? (v > gt ? "ALERT" : v < lt ? "LOW" : "OK") : "—";
        const cls = (s) => s === "ALERT" ? "status-alert" : s === "OK" ? "status-ok" : "status-watch";
        const txt = (s) => s === "ALERT" ? "⚠ ALERT" : s === "OK" ? "OK" : s === "LOW" ? "⚠ LOW" : "—";

        const tempS = st(r.temperature_c, 45, null);
        const humS = st(r.humidity_percent, null, 20);
        const smokeS = st(r.smoke_adc, 400, null);
        const heatS = st(r.heat_index_c, 52, null);
        const flameS = r.flame_detected ? "ALERT" : "OK";
        const rssiS = r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "WEAK" : "OK";

        $("#status-temp").className = cls(tempS); $("#status-temp").textContent = txt(tempS);
        $("#status-hum").className = cls(humS); $("#status-hum").textContent = txt(humS);
        $("#status-smoke").className = cls(smokeS); $("#status-smoke").textContent = txt(smokeS);
        $("#status-heat").className = cls(heatS); $("#status-heat").textContent = txt(heatS);
        $("#status-flame").className = cls(flameS); $("#status-flame").textContent = txt(flameS);
        $("#status-rssi").className = cls(rssiS); $("#status-rssi").textContent = txt(rssiS);

        if (r.alert) {
            $("#live-dot").style.background = "#b22222";
            $("#status-text").textContent = "⚠ ALERT ACTIVE";
            $("#status-text").style.color = "#b22222";
        } else {
            $("#live-dot").style.background = "#1e7e34";
            $("#status-text").textContent = "All Clear";
            $("#status-text").style.color = "#1e7e34";
        }

        // Component status indicators
        if (r.temperature_c != null && !isNaN(r.temperature_c)) $("#comp-dht").className = "comp-ok"; else $("#comp-dht").className = "comp-fail";
        if (r.smoke_adc != null) $("#comp-mq2").className = "comp-ok"; else $("#comp-mq2").className = "comp-fail";
        $("#comp-flame").className = "comp-ok";
        $("#comp-buzzer").className = "comp-ok";
        $("#comp-led").className = "comp-ok";

        updateCharts(data);
    } catch (e) { console.error(e); }
}

async function fetchBackendStatus() {
    try {
        // Check API health via readings endpoint
        const res = await fetch("/api/readings");
        if (res.ok) {
            const data = await res.json();
            $("#api-health").textContent = "✅ Connected";
            $("#api-health").className = "b-ok";
            $("#db-rows").textContent = data.length + " readings";
        }
        // Alerts count
        const ares = await fetch("/api/alerts");
        if (ares.ok) {
            const alerts = await ares.json();
            $("#alert-count").textContent = alerts.length + " alerts";
        }
        // Gemini AI status
        try {
            const ai = await fetch("/api/ai/suggest");
            if (ai.ok) {
                const result = await ai.json();
                if (result.analysis) {
                    $("#gemini-status").textContent = "✅ Active";
                    $("#gemini-status").className = "b-ok";
                }
            }
        } catch (e) { /* AI may be slow, ignore */ }
    } catch (e) {
        $("#api-health").textContent = "❌ Disconnected";
        $("#api-health").className = "b-fail";
    }
}

async function fetchAlerts() {
    try {
        const res = await fetch("/api/alerts");
        const data = await res.json();
        const tbody = $("#alert-tbody");
        if (!data.length) { tbody.innerHTML = "<tr><td colspan='6'>No alerts yet</td></tr>"; return; }
        tbody.innerHTML = data.map(a =>
            `<tr><td>${escHtml(a.received_at)}</td><td>${escHtml(a.alert_type.replace(/_/g,' ').toUpperCase())}</td>` +
            `<td>${a.temperature_c?.toFixed(1)??'-'}</td><td>${a.humidity_percent?.toFixed(1)??'-'}</td>` +
            `<td>${a.smoke_adc}</td><td>${a.flame_detected?'🔴':'🟢'}</td></tr>`
        ).join("");
    } catch (e) { console.error(e); }
}

// --- AI Assistant ---
const aiPanel = $("#ai-panel");
const aiResult = $("#ai-result");

$("#ai-toggle").addEventListener("click", () => { aiPanel.style.display = aiPanel.style.display === "none" ? "block" : "none"; });
$("#ai-close").addEventListener("click", () => { aiPanel.style.display = "none"; });

$("#ai-analyze").addEventListener("click", async () => {
    aiResult.innerHTML = '<p class="ai-hint">Analyzing with Gemini AI...</p>';
    try {
        const res = await fetch("/api/ai/suggest");
        const data = await res.json();
        aiResult.innerHTML = data.analysis ? `<pre class="ai-output">${escHtml(data.analysis)}</pre>` : '<p class="ai-error">No AI response. Check gemini_config.json.</p>';
    } catch (e) { aiResult.innerHTML = `<p class="ai-error">Error: ${escHtml(e.message)}</p>`; }
});

// --- Polling ---
setInterval(fetchReadings, POLL_MS);
setInterval(fetchBackendStatus, 10000);
setInterval(fetchAlerts, 15000);
fetchReadings();
fetchBackendStatus();
fetchAlerts();
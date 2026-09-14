const POLL_MS = 3000;
const $ = (s) => document.querySelector(s);

// --- Charts (small) ---
const chartOpts = { responsive: true, animation: false, scales: { y: { beginAtZero: true } } };
const chartTempHum = new Chart($("#chart-temp-hum"), {
    type: "line", data: { labels: [], datasets: [
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
function updateCharts(data) {
    if (!data.length) return;
    const r = data[0];
    labelsBuf.unshift(new Date(r.received_at).toLocaleTimeString());
    tempBuf.unshift(r.temperature_c ?? null); humBuf.unshift(r.humidity_percent ?? null); smokeBuf.unshift(r.smoke_adc ?? null);
    if (labelsBuf.length > 20) { labelsBuf.pop(); tempBuf.pop(); humBuf.pop(); smokeBuf.pop(); }
    chartTempHum.data.labels = labelsBuf; chartTempHum.data.datasets[0].data = tempBuf; chartTempHum.data.datasets[1].data = humBuf; chartTempHum.update();
    chartSmoke.data.labels = labelsBuf; chartSmoke.data.datasets[0].data = smokeBuf; chartSmoke.update();
}

function escHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

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
        const cls = (s) => s === "ALERT" ? "status-alert" : s === "OK" ? "status-ok" : "status-watch";
        const txt = (s) => s === "ALERT" ? "⚠ ALERT" : s === "OK" ? "OK" : s === "LOW" ? "LOW" : "—";
        $("#st-temp").className = cls(r.temperature_c != null && r.temperature_c > 45 ? "ALERT" : "OK"); $("#st-temp").textContent = txt("OK");
        $("#st-hum").className = cls(r.humidity_percent != null && r.humidity_percent < 20 ? "LOW" : "OK"); $("#st-hum").textContent = txt(r.humidity_percent != null && r.humidity_percent < 20 ? "LOW" : "OK");
        $("#st-smoke").className = cls(r.smoke_adc != null && r.smoke_adc > 400 ? "ALERT" : "OK"); $("#st-smoke").textContent = txt(r.smoke_adc != null && r.smoke_adc > 400 ? "ALERT" : "OK");
        $("#st-heat").className = cls(r.heat_index_c != null && r.heat_index_c > 52 ? "ALERT" : "OK"); $("#st-heat").textContent = txt(r.heat_index_c != null && r.heat_index_c > 52 ? "ALERT" : "OK");
        $("#st-flame").className = cls(r.flame_detected ? "ALERT" : "OK"); $("#st-flame").textContent = txt(r.flame_detected ? "ALERT" : "OK");
        $("#st-rssi").className = cls(r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "WATCH" : "OK"); $("#st-rssi").textContent = txt(r.wifi_rssi_db != null && r.wifi_rssi_db < -70 ? "WEAK" : "OK");
        if (r.alert) { $("#live-dot").style.background = "#b22222"; $("#status-text").textContent = "⚠ ALERT"; $("#status-text").style.color = "#b22222"; }
        else { $("#live-dot").style.background = "#1e7e34"; $("#status-text").textContent = "All Clear"; $("#status-text").style.color = "#1e7e34"; }
        updateCharts(data);
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
    } catch (e) { console.error(e); }
}

// --- AI Assistant ---
const aiPanel = $("#ai-panel"); const aiResult = $("#ai-result");
$("#ai-toggle").addEventListener("click", () => { aiPanel.style.display = aiPanel.style.display === "none" ? "block" : "none"; });
$("#ai-close").addEventListener("click", () => { aiPanel.style.display = "none"; });
$("#ai-analyze").addEventListener("click", async () => {
    aiResult.innerHTML = '<p class="ai-hint">Analyzing...</p>';
    try {
        const res = await fetch("/api/ai/suggest");
        const data = await res.json();
        aiResult.innerHTML = data.analysis ? `<pre class="ai-output">${escHtml(data.analysis)}</pre>` : '<p class="ai-error">No AI response.</p>';
    } catch (e) { aiResult.innerHTML = `<p class="ai-error">Error: ${escHtml(e.message)}</p>`; }
});

// --- Polling ---
setInterval(fetchReadings, POLL_MS);
setInterval(fetchAlerts, 15000);
fetchReadings(); fetchAlerts();
const POLL_MS = 3000;
const $ = (s) => document.querySelector(s);

lucide.createIcons();

const terminal = document.getElementById('serial-output');
function getTime() {
    const now = new Date();
    return `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
}

function addLog(msg, type="info") {
    if (!terminal) return;
    const div = document.createElement('div');
    let textColor = "text-slate-300/80";
    if(type === "data") textColor = "text-blue-300/80";
    if(type === "warn") textColor = "text-amber-400/90";
    if(type === "alert") textColor = "text-red-400/90";
    
    div.className = `${textColor} flex gap-4 opacity-0 transition-opacity duration-300`;
    div.innerHTML = `<span class="w-24 shrink-0 opacity-50">${getTime()}</span><span>${msg}</span>`;
    
    terminal.appendChild(div);
    requestAnimationFrame(() => { div.classList.remove('opacity-0'); });

    terminal.scrollTop = terminal.scrollHeight;
    if(terminal.children.length > 40) {
        terminal.removeChild(terminal.firstChild);
    }
}

// Chart Setup
const ctx = document.getElementById('tempChart');
let tempChart = null;
let tempData = [];
let tempLabels = [];
const MAX_DATA_POINTS = 30;

if (ctx) {
    const cctx = ctx.getContext('2d');
    const gradient = cctx.createLinearGradient(0, 0, 0, 150);
    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.4)');
    gradient.addColorStop(1, 'rgba(249, 115, 22, 0.0)');

    tempLabels = Array(MAX_DATA_POINTS).fill('');
    tempData = Array(MAX_DATA_POINTS).fill(null);

    tempChart = new Chart(cctx, {
        type: 'line',
        data: {
            labels: tempLabels,
            datasets: [{
                label: 'Temperature °C',
                data: tempData,
                borderColor: '#f97316', 
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 0,
                pointHitRadius: 10,
                fill: true,
                tension: 0.4 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 }, 
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: true, min: 10, max: 50, grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false }, ticks: { color: '#94a3b8', maxTicksLimit: 5, font: { family: 'Inter', size: 10 } } }
            }
        }
    });
}

function updateUI(r) {
    const elTemp = $("#val-temp-current");
    const elHum = $("#val-hum");
    const elSmoke = $("#val-smoke");
    const elWifi = $("#val-wifi");
    
    const barHum = $("#bar-hum");
    const barSmoke = $("#bar-smoke");
    const barWifi = $("#bar-wifi");

    if (r.temperature_c != null) {
        if (elTemp) elTemp.textContent = r.temperature_c.toFixed(1);
        if (tempChart) {
            tempData.push(r.temperature_c);
            tempData.shift();
            tempChart.update();
        }
    }
    
    if (r.humidity_percent != null && elHum) {
        elHum.textContent = r.humidity_percent.toFixed(1);
        if (barHum) barHum.style.width = Math.min(100, Math.max(0, r.humidity_percent)) + '%';
    }
    
    if (r.smoke_adc != null && elSmoke) {
        elSmoke.textContent = r.smoke_adc;
        if (barSmoke) {
            let pSmoke = (r.smoke_adc / 1024) * 100;
            barSmoke.style.width = Math.min(100, Math.max(0, pSmoke)) + '%';
            barSmoke.style.backgroundColor = r.smoke_adc > 400 ? 'var(--accent-red)' : (r.smoke_adc > 250 ? 'var(--accent-amber)' : 'var(--text-muted)');
        }
    }

    if (r.wifi_rssi_db != null && elWifi) {
        elWifi.textContent = r.wifi_rssi_db;
        if (barWifi) {
            let pWifi = 100 - ((Math.abs(r.wifi_rssi_db) - 30) / 70) * 100;
            barWifi.style.width = Math.min(100, Math.max(0, pWifi)) + '%';
        }
    }

    const flameDot = $("#val-flame-dot");
    const flameText = $("#val-flame-text");
    const flameBar = $("#bar-flame");
    
    if (flameDot && flameText && flameBar) {
        if (r.flame_detected) {
            flameDot.className = "w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]";
            flameText.className = "text-2xl font-medium tracking-tight text-red-400";
            flameText.textContent = "DETECTED";
            flameBar.className = "metric-fill bg-red-500";
        } else {
            flameDot.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]";
            flameText.className = "text-2xl font-medium tracking-tight text-emerald-400";
            flameText.textContent = "NORMAL";
            flameBar.className = "metric-fill bg-emerald-500";
        }
    }

    // Console logs
    const isAlert = r.alert === 1;
    if (isAlert) {
        addLog(`[ALERT] High risk anomaly detected!`, 'alert');
    } else {
        if (Math.random() < 0.3) {
            addLog(`Telemetry sync: T=${r.temperature_c ?? '?'} H=${r.humidity_percent ?? '?'} S=${r.smoke_adc ?? '?'}`, 'data');
        }
    }
}

async function fetchReadings() {
    try {
        const res = await fetch("/api/readings");
        const data = await res.json();
        if (!data.length) return;
        updateUI(data[0]);
    } catch (e) { console.error("Fetch error:", e); }
}

addLog("Forest Guard System Initialized", "info");
setInterval(fetchReadings, POLL_MS);
fetchReadings();

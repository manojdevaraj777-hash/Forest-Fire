const POLL_MS = 400; // Ultra-Fast 400ms polling for instant live sensor detection
const $ = (s) => document.querySelector(s);

if (window.lucide) {
    lucide.createIcons();
}

const terminal = document.getElementById('serial-output');
function getTime() {
    const now = new Date();
    return `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
}

function addLog(msg, type="info") {
    if (!terminal) return;
    const div = document.createElement('div');
    let textColor = "text-emerald-300";
    if(type === "data") textColor = "text-cyan-300";
    if(type === "warn") textColor = "text-amber-300 font-semibold";
    if(type === "alert") textColor = "text-rose-400 font-black drop-shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse";
    
    div.className = `${textColor} flex items-center gap-2.5 font-mono text-xs sm:text-sm opacity-0 transition-opacity duration-200 py-0.5`;
    div.innerHTML = `<span class="w-20 shrink-0 text-emerald-400 font-bold">${getTime()}</span><span class="font-medium">${msg}</span>`;
    
    terminal.appendChild(div);
    requestAnimationFrame(() => { div.classList.remove('opacity-0'); });

    terminal.scrollTop = terminal.scrollHeight;
    if(terminal.children.length > 50) {
        terminal.removeChild(terminal.firstChild);
    }
}

// Chart Data Buffers (30 samples rolling window) - Only physical sensors: Temp, Smoke, Flame
const MAX_DATA_POINTS = 30;
let tempLabels = Array(MAX_DATA_POINTS).fill('');
let tempData = Array(MAX_DATA_POINTS).fill(null);
let flameData = Array(MAX_DATA_POINTS).fill(null);
let smokeData = Array(MAX_DATA_POINTS).fill(null);

let activeTrendsFilter = 'all';

// Setup Unified Multi-Sensor Line Chart for Trends Tab (Continuous Analog Telemetry)
const bctx = document.getElementById('bigTempChart');
let bigTempChart = null;

if (bctx) {
    const bigCtx = bctx.getContext('2d');
    
    // Glowing gradient fills
    const tempGrad = bigCtx.createLinearGradient(0, 0, 0, 360);
    tempGrad.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
    tempGrad.addColorStop(1, 'rgba(245, 158, 11, 0.01)');

    const smokeGrad = bigCtx.createLinearGradient(0, 0, 0, 360);
    smokeGrad.addColorStop(0, 'rgba(192, 132, 252, 0.40)');
    smokeGrad.addColorStop(1, 'rgba(192, 132, 252, 0.01)');

    const flameGrad = bigCtx.createLinearGradient(0, 0, 0, 360);
    flameGrad.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
    flameGrad.addColorStop(1, 'rgba(244, 63, 94, 0.01)');

    bigTempChart = new Chart(bigCtx, {
        type: 'line',
        data: {
            labels: tempLabels,
            datasets: [
                {
                    label: 'Temperature (°C)',
                    data: tempData,
                    borderColor: '#f59e0b', 
                    backgroundColor: tempGrad,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#fbbf24',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    yAxisID: 'y'
                },
                {
                    label: 'Smoke MQ-2 (ADC)',
                    data: smokeData,
                    borderColor: '#c084fc', 
                    backgroundColor: smokeGrad,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#c084fc',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    yAxisID: 'y1'
                },
                {
                    label: 'Flame Degree (° Intensity)',
                    data: flameData,
                    borderColor: '#f43f5e', 
                    backgroundColor: flameGrad,
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.15,
                    pointRadius: 2.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#f43f5e',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 1.5,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: { 
                legend: { 
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#e2e8f0',
                        font: { size: 11, weight: 'bold' },
                        usePointStyle: true,
                        boxWidth: 8
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(8, 20, 14, 0.96)',
                    titleColor: '#34d399',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            if (context.datasetIndex === 2) {
                                return `Flame Degree: ${context.parsed.y}° (${context.parsed.y > 0 ? 'CRITICAL FIRE DETECTED!' : 'Normal / Safe'})`;
                            }
                            return `${context.dataset.label}: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                x: { 
                    display: true,
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    ticks: { color: '#e2e8f0', font: { size: 11, weight: '600' } }
                },
                y: { 
                    type: 'linear',
                    display: true, 
                    position: 'left',
                    min: 0, 
                    max: 100, 
                    grid: { color: 'rgba(255, 255, 255, 0.12)' }, 
                    ticks: { color: '#fbbf24', font: { size: 11, weight: 'bold' } },
                    title: {
                        display: true,
                        text: 'Temperature (°C) / Flame Degree (0°-100°)',
                        color: '#fbbf24',
                        font: { weight: 'bold', size: 11 }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true, 
                    position: 'right',
                    min: 0, 
                    max: 1024, 
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#c084fc', font: { size: 11, weight: 'bold' } },
                    title: {
                        display: true,
                        text: 'Smoke Density (0-1024 ADC)',
                        color: '#c084fc',
                        font: { weight: 'bold', size: 11 }
                    }
                }
            }
        }
    });
}

// Interactive Filter function for Trends tab (Temperature, Smoke & Flame Degree)
window.setTrendsFilter = function(filterMode) {
    if (!bigTempChart) return;
    activeTrendsFilter = filterMode;

    ['all', 'temp', 'smoke', 'flame'].forEach(k => {
        const btn = $(`#trend-filter-${k}`);
        if (btn) {
            if (k === filterMode) {
                btn.classList.add('active');
                btn.classList.remove('text-slate-300');
            } else {
                btn.classList.remove('active');
                btn.classList.add('text-slate-300');
            }
        }
    });

    if (filterMode === 'all') {
        bigTempChart.data.datasets.forEach(ds => ds.hidden = false);
    } else if (filterMode === 'temp') {
        bigTempChart.data.datasets.forEach((ds, i) => ds.hidden = (i !== 0));
    } else if (filterMode === 'smoke') {
        bigTempChart.data.datasets.forEach((ds, i) => ds.hidden = (i !== 1));
    } else if (filterMode === 'flame') {
        bigTempChart.data.datasets.forEach((ds, i) => ds.hidden = (i !== 2));
    }
    bigTempChart.update();
};

function updateTrendStats() {
    const validTemps = tempData.filter(v => v != null);
    const validFlames = flameData.filter(v => v != null);
    const validSmokes = smokeData.filter(v => v != null);

    const elPeakTemp = $("#trend-peak-temp");
    const elFlame = $("#trend-cur-flame");
    const elAvgSmoke = $("#trend-avg-smoke");

    if (elPeakTemp && validTemps.length) {
        elPeakTemp.textContent = Math.max(...validTemps).toFixed(1);
    }
    if (elFlame && validFlames.length) {
        const latestFlame = validFlames[validFlames.length - 1];
        elFlame.textContent = latestFlame > 0 ? "ALERT" : "NORMAL";
        elFlame.className = latestFlame > 0 
            ? "text-lg sm:text-xl font-black text-rose-400 font-mono drop-shadow animate-pulse" 
            : "text-lg sm:text-xl font-black text-emerald-300 font-mono drop-shadow";
    }
    if (elAvgSmoke && validSmokes.length) {
        const avg = validSmokes.reduce((a, b) => a + b, 0) / validSmokes.length;
        elAvgSmoke.textContent = Math.round(avg);
    }
}

function updateAlertBadge(isAlertActive) {
    const badge = $("#nav-alert-badge");
    const dot = $("#nav-alert-dot");
    if (badge && dot) {
        if (isAlertActive) {
            badge.classList.remove('hidden');
            dot.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
            dot.classList.add('hidden');
        }
    }
}

let isHardwareOnline = false;
let lastLogState = null;

function setOfflineState(reason = "Awaiting NodeMCU connection") {
    if (isHardwareOnline || lastLogState !== "offline") {
        isHardwareOnline = false;
        lastLogState = "offline";
        addLog(`[STANDBY] ${reason}. Waiting for live telemetry packet on /api/reading...`, 'warn');
    }

    // 1. Metric values to "--"
    const elTemp = $("#val-temp-current");
    const elSmoke = $("#val-smoke");
    const elFlameText = $("#val-flame-text");
    const elFlameDot = $("#val-flame-dot");
    const elWifi = $("#val-wifi");
    const iconWifi = $("#icon-wifi");

    if (elTemp) elTemp.textContent = "--";
    if (elSmoke) elSmoke.textContent = "--";
    if (elWifi) elWifi.textContent = "--";
    if (iconWifi) iconWifi.className = "w-3.5 h-3.5 text-slate-400";

    if (elFlameText) {
        elFlameText.className = "text-3xl sm:text-4xl font-black tracking-tight text-slate-400 drop-shadow";
        elFlameText.textContent = "--";
    }
    if (elFlameDot) {
        elFlameDot.className = "w-3.5 h-3.5 rounded-full bg-slate-500";
    }

    // 2. Metric bars to 0%
    const barTemp = $("#bar-temp");
    const barSmoke = $("#bar-smoke");
    const barFlame = $("#bar-flame");
    if (barTemp) barTemp.style.width = "0%";
    if (barSmoke) barSmoke.style.width = "0%";
    if (barFlame) {
        barFlame.style.width = "0%";
        barFlame.className = "metric-fill bg-slate-500";
    }

    // 3. Header badge & pill
    const sysBadge = $("#sys-live-badge");
    const sysContainer = $("#sys-status-container");
    const sysDotPing = $("#sys-status-dot-ping");
    const sysDot = $("#sys-status-dot");
    const sysText = $("#sys-status-text");

    if (sysBadge) {
        sysBadge.className = "text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/30 border border-amber-400/60 text-amber-300 uppercase tracking-wider drop-shadow transition-all";
        sysBadge.textContent = "STANDBY";
    }
    if (sysContainer) {
        sysContainer.className = "hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/70 border border-amber-400/50 shadow transition-all";
    }
    if (sysDotPing) sysDotPing.classList.add("hidden");
    if (sysDot) {
        sysDot.className = "relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,1)]";
    }
    if (sysText) {
        sysText.className = "text-[11px] font-bold text-amber-200 uppercase tracking-wider";
        sysText.textContent = "Awaiting Sensors";
    }

    // 4. Alert Badge off
    updateAlertBadge(false);

    // 5. Trends Tab Link & Stats
    const trendLinkDot = $("#trend-link-dot");
    const trendLinkText = $("#trend-link-text");
    if (trendLinkDot) trendLinkDot.className = "w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]";
    if (trendLinkText) {
        trendLinkText.className = "text-xs sm:text-sm font-black text-amber-200 font-mono drop-shadow";
        trendLinkText.textContent = "STANDBY (Awaiting NodeMCU)";
    }

    const elPeakTemp = $("#trend-peak-temp");
    const elFlame = $("#trend-cur-flame");
    const elAvgSmoke = $("#trend-avg-smoke");
    if (elPeakTemp) elPeakTemp.textContent = "--";
    if (elFlame) {
        elFlame.textContent = "--";
        elFlame.className = "text-lg sm:text-xl font-black text-white font-mono drop-shadow";
    }
    if (elAvgSmoke) elAvgSmoke.textContent = "--";

    // 6. Hardware tab badges
    const hwDot = $("#hw-verified-dot");
    const hwText = $("#hw-verified-text");
    if (hwDot) hwDot.className = "w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,1)]";
    if (hwText) {
        hwText.className = "text-xs font-mono font-bold text-amber-200";
        hwText.textContent = "Hardware Standby (Awaiting Link)";
    }
    const bNode = $("#hw-badge-nodemcu");
    const bDht = $("#hw-badge-dht11");
    const bMq2 = $("#hw-badge-mq2");
    const bFlame = $("#hw-badge-flame");
    if (bNode) {
        bNode.className = "px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/30 text-amber-300 border border-amber-400/50";
        bNode.textContent = "STANDBY";
    }
    if (bDht) {
        bDht.className = "px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-500/30 text-slate-300 border border-slate-400/50";
        bDht.textContent = "STANDBY";
    }
    if (bMq2) {
        bMq2.className = "px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-500/30 text-slate-300 border border-slate-400/50";
        bMq2.textContent = "STANDBY";
    }
    if (bFlame) {
        bFlame.className = "px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-500/30 text-slate-300 border border-slate-400/50";
        bFlame.textContent = "STANDBY";
    }
}

function setOnlineState(r) {
    if (!isHardwareOnline || lastLogState !== "online") {
        isHardwareOnline = true;
        lastLogState = "online";
        addLog(`[LINK ESTABLISHED] NodeMCU online. Receiving live telemetry stream.`, 'data');
    }

    // 1. Header badge & pill
    const sysBadge = $("#sys-live-badge");
    const sysContainer = $("#sys-status-container");
    const sysDotPing = $("#sys-status-dot-ping");
    const sysDot = $("#sys-status-dot");
    const sysText = $("#sys-status-text");

    if (sysBadge) {
        sysBadge.className = "text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/30 border border-emerald-400/60 text-emerald-300 uppercase tracking-wider drop-shadow transition-all";
        sysBadge.textContent = "LIVE";
    }
    if (sysContainer) {
        sysContainer.className = "hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-400/50 shadow transition-all";
    }
    if (sysDotPing) sysDotPing.classList.remove("hidden");
    if (sysDot) {
        sysDot.className = "relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]";
    }
    if (sysText) {
        sysText.className = "text-[11px] font-bold text-emerald-200 uppercase tracking-wider";
        sysText.textContent = "Active Monitoring";
    }

    // 2. Metric values & progress bars
    const elTemp = $("#val-temp-current");
    const elHum = $("#val-hum");
    const elSmoke = $("#val-smoke");
    const elWifi = $("#val-wifi");
    const iconWifi = $("#icon-wifi");

    const barTemp = $("#bar-temp");
    const barSmoke = $("#bar-smoke");

    // Push new telemetry points to rolling window
    if (r.temperature_c != null) {
        if (elTemp) elTemp.textContent = r.temperature_c.toFixed(1);
        if (barTemp) {
            let pTemp = (r.temperature_c / 60) * 100;
            barTemp.style.width = Math.min(100, Math.max(0, pTemp)) + '%';
        }
        tempData.push(r.temperature_c);
        tempData.shift();
    } else {
        tempData.push(null);
        tempData.shift();
    }
    
    if (r.smoke_adc != null) {
        if (elSmoke) elSmoke.textContent = r.smoke_adc;
        smokeData.push(r.smoke_adc);
        smokeData.shift();

        if (barSmoke) {
            let pSmoke = (r.smoke_adc / 1024) * 100;
            barSmoke.style.width = Math.min(100, Math.max(0, pSmoke)) + '%';
            if (r.smoke_adc > 400) {
                barSmoke.className = "metric-fill bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,1)]";
            } else if (r.smoke_adc > 250) {
                barSmoke.className = "metric-fill bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,1)]";
            } else {
                barSmoke.className = "metric-fill bg-gradient-to-r from-purple-400 to-indigo-400 shadow-[0_0_10px_rgba(192,132,252,0.9)]";
            }
        }
    } else {
        smokeData.push(null);
        smokeData.shift();
    }

    // Flame Detection percentage: 0% = Safe/Clear, 100% = Active Flame Alert!
    const flameLevel = r.flame_detected ? 100 : 0;
    flameData.push(flameLevel);
    flameData.shift();

    // Refresh Unified Trends Line Chart (Temperature, Smoke, Flame Degree)
    if (bigTempChart) {
        bigTempChart.data.datasets[0].data = tempData;
        bigTempChart.data.datasets[1].data = smokeData;
        bigTempChart.data.datasets[2].data = flameData;
        bigTempChart.update();
        updateTrendStats();
    }

    // Trends Tab link indicator
    const trendLinkDot = $("#trend-link-dot");
    const trendLinkText = $("#trend-link-text");
    if (trendLinkDot) trendLinkDot.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]";
    if (trendLinkText) {
        trendLinkText.className = "text-xs sm:text-sm font-black text-white font-mono drop-shadow";
        trendLinkText.textContent = "ONLINE (400ms Ultra-Fast Poll)";
    }

    // WiFi signal pill in header
    if (r.wifi_rssi_db != null && elWifi) {
        elWifi.textContent = r.wifi_rssi_db;
        if (iconWifi) iconWifi.className = "w-3.5 h-3.5 text-teal-300";
    }

    // Flame sensor status
    const flameDot = $("#val-flame-dot");
    const flameText = $("#val-flame-text");
    const flameBar = $("#bar-flame");
    
    if (flameDot && flameText && flameBar) {
        if (r.flame_detected) {
            flameDot.className = "w-3.5 h-3.5 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,1)] animate-ping";
            flameText.className = "text-3xl sm:text-4xl font-black tracking-tight text-rose-400 drop-shadow animate-pulse";
            flameText.textContent = "FIRE DETECTED!";
            flameBar.className = "metric-fill bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)]";
            flameBar.style.width = "100%";
        } else {
            flameDot.className = "w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]";
            flameText.className = "text-3xl sm:text-4xl font-black tracking-tight text-emerald-300 drop-shadow";
            flameText.textContent = "NORMAL";
            flameBar.className = "metric-fill bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]";
            flameBar.style.width = "100%";
        }
    }

    // Hardware tab badges
    const hwDot = $("#hw-verified-dot");
    const hwText = $("#hw-verified-text");
    if (hwDot) hwDot.className = "w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,1)]";
    if (hwText) {
        hwText.className = "text-xs font-mono font-bold text-emerald-300";
        hwText.textContent = "4 Hardware Modules Online";
    }
    const bNode = $("#hw-badge-nodemcu");
    const bDht = $("#hw-badge-dht11");
    const bMq2 = $("#hw-badge-mq2");
    const bFlame = $("#hw-badge-flame");
    if (bNode) {
        bNode.className = "px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/50";
        bNode.textContent = "ONLINE";
    }
    if (bDht) {
        bDht.className = "px-1.5 py-0.2 rounded text-[9px] font-bold bg-sky-500/30 text-sky-300 border border-sky-400/50";
        bDht.textContent = "SAMPLING";
    }
    if (bMq2) {
        bMq2.className = "px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/30 text-purple-300 border border-purple-400/50";
        bMq2.textContent = "ANALOG A0";
    }
    if (bFlame) {
        bFlame.className = r.flame_detected 
            ? "px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/30 text-rose-300 border border-rose-400/50 animate-pulse"
            : "px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-400/50";
        bFlame.textContent = r.flame_detected ? "FIRE DETECTED" : "NORMAL";
    }

    // Conditional Alert Badge: Only activates on danger
    const isAlert = r.alert === 1 || r.flame_detected || (r.smoke_adc && r.smoke_adc > 400) || (r.temperature_c && r.temperature_c > 45);
    updateAlertBadge(isAlert);

    // Instant AI Emergency Solution Auto-Generation
    checkAndTriggerImmediateAISolution(r);

    if (isAlert) {
        addLog(`[ALERT] Critical threshold exceeded! Incident logged.`, 'alert');
    } else {
        if (Math.random() < 0.25) {
            addLog(`Telemetry packet synced &bull; Temp: ${r.temperature_c ?? '?'}°C | Smoke: ${r.smoke_adc ?? '?'} ADC | Flame: ${r.flame_detected ? 'ACTIVE' : 'SAFE'}`, 'data');
        }
    }
}

let lastActionPlanGeneratedTime = 0;
let isEmergencyBannerVisible = false;

async function checkAndTriggerImmediateAISolution(r) {
    const isEmergency = Boolean(r.flame_detected || (r.smoke_adc && r.smoke_adc > 400) || (r.temperature_c && r.temperature_c > 45));

    const banner = $("#ai-emergency-banner");
    const threatBadge = $("#ai-threat-badge");
    const solutionTitle = $("#ai-solution-title");
    const actionStepsContainer = $("#ai-action-steps");

    if (!isEmergency) {
        if (banner) banner.classList.add("hidden");
        isEmergencyBannerVisible = false;
        return;
    }

    if (banner) banner.classList.remove("hidden");

    const now = Date.now();
    if (now - lastActionPlanGeneratedTime > 5000 || !isEmergencyBannerVisible) {
        lastActionPlanGeneratedTime = now;
        isEmergencyBannerVisible = true;

        try {
            const res = await fetch("/api/action/suggest");
            const data = await res.json();
            if (data && data.plan) {
                const p = data.plan;
                if (threatBadge) threatBadge.textContent = p.threat_level || "CRITICAL ALERT";
                if (solutionTitle) solutionTitle.textContent = p.solution_title || "Immediate Emergency Protocol";
                
                if (actionStepsContainer && p.actions) {
                    actionStepsContainer.innerHTML = p.actions.slice(0, 4).map(act => `
                        <div class="p-2.5 rounded-lg bg-black/70 border border-rose-500/40 text-rose-100 flex items-start gap-2 shadow">
                            <span class="text-rose-400 font-bold shrink-0 text-sm">&bull;</span>
                            <span class="leading-snug">${act}</span>
                        </div>
                    `).join('');
                }

                // Also update the full Action Plan view
                const actionPlanView = $("#action-plan-content");
                if (actionPlanView) {
                    actionPlanView.innerHTML = `
                        <div class="space-y-4">
                            <div class="p-4 rounded-xl bg-rose-950/70 border border-rose-400/50 shadow-lg">
                                <div class="flex items-center gap-2">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white">${p.threat_level}</span>
                                    <span class="text-xs text-rose-300 font-mono font-bold">${p.status}</span>
                                </div>
                                <h3 class="text-base sm:text-lg font-black text-white mt-1.5">${p.solution_title}</h3>
                                <p class="text-xs text-rose-200/90 mt-1.5 leading-relaxed">${p.explanation}</p>
                            </div>
                            <div class="space-y-2">
                                <h4 class="text-xs font-bold text-amber-300 uppercase tracking-wider">Automated Action Steps:</h4>
                                ${p.actions.map(a => `
                                    <div class="p-2.5 rounded-lg bg-black/60 border border-white/15 text-xs text-slate-100 font-mono shadow">
                                        ${a}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
                if (window.lucide) lucide.createIcons();
            }
        } catch(e) {
            console.error("AI Action Plan Error:", e);
        }
    }
}

function parsePacketTime(isoStr) {
    if (!isoStr) return NaN;
    if (typeof isoStr !== 'string') return new Date(isoStr).getTime();
    if (isoStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoStr)) {
        return new Date(isoStr).getTime();
    }
    return new Date(isoStr + 'Z').getTime();
}

async function fetchReadings() {
    try {
        const res = await fetch("/api/readings");
        const data = await res.json();
        
        if (!data || !data.length) {
            setOfflineState("No sensor telemetry in database");
            return;
        }

        const serverHeader = res.headers.get("X-Server-Time");
        const serverTime = serverHeader ? parsePacketTime(serverHeader) : Date.now();

        const latest = data[0];
        const packetTime = parsePacketTime(latest.received_at);
        const ageSec = (serverTime - packetTime) / 1000;

        // If newest packet is older than 75 seconds or invalid, hardware has disconnected
        if (isNaN(ageSec) || ageSec > 75) {
            const ageDisplay = isNaN(ageSec) ? '?' : Math.max(0, Math.round(ageSec));
            setOfflineState(`Hardware disconnected (Last packet was ${ageDisplay}s ago)`);
        } else {
            setOnlineState(latest);
        }
    } catch (e) { 
        console.error("Fetch error:", e);
        setOfflineState("Backend connection error");
    }
}

addLog("Forest Sentry Telemetry Daemon Active [REST API]", "info");
setInterval(fetchReadings, POLL_MS);
fetchReadings();

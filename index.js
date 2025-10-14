// ==========================
//  CLIENTE WEB (index.js)
// ==========================
const socket = io();
let currentDevice = null;

// ==========================
//  CONEXIÓN CON DISPOSITIVO
// ==========================
function connectDevice() {
  const id = document.getElementById("deviceId").value.trim();
  if (!id) return log("⚠️ Ingrese un ID de dispositivo.");
  currentDevice = id;
  socket.emit("join_device", id);
  socket.emit("connect_device", id);
  log(`🔗 Intentando conectar con ${id}...`);
}

// ==========================
//  RECIBIR DATOS DEL BROKER
// ==========================
socket.on("update_data", ({ deviceId, payload }) => {
  if (!currentDevice || deviceId !== currentDevice) return;
  if (typeof payload === "string") parsePlot(payload);
  else if (payload.msg) parsePlot(payload.msg);
});

// ==========================
//  ENVIAR COMANDOS
// ==========================
function sendData(e) {
  e.preventDefault();
  const v = document.getElementById("inputData").value.trim();
  const id = document.getElementById("deviceId").value.trim();
  if (!v || !id) return;
  socket.emit("send_command", { deviceId: id, command: v });
  log(`📤 Enviado a ${id}: ${v}`);
  document.getElementById("inputData").value = "";
}

// ==========================
//  LOG EN CONSOLA WEB
// ==========================
function log(msg) {
  const logEl = document.getElementById("log");
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

// ==========================
//  GRAFICOS
// ==========================
Chart.defaults.font.family = 'Poppins';
Chart.defaults.font.size = 14;

const chartMag = new Chart(document.getElementById('chartMag'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Magnitud [dB]',
      data: [],
      borderColor: 'blue',
      backgroundColor: 'rgba(0,0,255,0.1)',
      fill: true
    }]
  },
  options: {
    responsive: false,
    scales: {
      x: { type: 'logarithmic', title: { display: true, text: 'Frecuencia [rad/s]', font: { size: 16 } } },
      y: { title: { display: true, text: 'Magnitud [dB]', font: { size: 16 } } }
    }
  }
});

const chartPhase = new Chart(document.getElementById('chartPhase'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Fase [rad]',
      data: [],
      borderColor: 'red',
      backgroundColor: 'rgba(255,0,0,0.1)',
      fill: true
    }]
  },
  options: {
    responsive: false,
    scales: {
      x: { type: 'logarithmic', title: { display: true, text: 'Frecuencia [rad/s]', font: { size: 16 } } },
      y: { title: { display: true, text: 'Fase [rad]', font: { size: 16 } } }
    }
  }
});

const chartNyquist = new Chart(document.getElementById('chartNyquist'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Nyquist',
      data: [],
      borderColor: 'blue',
      fill: false
    }]
  },
  options: {
    responsive: false,
    scales: {
      x: { title: { display: true, text: 'Re', font: { size: 16 } } },
      y: { title: { display: true, text: 'Im', font: { size: 16 } } }
    }
  }
});

let latestMagnitude = NaN;
let latestPhase = NaN;

function parsePlot(msg) {
  const m = msg.match(/^([-+]?[0-9]*\.?[0-9]+);([0-9]*\.?[0-9]+)([AF])$/);
  if (!m) { log("⚠️ Formato inválido: " + msg); return; }
  const val = parseFloat(m[1]), freq = parseFloat(m[2]), type = m[3];

  if (type === "A") {
    chartMag.data.labels.push(freq);
    chartMag.data.datasets[0].data.push(val);
    chartMag.update();
    latestMagnitude = Math.pow(10, val / 20);
    if (!isNaN(latestPhase)) addNyquist(latestMagnitude, latestPhase);
  } else if (type === "F") {
    chartPhase.data.labels.push(freq);
    chartPhase.data.datasets[0].data.push(val);
    chartPhase.update();
    latestPhase = val;
    if (!isNaN(latestMagnitude)) addNyquist(latestMagnitude, latestPhase);
  }
}

function addNyquist(mag, phase) {
  const re = mag * Math.cos(phase);
  const im = mag * Math.sin(phase);
  chartNyquist.data.labels.push('');
  chartNyquist.data.datasets[0].data.push({ x: re, y: im });
  chartNyquist.update();
}

// ==========================
//  DESCARGAR GRAFICOS
// ==========================
function downloadAllCharts() {
  const charts = [
    { chart: chartMag, defaultName: 'magnitud.png' },
    { chart: chartPhase, defaultName: 'fase.png' },
    { chart: chartNyquist, defaultName: 'nyquist.png' }
  ];
  charts.forEach(c => {
    const filename = prompt(`Nombre para guardar ${c.defaultName}`, c.defaultName);
    if (filename) {
      const link = document.createElement('a');
      link.href = c.chart.toBase64Image();
      link.download = filename;
      link.click();
    }
  });
}

// ==================================================
// 🔁 Barrido de Frecuencia Automático
// ==================================================
let sweepRunning = false;
let sweepAbort = false;

async function startSweep() {
  if (sweepRunning) {
    log("⚠️ Barrido ya en ejecución.");
    return;
  }

  const start = parseFloat(document.getElementById("startFreq").value);
  const end = parseFloat(document.getElementById("endFreq").value);
  const step = parseFloat(document.getElementById("stepFreq").value);
  const waitSec = parseFloat(document.getElementById("waitTime").value);
  const id = document.getElementById("deviceId").value.trim();

  if (!id || isNaN(start) || isNaN(end) || isNaN(step) || isNaN(waitSec)) {
    log("⚠️ Complete todos los campos correctamente.");
    return;
  }

  if (end <= start || step <= 0) {
    log("⚠️ Valores inválidos: el límite superior debe ser mayor al inferior y el paso > 0.");
    return;
  }

  sweepRunning = true;
  sweepAbort = false;
  log(`🚀 Iniciando barrido de ${start} Hz a ${end} Hz, paso ${step} Hz, espera ${waitSec}s...`);

  for (let f = start; f <= end; f += step) {
    if (sweepAbort) {
      log("🛑 Barrido detenido por usuario.");
      break;
    }
    const cmd = `S${Math.round(f)}`;
    socket.emit("send_command", { deviceId: id, command: cmd });
    log(`📤 Enviado: ${cmd}`);
    await new Promise(res => setTimeout(res, waitSec * 1000));
  }

  sweepRunning = false;
  log("✅ Barrido completado.");
}

function stopSweep() {
  if (!sweepRunning) {
    log("⚠️ No hay un barrido en ejecución.");
    return;
  }
  sweepAbort = true;
  log("⏹️ Deteniendo barrido...");
}

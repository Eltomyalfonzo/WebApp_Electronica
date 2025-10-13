const express = require("express");
const http = require("http");
const mqtt = require("mqtt");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// === CONFIGURACIÓN MQTT - HiveMQ Cloud ===
const MQTT_HOST = process.env.MQTT_HOST || "79d9b250811241cda17602225df019b9.s1.eu.hivemq.cloud";
const MQTT_PORT = process.env.MQTT_PORT || 8883;
const MQTT_USER = process.env.MQTT_USER || "TU_USUARIO";
const MQTT_PASS = process.env.MQTT_PASS || "TU_PASSWORD";

// Opciones de conexión segura (TLS)
const mqttOptions = {
  protocol: 'mqtts', // Usar MQTT sobre TLS
  host: MQTT_HOST,
  port: MQTT_PORT,
  username: MQTT_USER,
  password: MQTT_PASS,
  rejectUnauthorized: true, // Verificar certificado
  keepalive: 60,
  reconnectPeriod: 5000,
  connectTimeout: 30000
};

console.log(`🔐 Conectando a HiveMQ Cloud: ${MQTT_HOST}:${MQTT_PORT}`);
const mqttClient = mqtt.connect(mqttOptions);

mqttClient.on("connect", () => {
  console.log("✅ Conectado al broker HiveMQ Cloud");
  
  // Suscribirse a todos los dispositivos
  mqttClient.subscribe("dispositivos/+/datos", (err) => {
    if (err) {
      console.error("❌ Error al suscribirse:", err);
    } else {
      console.log("📡 Suscrito a: dispositivos/+/datos");
    }
  });
});

mqttClient.on("error", (err) => {
  console.error("❌ Error MQTT:", err.message);
});

mqttClient.on("offline", () => {
  console.log("⚠️ Broker MQTT offline, reintentando...");
});

mqttClient.on("reconnect", () => {
  console.log("🔄 Reconectando al broker...");
});

mqttClient.on("message", (topic, message) => {
  const msg = message.toString();
  const match = topic.match(/^dispositivos\/(.+)\/datos$/);
  if (!match) return;
  
  const deviceId = match[1];
  console.log(`📩 Datos de ${deviceId}: ${msg}`);
  
  // Enviar a la sala del dispositivo específico
  io.to(deviceId).emit("update_data", { deviceId, payload: msg });
});

// === CONFIGURACIÓN SOCKET.IO ===
io.on("connection", (socket) => {
  console.log("🟢 Nueva conexión desde página web");

  socket.on("join_device", (deviceId) => {
    socket.join(deviceId);
    console.log(`👤 Cliente unido a sala: ${deviceId}`);
  });

  socket.on("connect_device", (deviceId) => {
    console.log(`🌐 Página solicitó conexión con ${deviceId}`);
    if (mqttClient.connected) {
      mqttClient.publish(`dispositivos/${deviceId}/status`, "connected");
    } else {
      console.error("⚠️ MQTT no conectado, no se puede enviar status");
    }
  });

  socket.on("send_command", ({ deviceId, command }) => {
    console.log(`📤 Comando para ${deviceId}: ${command}`);
    if (mqttClient.connected) {
      mqttClient.publish(`dispositivos/${deviceId}/comando`, command);
    } else {
      console.error("⚠️ MQTT no conectado, comando no enviado");
      socket.emit("error", { message: "Broker MQTT desconectado" });
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente web desconectado");
  });
});

// === SERVIDOR WEB ===
app.use(express.static(__dirname));

// Endpoint de health check
app.get("/health", (req, res) => {
  const status = mqttClient.connected ? "healthy" : "unhealthy";
  const statusCode = mqttClient.connected ? 200 : 503;
  res.status(statusCode).json({ 
    status,
    mqtt: mqttClient.connected,
    broker: `${MQTT_HOST}:${MQTT_PORT}`
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Servidor web escuchando en http://localhost:${PORT}`);
  console.log(`🔗 Broker MQTT: ${MQTT_HOST}:${MQTT_PORT}`);
});

// Manejo de señales de cierre
process.on('SIGINT', () => {
  console.log('\n⚠️ Cerrando servidor...');
  mqttClient.end();
  server.close();
  process.exit(0);
});

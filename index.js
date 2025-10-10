const express = require("express");
const http = require("http");
const mqtt = require("mqtt");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// === CONFIGURACIÓN MQTT ===
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost";
const MQTT_PORT = process.env.MQTT_PORT || 1883;
const mqttClient = mqtt.connect(`${MQTT_BROKER}:${MQTT_PORT}`);

mqttClient.on("connect", () => {
  console.log("✅ Conectado al broker MQTT");
  mqttClient.subscribe("dispositivos/+/datos");
});

mqttClient.on("message", (topic, message) => {
  const msg = message.toString();
  const match = topic.match(/^dispositivos\/(.+)\/datos$/);
  if (!match) return;
  const deviceId = match[1];
  io.to(deviceId).emit("update_data", { deviceId, payload: msg });
});

// === CONFIGURACIÓN SOCKET.IO ===
io.on("connection", (socket) => {
  console.log("🟢 Nueva conexión desde página web");

  // Unirse a una "sala" (deviceId)
  socket.on("join_device", (deviceId) => {
    socket.join(deviceId);
    console.log(`Cliente unido a ${deviceId}`);
  });

  // Botón "Conectar" desde la web
  socket.on("connect_device", (deviceId) => {
    console.log(`🌐 Página solicitó conexión con ${deviceId}`);
    mqttClient.publish(`dispositivos/${deviceId}/status`, "connected");
  });

  // Enviar comando al ESP32
  socket.on("send_command", ({ deviceId, command }) => {
    console.log(`📤 Comando para ${deviceId}: ${command}`);
    mqttClient.publish(`dispositivos/${deviceId}/comando`, command);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente web desconectado");
  });
});

// === SERVIDOR WEB ===
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌍 Servidor web escuchando en http://localhost:${PORT}`);
});


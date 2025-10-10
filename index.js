// index.js
const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const mqtt = require("mqtt");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Config via env
// Para local con docker-compose puedes usar: mqtt://mosquitto
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://test.mosquitto.org";
const MQTT_PORT = process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT) : undefined;
const MQTT_OPTS = {};
if (MQTT_PORT) MQTT_OPTS.port = MQTT_PORT;

// Conectarse al broker MQTT
const mqttClient = mqtt.connect(MQTT_BROKER, MQTT_OPTS);

mqttClient.on("connect", () => {
  console.log("✅ Conectado al broker MQTT:", MQTT_BROKER, MQTT_PORT ? `port ${MQTT_PORT}` : "");
  // Suscribirse a todos los topics de datos de dispositivos
  mqttClient.subscribe("dispositivos/+/datos", (err) => {
    if (err) console.error("Error al subscribir:", err);
  });
});

mqttClient.on("error", (err) => {
  console.error("Error MQTT:", err);
});

// Reenviar mensajes MQTT a clientes web mediante Socket.IO
mqttClient.on("message", (topic, message) => {
  let payload = null;
  try {
    payload = JSON.parse(message.toString());
  } catch (e) {
    // si no es JSON, enviar como string
    payload = message.toString();
  }

  // topic: "dispositivos/{deviceId}/datos"
  const parts = topic.split("/");
  const deviceId = parts.length >= 2 ? parts[1] : "unknown";

  console.log(`📡 MQTT recibido -> device=${deviceId} topic=${topic} payload=`, payload);

  // Emitir solo al room del deviceId
  io.to(deviceId).emit("update_data", { deviceId, payload });
});

// Socket.IO: clientes web se unen a rooms con el deviceId y piden enviar comandos
io.on("connection", (socket) => {
  console.log("🌐 Cliente web conectado:", socket.id);

  socket.on("join_device", (deviceId) => {
    socket.join(deviceId);
    console.log(`👤 Cliente ${socket.id} se unió al dispositivo ${deviceId}`);
  });

  // Enviar comando desde web -> publicarlo en MQTT
  socket.on("send_command", ({ deviceId, command }) => {
    if (!deviceId) return;
    const topic = `dispositivos/${deviceId}/comando`;
    const payload = typeof command === "object" ? JSON.stringify(command) : String(command);
    console.log(`➡️ Publicando comando en ${topic}:`, payload);
    mqttClient.publish(topic, payload);
  });

  socket.on("disconnect", () => {
    console.log("Cliente web desconectado:", socket.id);
  });
});

// Servir archivos estáticos (index.html)
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ WebApp corriendo en http://0.0.0.0:${PORT}`);
});

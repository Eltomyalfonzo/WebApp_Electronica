// ===================================
// BACKEND: Node.js + Express + Socket.io + MQTT
// ===================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mqtt = require('mqtt');
const path = require('path');
const fs = require('fs');

// Configuración
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Variables MQTT
const MQTT_HOST = process.env.MQTT_HOST || 'localhost';
const MQTT_PORT = process.env.MQTT_PORT || 1883;
const MQTT_USER = process.env.MQTT_USER || 'admin';
const MQTT_PASS = process.env.MQTT_PASS || 'admin';

let mqttClient;
const deviceSessions = {}; // Rastrear sesiones activas

// ===================================
// CONEXION MQTT
// ===================================
function connectMQTT() {
  const clientId = `nodejs_client_${Date.now()}`;
  
  const options = {
    clientId: clientId,
    username: MQTT_USER,
    password: MQTT_PASS,
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
    rejectUnauthorized: false, // Para certificados autofirmados
    protocol: 'mqtts' // Usar MQTT con TLS para HiveMQ Cloud
  };

  // Usar mqtts:// para HiveMQ Cloud (puerto 8883)
  const connectUrl = `mqtts://${MQTT_HOST}:${MQTT_PORT}`;
  
  mqttClient = mqtt.connect(connectUrl, options);

  mqttClient.on('connect', () => {
    console.log('✅ Conectado a MQTT Broker');
  });

  mqttClient.on('error', (err) => {
    console.error('❌ Error MQTT:', err);
  });

  mqttClient.on('disconnect', () => {
    console.log('⚠️ Desconectado de MQTT');
  });

  mqttClient.on('message', (topic, message) => {
    console.log(`📨 Mensaje recibido en ${topic}: ${message.toString()}`);
    
    // Extraer deviceId del topic (ej: "devices/ESP32_A1/data" -> "ESP32_A1")
    const parts = topic.split('/');
    if (parts.length >= 2) {
      const deviceId = parts[1];
      
      // Emitir a todos los clientes conectados a ese dispositivo
      io.to(deviceId).emit('update_data', {
        deviceId: deviceId,
        payload: message.toString()
      });
    }
  });
}

// ===================================
// SOCKET.IO - EVENTOS
// ===================================
io.on('connection', (socket) => {
  console.log(`👤 Cliente conectado: ${socket.id}`);

  // Unirse a una sala por dispositivo
  socket.on('join_device', (deviceId) => {
    socket.join(deviceId);
    console.log(`✅ Socket ${socket.id} se unió a la sala ${deviceId}`);
    if (!deviceSessions[deviceId]) {
      deviceSessions[deviceId] = [];
    }
    deviceSessions[deviceId].push(socket.id);
  });

  // Conectar dispositivo (suscribirse al topic MQTT)
  socket.on('connect_device', (deviceId) => {
    if (mqttClient && mqttClient.connected) {
      const topic = `dispositivos/${deviceId}/datos`;
      mqttClient.subscribe(topic, (err) => {
        if (err) {
          console.error(`❌ Error subscribiendo a ${topic}:`, err);
          socket.emit('error', `No se pudo suscribir a ${topic}`);
        } else {
          console.log(`📡 Suscrito a: ${topic}`);
          socket.emit('status', `Conectado a ${deviceId}`);
        }
      });
    } else {
      socket.emit('error', 'MQTT no está conectado');
    }
  });

  // Enviar comandos al dispositivo
  socket.on('send_command', ({ deviceId, command }) => {
    if (mqttClient && mqttClient.connected) {
      const topic = `dispositivos/${deviceId}/comando`;
      mqttClient.publish(topic, command, (err) => {
        if (err) {
          console.error(`❌ Error publicando en ${topic}:`, err);
          socket.emit('error', `No se pudo enviar el comando a ${deviceId}`);
        } else {
          console.log(`📤 Comando enviado a ${topic}: ${command}`);
          socket.emit('command_sent', { deviceId, command, status: 'ok' });
        }
      });
    } else {
      socket.emit('error', 'MQTT no está conectado');
    }
  });

  // Desconectar
  socket.on('disconnect', () => {
    console.log(`❌ Cliente desconectado: ${socket.id}`);
    // Limpiar sesiones
    Object.keys(deviceSessions).forEach(deviceId => {
      deviceSessions[deviceId] = deviceSessions[deviceId].filter(id => id !== socket.id);
      if (deviceSessions[deviceId].length === 0) {
        delete deviceSessions[deviceId];
      }
    });
  });
});

// ===================================
// EXPRESS - SERVIR HTML DESDE RAÍZ
// ===================================

// Ruta raíz - Servir index.html desde la raíz del proyecto
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  
  // Verificar si el archivo existe
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('❌ index.html no encontrado');
  }
});

// Servir archivos estáticos (CSS, JS, etc.) desde la raíz
app.use(express.static(__dirname));

// Ruta catch-all - Envía index.html para rutas no encontradas
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('❌ index.html no encontrado');
  }
});

// ===================================
// INICIAR SERVIDOR
// ===================================
const PORT = process.env.PORT || 3000;

connectMQTT();

server.listen(PORT, () => {
  console.log(`🚀 Servidor FRA_Monitor escuchando en puerto ${PORT}`);
  console.log(`📍 Accede a http://localhost:${PORT}`);
});

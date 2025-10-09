const express = require("express");
const path = require("path");

const app = express();

// Servir archivos estáticos (como index.html)
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ WebApp corriendo en http://0.0.0.0:${PORT}`);
});

// Servidor principal: arma la aplicación Express y la pone a escuchar.
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const config = require("./config");
const db = require("./db");
const { HttpError } = require("./utils");
const { requiereSesion, protegerCambios } = require("./middleware");

const app = express();

// Cabeceras de seguridad. La política de contenido solo permite cargar recursos de este mismo sitio.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      // El servidor atiende por http: si se pide pasar a https, el celular (por la IP de la red) no carga nada.
      upgradeInsecureRequests: null
    }
  }
}));
app.disable("x-powered-by");

// Los archivos (fotos, firmas, PDF) llegan en el cuerpo del mensaje, por eso el límite es mayor.
app.use("/api", express.json({ limit: "5mb" }));
app.use("/api", protegerCambios);

const limite = (max, mensaje) => rateLimit({
  windowMs: 15 * 60 * 1000, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: mensaje }
});
// Frena los intentos de adivinar contraseñas o enlaces.
app.use("/api/auth/login", limite(30, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."));
app.use("/api/auth/cliente", limite(60, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo."));
app.use("/api/auth/registro", limite(20, "Demasiados registros desde este equipo. Intenta más tarde."));

// --- API ---
app.use("/api/auth", require("./routes/auth"));
app.use("/api", requiereSesion);                      // todo lo que sigue exige sesión iniciada
app.use("/api/datos", require("./routes/datos"));
app.use("/api/clientes", require("./routes/clientes").router);
app.use("/api/tecnicos", require("./routes/tecnicos"));
app.use("/api/productos", require("./routes/productos"));
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/api/ordenes", require("./routes/ordenes"));
const archivos = require("./routes/archivos");
app.use("/api/evidencias", archivos.evidencias);
app.use("/api/certificados", archivos.certs);
app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

// --- Frontend (carpeta public) ---
app.use(express.static(path.join(__dirname, "..", "public")));

// --- Manejo de errores ---
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.campo ? { campo: err.campo } : {}) });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Los datos enviados no son válidos." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "El archivo o los datos son demasiado grandes." });
  if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ese registro ya existe." });
  console.error(err);
  res.status(500).json({ error: "Ocurrió un error en el servidor. Intenta de nuevo." });
});

async function iniciar() {
  try {
    await db.query("SELECT 1");
  } catch (err) {
    console.error("No se pudo conectar a MySQL: " + err.message);
    console.error("Revisa DB_HOST, DB_USER y DB_PASSWORD en el archivo .env y que MySQL esté encendido.");
    process.exit(1);
  }
  app.listen(config.port, () => {
    console.log("Pest Control funcionando en http://localhost:" + config.port);
  });
}

if (require.main === module) iniciar();
module.exports = app;

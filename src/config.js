// Configuración general: lee las variables del archivo .env
require("dotenv").config({ quiet: true });

// Las fechas y horas se manejan en hora de Colombia (así "hoy" coincide con el del navegador).
process.env.TZ = process.env.TZ || "America/Bogota";

const puerto = Number(process.env.PORT) || 3000;

const config = {
  port: puerto,
  // Dirección pública del sistema: se usa para armar el enlace seguro de los clientes.
  publicUrl: (process.env.PUBLIC_URL || "http://localhost:" + puerto).replace(/\/$/, ""),
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "pestcontrol"
  },
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpires: process.env.JWT_EXPIRES || "8h",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "Pest Control <no-responder@pestcontrol.com>"
  }
};

// Sin frase secreta no se puede firmar las sesiones de forma segura.
if (!config.jwtSecret || config.jwtSecret.length < 16) {
  console.error("Falta JWT_SECRET en el archivo .env (mínimo 16 caracteres). Copia .env.example como .env y ajústalo.");
  process.exit(1);
}

module.exports = config;

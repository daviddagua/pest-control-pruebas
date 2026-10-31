// Crea la base de datos "pestcontrol" y sus 10 tablas leyendo db/schema.sql.
//   npm run setup-db            -> crea lo que falte (no borra nada)
//   npm run setup-db -- --reset -> BORRA la base y la crea de nuevo
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const config = require("../src/config");

(async () => {
  const reset = process.argv.includes("--reset");
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true
  });
  try {
    if (reset) {
      await conn.query("DROP DATABASE IF EXISTS `" + config.db.database + "`");
      console.log("Base de datos anterior eliminada.");
    }
    const sql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
    await conn.query(sql);
    const [tablas] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?", [config.db.database]
    );
    console.log("Listo: la base «" + config.db.database + "» tiene " + tablas[0].n + " tablas.");
  } catch (err) {
    console.error("No se pudo crear la base de datos:", err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();

// Conexión a MySQL con un "pool" (conjunto de conexiones reutilizables).
const mysql = require("mysql2/promise");
const config = require("./config");

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,        // las fechas llegan como texto 'YYYY-MM-DD HH:MM:SS'
  decimalNumbers: true,     // los DECIMAL llegan como número, no como texto
  charset: "utf8mb4"
});

/**
 * Ejecuta una consulta SQL.
 * Los signos ? se reemplazan por los valores del arreglo "params".
 * Esto evita la inyección SQL: nunca se pegan datos del usuario dentro del texto SQL.
 */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Devuelve la primera fila o null. */
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Ejecuta varias operaciones como una sola unidad (transacción):
 * o se guardan todas o no se guarda ninguna.
 */
async function transaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, one, transaction };

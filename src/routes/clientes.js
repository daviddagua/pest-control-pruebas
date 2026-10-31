// Clientes (solo administrador): crear, editar y obtener su enlace seguro.
const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const config = require("../config");
const { soloRol, ROLES } = require("../middleware");
const { TIPOS_CLIENTE } = require("../dominio");
const { texto, entero, bad, conflict, notFound, reCorreo, reDocumento, reTelefono } = require("../utils");

const router = express.Router();
router.use(soloRol(ROLES.ADMIN));

/** Valida los datos de un cliente (los mismos del formulario). Sirve para crear y para editar. */
function leerCliente(b, prefijo = "cliente-") {
  const nombre = texto(b.nombre, "nombre", 100);
  const documento = texto(b.documento, "documento", 15);
  const correo = texto(b.correo, "correo", 100).toLowerCase();
  const direccion = texto(b.direccion, "dirección", 150);
  const telefono = texto(b.telefono, "teléfono", 15, { requerido: false });
  const tipo = b.tipo;
  if (!reDocumento.test(documento)) throw bad("Usa solo números (y guion para el NIT).", prefijo + "documento");
  if (!reCorreo.test(correo)) throw bad("Escribe un correo válido.", prefijo + "correo");
  if (telefono && !reTelefono.test(telefono)) throw bad("El teléfono debe tener entre 7 y 10 números.", prefijo + "telefono");
  if (!TIPOS_CLIENTE.includes(tipo)) throw bad("Selecciona el tipo de cliente.", prefijo + "tipo");
  return { nombre, documento, correo, direccion, telefono, tipo };
}

/** Evita duplicados por documento o correo (HU-01). */
async function revisarDuplicado(c, exceptoId, prefijo) {
  const d = await db.one(
    "SELECT nombre_empresa, documento FROM cliente WHERE (documento = ? OR correo = ?) AND id_cliente <> ? LIMIT 1",
    [c.documento, c.correo, exceptoId || 0]);
  if (d) {
    const porDocumento = d.documento === c.documento;
    throw conflict('Ya está registrado para "' + d.nombre_empresa + '".', prefijo + (porDocumento ? "documento" : "correo"));
  }
}

/** Crea un cliente dentro de una transacción (también lo usa la creación de órdenes). */
async function crearCliente(conn, c) {
  const token = crypto.randomBytes(12).toString("base64url");
  const [r] = await conn.query(
    "INSERT INTO cliente (nombre_empresa, tipo, documento, telefono, correo, direccion, token_acceso) VALUES (?,?,?,?,?,?,?)",
    [c.nombre, c.tipo, c.documento, c.telefono, c.correo, c.direccion, token]);
  return r.insertId;
}

router.post("/", async (req, res) => {
  const c = leerCliente(req.body);
  await revisarDuplicado(c, 0, "cliente-");
  const id = await db.transaction((conn) => crearCliente(conn, c));
  res.status(201).json({ id });
});

router.put("/:id", async (req, res) => {
  const id = entero(req.params.id, "cliente");
  if (!(await db.one("SELECT 1 FROM cliente WHERE id_cliente = ?", [id]))) throw notFound("El cliente no existe.");
  const c = leerCliente(req.body);
  await revisarDuplicado(c, id, "cliente-");
  await db.query(
    "UPDATE cliente SET nombre_empresa=?, tipo=?, documento=?, telefono=?, correo=?, direccion=? WHERE id_cliente=?",
    [c.nombre, c.tipo, c.documento, c.telefono, c.correo, c.direccion, id]);
  res.json({ ok: true });
});

// Enlace seguro para que el cliente entre a su portal sin contraseña.
router.get("/:id/enlace", async (req, res) => {
  const c = await db.one("SELECT token_acceso FROM cliente WHERE id_cliente = ?", [entero(req.params.id, "cliente")]);
  if (!c) throw notFound("El cliente no existe.");
  res.json({ url: config.publicUrl + "/cliente.html?token=" + c.token_acceso });
});

module.exports = { router, leerCliente, revisarDuplicado, crearCliente };

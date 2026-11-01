// Inicio de sesión, registro de técnicos y entrada de clientes con su enlace seguro.
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { iniciarSesion, cerrarSesion, requiereSesion, ROLES } = require("../middleware");
const { texto, bad, conflict, reCorreo, reDocumento, reTelefono, reClave, HttpError } = require("../utils");

const router = express.Router();

// Hash falso para que tardar lo mismo aunque el correo no exista (no revela qué correos están registrados).
const HASH_FALSO = bcrypt.hashSync("clave-que-nadie-usa", 10);

router.post("/login", async (req, res) => {
  const correo = texto(req.body.correo, "correo", 100).toLowerCase();
  const clave = typeof req.body.clave === "string" ? req.body.clave : "";
  if (!clave || clave.length > 72) throw bad("Falta la contraseña.");

  const u = await db.one(
    `SELECT u.id_usuario, u.nombre_completo, u.contrasena, u.estado, r.nombre_rol, t.id_tecnico
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       LEFT JOIN tecnico t ON t.id_usuario = u.id_usuario
      WHERE u.correo = ?`, [correo]);
  const correcta = await bcrypt.compare(clave, u ? u.contrasena : HASH_FALSO);
  if (!u || !correcta) throw new HttpError(401, "El usuario o la contraseña no son correctos.");
  if (u.estado !== "activo") throw new HttpError(403, "Tu cuenta está inactiva.");

  const admin = u.nombre_rol === "Administrador";
  if (!admin && !u.id_tecnico) throw new HttpError(403, "Tu cuenta no tiene un perfil de técnico.");
  iniciarSesion(res, { tipo: "usuario", id_usuario: u.id_usuario }, admin ? "admin" : "tecnico");
  res.json({
    rol: admin ? "admin" : "tecnico",
    rolTexto: admin ? "Administrador" : "Técnico",
    nombre: u.nombre_completo,
    usuarioId: u.id_usuario,
    tecnicoId: u.id_tecnico || null
  });
});

// Los técnicos se registran solos; el administrador puede cambiar su rol después.
router.post("/registro", async (req, res) => {
  const nombre = texto(req.body.nombre, "nombre", 100);
  const correo = texto(req.body.correo, "correo", 100).toLowerCase();
  const documento = texto(req.body.documento, "cédula", 15);
  const telefono = texto(req.body.telefono, "teléfono", 15);
  const clave = typeof req.body.clave === "string" ? req.body.clave : "";
  if (!reCorreo.test(correo)) throw bad("Escribe un correo válido.", "reg-correo");
  if (!reDocumento.test(documento)) throw bad("Usa solo números (y guion para el NIT).", "reg-documento");
  if (!reTelefono.test(telefono)) throw bad("El teléfono debe tener entre 7 y 10 números.", "reg-telefono");
  if (!reClave.test(clave)) throw bad("La contraseña necesita mínimo 6 caracteres, con letras y números.", "reg-clave");

  if (await db.one("SELECT 1 FROM usuario WHERE correo = ?", [correo])) throw conflict("Ya existe una cuenta con este correo.", "reg-correo");
  if (await db.one("SELECT 1 FROM usuario WHERE documento = ?", [documento])) throw conflict("Ya existe una cuenta con esta cédula.", "reg-documento");

  const hash = await bcrypt.hash(clave, 10);
  await db.transaction(async (c) => {
    const [r] = await c.query(
      "INSERT INTO usuario (nombre_completo, documento, correo, contrasena, id_rol) VALUES (?,?,?,?,(SELECT id_rol FROM rol WHERE nombre_rol = 'Técnico'))",
      [nombre, documento, correo, hash]);
    await c.query("INSERT INTO tecnico (id_usuario, nombre, telefono, especialidad) VALUES (?,?,?,'Por definir')", [r.insertId, nombre, telefono]);
  });
  res.status(201).json({ ok: true });
});

// El cliente entra con el enlace seguro (token) que recibe por correo. No tiene contraseña.
router.post("/cliente", async (req, res) => {
  const token = typeof req.body.token === "string" ? req.body.token.trim() : "";
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(token)) throw new HttpError(401, "El enlace no es válido.");
  const c = await db.one("SELECT id_cliente, nombre_empresa FROM cliente WHERE token_acceso = ?", [token]);
  if (!c) throw new HttpError(401, "El enlace no es válido.");
  iniciarSesion(res, { tipo: "cliente", id_cliente: c.id_cliente }, "cliente");
  res.json({ rol: "cliente", rolTexto: "Cliente", nombre: c.nombre_empresa, clienteId: c.id_cliente });
});

router.post("/logout", (req, res) => {
  cerrarSesion(req, res);
  res.json({ ok: true });
});

// Para que la pantalla compruebe si la sesión sigue activa.
router.get("/yo", requiereSesion, (req, res) => {
  const u = req.usuario;
  res.json({
    rol: u.rol === ROLES.ADMIN ? "admin" : u.rol === ROLES.TECNICO ? "tecnico" : "cliente",
    nombre: u.nombre, usuarioId: u.id_usuario, tecnicoId: u.id_tecnico, clienteId: u.id_cliente
  });
});

module.exports = router;

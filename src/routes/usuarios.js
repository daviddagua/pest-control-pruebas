// Usuarios y roles (solo administrador).
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { soloRol, ROLES } = require("../middleware");
const archivos = require("../services/archivos");
const { texto, entero, bad, conflict, notFound, reCorreo, reDocumento, reClave } = require("../utils");

const router = express.Router();
router.use(soloRol(ROLES.ADMIN));

const NOMBRE_ROL = { Administrador: "Administrador", "Técnico": "Técnico" };

/** Si el usuario es técnico y aún no tiene perfil de técnico, se lo crea. */
async function asegurarPerfilTecnico(c, idUsuario, nombre) {
  const [[t]] = await c.query("SELECT 1 AS ok FROM tecnico WHERE id_usuario = ?", [idUsuario]);
  if (!t) await c.query("INSERT INTO tecnico (id_usuario, nombre, especialidad) VALUES (?,?,'Por definir')", [idUsuario, nombre]);
}

/** Evita dejar el sistema sin ningún administrador activo. */
async function quedaOtroAdmin(c, idUsuario) {
  const [[r]] = await c.query(
    `SELECT COUNT(*) AS n FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
      WHERE r.nombre_rol = 'Administrador' AND u.estado = 'activo' AND u.id_usuario <> ?`, [idUsuario]);
  return r.n > 0;
}

router.post("/", async (req, res) => {
  const nombre = texto(req.body.nombre, "nombre", 100);
  const documento = texto(req.body.documento, "documento", 15);
  const correo = texto(req.body.correo, "correo", 100).toLowerCase();
  const clave = typeof req.body.clave === "string" ? req.body.clave : "";
  if (!NOMBRE_ROL[req.body.rol]) throw bad("Selecciona el rol.", "usu-rol");
  if (!reDocumento.test(documento)) throw bad("Usa solo números (y guion para el NIT).", "usu-documento");
  if (!reCorreo.test(correo)) throw bad("Escribe un correo válido.", "usu-correo");
  if (!reClave.test(clave)) throw bad("Mínimo 6 caracteres, con letras y números.", "usu-clave");
  if (await db.one("SELECT 1 FROM usuario WHERE correo = ?", [correo])) throw conflict("Ya existe un usuario con este correo.", "usu-correo");
  if (await db.one("SELECT 1 FROM usuario WHERE documento = ?", [documento])) throw conflict("Ya existe un usuario con esta cédula.", "usu-documento");

  const hash = await bcrypt.hash(clave, 10);
  await db.transaction(async (c) => {
    const [r] = await c.query(
      "INSERT INTO usuario (nombre_completo, documento, correo, contrasena, id_rol) VALUES (?,?,?,?,(SELECT id_rol FROM rol WHERE nombre_rol = ?))",
      [nombre, documento, correo, hash, req.body.rol]);
    if (req.body.rol === "Técnico") await asegurarPerfilTecnico(c, r.insertId, nombre);
  });
  res.status(201).json({ ok: true });
});

router.put("/:id/rol", async (req, res) => {
  const id = entero(req.params.id, "usuario");
  if (!NOMBRE_ROL[req.body.rol]) throw bad("Rol no válido.");
  if (id === req.usuario.id_usuario) throw bad("No puedes cambiar tu propio rol.");
  await db.transaction(async (c) => {
    const [[u]] = await c.query("SELECT nombre_completo, id_rol FROM usuario WHERE id_usuario = ? FOR UPDATE", [id]);
    if (!u) throw notFound("El usuario no existe.");
    if (req.body.rol === "Técnico" && !(await quedaOtroAdmin(c, id))) throw conflict("Debe quedar al menos un administrador activo.");
    await c.query("UPDATE usuario SET id_rol = (SELECT id_rol FROM rol WHERE nombre_rol = ?) WHERE id_usuario = ?", [req.body.rol, id]);
    if (req.body.rol === "Técnico") await asegurarPerfilTecnico(c, id, u.nombre_completo);
  });
  res.json({ ok: true });
});

router.put("/:id/estado", async (req, res) => {
  const id = entero(req.params.id, "usuario");
  const estado = req.body.estado === "Activo" ? "activo" : req.body.estado === "Inactivo" ? "inactivo" : null;
  if (!estado) throw bad("Estado no válido.");
  if (id === req.usuario.id_usuario) throw bad("No puedes inactivar tu propia cuenta.");
  await db.transaction(async (c) => {
    const [[u]] = await c.query(
      "SELECT r.nombre_rol FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = ? FOR UPDATE", [id]);
    if (!u) throw notFound("El usuario no existe.");
    if (estado === "inactivo" && u.nombre_rol === "Administrador" && !(await quedaOtroAdmin(c, id))) {
      throw conflict("Debe quedar al menos un administrador activo.");
    }
    await c.query("UPDATE usuario SET estado = ? WHERE id_usuario = ?", [estado, id]);
  });
  res.json({ ok: true });
});

/** Elimina un usuario. Si ya tiene visitas registradas se pide inactivarlo para no perder el historial. */
router.delete("/:id", async (req, res) => {
  const id = entero(req.params.id, "usuario");
  if (id === req.usuario.id_usuario) throw bad("No puedes eliminar tu propia cuenta.");
  let firma = null;
  await db.transaction(async (c) => {
    const [[u]] = await c.query(
      "SELECT r.nombre_rol FROM usuario u JOIN rol r ON r.id_rol = u.id_rol WHERE u.id_usuario = ? FOR UPDATE", [id]);
    if (!u) throw notFound("El usuario no existe.");
    if (u.nombre_rol === "Administrador" && !(await quedaOtroAdmin(c, id))) {
      throw conflict("Debe quedar al menos un administrador activo.");
    }
    const [[t]] = await c.query("SELECT id_tecnico, firma_ruta FROM tecnico WHERE id_usuario = ? FOR UPDATE", [id]);
    if (t) {
      const [[n]] = await c.query("SELECT COUNT(*) AS n FROM servicio WHERE id_tecnico = ?", [t.id_tecnico]);
      if (n.n > 0) throw conflict("Este técnico ya tiene órdenes registradas. Mejor inactívalo para conservar el historial.");
      firma = t.firma_ruta;
      await c.query("DELETE FROM tecnico WHERE id_tecnico = ?", [t.id_tecnico]);
    }
    await c.query("DELETE FROM usuario WHERE id_usuario = ?", [id]);
  });
  if (firma) archivos.borrar("firmas", firma);
  res.json({ ok: true });
});

module.exports = router;
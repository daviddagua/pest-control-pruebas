// Técnicos: registrar, activar/inactivar y firma. (Administrador, salvo ver la propia firma.)
const express = require("express");
const db = require("../db");
const archivos = require("../services/archivos");
const { soloRol, ROLES } = require("../middleware");
const { texto, entero, bad, notFound, forbidden, reTelefono } = require("../utils");

const router = express.Router();

// La firma se puede ver desde el panel del administrador y desde el del propio técnico.
router.get("/:id/firma", soloRol(ROLES.ADMIN, ROLES.TECNICO), async (req, res) => {
  const id = entero(req.params.id, "técnico");
  if (req.usuario.rol === ROLES.TECNICO && req.usuario.id_tecnico !== id) throw forbidden();
  const t = await db.one("SELECT firma_ruta FROM tecnico WHERE id_tecnico = ?", [id]);
  if (!t || !t.firma_ruta) throw notFound("Este técnico no tiene firma.");
  archivos.enviar(res, "firmas", t.firma_ruta);
});

router.use(soloRol(ROLES.ADMIN));

router.post("/", async (req, res) => {
  const nombre = texto(req.body.nombre, "nombre", 100);
  const especialidad = texto(req.body.especialidad, "especialidad", 80);
  const telefono = texto(req.body.telefono, "teléfono", 15);
  if (!reTelefono.test(telefono)) throw bad("El teléfono debe tener entre 7 y 10 números.", "tec-telefono");
  const r = await db.query("INSERT INTO tecnico (nombre, especialidad, telefono) VALUES (?,?,?)", [nombre, especialidad, telefono]);
  res.status(201).json({ id: r.insertId });
});

router.put("/:id/estado", async (req, res) => {
  const id = entero(req.params.id, "técnico");
  const estado = req.body.estado === "Activo" ? "activo" : req.body.estado === "Inactivo" ? "inactivo" : null;
  if (!estado) throw bad("Estado no válido.");
  const r = await db.query("UPDATE tecnico SET estado = ? WHERE id_tecnico = ?", [estado, id]);
  if (!r.affectedRows) throw notFound("El técnico no existe.");
  res.json({ ok: true });
});

router.put("/:id/firma", async (req, res) => {
  const id = entero(req.params.id, "técnico");
  const t = await db.one("SELECT firma_ruta FROM tecnico WHERE id_tecnico = ?", [id]);
  if (!t) throw notFound("El técnico no existe.");
  const archivo = archivos.guardarImagen(req.body.imagen, "firmas", "la firma");
  await db.query("UPDATE tecnico SET firma_ruta = ? WHERE id_tecnico = ?", [archivo, id]);
  // Los certificados ya emitidos conservan su propia copia de la firma, así que se puede borrar la anterior.
  if (t.firma_ruta) archivos.borrar("firmas", t.firma_ruta);
  res.json({ ok: true });
});

router.delete("/:id/firma", async (req, res) => {
  const id = entero(req.params.id, "técnico");
  const t = await db.one("SELECT firma_ruta FROM tecnico WHERE id_tecnico = ?", [id]);
  if (!t) throw notFound("El técnico no existe.");
  await db.query("UPDATE tecnico SET firma_ruta = NULL WHERE id_tecnico = ?", [id]);
  if (t.firma_ruta) archivos.borrar("firmas", t.firma_ruta);
  res.json({ ok: true });
});

module.exports = router;

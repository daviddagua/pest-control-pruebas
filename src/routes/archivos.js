// Descarga protegida de fotos de evidencia y firmas de certificados, y reenvío de certificados.
const express = require("express");
const db = require("../db");
const archivos = require("../services/archivos");
const certificados = require("../services/certificados");
const { soloRol, ROLES } = require("../middleware");
const { entero, notFound, forbidden, conflict, bad } = require("../utils");

const evidencias = express.Router();
const certs = express.Router();

/** ¿Esta persona puede ver cosas de esta orden? Administrador sí; técnico y cliente solo las suyas. */
function puedeVer(req, s) {
  const u = req.usuario;
  if (u.rol === ROLES.ADMIN) return true;
  if (u.rol === ROLES.TECNICO) return s.id_tecnico === u.id_tecnico;
  return s.id_cliente === u.id_cliente;
}

evidencias.get("/:id", async (req, res) => {
  const f = await db.one(
    `SELECT e.url_imagen, s.id_tecnico, s.id_cliente FROM evidencia_fotografica e
       JOIN servicio s ON s.id_servicio = e.id_servicio WHERE e.id_evidencia = ?`, [entero(req.params.id, "foto")]);
  if (!f) throw notFound("La foto no existe.");
  if (!puedeVer(req, f)) throw forbidden();
  archivos.enviar(res, "evidencias", f.url_imagen);
});

async function firma(req, res, columna) {
  const c = await db.one(
    `SELECT c.${columna} AS archivo, s.id_tecnico, s.id_cliente FROM certificado c
       JOIN servicio s ON s.id_servicio = c.id_servicio WHERE s.numero_ods = ?`, [req.params.ods]);
  if (!c || !c.archivo) throw notFound("No hay firma registrada.");
  if (!puedeVer(req, c)) throw forbidden();
  archivos.enviar(res, "firmas", c.archivo);
}
certs.get("/:ods/firma-cliente", (req, res) => firma(req, res, "firma_cliente_ruta"));
certs.get("/:ods/firma-tecnico", (req, res) => firma(req, res, "firma_tecnico_ruta"));

// Reenviar el certificado por correo (solo funciona si el correo está configurado en .env).
certs.post("/:ods/reenviar", soloRol(ROLES.ADMIN), async (req, res) => {
  const c = await db.one(
    `SELECT c.id_servicio, c.correo_destino, cl.correo AS correo_cliente FROM certificado c
       JOIN servicio s ON s.id_servicio = c.id_servicio JOIN cliente cl ON cl.id_cliente = s.id_cliente
      WHERE s.numero_ods = ?`, [req.params.ods]);
  if (!c) throw notFound("El certificado no existe.");
  if (!certificados.correoConfigurado()) throw conflict("El envío de correos no está configurado en el servidor (ver README, sección Correo).");
  const para = (c.correo_destino || c.correo_cliente).split(",").map((x) => x.trim()).filter(Boolean);
  if (!para.length) throw bad("No hay un correo de destino.");
  const ok = await certificados.enviarCertificado(req.params.ods, para);
  if (!ok) throw conflict("No se pudo enviar el correo. Revisa la configuración SMTP.");
  await db.query("UPDATE certificado SET estado='enviado' WHERE id_servicio = ?", [c.id_servicio]);
  res.json({ correo: para.join(", ") });
});

module.exports = { evidencias, certs };

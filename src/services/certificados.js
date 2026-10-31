// Certificado en PDF y envío por correo (el correo solo funciona si configuraste SMTP en .env).
const fs = require("fs");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const db = require("../db");
const config = require("../config");
const archivos = require("./archivos");
const { aIso } = require("../utils");

const correoConfigurado = () => !!(config.smtp.host && config.smtp.user && config.smtp.pass);

const fmtFecha = (s) => { const [a, m, d] = String(s).slice(0, 10).split("-"); return d + "/" + m + "/" + a; };
const fmtHora = (s) => {
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d) ? "—" : d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", hour12: true });
};
const duracion = (seg) => {
  const s = Math.round(seg || 0);
  if (!s) return "—";
  return (Math.floor(s / 3600) ? Math.floor(s / 3600) + " h " : "") + Math.floor((s % 3600) / 60) + " min";
};
const num = (n) => String(Math.round(Number(n) * 1000) / 1000).replace(".", ",");

/** Reúne todo lo que lleva el certificado de una orden. */
async function cargarCertificado(numero) {
  const s = await db.one(
    `SELECT s.*, c.fecha_emision, c.nombre_firmante, c.documento_firmante, c.firma_cliente_ruta, c.firma_tecnico_ruta,
            c.correo_destino, c.estado AS estado_cert, c.id_certificado,
            cl.nombre_empresa, cl.documento AS cliente_documento, cl.direccion, cl.correo AS cliente_correo,
            t.nombre AS tecnico
       FROM servicio s JOIN certificado c ON c.id_servicio = s.id_servicio
       JOIN cliente cl ON cl.id_cliente = s.id_cliente
       LEFT JOIN tecnico t ON t.id_tecnico = s.id_tecnico
      WHERE s.numero_ods = ?`, [numero]);
  if (!s) return null;
  s.items = await db.query("SELECT nombre, realizado FROM servicio_item WHERE id_servicio = ? ORDER BY posicion", [s.id_servicio]);
  s.productos = await db.query(
    `SELECT p.nombre, sp.* FROM servicio_producto sp JOIN producto p ON p.id_producto = sp.id_producto
      WHERE sp.id_servicio = ? ORDER BY sp.posicion`, [s.id_servicio]);
  s.fotos = await db.query("SELECT url_imagen FROM evidencia_fotografica WHERE id_servicio = ? ORDER BY id_evidencia", [s.id_servicio]);
  return s;
}

/** Dibuja el certificado y devuelve el PDF como Buffer. */
function generarPdf(c) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: "Certificado " + c.numero_ods, Author: "Pest Control" } });
    const partes = [];
    doc.on("data", (d) => partes.push(d));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);

    const AZUL = "#101b3d", GRIS = "#566080", TEXTO = "#1b2440";
    doc.rect(0, 0, doc.page.width, 80).fill(AZUL);
    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text("PEST CONTROL", 50, 26);
    doc.fontSize(11).font("Helvetica").text("Certificado de servicio de control de plagas · " + c.numero_ods, 50, 54);
    doc.y = 100;

    const fila = (k, v) => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(GRIS).text(k + " ", 50, doc.y, { continued: true });
      doc.font("Helvetica").fillColor(TEXTO).text(v || "—");
    };
    const titulo = (t) => { doc.moveDown(0.8); doc.font("Helvetica-Bold").fontSize(13).fillColor(AZUL).text(t); doc.moveDown(0.2); };
    const normal = (t, color = TEXTO) => doc.font("Helvetica").fontSize(10).fillColor(color).text(t);

    fila("Cliente:", c.nombre_empresa + " · NIT/C.C. " + c.cliente_documento);
    fila("Dirección:", c.direccion);
    fila("Área intervenida:", c.area);
    fila("Fecha del servicio:", fmtFecha(c.fecha_emision));
    fila("Inicio / fin / duración:", [c.fecha_ejecucion ? fmtHora(c.fecha_ejecucion) : "—", c.fecha_fin ? fmtHora(c.fecha_fin) : "—", duracion(c.segundos_acumulados)].join("  ·  "));
    if (c.gps_lat !== null) {
      fila("Ubicación al iniciar:", Number(c.gps_lat).toFixed(5) + ", " + Number(c.gps_lon).toFixed(5) + (c.gps_prueba ? " (ubicación de prueba)" : ""));
    }

    titulo("Servicios realizados");
    const hechos = c.items.filter((i) => i.realizado);
    (hechos.length ? hechos : c.items).forEach((i) => normal("• " + i.nombre));

    titulo("Productos aplicados");
    if (!c.productos.length) normal("Sin productos registrados.");
    c.productos.forEach((p) => {
      normal("• " + p.nombre + " — dosis " + num(p.dosis_valor) + " " + p.dosis_unidad + " · cantidad " + num(p.usado_valor) + " " + p.usado_unidad);
      normal("   Lote: " + (p.lote || "—") + " · Zona: " + (p.zona || "—") + (p.especie ? " · Especie: " + p.especie : ""), GRIS);
    });

    if (c.incidencias && c.incidencias.trim()) { titulo("Incidencias"); normal(c.incidencias); }
    if (c.nota_cliente && c.nota_cliente.trim()) { titulo("Recomendaciones"); normal(c.nota_cliente); }

    if (c.fotos.length) {
      titulo("Evidencia fotográfica");
      let x = 50, y = doc.y;
      c.fotos.slice(0, 6).forEach((f, i) => {
        const r = archivos.ruta("evidencias", f.url_imagen);
        if (!r || !fs.existsSync(r)) return;
        if (i > 0 && i % 3 === 0) { x = 50; y += 100; }
        if (y > doc.page.height - 200) { doc.addPage(); y = 60; }
        try { doc.image(r, x, y, { fit: [150, 90] }); } catch (e) { /* imagen dañada: se omite */ }
        x += 165;
      });
      doc.y = y + 100;
    }

    // Firmas: quien recibe y el técnico responsable
    if (doc.y > doc.page.height - 190) doc.addPage();
    const yf = doc.y + 20;
    [[50, c.firma_cliente_ruta, c.nombre_firmante, "Recibe el servicio · Doc. " + c.documento_firmante],
     [310, c.firma_tecnico_ruta, c.tecnico || "—", "Técnico responsable · PEST CONTROL"]].forEach(([x, ruta, nombre, rol]) => {
      const r = ruta ? archivos.ruta("firmas", ruta) : null;
      if (r && fs.existsSync(r)) { try { doc.image(r, x, yf, { fit: [200, 70] }); } catch (e) { /* se omite */ } }
      doc.moveTo(x, yf + 78).lineTo(x + 200, yf + 78).strokeColor("#1b2340").lineWidth(1).stroke();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXTO).text(nombre, x, yf + 84, { width: 200, align: "center" });
      doc.font("Helvetica").fontSize(9).fillColor(GRIS).text(rol, x, yf + 98, { width: 200, align: "center" });
    });
    doc.end();
  });
}

let transporte = null;
function getTransporte() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass }
    });
  }
  return transporte;
}

/** Envía el certificado en PDF. Devuelve true si el correo salió; false si no hay SMTP o falló. */
async function enviarCertificado(numero, correos) {
  if (!correoConfigurado() || !correos.length) return false;
  try {
    const c = await cargarCertificado(numero);
    if (!c) return false;
    const pdf = await generarPdf(c);
    await getTransporte().sendMail({
      from: config.smtp.from,
      to: correos.join(", "),
      subject: "Certificado de servicio " + numero + " - Pest Control",
      text: "Hola " + c.nombre_empresa + ",\n\nAdjuntamos el certificado del servicio " + numero + " realizado en sus instalaciones.\n\nGracias por confiar en Pest Control.",
      attachments: [{ filename: numero + ".pdf", content: pdf }]
    });
    return true;
  } catch (err) {
    console.error("No se pudo enviar el correo:", err.message);
    return false;
  }
}

module.exports = { correoConfigurado, cargarCertificado, generarPdf, enviarCertificado, aIso };

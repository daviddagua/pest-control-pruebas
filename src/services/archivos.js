// Guardado seguro de archivos (fotos, firmas y fichas PDF) en la carpeta storage.
// Los archivos se reciben como "data URL" desde el navegador y se validan por su contenido real,
// no por lo que diga el nombre o el tipo que declare el navegador.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { bad } = require("../utils");

const RAIZ = path.join(__dirname, "..", "..", "storage");
const CARPETAS = ["fichas", "firmas", "evidencias", "certificados"];
CARPETAS.forEach((c) => fs.mkdirSync(path.join(RAIZ, c), { recursive: true }));

const LIMITES = { imagen: 3 * 1024 * 1024, pdf: 2 * 1024 * 1024 };

/** Separa "data:image/png;base64,AAAA" en { mime, buffer }. */
function leerDataUrl(dataUrl, nombre) {
  const m = typeof dataUrl === "string" && dataUrl.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!m) throw bad("El archivo de «" + nombre + "» no es válido.");
  return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") };
}

/** Detecta el tipo real mirando los primeros bytes del archivo. */
function tipoReal(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 5 && b.slice(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

function guardar(carpeta, buffer, extension) {
  const nombre = crypto.randomBytes(16).toString("hex") + "." + extension;
  fs.writeFileSync(path.join(RAIZ, carpeta, nombre), buffer, { flag: "wx" });
  return nombre;
}

/** Guarda una imagen (JPG o PNG). Devuelve el nombre del archivo. */
function guardarImagen(dataUrl, carpeta, nombre) {
  const { buffer } = leerDataUrl(dataUrl, nombre);
  if (buffer.length > LIMITES.imagen) throw bad("La imagen de «" + nombre + "» es demasiado grande (máximo 3 MB).");
  const tipo = tipoReal(buffer);
  if (tipo !== "png" && tipo !== "jpg") throw bad("«" + nombre + "» debe ser una imagen JPG o PNG.");
  return guardar(carpeta, buffer, tipo);
}

/** Guarda un PDF. Devuelve { archivo, tamano }. */
function guardarPdf(dataUrl, carpeta, nombre) {
  const { buffer } = leerDataUrl(dataUrl, nombre);
  if (buffer.length > LIMITES.pdf) throw bad("El PDF pesa más de 2 MB.");
  if (tipoReal(buffer) !== "pdf") throw bad("Solo se permiten archivos PDF.");
  return { archivo: guardar(carpeta, buffer, "pdf"), tamano: buffer.length };
}

/** Ruta completa de un archivo guardado. Solo acepta nombres que este sistema generó. */
function ruta(carpeta, archivo) {
  if (!CARPETAS.includes(carpeta) || typeof archivo !== "string" || !/^[a-f0-9]{32}\.(png|jpg|pdf)$/.test(archivo)) return null;
  return path.join(RAIZ, carpeta, archivo);
}

/** Copia un archivo (por ejemplo, la firma del técnico dentro de un certificado). */
function copiar(carpeta, archivo) {
  const origen = ruta(carpeta, archivo);
  if (!origen || !fs.existsSync(origen)) return null;
  const ext = path.extname(archivo).slice(1);
  return guardar(carpeta, fs.readFileSync(origen), ext);
}

/** Borra un archivo sin lanzar error si ya no existe. */
function borrar(carpeta, archivo) {
  const r = ruta(carpeta, archivo);
  if (r) fs.rm(r, { force: true }, () => {});
}

/** Envía un archivo guardado como respuesta HTTP. */
function enviar(res, carpeta, archivo, { descargar = false, nombre = null } = {}) {
  const r = ruta(carpeta, archivo);
  if (!r || !fs.existsSync(r)) return res.status(404).json({ error: "Archivo no encontrado." });
  const ext = path.extname(archivo).slice(1);
  const tipos = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" };
  res.setHeader("Content-Type", tipos[ext]);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  if (ext === "pdf") res.removeHeader("Content-Security-Policy"); // el visor de PDF del navegador lo necesita
  const seguro = (nombre || "documento.pdf").replace(/[^\w.\- ]+/g, "_");
  res.setHeader("Content-Disposition", (descargar ? "attachment" : "inline") + '; filename="' + seguro + '"');
  res.sendFile(r);
}

module.exports = { RAIZ, guardarImagen, guardarPdf, ruta, copiar, borrar, enviar };

// Funciones de ayuda compartidas.

/** Error con código HTTP. Lo captura el manejador de errores de server.js.
 *  "campo" (opcional) le dice a la pantalla qué casilla marcar en rojo. */
class HttpError extends Error {
  constructor(status, message, campo) {
    super(message);
    this.status = status;
    this.campo = campo;
  }
}

const bad = (msg, campo) => new HttpError(400, msg, campo);
const notFound = (msg) => new HttpError(404, msg || "No encontrado.");
const forbidden = (msg) => new HttpError(403, msg || "No tienes permiso para esto.");
const conflict = (msg, campo) => new HttpError(409, msg, campo);

const reCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const reDocumento = /^[0-9-]{6,15}$/;
const reTelefono = /^\d{7,10}$/;
const reClave = /^(?=.*[A-Za-z])(?=.*\d).{6,72}$/;

/** Texto con largo máximo. Si es obligatorio y viene vacío lanza error. */
function texto(valor, nombre, max, { requerido = true } = {}) {
  const v = typeof valor === "string" ? valor.trim() : "";
  if (!v) {
    if (requerido) throw bad("Falta el campo «" + nombre + "».");
    return null;
  }
  if (v.length > max) throw bad("«" + nombre + "» no puede pasar de " + max + " caracteres.");
  return v;
}

/** Entero positivo (para ids). */
function entero(valor, nombre) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) throw bad("«" + nombre + "» no es válido.");
  return n;
}

/** Número mayor que cero. */
function positivo(valor, nombre) {
  const n = Number(valor);
  if (valor === "" || valor === null || !Number.isFinite(n) || n <= 0 || n > 1e7) throw bad("«" + nombre + "» debe ser un número mayor a 0.");
  return n;
}

const p2 = (n) => String(n).padStart(2, "0");

/** Fecha de hoy AAAA-MM-DD (hora de Colombia, ver config.js). */
function hoy() {
  const d = new Date();
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

/** Valida 'AAAA-MM-DD' (y que exista de verdad, p. ej. no el 31 de febrero). */
function fecha(valor, nombre) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw bad("«" + nombre + "» no es una fecha válida.");
  const [a, m, d] = valor.split("-").map(Number);
  const f = new Date(a, m - 1, d);
  if (f.getFullYear() !== a || f.getMonth() !== m - 1 || f.getDate() !== d) throw bad("«" + nombre + "» no es una fecha válida.");
  return valor;
}

/** Valida 'HH:MM'. */
function hora(valor, nombre) {
  if (typeof valor !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(valor)) throw bad("«" + nombre + "» no es una hora válida.");
  return valor;
}

/** Fecha y hora de MySQL ('2026-10-28 10:30:00') -> {fecha, hora}. */
function partirFechaHora(s) {
  return { fecha: String(s).slice(0, 10), hora: String(s).slice(11, 16) };
}

/** Texto de MySQL (hora local) -> ISO con zona, que el navegador entiende. */
function aIso(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d) ? null : d.toISOString();
}

module.exports = {
  HttpError, bad, notFound, forbidden, conflict,
  reCorreo, reDocumento, reTelefono, reClave,
  texto, entero, positivo, hoy, fecha, hora, partirFechaHora, aIso
};

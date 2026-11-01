// Seguridad: sesión por cookie, roles y protección contra peticiones falsas (CSRF).
const jwt = require("jsonwebtoken");
const config = require("./config");
const db = require("./db");

const ROLES = { ADMIN: "Administrador", TECNICO: "Tecnico", CLIENTE: "Cliente" };

// Una cookie por tipo de sesión: así el administrador y el técnico pueden estar abiertos
// a la vez en pestañas distintas del mismo navegador sin que uno cierre al otro.
const SESIONES = ["admin", "tecnico", "cliente"];
const COOKIE = (sesion) => "pc_sesion_" + sesion;

/** Qué sesión pide la pestaña (encabezado X-Sesion, lo pone el navegador según la pantalla). */
function sesionPedida(req) {
  const s = req.headers["x-sesion"];
  return SESIONES.includes(s) ? s : null;
}

/** Lee una cookie del encabezado (sin librerías extra). */
function leerCookie(req, nombre) {
  const crudo = req.headers.cookie || "";
  for (const parte of crudo.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

/** Guarda la sesión en una cookie HttpOnly: el JavaScript de la página no puede leerla ni robarla. */
function iniciarSesion(res, payload, sesion) {
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpires });
  const segundos = Math.round((jwt.decode(token).exp - jwt.decode(token).iat));
  res.cookie(COOKIE(sesion), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: config.publicUrl.startsWith("https://"),
    maxAge: segundos * 1000,
    path: "/"
  });
}

/** Cierra la sesión de esta pestaña (o todas si no indica cuál). */
function cerrarSesion(req, res) {
  const pedida = sesionPedida(req);
  for (const s of pedida ? [pedida] : SESIONES) res.clearCookie(COOKIE(s), { path: "/" });
  res.clearCookie("pc_sesion", { path: "/" });   // cookie única de versiones anteriores
}

/**
 * Token de la sesión que corresponde a esta petición. Las peticiones de la página traen X-Sesion;
 * las que hace el navegador solo (una <img> de evidencia, un PDF) no, y usan la primera sesión válida.
 */
function leerToken(req) {
  const pedida = sesionPedida(req);
  for (const s of pedida ? [pedida] : SESIONES) {
    const token = leerCookie(req, COOKIE(s));
    if (!token) continue;
    try { return { payload: jwt.verify(token, config.jwtSecret) }; } catch (e) { if (pedida) return { vencida: true }; }
  }
  return null;
}

/**
 * Exige sesión iniciada y deja en req.usuario: { rol, nombre, id_usuario, id_tecnico, id_cliente }.
 * El rol y el estado se consultan en la base en cada petición: si el administrador inactiva
 * a alguien o le cambia el rol, el cambio se aplica de inmediato.
 */
async function requiereSesion(req, res, next) {
  const leido = leerToken(req);
  if (!leido) return res.status(401).json({ error: "Debes iniciar sesión." });
  if (leido.vencida) return res.status(401).json({ error: "La sesión venció. Inicia sesión de nuevo." });
  const p = leido.payload;

  if (p.tipo === "cliente") {
    const c = await db.one("SELECT id_cliente, nombre_empresa FROM cliente WHERE id_cliente = ?", [p.id_cliente]);
    if (!c) return res.status(401).json({ error: "La sesión ya no es válida." });
    req.usuario = { rol: ROLES.CLIENTE, nombre: c.nombre_empresa, id_usuario: null, id_tecnico: null, id_cliente: c.id_cliente };
    return next();
  }

  const u = await db.one(
    `SELECT u.id_usuario, u.nombre_completo, u.estado, r.nombre_rol, t.id_tecnico
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       LEFT JOIN tecnico t ON t.id_usuario = u.id_usuario
      WHERE u.id_usuario = ?`, [p.id_usuario]);
  if (!u || u.estado !== "activo") return res.status(401).json({ error: "La sesión ya no es válida." });
  req.usuario = {
    rol: u.nombre_rol === "Administrador" ? ROLES.ADMIN : ROLES.TECNICO,
    nombre: u.nombre_completo,
    id_usuario: u.id_usuario,
    id_tecnico: u.id_tecnico || null,
    id_cliente: null
  };
  if (req.usuario.rol === ROLES.TECNICO && !req.usuario.id_tecnico) {
    return res.status(403).json({ error: "Tu cuenta no tiene un perfil de técnico." });
  }
  next();
}

/** Exige que el rol sea uno de los permitidos. */
function soloRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tienes permiso para hacer esto." });
    }
    next();
  };
}

/**
 * Protección CSRF: toda petición que cambia datos debe traer este encabezado.
 * Una página de otro sitio no puede ponerlo, así que no puede actuar en nombre del usuario.
 */
function protegerCambios(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers["x-requested-with"] !== "pestcontrol") {
    return res.status(403).json({ error: "Petición no permitida." });
  }
  next();
}

module.exports = { ROLES, iniciarSesion, cerrarSesion, requiereSesion, soloRol, protegerCambios };

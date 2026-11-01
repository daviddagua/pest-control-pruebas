// Órdenes de servicio (ODS): creación y edición (administrador), asignación y la visita del técnico.
const express = require("express");
const db = require("../db");
const archivos = require("../services/archivos");
const certificados = require("../services/certificados");
const { soloRol, ROLES } = require("../middleware");
const { leerCliente, revisarDuplicado, crearCliente } = require("./clientes");
const { SERVICIOS, UNIDADES, cantidadEnInventario } = require("../dominio");
const U = require("../utils");
const { bad, conflict, notFound, forbidden, texto, entero, positivo } = U;

const router = express.Router();
const ADMIN = soloRol(ROLES.ADMIN);
const TECNICO = soloRol(ROLES.TECNICO);
const MAX_FOTOS = 12;

const num = (n) => String(Math.round(Number(n) * 1000) / 1000).replace(".", ",");
const mysqlFecha = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
};
const comoFecha = (s) => new Date(String(s).replace(" ", "T"));
const fechaLarga = (f) => {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const [a, m, d] = f.split("-");
  return Number(d) + " " + MESES[Number(m) - 1] + " " + a;
};
const hora12 = (h) => {
  const [hh, mm] = h.split(":").map(Number);
  return ((hh + 11) % 12) + 1 + ":" + String(mm).padStart(2, "0") + " " + (hh >= 12 ? "p. m." : "a. m.");
};

/* ---------- utilidades ---------- */

/** Busca la orden por su número (ODS-2452). Con conn la bloquea para modificarla. */
async function buscarOrden(numero, conn = null) {
  if (typeof numero !== "string" || !/^ODS-\d{1,8}$/.test(numero)) throw notFound("La orden no existe.");
  let s;
  if (conn) [[s]] = await conn.query("SELECT * FROM servicio WHERE numero_ods = ? FOR UPDATE", [numero]);
  else s = await db.one("SELECT * FROM servicio WHERE numero_ods = ?", [numero]);
  if (!s) throw notFound("La orden no existe.");
  return s;
}

/** El técnico solo puede tocar sus propias órdenes. */
function exigirDueno(req, s) {
  if (s.id_tecnico !== req.usuario.id_tecnico) throw forbidden("Esta visita no está asignada a ti.");
}

function exigirEstado(s, ...estados) {
  if (!estados.includes(s.estado)) throw conflict("La orden está en estado «" + s.estado + "» y no permite esta acción.");
}

/** Segundos trabajados hasta ahora (lo acumulado + el tramo en curso). */
function segundosActuales(s, ahora = new Date()) {
  const extra = s.reanudado_en ? Math.max(0, Math.floor((ahora - comoFecha(s.reanudado_en)) / 1000)) : 0;
  return s.segundos_acumulados + extra;
}

async function crearAviso(conn, idCliente, titulo, textoAviso) {
  await conn.query("INSERT INTO aviso (id_cliente, fecha, titulo, texto) VALUES (?,?,?,?)", [idCliente, U.hoy(), titulo, textoAviso]);
}

/* ---------- validaciones de lo que escribe el administrador ---------- */

function leerServicios(lista) {
  if (!Array.isArray(lista) || !lista.length) throw bad("Selecciona al menos un servicio a realizar.", "campo-servicios");
  const limpios = [...new Set(lista)];
  if (limpios.some((s) => !SERVICIOS.includes(s))) throw bad("Hay un servicio que no existe en el catálogo.", "campo-servicios");
  return limpios;
}

/** Valida los productos asignados y calcula cuánto se descontará del inventario. */
async function leerProductos(lista) {
  if (lista === undefined || lista === null) return [];
  if (!Array.isArray(lista) || lista.length > 20) throw bad("La lista de productos no es válida.");
  const vistos = new Set();
  const salida = [];
  for (const [i, p] of lista.entries()) {
    const id = entero(p && p.productoId, "producto");
    if (vistos.has(id)) throw bad("Un producto no puede repetirse en la misma orden.");
    vistos.add(id);
    const prod = await db.one("SELECT nombre, unidad_medida FROM producto WHERE id_producto = ?", [id]);
    if (!prod) throw bad("Uno de los productos no existe.");
    const u = UNIDADES[prod.unidad_medida];
    const dosisValor = positivo(p.dosisValor, "dosis de " + prod.nombre);
    const usadoValor = positivo(p.usadoValor, "cantidad de " + prod.nombre);
    if (!u.dosis.includes(p.dosisUnidad)) throw bad("La unidad de la dosis no es válida para " + prod.nombre + ".");
    if (!u.cantidad.includes(p.usadoUnidad)) throw bad("La unidad de la cantidad no es válida para " + prod.nombre + ".");
    const inventario = cantidadEnInventario(usadoValor, p.usadoUnidad);
    if (inventario <= 0) throw bad("La cantidad de " + prod.nombre + " es demasiado pequeña.");
    salida.push({ id, posicion: i, dosisValor, dosisUnidad: p.dosisUnidad, usadoValor, usadoUnidad: p.usadoUnidad, inventario });
  }
  return salida;
}

async function guardarItems(conn, idServicio, servicios) {
  await conn.query("DELETE FROM servicio_item WHERE id_servicio = ?", [idServicio]);
  await conn.query("INSERT INTO servicio_item (id_servicio, posicion, nombre) VALUES ?", [servicios.map((n, i) => [idServicio, i, n])]);
}

async function guardarProductos(conn, idServicio, productos, previos = {}) {
  await conn.query("DELETE FROM servicio_producto WHERE id_servicio = ?", [idServicio]);
  if (!productos.length) return;
  await conn.query(
    `INSERT INTO servicio_producto (id_servicio, id_producto, posicion, dosis_valor, dosis_unidad, usado_valor,
       usado_unidad, cantidad_utilizada, lote, zona, especie) VALUES ?`,
    [productos.map((p) => {
      const prev = previos[p.id] || {};
      return [idServicio, p.id, p.posicion, p.dosisValor, p.dosisUnidad, p.usadoValor, p.usadoUnidad, p.inventario,
        prev.lote || null, prev.zona || null, prev.especie || null];
    })]);
}

function leerOrden(b) {
  const servicios = leerServicios(b.servicios);
  const area = texto(b.area, "área a intervenir", 150);
  const fecha = U.fecha(b.fecha, "fecha");
  const hora = U.hora(b.hora, "hora");
  const comentarios = texto(b.comentarios, "comentarios", 1000, { requerido: false });
  return { servicios, area, fecha, hora, comentarios };
}

/* ---------- ADMINISTRADOR: crear, editar, asignar, cancelar ---------- */

router.post("/", ADMIN, async (req, res) => {
  const o = leerOrden(req.body);
  if (o.fecha < U.hoy()) throw bad("La fecha no puede ser anterior a hoy.", "ods-fecha");
  const productos = await leerProductos(req.body.productos);

  let clienteNuevo = null;
  let idCliente = null;
  if (req.body.clienteId) {
    idCliente = entero(req.body.clienteId, "cliente");
    if (!(await db.one("SELECT 1 FROM cliente WHERE id_cliente = ?", [idCliente]))) throw bad("El cliente no existe.");
  } else {
    clienteNuevo = leerCliente(req.body.cliente || {}, "c-");
    await revisarDuplicado(clienteNuevo, 0, "c-");
  }

  // El número de ODS es único: si dos personas crean a la vez y chocan, se reintenta con el siguiente.
  for (let intento = 0; intento < 5; intento++) {
    try {
      const numero = await db.transaction(async (c) => {
        if (clienteNuevo) idCliente = await crearCliente(c, clienteNuevo);
        const [[m]] = await c.query("SELECT COALESCE(MAX(CAST(SUBSTRING(numero_ods, 5) AS UNSIGNED)), 2000) AS m FROM servicio");
        const numero = "ODS-" + (m.m + 1);
        const [r] = await c.query(
          "INSERT INTO servicio (numero_ods, id_cliente, fecha_programada, area, estado, observaciones) VALUES (?,?,?,?, 'pendiente', ?)",
          [numero, idCliente, o.fecha + " " + o.hora + ":00", o.area, o.comentarios]);
        await guardarItems(c, r.insertId, o.servicios);
        await guardarProductos(c, r.insertId, productos);
        return numero;
      });
      return res.status(201).json({ numero });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY" && /uq_servicio_ods/.test(err.message)) continue;
      throw err;
    }
  }
  throw conflict("No se pudo generar el número de la orden. Intenta de nuevo.");
});

router.put("/:numero", ADMIN, async (req, res) => {
  const o = leerOrden(req.body);
  const productos = await leerProductos(req.body.productos);
  await db.transaction(async (c) => {
    const s = await buscarOrden(req.params.numero, c);
    exigirEstado(s, "pendiente", "programado", "en_proceso");
    const actual = U.partirFechaHora(s.fecha_programada);
    if ((o.fecha !== actual.fecha || o.hora !== actual.hora) && o.fecha < U.hoy()) throw bad("La fecha no puede ser anterior a hoy.", "ods-fecha");

    await c.query("UPDATE servicio SET fecha_programada=?, area=?, observaciones=? WHERE id_servicio=?",
      [o.fecha + " " + o.hora + ":00", o.area, o.comentarios, s.id_servicio]);

    // Si los servicios no cambiaron se conserva lo que el técnico ya marcó como realizado.
    const [viejos] = await c.query("SELECT nombre FROM servicio_item WHERE id_servicio = ? ORDER BY posicion", [s.id_servicio]);
    if (JSON.stringify(viejos.map((v) => v.nombre)) !== JSON.stringify(o.servicios)) await guardarItems(c, s.id_servicio, o.servicios);

    // Se conservan el lote, la zona y la especie que el técnico ya hubiera registrado.
    const [prev] = await c.query("SELECT id_producto, lote, zona, especie FROM servicio_producto WHERE id_servicio = ?", [s.id_servicio]);
    await guardarProductos(c, s.id_servicio, productos, Object.fromEntries(prev.map((p) => [p.id_producto, p])));
  });
  res.json({ ok: true });
});

router.put("/:numero/asignar", ADMIN, async (req, res) => {
  const idTecnico = entero(req.body.id_tecnico, "técnico");
  const fecha = U.fecha(req.body.fecha, "fecha");
  const hora = U.hora(req.body.hora, "hora");
  if (fecha < U.hoy()) throw bad("No se puede programar una orden en una fecha pasada.");
  await db.transaction(async (c) => {
    const s = await buscarOrden(req.params.numero, c);
    exigirEstado(s, "pendiente", "programado");
    const [[t]] = await c.query("SELECT nombre, estado FROM tecnico WHERE id_tecnico = ?", [idTecnico]);
    if (!t) throw bad("El técnico no existe.");
    if (t.estado !== "activo") throw bad("El técnico está inactivo.");

    const antes = U.partirFechaHora(s.fecha_programada);
    const cambioFecha = antes.fecha !== fecha || antes.hora !== hora;
    await c.query("UPDATE servicio SET id_tecnico=?, fecha_programada=?, estado='programado' WHERE id_servicio=?",
      [idTecnico, fecha + " " + hora + ":00", s.id_servicio]);

    // Si ya tenía técnico y cambió el día u hora, se avisa al cliente en su portal.
    if (s.id_tecnico && cambioFecha) {
      await crearAviso(c, s.id_cliente, "Visita reprogramada",
        "Tu servicio " + s.numero_ods + " quedó para el " + fechaLarga(fecha) + " a las " + hora12(hora) + " con el técnico " + t.nombre + ".");
    }
  });
  res.json({ ok: true });
});

// Cancelar: el administrador cancela órdenes sin iniciar; el técnico cancela su visita indicando el motivo.
router.post("/:numero/cancelar", async (req, res) => {
  const rol = req.usuario.rol;
  if (rol !== ROLES.ADMIN && rol !== ROLES.TECNICO) throw forbidden();
  const motivo = rol === ROLES.TECNICO ? texto(req.body.motivo, "motivo", 300) : null;
  await db.transaction(async (c) => {
    const s = await buscarOrden(req.params.numero, c);
    if (rol === ROLES.ADMIN) {
      exigirEstado(s, "pendiente", "programado");
      await c.query("UPDATE servicio SET estado='cancelado' WHERE id_servicio=?", [s.id_servicio]);
      return;
    }
    exigirDueno(req, s);
    exigirEstado(s, "programado", "en_proceso");
    const incidencias = (s.incidencias ? s.incidencias + "\n" : "") + "Cancelado: " + motivo;
    await c.query(
      "UPDATE servicio SET estado='cancelado', incidencias=?, segundos_acumulados=?, reanudado_en=NULL, pausado=0, fecha_fin=? WHERE id_servicio=?",
      [incidencias.slice(0, 2000), segundosActuales(s), mysqlFecha(new Date()), s.id_servicio]);
  });
  res.json({ ok: true });
});

/* ---------- TÉCNICO: la visita ---------- */

router.post("/:numero/iniciar", TECNICO, async (req, res) => {
  // La ubicación es opcional: si el navegador no la entrega, la visita inicia sin ella.
  const g = req.body.gps || null;
  let lat = null, lon = null, precision = null;
  if (g) {
    lat = Number(g.lat); lon = Number(g.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw bad("La ubicación no es válida.");
    }
    precision = g.precision === null || g.precision === undefined ? null : Math.round(Number(g.precision));
    if (precision !== null && (!Number.isFinite(precision) || precision < 0 || precision > 1e6)) throw bad("La precisión de la ubicación no es válida.");
  }
  await db.transaction(async (c) => {
    const s = await buscarOrden(req.params.numero, c);
    exigirDueno(req, s);
    exigirEstado(s, "programado");
    const ahora = new Date();
    await c.query(
      `UPDATE servicio SET estado='en_proceso', fecha_ejecucion=COALESCE(fecha_ejecucion, ?), reanudado_en=?, pausado=0,
         gps_lat=?, gps_lon=?, gps_precision=?, gps_prueba=? WHERE id_servicio=?`,
      [mysqlFecha(ahora), mysqlFecha(ahora), lat, lon, precision, g && g.prueba ? 1 : 0, s.id_servicio]);
  });
  res.json({ ok: true });
});

router.post("/:numero/pausar", TECNICO, async (req, res) => {
  await db.transaction(async (c) => {
    const s = await buscarOrden(req.params.numero, c);
    exigirDueno(req, s);
    exigirEstado(s, "en_proceso");
    if (s.pausado) throw conflict("El trabajo ya está en pausa.");
    await c.query("UPDATE servicio SET segundos_acumulados=?, reanudado_en=NULL, pausado=1 WHERE id_servicio=?", [segundosActuales(s), s.id_servicio]);
  });
  res.json({ ok: true });
});

router.post("/:numero/reanudar", TECNICO, async (req, res) => {
  await db.transaction(async (c) => {
    const s = await buscarOrden(req.params.numero, c);
    exigirDueno(req, s);
    exigirEstado(s, "en_proceso");
    if (!s.pausado) throw conflict("El trabajo no está en pausa.");
    await c.query("UPDATE servicio SET reanudado_en=?, pausado=0 WHERE id_servicio=?", [mysqlFecha(new Date()), s.id_servicio]);
  });
  res.json({ ok: true });
});

// Anular: borra el tiempo registrado y la visita vuelve a quedar sin iniciar.
router.post("/:numero/anular", TECNICO, async (req, res) => {
  await db.transaction(async (c) => {
    const s = await buscarOrden(req.params.numero, c);
    exigirDueno(req, s);
    exigirEstado(s, "en_proceso");
    await c.query(
      `UPDATE servicio SET estado='programado', segundos_acumulados=0, reanudado_en=NULL, pausado=0, fecha_ejecucion=NULL,
         fecha_fin=NULL, gps_lat=NULL, gps_lon=NULL, gps_precision=NULL, gps_prueba=0 WHERE id_servicio=?`, [s.id_servicio]);
  });
  res.json({ ok: true });
});

// Guardado automático mientras el técnico escribe. Acepta solo las partes que lleguen.
router.put("/:numero/progreso", TECNICO, async (req, res) => {
  const b = req.body || {};
  await db.transaction(async (c) => {
    const s = await buscarOrden(req.params.numero, c);
    exigirDueno(req, s);
    exigirEstado(s, "en_proceso");

    const campos = {};
    for (const [clave, columna] of [["incidencias", "incidencias"], ["notasTecnicas", "notas_tecnicas"], ["notaCliente", "nota_cliente"]]) {
      if (b[clave] !== undefined) campos[columna] = typeof b[clave] === "string" ? texto(b[clave], clave, 2000, { requerido: false }) : (() => { throw bad("«" + clave + "» no es válido."); })();
    }
    if (Object.keys(campos).length) {
      await c.query("UPDATE servicio SET ? WHERE id_servicio = ?", [campos, s.id_servicio]);
    }

    if (b.serviciosHechos !== undefined) {
      if (!Array.isArray(b.serviciosHechos) || b.serviciosHechos.some((i) => !Number.isInteger(i) || i < 0 || i > 50)) throw bad("La lista de servicios realizados no es válida.");
      await c.query("UPDATE servicio_item SET realizado = (posicion IN (?)) WHERE id_servicio = ?", [b.serviciosHechos.length ? b.serviciosHechos : [-1], s.id_servicio]);
    }

    if (b.productos !== undefined) {
      if (!Array.isArray(b.productos) || b.productos.length > 20) throw bad("La lista de productos no es válida.");
      for (const p of b.productos) {
        const lote = texto(p.lote, "lote", 40, { requerido: false });
        const zona = texto(p.zona, "zona", 150, { requerido: false });
        const especie = texto(p.especie, "especie", 100, { requerido: false });
        await c.query(
          "UPDATE servicio_producto SET lote=?, zona=?, especie=? WHERE id_servicio=? AND id_producto=?",
          [lote, zona, especie, s.id_servicio, entero(p.productoId, "producto")]);
      }
    }
  });
  res.json({ ok: true });
});

router.post("/:numero/evidencias", TECNICO, async (req, res) => {
  const s = await buscarOrden(req.params.numero);
  exigirDueno(req, s);
  exigirEstado(s, "en_proceso");
  const { n } = await db.one("SELECT COUNT(*) AS n FROM evidencia_fotografica WHERE id_servicio = ?", [s.id_servicio]);
  if (n >= MAX_FOTOS) throw bad("Cada orden admite máximo " + MAX_FOTOS + " fotos.");
  const archivo = archivos.guardarImagen(req.body.imagen, "evidencias", "la foto");
  try {
    const r = await db.query("INSERT INTO evidencia_fotografica (id_servicio, url_imagen) VALUES (?,?)", [s.id_servicio, archivo]);
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    archivos.borrar("evidencias", archivo);
    throw err;
  }
});

router.delete("/:numero/evidencias/:id", TECNICO, async (req, res) => {
  const s = await buscarOrden(req.params.numero);
  exigirDueno(req, s);
  exigirEstado(s, "en_proceso");
  const id = entero(req.params.id, "foto");
  const f = await db.one("SELECT url_imagen FROM evidencia_fotografica WHERE id_evidencia = ? AND id_servicio = ?", [id, s.id_servicio]);
  if (!f) throw notFound("La foto no existe.");
  await db.query("DELETE FROM evidencia_fotografica WHERE id_evidencia = ?", [id]);
  archivos.borrar("evidencias", f.url_imagen);
  res.json({ ok: true });
});

// Finalizar: cierra la orden, descuenta el inventario y genera el certificado.
router.post("/:numero/finalizar", TECNICO, async (req, res) => {
  const b = req.body || {};
  const firmadoPor = texto(b.firmadoPor, "nombre de quien firma", 100);
  const documentoFirma = texto(b.documentoFirma, "documento de quien firma", 20);
  if (!U.reDocumento.test(documentoFirma)) throw bad("Usa solo números (y guion).", "firma-documento");
  const correos = (Array.isArray(b.correos) ? b.correos : []).map((x) => String(x).trim()).filter(Boolean);
  if (correos.length > 5) throw bad("Máximo 5 correos.", "correos-envio");
  const malo = correos.find((x) => !U.reCorreo.test(x) || x.length > 100);
  if (malo) throw bad('"' + malo + '" no es un correo válido.', "correos-envio");
  const enviar = !!(b.enviarCertificado || b.enviarParte);
  if (enviar && !correos.length) throw bad("Escribe al menos un correo para el envío.", "correos-envio");

  const archivoFirma = archivos.guardarImagen(b.firmaImagen, "firmas", "la firma de quien recibe");
  let archivoFirmaTecnico = null;
  let resultado;
  try {
    resultado = await db.transaction(async (c) => {
      const s = await buscarOrden(req.params.numero, c);
      exigirDueno(req, s);
      exigirEstado(s, "en_proceso");

      const [items] = await c.query("SELECT * FROM servicio_item WHERE id_servicio = ?", [s.id_servicio]);
      if (items.length && !items.some((i) => i.realizado)) throw bad("Marca al menos un servicio realizado antes de finalizar.");
      const [prods] = await c.query(
        `SELECT sp.*, p.nombre FROM servicio_producto sp JOIN producto p ON p.id_producto = sp.id_producto
          WHERE sp.id_servicio = ? ORDER BY sp.id_producto`, [s.id_servicio]);
      if (prods.some((p) => !p.lote || !p.zona)) throw bad("Completa el lote y la zona de aplicación de cada producto.");

      const ahora = new Date();
      await c.query(
        "UPDATE servicio SET estado='finalizado', segundos_acumulados=?, reanudado_en=NULL, pausado=0, fecha_fin=?, inventario_descontado=1 WHERE id_servicio=?",
        [segundosActuales(s, ahora), mysqlFecha(ahora), s.id_servicio]);

      // Inventario: se descuenta lo usado. Si no alcanza, queda en 0 y se avisa (no se bloquea el cierre).
      const [[tec]] = await c.query("SELECT nombre, firma_ruta FROM tecnico WHERE id_tecnico = ?", [s.id_tecnico]);
      const descontados = [], sinStock = [];
      if (!s.inventario_descontado) {
        for (const p of prods) {
          const [[prod]] = await c.query("SELECT stock_disponible FROM producto WHERE id_producto = ? FOR UPDATE", [p.id_producto]);
          const usado = Number(p.cantidad_utilizada);
          const stock = Number(prod.stock_disponible);
          const descuento = Math.min(usado, stock);
          if (usado > stock) sinStock.push(p.nombre);
          await c.query("UPDATE producto SET stock_disponible = ? WHERE id_producto = ?", [Math.round((stock - descuento) * 1000) / 1000, p.id_producto]);
          const cantidadTxt = num(p.usado_valor) + " " + p.usado_unidad;
          await c.query(
            "INSERT INTO movimiento_inventario (id_producto, id_servicio, cantidad, detalle, tecnico, fecha) VALUES (?,?,?,?,?,?)",
            [p.id_producto, s.id_servicio, -descuento, "Usado en " + s.numero_ods + " (" + cantidadTxt + ")", tec.nombre, U.hoy()]);
          descontados.push(cantidadTxt + " de " + p.nombre);
        }
      }

      // El certificado guarda su propia copia de la firma del técnico (si cambia después, el certificado no se altera).
      if (tec.firma_ruta) archivoFirmaTecnico = archivos.copiar("firmas", tec.firma_ruta);
      await c.query(
        `INSERT INTO certificado (id_servicio, fecha_emision, nombre_firmante, documento_firmante, firma_cliente_ruta,
           firma_tecnico_ruta, correo_destino, estado) VALUES (?,?,?,?,?,?,?, 'generado')`,
        [s.id_servicio, mysqlFecha(ahora), firmadoPor, documentoFirma, archivoFirma, archivoFirmaTecnico, correos.join(", ") || null]);

      const hechos = items.filter((i) => i.realizado).map((i) => i.nombre).join(", ");
      await crearAviso(c, s.id_cliente, "Servicio finalizado",
        "El servicio " + s.numero_ods + " (" + hechos + ") fue completado. Ya puedes descargar tu certificado.");
      return { numero: s.numero_ods, descontados, sinStock };
    });
  } catch (err) {
    archivos.borrar("firmas", archivoFirma);
    if (archivoFirmaTecnico) archivos.borrar("firmas", archivoFirmaTecnico);
    throw err;
  }

  let correoEnviado = false;
  if (enviar) {
    correoEnviado = await certificados.enviarCertificado(resultado.numero, correos);
    if (correoEnviado) {
      await db.query("UPDATE certificado SET estado='enviado' WHERE id_servicio = (SELECT id_servicio FROM servicio WHERE numero_ods = ?)", [resultado.numero]);
    }
  }
  res.json({
    descontados: resultado.descontados, sinStock: resultado.sinStock,
    correoSolicitado: enviar, correoEnviado, correoConfigurado: certificados.correoConfigurado()
  });
});

module.exports = router;

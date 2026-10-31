// Arma la "foto" de los datos que la pantalla necesita, filtrada según el rol de quien pregunta.
// El navegador recibe esto con la misma forma que usaba el frontend original (objeto "datos"),
// pero SOLO con lo que esa persona tiene derecho a ver.
const db = require("../db");
const { ROLES } = require("../middleware");
const { ESTADO_A_TEXTO } = require("../dominio");
const { partirFechaHora, aIso } = require("../utils");

const dec = (n) => Math.round(Number(n) * 1000) / 1000;
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Carga de trabajo según las visitas abiertas del técnico. */
function nivelCarga(abiertas) {
  return abiertas <= 2 ? "Baja" : abiertas <= 4 ? "Media" : "Alta";
}

/** Texto de la dosis que el frontend guarda en "cantidad" (compatibilidad). */
const textoDosis = (v, u) => String(dec(v)).replace(".", ",") + " " + u;

async function construirDatos(usuario) {
  const rol = usuario.rol;
  const esAdmin = rol === ROLES.ADMIN;
  const esTec = rol === ROLES.TECNICO;
  const esCli = rol === ROLES.CLIENTE;

  // --- Órdenes (según el rol) ---
  let filtro = "";
  let params = [];
  if (esTec) { filtro = "WHERE s.id_tecnico = ?"; params = [usuario.id_tecnico]; }
  if (esCli) { filtro = "WHERE s.id_cliente = ?"; params = [usuario.id_cliente]; }

  const servicios = await db.query(
    `SELECT s.*, t.nombre AS tecnico_nombre FROM servicio s
       LEFT JOIN tecnico t ON t.id_tecnico = s.id_tecnico
       ${filtro} ORDER BY s.fecha_programada, s.id_servicio`, params);
  const ids = servicios.map((s) => s.id_servicio);

  const items = ids.length ? await db.query(
    "SELECT * FROM servicio_item WHERE id_servicio IN (?) ORDER BY id_servicio, posicion", [ids]) : [];
  const prods = ids.length ? await db.query(
    "SELECT * FROM servicio_producto WHERE id_servicio IN (?) ORDER BY id_servicio, posicion", [ids]) : [];
  const fotos = ids.length ? await db.query(
    "SELECT id_evidencia, id_servicio FROM evidencia_fotografica WHERE id_servicio IN (?) ORDER BY id_evidencia", [ids]) : [];

  const porServicio = (lista) => lista.reduce((m, x) => { (m[x.id_servicio] = m[x.id_servicio] || []).push(x); return m; }, {});
  const itemsPor = porServicio(items), prodsPor = porServicio(prods), fotosPor = porServicio(fotos);
  const ahora = Date.now();

  const ordenes = servicios.map((s) => {
    const { fecha, hora } = partirFechaHora(s.fecha_programada);
    const its = itemsPor[s.id_servicio] || [];
    const fs = fotosPor[s.id_servicio] || [];
    const enCurso = s.estado === "en_proceso";
    const o = {
      numero: s.numero_ods,
      clienteId: s.id_cliente,
      servicios: its.map((i) => i.nombre),
      serviciosHechos: its.filter((i) => i.realizado).map((i) => i.posicion),
      area: s.area,
      fecha, hora,
      comentarios: s.observaciones || "",
      tecnicoId: s.id_tecnico,
      estado: ESTADO_A_TEXTO[s.estado],
      productos: (prodsPor[s.id_servicio] || []).map((p) => ({
        productoId: p.id_producto,
        dosisValor: dec(p.dosis_valor), dosisUnidad: p.dosis_unidad,
        usadoValor: dec(p.usado_valor), usadoUnidad: p.usado_unidad,
        cantidad: textoDosis(p.dosis_valor, p.dosis_unidad),
        lote: p.lote || "", zona: p.zona || "", especie: p.especie || ""
      })),
      incidencias: s.incidencias || "",
      notasTecnicas: s.notas_tecnicas || "",
      notaCliente: s.nota_cliente || "",
      // Cronómetro: "segundos" es lo acumulado e "inicio" (en ms) es cuándo arrancó el tramo en curso.
      segundos: s.segundos_acumulados,
      inicio: enCurso && s.reanudado_en ? new Date(String(s.reanudado_en).replace(" ", "T")).getTime() : null,
      pausado: !!s.pausado,
      horaInicio: aIso(s.fecha_ejecucion),
      horaFin: aIso(s.fecha_fin),
      gpsInicio: s.gps_lat === null ? null : {
        lat: Number(s.gps_lat).toFixed(5), lon: Number(s.gps_lon).toFixed(5),
        precision: s.gps_precision, ...(s.gps_prueba ? { prueba: true } : {})
      },
      evidencias: fs.map((f) => "/api/evidencias/" + f.id_evidencia),
      evidenciaIds: fs.map((f) => f.id_evidencia),
      inventarioDescontado: !!s.inventario_descontado
    };
    if (esCli) { delete o.comentarios; delete o.notasTecnicas; }
    return o;
  });

  // --- Certificados ---
  const certs = await db.query(
    `SELECT c.*, s.numero_ods, s.id_cliente, s.id_servicio AS id_s, t.nombre AS tecnico_nombre
       FROM certificado c JOIN servicio s ON s.id_servicio = c.id_servicio
       LEFT JOIN tecnico t ON t.id_tecnico = s.id_tecnico
       ${filtro} ORDER BY c.id_certificado`, params);
  const certificados = certs.map((c) => {
    const its = itemsPor[c.id_s] || [];
    const hechos = its.filter((i) => i.realizado);
    return {
      ods: c.numero_ods,
      clienteId: c.id_cliente,
      fecha: String(c.fecha_emision).slice(0, 10),
      servicio: (hechos.length ? hechos : its).map((i) => i.nombre).join(", "),
      tecnico: c.tecnico_nombre || "—",
      firmadoPor: c.nombre_firmante,
      documentoFirma: c.documento_firmante,
      ...(c.firma_cliente_ruta ? { firmaImagen: "/api/certificados/" + c.numero_ods + "/firma-cliente" } : {}),
      firmaTecnico: c.firma_tecnico_ruta ? "/api/certificados/" + c.numero_ods + "/firma-tecnico" : null,
      estado: mayus(c.estado),
      correo: c.correo_destino || ""
    };
  });

  // --- Clientes ---
  let clientesSql = "SELECT id_cliente, nombre_empresa, tipo, documento, telefono, correo, direccion FROM cliente";
  let clientesParams = [];
  if (esTec) {
    const idsCli = [...new Set(servicios.map((s) => s.id_cliente))];
    clientesSql += " WHERE id_cliente IN (?)"; clientesParams = [idsCli.length ? idsCli : [0]];
  }
  if (esCli) { clientesSql += " WHERE id_cliente = ?"; clientesParams = [usuario.id_cliente]; }
  const clientes = (await db.query(clientesSql + " ORDER BY id_cliente", clientesParams)).map((c) => ({
    id: c.id_cliente, nombre: c.nombre_empresa, tipo: c.tipo, documento: c.documento,
    telefono: c.telefono || "", correo: c.correo, direccion: c.direccion
  }));

  // --- Técnicos ---
  let tecnicos = [];
  if (esAdmin || esTec) {
    const abiertas = await db.query(
      `SELECT id_tecnico, COUNT(*) AS n FROM servicio
        WHERE id_tecnico IS NOT NULL AND estado IN ('programado','en_proceso') GROUP BY id_tecnico`);
    const cuenta = Object.fromEntries(abiertas.map((a) => [a.id_tecnico, a.n]));
    const filas = await db.query(
      "SELECT * FROM tecnico" + (esTec ? " WHERE id_tecnico = ?" : "") + " ORDER BY id_tecnico",
      esTec ? [usuario.id_tecnico] : []);
    tecnicos = filas.map((t) => ({
      id: t.id_tecnico, nombre: t.nombre, especialidad: t.especialidad || "Por definir",
      telefono: t.telefono || "", distanciaKm: Number(t.distancia_km), tiempoMin: t.tiempo_min,
      carga: nivelCarga(cuenta[t.id_tecnico] || 0), estado: mayus(t.estado),
      ...(t.firma_ruta ? { firma: "/api/tecnicos/" + t.id_tecnico + "/firma?v=" + t.firma_ruta.slice(0, 8) } : {})
    }));
  } else {
    // El cliente solo necesita el nombre del técnico que lo atiende.
    const idsT = [...new Set(servicios.map((s) => s.id_tecnico).filter(Boolean))];
    if (idsT.length) {
      tecnicos = (await db.query("SELECT id_tecnico, nombre FROM tecnico WHERE id_tecnico IN (?)", [idsT]))
        .map((t) => ({ id: t.id_tecnico, nombre: t.nombre }));
    }
  }

  // --- Productos ---
  let productos = [];
  {
    let sql = "SELECT * FROM producto";
    let p = [];
    if (!esAdmin) {
      const idsP = [...new Set(prods.map((x) => x.id_producto))];
      sql += " WHERE id_producto IN (?)"; p = [idsP.length ? idsP : [0]];
    }
    productos = (await db.query(sql + " ORDER BY id_producto", p)).map((x) => {
      const base = { id: x.id_producto, nombre: x.nombre, tipo: x.tipo, unidad: x.unidad_medida };
      if (esCli) return base;
      return {
        ...base, stock: dec(x.stock_disponible), minimo: dec(x.stock_minimo), dosis: x.dosis_referencia,
        ...(x.ficha_ruta ? { ficha: { nombre: x.ficha_nombre, tamano: x.ficha_tamano } } : {})
      };
    });
  }

  const datos = { ahora, ordenes, certificados, clientes, tecnicos, productos, usuarios: [], movimientos: [], facturas: [], avisos: [] };

  // --- Solo administrador ---
  if (esAdmin) {
    datos.usuarios = (await db.query(
      `SELECT u.*, r.nombre_rol, t.id_tecnico FROM usuario u
         JOIN rol r ON r.id_rol = u.id_rol LEFT JOIN tecnico t ON t.id_usuario = u.id_usuario
        ORDER BY u.id_usuario`)).map((u) => ({
      id: u.id_usuario, nombre: u.nombre_completo, documento: u.documento, correo: u.correo,
      rol: u.nombre_rol === "Técnico" ? "Técnico" : "Administrador", estado: mayus(u.estado), tecnicoId: u.id_tecnico || null
    }));
    datos.movimientos = (await db.query(
      "SELECT * FROM movimiento_inventario ORDER BY id_movimiento")).map((m) => ({
      fecha: String(m.fecha).slice(0, 10), productoId: m.id_producto, cantidad: dec(m.cantidad),
      detalle: m.detalle, ...(m.tecnico ? { tecnico: m.tecnico } : {})
    }));
  }

  // --- Facturas y avisos (administrador y cliente) ---
  if (esAdmin || esCli) {
    const f = esCli ? " WHERE id_cliente = ?" : "";
    const p = esCli ? [usuario.id_cliente] : [];
    datos.facturas = (await db.query("SELECT * FROM factura" + f + " ORDER BY id_factura", p)).map((x) => ({
      numero: x.numero, clienteId: x.id_cliente, fecha: String(x.fecha).slice(0, 10),
      concepto: x.concepto, valor: Number(x.valor), estado: x.estado
    }));
    datos.avisos = (await db.query("SELECT * FROM aviso" + f + " ORDER BY id_aviso", p)).map((x) => ({
      clienteId: x.id_cliente, fecha: String(x.fecha).slice(0, 10), titulo: x.titulo, texto: x.texto
    }));
  }

  return datos;
}

module.exports = { construirDatos, nivelCarga };

// Productos e inventario: catálogo, entradas de stock y fichas de seguridad (PDF).
const express = require("express");
const db = require("../db");
const archivos = require("../services/archivos");
const { soloRol, ROLES } = require("../middleware");
const { UNIDADES } = require("../dominio");
const { texto, entero, positivo, bad, conflict, notFound, forbidden, hoy } = require("../utils");

const router = express.Router();
const TIPOS = ["Insecticida", "Rodenticida", "Termiticida", "Larvicida", "Trampa", "Herramienta"];

// La ficha la ve el administrador siempre, y el técnico solo mientras tenga una orden abierta con ese producto.
router.get("/:id/ficha", soloRol(ROLES.ADMIN, ROLES.TECNICO), async (req, res) => {
  const id = entero(req.params.id, "producto");
  const p = await db.one("SELECT ficha_nombre, ficha_ruta FROM producto WHERE id_producto = ?", [id]);
  if (!p || !p.ficha_ruta) throw notFound("Este producto no tiene ficha de seguridad.");
  if (req.usuario.rol === ROLES.TECNICO) {
    const abierta = await db.one(
      `SELECT 1 FROM servicio s JOIN servicio_producto sp ON sp.id_servicio = s.id_servicio
        WHERE s.id_tecnico = ? AND sp.id_producto = ? AND s.estado IN ('programado','en_proceso') LIMIT 1`,
      [req.usuario.id_tecnico, id]);
    if (!abierta) throw forbidden("La ficha solo está disponible mientras tengas una orden abierta con este producto.");
  }
  archivos.enviar(res, "fichas", p.ficha_ruta, { descargar: req.query.descargar === "1", nombre: p.ficha_nombre });
});

router.use(soloRol(ROLES.ADMIN));

router.post("/", async (req, res) => {
  const nombre = texto(req.body.nombre, "nombre", 80);
  const unidad = req.body.unidad;
  const stock = Number(req.body.stock), minimo = Number(req.body.minimo);
  if (!TIPOS.includes(req.body.tipo)) throw bad("Selecciona el tipo de producto.", "prod-tipo");
  if (!UNIDADES[unidad]) throw bad("Selecciona la unidad.", "prod-unidad");
  if (!Number.isFinite(stock) || stock < 0 || stock > 1e7) throw bad("El stock no puede ser negativo.", "prod-stock");
  if (!Number.isFinite(minimo) || minimo < 0 || minimo > 1e7) throw bad("El mínimo no puede ser negativo.", "prod-minimo");
  const dosis = texto(req.body.dosis, "dosis", 60, { requerido: false }) || "—";

  if (await db.one("SELECT 1 FROM producto WHERE nombre = ?", [nombre])) throw conflict("Ya existe un producto con ese nombre.", "prod-nombre");
  await db.transaction(async (c) => {
    const [r] = await c.query(
      "INSERT INTO producto (nombre, tipo, unidad_medida, stock_disponible, stock_minimo, dosis_referencia) VALUES (?,?,?,?,?,?)",
      [nombre, req.body.tipo, unidad, stock, minimo, dosis]);
    if (stock > 0) {
      await c.query("INSERT INTO movimiento_inventario (id_producto, cantidad, detalle, fecha) VALUES (?,?,?,?)",
        [r.insertId, stock, "Stock inicial", hoy()]);
    }
  });
  res.status(201).json({ ok: true });
});

router.post("/:id/entrada", async (req, res) => {
  const id = entero(req.params.id, "producto");
  const cantidad = positivo(req.body.cantidad, "cantidad");
  const stock = await db.transaction(async (c) => {
    const [[p]] = await c.query("SELECT stock_disponible FROM producto WHERE id_producto = ? FOR UPDATE", [id]);
    if (!p) throw notFound("El producto no existe.");
    const nuevo = Math.round((Number(p.stock_disponible) + cantidad) * 1000) / 1000;
    await c.query("UPDATE producto SET stock_disponible = ? WHERE id_producto = ?", [nuevo, id]);
    await c.query("INSERT INTO movimiento_inventario (id_producto, cantidad, detalle, fecha) VALUES (?,?,?,?)",
      [id, cantidad, "Entrada de inventario", hoy()]);
    return nuevo;
  });
  res.json({ stock });
});

router.put("/:id/ficha", async (req, res) => {
  const id = entero(req.params.id, "producto");
  const p = await db.one("SELECT ficha_ruta FROM producto WHERE id_producto = ?", [id]);
  if (!p) throw notFound("El producto no existe.");
  const nombre = texto(req.body.nombre, "nombre del archivo", 150);
  const { archivo, tamano } = archivos.guardarPdf(req.body.datos, "fichas", "la ficha");
  await db.query("UPDATE producto SET ficha_nombre=?, ficha_ruta=?, ficha_tamano=? WHERE id_producto=?", [nombre, archivo, tamano, id]);
  if (p.ficha_ruta) archivos.borrar("fichas", p.ficha_ruta);
  res.json({ ok: true });
});

router.delete("/:id/ficha", async (req, res) => {
  const id = entero(req.params.id, "producto");
  const p = await db.one("SELECT ficha_ruta FROM producto WHERE id_producto = ?", [id]);
  if (!p) throw notFound("El producto no existe.");
  await db.query("UPDATE producto SET ficha_nombre=NULL, ficha_ruta=NULL, ficha_tamano=NULL WHERE id_producto=?", [id]);
  if (p.ficha_ruta) archivos.borrar("fichas", p.ficha_ruta);
  res.json({ ok: true });
});

module.exports = router;

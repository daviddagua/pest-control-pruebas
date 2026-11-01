/*  Datos y utilidades comunes
   Los datos los entrega el servidor (Node.js + MySQL); aquí también están
   las unidades de dosis, las conversiones y los textos que usan las pantallas.*/

/* Devuelve una fecha AAAA-MM-DD sumando días a hoy (para que siempre haya visitas "de hoy") */
function fechaRelativa(dias) {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0");
}

/* Catálogo de servicios que el administrador puede asignar a una orden */
const SERVICIOS = [
  "Fumigación general", "Aspersión", "Nebulización","Instalación de estaciones cebaderas", "Control de cucarachas", "Control de roedores",
  "Control de hormigas", "Control de termitas", "Control de mosquitos", "Control de moscas",
  "Control de chinches", "Inspección", "Desinfección de áreas", "Lavado y desinfección de tanques"
];

/* Los datos ya no viven en el navegador: los entrega el servidor (Node.js + MySQL) según el rol de la sesión.
   "datos" tiene la misma forma de siempre (usuarios, clientes, tecnicos, productos, ordenes, certificados,
   movimientos, facturas, avisos), pero se llena con GET /api/datos. */
const datos = {
  usuarios: [], clientes: [], tecnicos: [], productos: [], ordenes: [],
  certificados: [], movimientos: [], facturas: [], avisos: []
};

/* Error que devuelve el servidor: trae el mensaje y, a veces, la casilla (campo) que hay que marcar */
class ErrorApi extends Error {
  constructor(estado, mensaje, campo) {
    super(mensaje);
    this.estado = estado;
    this.campo = campo;
  }
}

/* Cliente de la API. La sesión viaja en una cookie segura (HttpOnly) que el navegador envía solo.
   El encabezado X-Requested-With protege contra peticiones falsas desde otros sitios.
   X-Sesion indica qué sesión usa esta pestaña (admin, tecnico o cliente): cada rol tiene su propia
   cookie, así el administrador y el técnico pueden estar abiertos a la vez en el mismo navegador. */
async function api(metodo, url, cuerpo, { sinRedireccion = false } = {}) {
  let respuesta;
  const sesion = document.body && document.body.dataset.rol;
  try {
    respuesta = await fetch("/api" + url, {
      method: metodo,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "pestcontrol",
        ...(sesion ? { "X-Sesion": sesion } : {}),
        ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {})
      },
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined
    });
  } catch (e) {
    throw new ErrorApi(0, "No hay conexión con el servidor. Revisa que esté encendido (npm start).");
  }
  let json = null;
  try { json = await respuesta.json(); } catch (e) { /* respuesta sin cuerpo */ }
  if (!respuesta.ok) {
    // Sesión vencida: se vuelve a la pantalla de error 401 (salvo en el inicio de sesión)
    if (respuesta.status === 401 && !sinRedireccion) {
      try { sessionStorage.removeItem("pestcontrol-sesion"); } catch (e) { }
      location.href = "error.html?codigo=401";
    }
    throw new ErrorApi(respuesta.status, (json && json.error) || "Ocurrió un error. Intenta de nuevo.", json && json.campo);
  }
  return json;
}

/* Vuelve a pedir los datos al servidor. Se llama al abrir cada pantalla y después de cada cambio. */
async function recargarDatos() {
  const nuevos = await api("GET", "/datos");
  const desfase = Date.now() - nuevos.ahora;   // por si el reloj del servidor y el del navegador no coinciden
  nuevos.ordenes.forEach(o => { if (o.inicio) o.inicio += desfase; });
  delete nuevos.ahora;
  Object.assign(datos, nuevos);
}

/*Consultas frecuentes*/
const buscarCliente = id => datos.clientes.find(c => c.id === Number(id));
const buscarTecnico = id => datos.tecnicos.find(t => t.id === Number(id));
const buscarProducto = id => datos.productos.find(p => p.id === Number(id));
const buscarOrden = numero => datos.ordenes.find(o => o.numero === numero);

/* Hora de inicio, hora de finalización y duración de la visita.
   Si la orden es de ejemplo (sin horas registradas) se calculan con la hora programada. */
function horasServicio(orden) {
  const aHora = d => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const inicio = orden.horaInicio ? new Date(orden.horaInicio) : new Date(orden.fecha + "T" + orden.hora);
  const fin = orden.horaFin ? new Date(orden.horaFin)
            : (orden.segundos ? new Date(inicio.getTime() + orden.segundos * 1000) : null);
  const s = Math.round(orden.segundos || 0);
  const duracion = s ? (Math.floor(s / 3600) ? Math.floor(s / 3600) + " h " : "") + Math.floor((s % 3600) / 60) + " min" : "—";
  return { inicio: aHora(inicio), fin: fin ? aHora(fin) : null, duracion };
}

/* Unidades de dosis y cantidad según el producto La unidad del inventario (L, kg, und, tubos) decide qué unidades se pueden usar. */
const UNIDADES = {
  L:     { dosis: ["ml/L", "cc/L"], cantidad: ["ml", "cc", "L"] },
  kg:    { dosis: ["g/L", "g/m²", "g por estación"], cantidad: ["g", "kg"] },
  und:   { dosis: ["und por estación", "und/m²"], cantidad: ["und"] },
  tubos: { dosis: ["puntos por m", "g/m²"], cantidad: ["tubos"] }
};
// Cuánto vale 1 unidad de cantidad en la unidad del inventario
const FACTOR = { ml: 0.001, cc: 0.001, L: 1, g: 0.001, kg: 1, und: 1, tubos: 1 };

function unidadesDe(prod) {
  return UNIDADES[prod && prod.unidad] || { dosis: ["por aplicación"], cantidad: [prod ? prod.unidad : "und"] };
}

/* Propone dosis y cantidad por defecto a partir de la dosis del catálogo (ej. "15 ml/L") */
function valoresPorDefecto(prod) {
  const u = unidadesDe(prod);
  const coincide = String(prod.dosis || "").match(/^([\d.,]+)\s*(.+)$/);
  const dosisUnidad = coincide && u.dosis.includes(coincide[2].trim()) ? coincide[2].trim() : u.dosis[0];
  return {
    dosisValor: coincide && u.dosis.includes(coincide[2].trim()) ? Number(coincide[1].replace(",", ".")) : "",
    dosisUnidad,
    usadoValor: "",
    usadoUnidad: u.cantidad[0]
  };
}

/* Convierte la cantidad usada a la unidad del inventario (ej. 250 ml -> 0.25 L) */
function cantidadEnInventario(p) {
  if (p.usadoValor === "" || p.usadoValor == null) return 0;
  const factor = FACTOR[p.usadoUnidad] ?? 1;
  return Math.round(Number(p.usadoValor) * factor * 1000) / 1000;
}

const numeroBonito = n => String(Math.round(Number(n) * 1000) / 1000).replace(".", ",");
function textoDosis(p) {
  if (p.dosisValor !== undefined && p.dosisValor !== "") return `${numeroBonito(p.dosisValor)} ${p.dosisUnidad}`;
  return p.cantidad || "—";
}
function textoCantidad(p) {
  if (p.usadoValor !== undefined && p.usadoValor !== "") return `${numeroBonito(p.usadoValor)} ${p.usadoUnidad}`;
  return "—";
}

/* Servicios de una orden como texto: "Aspersión, Colocación de cebos" */
function textoServicios(orden) {
  return (orden.servicios || []).join(", ") || "Sin servicios";
}

/* Servicios que el técnico marcó como realizados (si no marcó ninguno, todos) */
function serviciosRealizados(orden) {
  const hechos = orden.serviciosHechos || [];
  const lista = orden.servicios || [];
  return hechos.length ? lista.filter((s, i) => hechos.includes(i)) : lista;
}

function siguienteId(lista) {
  return lista.length ? Math.max(...lista.map(x => x.id)) + 1 : 1;
}

/* RF10: número de ODS automático y único (RNF-06) */
function siguienteNumeroODS() {
  const mayor = Math.max(2000, ...datos.ordenes.map(o => Number(o.numero.replace("ODS-", ""))));
  return "ODS-" + (mayor + 1);
}

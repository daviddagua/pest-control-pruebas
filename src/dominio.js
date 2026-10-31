// Reglas del negocio que usan varias partes del servidor.

// Estados de la orden: en la base de datos se guardan en minúscula; la pantalla usa estos nombres.
const ESTADO_A_TEXTO = {
  pendiente: "Pendiente",
  programado: "Programado",
  en_proceso: "En ejecución",
  finalizado: "Completado",
  cancelado: "Cancelado"
};
const TEXTO_A_ESTADO = Object.fromEntries(Object.entries(ESTADO_A_TEXTO).map(([k, v]) => [v, k]));

// Unidades permitidas según la unidad con que se maneja el producto en el inventario.
const UNIDADES = {
  L:     { dosis: ["ml/L", "cc/L"], cantidad: ["ml", "cc", "L"] },
  kg:    { dosis: ["g/L", "g/m²", "g por estación"], cantidad: ["g", "kg"] },
  und:   { dosis: ["und por estación", "und/m²"], cantidad: ["und"] },
  tubos: { dosis: ["puntos por m", "g/m²"], cantidad: ["tubos"] }
};

// Cuánto vale 1 unidad de "cantidad usada" en la unidad del inventario.
const FACTOR = { ml: 0.001, cc: 0.001, L: 1, g: 0.001, kg: 1, und: 1, tubos: 1 };

/** Convierte lo usado (ej. 250 ml) a la unidad del inventario (0.25 L). */
function cantidadEnInventario(valor, unidad) {
  return Math.round(Number(valor) * (FACTOR[unidad] ?? 1) * 1000) / 1000;
}

const TIPOS_CLIENTE = ["Empresa", "Persona natural", "Conjunto residencial"];

// Servicios que el administrador puede elegir al crear una orden.
const SERVICIOS = [
  "Fumigación general", "Aspersión", "Nebulización", "Instalación de estaciones cebaderas",
  "Control de cucarachas", "Control de roedores", "Control de hormigas", "Control de termitas",
  "Control de mosquitos", "Control de moscas", "Control de chinches", "Inspección",
  "Desinfección de áreas", "Lavado y desinfección de tanques"
];

const ESPECIALIDADES_LIBRES = true; // la especialidad del técnico es un texto libre

module.exports = {
  ESTADO_A_TEXTO, TEXTO_A_ESTADO, UNIDADES, FACTOR, cantidadEnInventario,
  TIPOS_CLIENTE, SERVICIOS, ESPECIALIDADES_LIBRES
};

/* Funciones comunes a todas las pantallas
   Sesión por rol, estructura (barra, menú, navegación inferior),
   mensajes, ventanas modales, validación y utilidades.*/

/*1. Sesión y control de acceso por rol (RNF-05)*/
function obtenerSesion() {
  try { return JSON.parse(sessionStorage.getItem("pestcontrol-sesion")); } catch (e) { return null; }
}

function guardarSesion(sesion) {
  try { sessionStorage.setItem("pestcontrol-sesion", JSON.stringify(sesion)); } catch (e) { }
}

async function cerrarSesion() {
  if (!confirm("¿Deseas cerrar la sesión?")) return;
  try { await api("POST", "/auth/logout", {}, { sinRedireccion: true }); } catch (e) { /* aunque falle, se sale */ }
  try { sessionStorage.removeItem("pestcontrol-sesion"); } catch (e) { }
  location.href = "index.html";
}

/* Cada página indica qué rol puede verla con <body data-rol="...">.
   El control real lo hace el servidor (cada petición revisa la sesión y el rol); esto solo decide
   a qué pantalla de error mandar al usuario. */
async function verificarAcceso() {
  const rolPagina = document.body.dataset.rol;
  if (!rolPagina) return true;

  // El cliente entra con el enlace seguro que le llega por correo (sin usuario ni contraseña)
  const parametros = new URLSearchParams(location.search);
  const token = parametros.get("token");
  if (token && rolPagina === "cliente") {
    try {
      const s = await api("POST", "/auth/cliente", { token }, { sinRedireccion: true });
      guardarSesion({ rol: "cliente", rolTexto: "Cliente", nombre: s.nombre, clienteId: s.clienteId });
      history.replaceState(null, "", location.pathname);   // el enlace secreto no se queda en la barra de direcciones
    } catch (e) {
      location.href = "error.html?codigo=401";
      return false;
    }
  }

  const sesion = obtenerSesion();
  if (!sesion) {
    location.href = "error.html?codigo=401";
    return false;
  }
  if (sesion.rol !== rolPagina) {
    location.href = "error.html?codigo=403";
    return false;
  }
  return true;
}

/*2. Menús de cada rol (mismos nombres del mapa de navegación)*/
const MENUS = {
  admin: {
    titulo: "Panel Administrador",
    grupo: "Administración",
    opciones: [
      { id: "dashboard", texto: "Dashboard", corto: "Inicio", icono: "🏠", url: "admin.html" },
      { id: "clientes", texto: "Clientes", icono: "👥", url: "admin-clientes.html" },
      { id: "tecnicos", texto: "Técnicos", icono: "🧑‍🔧", url: "admin-tecnicos.html" },
      { id: "ordenes", texto: "Servicios (Órdenes)", corto: "Órdenes", icono: "📋", url: "admin-ordenes.html" },
      { id: "asignacion", texto: "Asignación", icono: "📍", url: "admin-asignacion.html" },
      { id: "productos", texto: "Productos", icono: "🧪", url: "admin-productos.html" },
      { id: "certificados", texto: "Certificados", icono: "📄", url: "admin-certificados.html" },
      { id: "usuarios", texto: "Usuarios", icono: "🔐", url: "admin-usuarios.html" },
      { id: "reportes", texto: "Reportes", icono: "📊", url: "admin-reportes.html" }
    ],
    inferior: ["dashboard", "ordenes", "clientes", "tecnicos"]
  },
  tecnico: {
    titulo: "App Técnico",
    grupo: "Técnico de campo",
    opciones: [
      { id: "inicio", texto: "Mis visitas del día", corto: "Visitas", icono: "📅", url: "tecnico.html" },
      { id: "historial", texto: "Historial", icono: "🗂️", url: "tecnico.html#historial" }
    ],
    inferior: ["inicio", "historial"]
  },
  cliente: {
    titulo: "Portal Cliente",
    grupo: "Mi cuenta",
    opciones: [
      { id: "resumen", texto: "Resumen", icono: "🏠", url: "cliente.html" },
      { id: "servicios", texto: "Servicios y visitas", corto: "Servicios", icono: "📅", url: "cliente-servicios.html" },
      { id: "certificados", texto: "Certificados", icono: "📄", url: "cliente-certificados.html" },
      { id: "facturas", texto: "Facturas", icono: "🧾", url: "cliente-facturas.html" },
      { id: "avisos", texto: "Avisos", icono: "🔔", url: "cliente-avisos.html" }
    ],
    inferior: ["resumen", "servicios", "certificados", "avisos"]
  }
};

function iniciales(nombre) {
  return nombre.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

/* Construye barra superior, menú lateral y navegación inferior */
function construirEstructura() {
  const rol = document.body.dataset.rol;
  const menu = MENUS[rol];
  if (!menu) return;
  const sesion = obtenerSesion();
  const actual = document.body.dataset.menu;

  // Barra superior
  const barra = document.createElement("header");
  barra.className = "barra-superior";
  barra.innerHTML = `
    <button class="btn-menu" id="btn-menu" aria-label="Abrir menú" aria-expanded="false" aria-controls="menu-lateral">☰</button>
    <img class="logo-mini" src="img/logo.png" alt="">
    <div class="titulo-app">PEST CONTROL <span>· ${menu.titulo}</span></div>
    <div class="usuario-barra">
      <span class="nombre-usuario">${sesion.nombre} · ${sesion.rolTexto}</span>
      <span class="avatar" aria-hidden="true">${iniciales(sesion.nombre)}</span>
    </div>`;

  // Menú lateral
  const lateral = document.createElement("aside");
  lateral.className = "menu-lateral";
  lateral.id = "menu-lateral";
  lateral.setAttribute("aria-label", "Menú principal");
  lateral.innerHTML = `
    <p class="grupo">${menu.grupo}</p>
    <nav>
      ${menu.opciones.map(op => `
        <a href="${op.url}" class="${op.id === actual ? "activo" : ""}" ${op.id === actual ? 'aria-current="page"' : ""}>
          <span aria-hidden="true">${op.icono}</span>${op.texto}
        </a>`).join("")}
    </nav>
    <div class="salir"><button class="btn btn-secundario btn-chico" id="btn-salir">Cerrar sesión</button></div>`;

  // Navegación inferior (solo se ve en celular)
  const inferior = document.createElement("nav");
  inferior.className = "nav-inferior";
  inferior.setAttribute("aria-label", "Navegación rápida");
  inferior.innerHTML = menu.inferior.map(id => {
    const op = menu.opciones.find(o => o.id === id);
    return `<a href="${op.url}" class="${id === actual ? "activo" : ""}"><span class="icono" aria-hidden="true">${op.icono}</span>${op.corto || op.texto}</a>`;
  }).join("") + `<a href="#" id="btn-mas"><span class="icono" aria-hidden="true">•••</span>Más</a>`;

  const velo = document.createElement("div");
  velo.className = "velo";

  document.body.prepend(barra, lateral, velo);
  document.body.appendChild(inferior);

  // Abrir / cerrar menú en celular
  const botonMenu = document.getElementById("btn-menu");
  function alternarMenu(abrir) {
    lateral.classList.toggle("abierto", abrir);
    velo.classList.toggle("visible", abrir);
    botonMenu.setAttribute("aria-expanded", abrir);
  }
  botonMenu.addEventListener("click", () => alternarMenu(!lateral.classList.contains("abierto")));
  document.getElementById("btn-mas").addEventListener("click", e => { e.preventDefault(); alternarMenu(true); });
  velo.addEventListener("click", () => alternarMenu(false));
  document.getElementById("btn-salir").addEventListener("click", cerrarSesion);

  // Pie de página
  const contenido = document.querySelector(".contenido");
  if (contenido) {
    const pie = document.createElement("footer");
    pie.className = "pie";
    pie.innerHTML = `PEST CONTROL ${new Date().getFullYear()}  Desarrollado por David Liz Dagua  ADSO SENA, ficha 3336089`;
    contenido.appendChild(pie);
  }
}

/*3. Mensajes de retroalimentación (Shneiderman: retroalimentación informativa)*/
function mostrarAviso(texto, tipo = "exito") {
  let caja = document.getElementById("avisos");
  if (!caja) {
    caja = document.createElement("div");
    caja.id = "avisos";
    caja.setAttribute("role", "status");
    caja.setAttribute("aria-live", "polite");
    document.body.appendChild(caja);
  }
  const aviso = document.createElement("div");
  aviso.className = "aviso " + (tipo === "exito" ? "" : tipo);
  aviso.textContent = texto;
  caja.appendChild(aviso);
  setTimeout(() => aviso.remove(), 3500);
}

/*4. Ventanas modales*/
let ultimoFoco = null;

function abrirModal(id) {
  ultimoFoco = document.activeElement;
  const modal = document.getElementById(id);
  modal.classList.add("abierto");
  const primero = modal.querySelector("input:not([type=hidden]), select, textarea, button");
  if (primero) primero.focus();
}

function cerrarModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove("abierto");
  const form = modal.querySelector("form");
  if (form) limpiarFormulario(form);
  if (ultimoFoco) ultimoFoco.focus();
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.querySelectorAll(".modal.abierto").forEach(m => cerrarModal(m.id));
});
document.addEventListener("click", e => {
  if (e.target.classList.contains("modal")) cerrarModal(e.target.id);
  const boton = e.target.closest("[data-cerrar]");
  if (boton) cerrarModal(boton.dataset.cerrar);
});

/*5. Validación de formularios (Shneiderman: manejo simple de errores)*/
function marcarError(campo, mensaje) {
  const caja = campo.closest(".campo");
  if (!caja) return;
  caja.classList.add("con-error");
  campo.setAttribute("aria-invalid", "true");
  const msg = caja.querySelector(".mensaje-error");
  if (msg) msg.textContent = mensaje;
}

function quitarError(campo) {
  const caja = campo.closest(".campo");
  if (!caja) return;
  caja.classList.remove("con-error");
  campo.removeAttribute("aria-invalid");
}

function limpiarFormulario(form) {
  form.reset();
  form.querySelectorAll("[aria-invalid]").forEach(quitarError);
  form.querySelectorAll(".con-error").forEach(c => c.classList.remove("con-error"));
  const alerta = form.querySelector(".alerta-form");
  if (alerta) alerta.classList.remove("visible");
}

/* Reglas: required, type=email, data-tipo="telefono" | "documento" | "clave", data-igual="idOtroCampo" */
function validarFormulario(form) {
  let valido = true;
  let primerError = null;

  form.querySelectorAll("input, select, textarea").forEach(campo => {
    if (!campo.closest(".campo") || campo.type === "hidden" || campo.disabled) return;
    quitarError(campo);
    const valor = campo.value.trim();
    let mensaje = "";

    if (campo.required && valor === "") mensaje = "Este campo es obligatorio.";
    else if (valor && campo.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor)) mensaje = "Escribe un correo válido, por ejemplo nombre@empresa.com.";
    else if (valor && campo.dataset.tipo === "telefono" && !/^\d{7,10}$/.test(valor)) mensaje = "El teléfono debe tener entre 7 y 10 números, sin espacios.";
    else if (valor && campo.dataset.tipo === "documento" && !/^[0-9-]{6,15}$/.test(valor)) mensaje = "Usa solo números (y guion para el NIT).";
    else if (valor && campo.dataset.tipo === "clave" && !/^(?=.*[A-Za-z])(?=.*\d).{6,}$/.test(valor)) mensaje = "Mínimo 6 caracteres, con letras y números.";
    else if (campo.dataset.igual && valor !== document.getElementById(campo.dataset.igual).value) mensaje = "Las contraseñas no coinciden.";
    else if (valor && campo.type === "number" && Number(valor) < Number(campo.min || 0)) mensaje = "El valor no puede ser menor a " + (campo.min || 0) + ".";

    if (mensaje) {
      marcarError(campo, mensaje);
      valido = false;
      if (!primerError) primerError = campo;
    }
  });

  if (primerError) primerError.focus();
  return valido;
}

/* Quita el error apenas el usuario corrige el campo */
document.addEventListener("input", e => {
  if (e.target.getAttribute && e.target.getAttribute("aria-invalid")) quitarError(e.target);
});

/*6. Utilidades*/
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatoFecha(texto) {
  if (!texto) return "";
  const [a, m, d] = texto.split("-");
  return `${d}/${m}/${a}`;
}

function formatoFechaLarga(texto) {
  const [a, m, d] = texto.split("-");
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`;
}

function formatoHora(hora) {
  const [h, m] = hora.split(":").map(Number);
  const sufijo = h >= 12 ? "p. m." : "a. m.";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${sufijo}`;
}

function formatoPesos(valor) {
  return "$ " + valor.toLocaleString("es-CO");
}

function hoy() {
  return fechaRelativa(0);
}

/* Etiqueta de estado con color y texto a la vez (RNF-03) */
function etiquetaEstado(estado) {
  const clase = estado.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-");
  return `<span class="estado ${clase}">${estado}</span>`;
}

function llenarSelect(select, opciones, textoInicial) {
  select.innerHTML = (textoInicial !== undefined ? `<option value="">${textoInicial}</option>` : "") +
    opciones.map(o => `<option value="${o.valor}">${o.texto}</option>`).join("");
}

/*Fichas de seguridad (PDF): el servidor las entrega solo a quien tiene permiso*/
const urlFicha = (idProducto, descargar) => "/api/productos/" + idProducto + "/ficha" + (descargar ? "?descargar=1" : "");

/* Abre el PDF en una pestaña nueva */
function abrirPdf(url) {
  if (!window.open(url, "_blank")) mostrarAviso("Permite las ventanas emergentes para ver el PDF.", "error");
}

/* Descarga el PDF con su nombre original */
function descargarPdf(url, nombre) {
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre || "documento.pdf";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

/* Lee un archivo del equipo como "data URL" (texto) para enviarlo al servidor */
function leerArchivo(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

/* Muestra un error del servidor: si indica una casilla, la marca; si no, lo muestra como aviso */
function errorApi(err, form) {
  const mensaje = err && err.message ? err.message : "Ocurrió un error. Intenta de nuevo.";
  const caja = err && err.campo ? document.getElementById(err.campo) : null;
  if (caja && caja.classList.contains("campo")) {
    caja.classList.add("con-error");
    mostrarAviso(mensaje, "error");
  } else if (caja) {
    marcarError(caja, mensaje);
    caja.focus();
  } else {
    mostrarAviso(mensaje, "error");
  }
}

/* Evita insertar HTML escrito por el usuario */
function seguro(texto) {
  const div = document.createElement("div");
  div.textContent = texto == null ? "" : String(texto);
  return div.innerHTML;
}

/*Recuadro de firma reutilizable
   Lo usan el técnico (firma de quien recibe) y el administrador (firma de cada técnico).
   Se puede dibujar con el dedo / mouse o subir una imagen. */
function crearFirma(idLienzo, idCampo, idLimpiar, idImagen) {
  const el = id => document.getElementById(id);
  const lienzo = el(idLienzo);
  const ctx = lienzo.getContext("2d");
  let dibujando = false;
  let hay = false;

  function preparar() {
    const escala = window.devicePixelRatio || 1;
    lienzo.width = lienzo.clientWidth * escala;
    lienzo.height = lienzo.clientHeight * escala;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#101B3D";
    hay = false;
  }

  function posicion(e) {
    const r = lienzo.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  lienzo.addEventListener("pointerdown", e => {
    dibujando = true;
    lienzo.setPointerCapture(e.pointerId);
    const p = posicion(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  lienzo.addEventListener("pointermove", e => {
    if (!dibujando) return;
    const p = posicion(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hay = true;
    el(idCampo).classList.remove("con-error");
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => lienzo.addEventListener(ev, () => dibujando = false));

  el(idLimpiar).addEventListener("click", preparar);

  // Firma en papel: subir una foto
  el(idImagen).addEventListener("change", e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        preparar();
        const w = lienzo.clientWidth, h = lienzo.clientHeight;
        const escala = Math.min(w / img.width, h / img.height);
        ctx.drawImage(img, (w - img.width * escala) / 2, (h - img.height * escala) / 2, img.width * escala, img.height * escala);
        hay = true;
        el(idCampo).classList.remove("con-error");
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
    e.target.value = "";
  });

  // Dibuja una imagen de firma existente (por ejemplo, la ya registrada)
  function cargar(dataUrl) {
    const img = new Image();
    img.onload = () => {
      const w = lienzo.clientWidth, h = lienzo.clientHeight;
      const escala = Math.min(w / img.width, h / img.height);
      ctx.drawImage(img, (w - img.width * escala) / 2, (h - img.height * escala) / 2, img.width * escala, img.height * escala);
      hay = true;
    };
    img.src = dataUrl;
  }

  return {
    preparar,
    cargar,
    tieneFirma: () => hay,
    marcarFalta: () => el(idCampo).classList.add("con-error"),
    imagen: () => lienzo.toDataURL("image/png")
  };
}

/*7. Arranque de cada pantalla interna
   Primero se comprueba el acceso y se piden los datos al servidor; recién entonces cada pantalla se dibuja.
   Los archivos admin.js, tecnico.js y cliente.js esperan a "accesoListo" antes de arrancar.*/
const accesoListo = (async () => {
  if (!document.body.dataset.rol) return true;
  if (!(await verificarAcceso())) return false;
  construirEstructura();
  try {
    await recargarDatos();
  } catch (e) {
    mostrarAviso(e.message, "error");
    return false;
  }
  return true;
})();

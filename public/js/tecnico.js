/*  App del técnico de campo (mobile first)
   Mis visitas del día, Detalle de la visita y Finalizar trabajo
   RF2–RF4, RF15, RF16, RF17, RF19, RF21, RF22*/

const sesionTecnico = obtenerSesion();

function nombreClienteT(id) {
  const c = buscarCliente(id);
  return c ? c.nombre : "—";
}

function formatoDuracion(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function textoDia(fecha) {
  if (fecha === hoy()) return "hoy";
  if (fecha === fechaRelativa(1)) return "mañana";
  return formatoFechaLarga(fecha);
}

/*MIS VISITAS DEL DÍA (RF15)*/
function pantallaVisitas() {
  const tecnico = buscarTecnico(sesionTecnico.tecnicoId);
  document.getElementById("nombre-tecnico").textContent = (tecnico ? tecnico.nombre : sesionTecnico.nombre) + " Técnico";

  const mias = datos.ordenes.filter(o => o.tecnicoId === sesionTecnico.tecnicoId);
  const deHoy = mias.filter(o => o.fecha === hoy() && o.estado !== "Cancelado").sort((a, b) => a.hora.localeCompare(b.hora));
  const proximas = mias.filter(o => o.fecha > hoy() && ["Programado", "En ejecución"].includes(o.estado)).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const historial = mias.filter(o => ["Completado", "Cancelado"].includes(o.estado)).sort((a, b) => b.fecha.localeCompare(a.fecha));

  document.getElementById("res-visitas").textContent = deHoy.length;
  document.getElementById("res-completadas").textContent = deHoy.filter(o => o.estado === "Completado").length;
  document.getElementById("res-pendientes").textContent = deHoy.filter(o => o.estado !== "Completado").length;

  function itemVisita(o) {
    const estado = o.estado === "Programado" ? "Pendiente" : o.estado;
    return `<li>
      <a class="info" href="tecnico-visita.html?ods=${o.numero}" style="text-decoration:none;color:inherit;flex:1">
        <span class="icono" aria-hidden="true">📅</span>
        <div><strong>Cliente: ${seguro(nombreClienteT(o.clienteId))}</strong>
        <small>${o.numero} · ${seguro(textoServicios(o))} · ${textoDia(o.fecha)}, ${formatoHora(o.hora)}</small></div>
      </a>
      ${etiquetaEstado(estado)}
    </li>`;
  }

  document.getElementById("lista-visitas").innerHTML = deHoy.length
    ? deHoy.map(itemVisita).join("")
    : `<li class="vacio">No tienes visitas asignadas para hoy.</li>`;

  document.getElementById("lista-proximas").innerHTML = proximas.length
    ? proximas.map(itemVisita).join("")
    : `<li class="vacio">No tienes visitas programadas para los próximos días.</li>`;

  document.getElementById("tabla-historial").innerHTML = historial.length
    ? historial.map(o => `<tr>
        <td><strong>${o.numero}</strong></td>
        <td>${seguro(nombreClienteT(o.clienteId))}</td>
        <td>${seguro(textoServicios(o))}</td>
        <td>${formatoFecha(o.fecha)}</td>
        <td>${o.estado === "Completado" ? formatoHora(horasServicio(o).inicio) + " – " + formatoHora(horasServicio(o).fin || horasServicio(o).inicio) : "—"}</td>
        <td>${o.segundos ? horasServicio(o).duracion : "—"}</td>
        <td>${etiquetaEstado(o.estado)}</td></tr>`).join("")
    : `<tr><td colspan="7" class="vacio">Aún no tienes servicios cerrados.</td></tr>`;

  /*Mi firma: la registra el administrador; aquí solo se ve*/
  const tieneFirma = tecnico && tecnico.firma;
  document.getElementById("mi-firma-vista").innerHTML = tieneFirma
    ? `<img src="${tecnico.firma}" alt="Tu firma registrada">`
    : "Sin firma registrada";
  document.getElementById("mi-firma-texto").innerHTML = tieneFirma
    ? "✅ Tu firma está registrada y se pondrá <strong>automáticamente</strong> en los certificados al cerrar cada orden."
    : "⚠️ Aún no tienes firma registrada. Pídele al administrador que la cargue en el módulo <strong>Técnicos</strong>.";

  // Accesos directos del panel
  document.getElementById("ir-detalle").addEventListener("click", e => {
    e.preventDefault();
    const siguiente = deHoy.find(o => o.estado === "En ejecución") || deHoy.find(o => o.estado === "Programado");
    if (siguiente) location.href = "tecnico-visita.html?ods=" + siguiente.numero;
    else mostrarAviso("No tienes visitas pendientes hoy.", "info");
  });

  document.getElementById("ir-finalizar").addEventListener("click", e => {
    e.preventDefault();
    const enCurso = mias.find(o => o.estado === "En ejecución");
    if (enCurso) location.href = `tecnico-visita.html?ods=${enCurso.numero}&finalizar=1`;
    else mostrarAviso("Primero inicia una visita desde “Detalle de la visita”.", "info");
  });
}

/*P5. DETALLE DE LA VISITA*/
function pantallaDetalle() {
  const parametros = new URLSearchParams(location.search);
  const orden = buscarOrden(parametros.get("ods"));

  // Solo puede abrir sus propias visitas
  if (!orden || orden.tecnicoId !== sesionTecnico.tecnicoId) {
    location.href = "error.html?codigo=403";
    return;
  }

  const cliente = buscarCliente(orden.clienteId);
  const tecnico = buscarTecnico(orden.tecnicoId);
  orden.servicios = orden.servicios || [];
  orden.serviciosHechos = orden.serviciosHechos || [];

  const el = id => document.getElementById(id);
  const cronometro = el("cronometro");
  const numeroOrden = orden.numero;
  let intervalo = null;

  /* Vuelve a pedir la orden al servidor y actualiza el objeto "orden" que usa toda la pantalla */
  async function refrescar() {
    await recargarDatos();
    const nueva = buscarOrden(numeroOrden);
    if (!nueva) { location.href = "error.html?codigo=403"; return; }
    Object.keys(orden).forEach(k => delete orden[k]);
    Object.assign(orden, nueva);
    orden.servicios = orden.servicios || [];
    orden.serviciosHechos = orden.serviciosHechos || [];
  }

  /* Guardado automático (RF21): lo que el técnico escribe se envía al servidor a los 0,6 s de dejar de teclear */
  let pendiente = {};
  let temporizadorGuardado = null;
  function programarGuardado(parcial) {
    Object.assign(pendiente, parcial);
    clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(vaciarProgreso, 600);
  }
  async function vaciarProgreso() {
    clearTimeout(temporizadorGuardado);
    if (!Object.keys(pendiente).length) return true;
    const cuerpo = pendiente;
    pendiente = {};
    try {
      await api("PUT", "/ordenes/" + numeroOrden + "/progreso", cuerpo);
      return true;
    } catch (err) {
      errorApi(err);
      return false;
    }
  }
  const productosParaGuardar = () => orden.productos.map(p => ({ productoId: p.productoId, lote: p.lote || "", zona: p.zona || "", especie: p.especie || "" }));

  document.title = orden.numero + " | PEST CONTROL";
  el("visita-titulo").textContent = `${orden.numero} · ${cliente.nombre}`;
  el("visita-sub").textContent = `${textoServicios(orden)} · Área: ${orden.area} · ${cliente.direccion}`;
  el("visita-programada").textContent = `Programado: ${textoDia(orden.fecha)}, ${formatoHora(orden.hora)}`;
  el("chip-tecnico").innerHTML = `<span class="avatar">${iniciales(tecnico.nombre)}</span><span>${seguro(tecnico.nombre.toUpperCase())}</span>`;

  /*Acordeón (secciones plegables)*/
  document.querySelectorAll("#acordeon .acordeon-boton").forEach(boton => {
    boton.addEventListener("click", () => {
      const abierto = boton.getAttribute("aria-expanded") === "true";
      boton.setAttribute("aria-expanded", !abierto);
      el(boton.getAttribute("aria-controls")).classList.toggle("abierto", !abierto);
    });
  });

  /*Servicios a realizar (los define el administrador)*/
  function pintarTareas() {
    el("lista-tareas").innerHTML = orden.servicios.length
      ? orden.servicios.map((s, i) => `<li><label class="casilla" style="margin:0">
          <input type="checkbox" data-servicio="${i}" ${orden.serviciosHechos.includes(i) ? "checked" : ""}> ${seguro(s)}</label></li>`).join("")
      : `<li class="ayuda">Esta orden no tiene servicios definidos.</li>`;
  }

  el("lista-tareas").addEventListener("change", e => {
    const i = Number(e.target.dataset.servicio);
    if (e.target.checked) orden.serviciosHechos.push(i);
    else orden.serviciosHechos = orden.serviciosHechos.filter(x => x !== i);
    programarGuardado({ serviciosHechos: orden.serviciosHechos });
  });

  /*Productos utilizados (RF2–RF4, RF16) ----------
     Los asigna el administrador (producto + dosis). El técnico solo
     registra el lote, la zona donde se aplicó y la especie tratada. */

  // Sugerencias de especies según los servicios de la orden (el técnico puede escribir otra)
  const ESPECIES = {
    "cucaracha": ["Blattella germanica", "Periplaneta americana"],
    "roedor": ["Rattus norvegicus", "Rattus rattus", "Mus musculus"],
    "cebadera": ["Rattus norvegicus", "Rattus rattus", "Mus musculus"],
    "hormiga": ["Solenopsis sp.", "Monomorium pharaonis", "Tapinoma melanocephalum"],
    "termita": ["Cryptotermes brevis", "Nasutitermes sp.", "Coptotermes sp."],
    "mosquito": ["Aedes aegypti", "Culex quinquefasciatus"],
    "mosca": ["Musca domestica", "Drosophila melanogaster"],
    "chinche": ["Cimex lectularius"]
  };
  const textoOrden = textoServicios(orden).toLowerCase();
  let sugeridas = Object.keys(ESPECIES).filter(k => textoOrden.includes(k)).flatMap(k => ESPECIES[k]);
  if (!sugeridas.length) sugeridas = Object.values(ESPECIES).flat();
  el("lista-especies").innerHTML = [...new Set(sugeridas)].map(e => `<option value="${e}">`).join("");

  // Ficha de seguridad que subió el administrador (solo con la orden abierta)
  function fichaDelProducto(prod) {
    if (!prod || !prod.ficha) {
      return `<p class="ficha-producto sin-ficha">⚠️ Sin ficha de seguridad. Solicítala al administrador.</p>`;
    }
    if (["Completado", "Cancelado"].includes(orden.estado)) {
      return `<p class="ficha-producto sin-ficha">🔒 Ficha de seguridad disponible solo con la orden abierta.</p>`;
    }
    return `<div class="ficha-producto">
        <span class="icono-pdf-mini" aria-hidden="true">PDF</span>
        <span class="ficha-nombre">Ficha de seguridad <small>${seguro(prod.ficha.nombre)}</small></span>
        <span class="acciones">
          <button type="button" class="btn btn-secundario btn-chico" data-ver-ficha="${prod.id}" aria-label="Ver ficha de seguridad de ${seguro(prod.nombre)}">Ver</button>
          <button type="button" class="btn btn-primario btn-chico" data-descargar-ficha="${prod.id}" aria-label="Descargar ficha de seguridad de ${seguro(prod.nombre)}">Descargar</button>
        </span>
      </div>`;
  }

  el("lista-productos").addEventListener("click", e => {
    const ver = e.target.closest("[data-ver-ficha]");
    const descargar = e.target.closest("[data-descargar-ficha]");
    if (ver) abrirPdf(urlFicha(ver.dataset.verFicha));
    if (descargar) {
      const p = buscarProducto(descargar.dataset.descargarFicha);
      descargarPdf(urlFicha(p.id, true), p.ficha.nombre);
    }
  });

  function pintarProductos() {
    el("lista-productos").innerHTML = orden.productos.length
      ? orden.productos.map((p, i) => {
          const prod = buscarProducto(p.productoId);
          const nombre = prod ? prod.nombre : "Producto";
          return `<li>
            <div class="cabecera-producto">
              <div><strong>${seguro(nombre)}</strong></div>
            </div>
            <!-- Dosis y cantidad: las asigna el administrador y aparecen automáticamente -->
            <div class="datos-asignados">
              <div><span>Dosis</span><strong>${seguro(textoDosis(p))}</strong></div>
              <div><span>Cantidad a utilizar</span><strong>${seguro(textoCantidad(p))}</strong></div>
            </div>
            ${fichaDelProducto(prod)}
            <div class="fila-campos">
              <div class="campo">
                <label for="lote-${i}">Lote <span class="obligatorio" aria-hidden="true">*</span></label>
                <input type="text" id="lote-${i}" data-producto="${i}" data-dato="lote" value="${seguro(p.lote || "")}" placeholder="Ej: L-230915" autocomplete="off">
                <p class="mensaje-error"></p>
              </div>
              <div class="campo">
                <label for="especie-${i}">Especie tratada</label>
                <input type="text" id="especie-${i}" data-producto="${i}" data-dato="especie" value="${seguro(p.especie || "")}" list="lista-especies" placeholder="Ej: Blattella germanica" autocomplete="off">
                <p class="mensaje-error"></p>
              </div>
            </div>
            <div class="campo">
              <label for="zona-${i}">Zona(s) donde se aplicó <span class="obligatorio" aria-hidden="true">*</span></label>
              <input type="text" id="zona-${i}" data-producto="${i}" data-dato="zona" value="${seguro(p.zona || "")}" placeholder="Ej: cocina, desagües y bodega" autocomplete="off">
              <p class="mensaje-error"></p>
            </div>
          </li>`;
        }).join("")
      : `<li class="ayuda" style="border:none;background:none;padding:0">El administrador no asignó productos a esta orden.</li>`;
  }

  // Se guarda mientras el técnico escribe
  el("lista-productos").addEventListener("input", e => {
    const campo = e.target;
    if (!campo.dataset.producto) return;
    const dato = campo.dataset.dato;
    const registro = orden.productos[Number(campo.dataset.producto)];
    registro[dato] = (dato === "lote" ? campo.value.toUpperCase() : campo.value).trim();
    programarGuardado({ productos: productosParaGuardar() });
  });

  // Antes de finalizar: lote y zona son obligatorios en cada producto
  function productosCompletos() {
    let primero = null;
    el("lista-productos").querySelectorAll("[data-dato='lote'], [data-dato='zona']").forEach(campo => {
      quitarError(campo);
      let mensaje = "";
      if (!campo.value.trim()) {
        mensaje = campo.dataset.dato === "lote" ? "Escribe el lote del producto." : "Escribe dónde se aplicó.";
      }
      if (mensaje) {
        marcarError(campo, mensaje);
        primero = primero || campo;
      }
    });
    return primero;
  }

  /*Documentación (solo ver y descargar)
     Fichas de seguridad de los productos (las sube el administrador en Productos).
     Solo están disponibles mientras la orden esté abierta.*/
  function documentosDeLaOrden() {
    const fichas = [...new Set(orden.productos.map(p => p.productoId))]
      .map(id => buscarProducto(id))
      .filter(p => p && p.ficha)
      .map(p => ({ titulo: "Ficha de seguridad · " + p.nombre, productoId: p.id, ...p.ficha }));
    return fichas;
  }

  function pintarDocumentos() {
    const cerrada = ["Completado", "Cancelado"].includes(orden.estado);
    if (cerrada) {
      el("lista-documentos").innerHTML = `<li class="ayuda" style="border:none;background:none;padding:0">
        🔒 La orden está cerrada. Los documentos solo están disponibles mientras la orden esté abierta.</li>`;
      return;
    }
    const docs = documentosDeLaOrden();
    el("lista-documentos").innerHTML = docs.length
      ? docs.map((d, i) => `<li>
          <div class="info">
            <span class="icono-pdf" aria-hidden="true">PDF</span>
            <div style="min-width:0"><strong>${seguro(d.titulo)}</strong>
            <small style="display:block">${seguro(d.nombre)} · ${Math.max(1, Math.round(d.tamano / 1024))} KB</small></div>
          </div>
          <div class="acciones">
            <button type="button" class="btn btn-secundario btn-chico" data-ver-doc="${i}">Ver</button>
            <button type="button" class="btn btn-primario btn-chico" data-descargar-doc="${i}">Descargar</button>
          </div>
        </li>`).join("")
      : `<li class="ayuda" style="border:none;background:none;padding:0">Los productos de esta orden aún no tienen fichas de seguridad.</li>`;
  }

  el("lista-documentos").addEventListener("click", e => {
    const ver = e.target.closest("[data-ver-doc]");
    const descargar = e.target.closest("[data-descargar-doc]");
    const docs = documentosDeLaOrden();
    if (ver) abrirPdf(urlFicha(docs[Number(ver.dataset.verDoc)].productoId));
    if (descargar) {
      const d = docs[Number(descargar.dataset.descargarDoc)];
      descargarPdf(urlFicha(d.productoId, true), d.nombre);
    }
  });

  /* ---------- Incidencias y notas (RF21): se guardan mientras se escribe ---------- */
  document.querySelectorAll("[data-guardar]").forEach(caja => {
    caja.value = orden[caja.dataset.guardar] || "";
    caja.addEventListener("input", () => {
      orden[caja.dataset.guardar] = caja.value;
      programarGuardado({ [caja.dataset.guardar]: caja.value });
    });
  });

  /*Documentación: foto + ubicación GPS*/
  if (!Array.isArray(orden.evidencias)) orden.evidencias = [];

  // Muestra las fotos guardadas, cada una con su botón para quitarla
  function pintarGaleria() {
    el("galeria").innerHTML = orden.evidencias.map((foto, i) => `
      <figure style="position:relative;margin:0">
        <img src="${foto}" alt="Evidencia fotográfica ${i + 1}"
             style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--borde)">
        <button type="button" data-quitar-foto="${i}" aria-label="Quitar foto ${i + 1}"
                style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;border:none;background:var(--error);color:#fff;cursor:pointer">×</button>
      </figure>`).join("");
    if (orden.estado !== "En ejecución" || orden.pausado) {
      el("galeria").querySelectorAll("button").forEach(b => b.disabled = true);
    }
  }

  el("galeria").addEventListener("click", async e => {
    const boton = e.target.closest("[data-quitar-foto]");
    if (!boton) return;
    try {
      await api("DELETE", "/ordenes/" + numeroOrden + "/evidencias/" + orden.evidenciaIds[Number(boton.dataset.quitarFoto)]);
      await refrescar();
    } catch (err) {
      errorApi(err);
      return;
    }
    pintarGaleria();
  });

  // Reduce la foto (máx. 800 px) para que no ocupe tanto espacio al guardarla
  function reducirFoto(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 800 / Math.max(img.width, img.height));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
        resolve(lienzo.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  el("foto-evidencia").addEventListener("change", e => {
    const archivo = e.target.files[0];
    e.target.value = "";
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) {
      mostrarAviso("Solo se permiten imágenes (JPG, PNG…).", "error");
      return;
    }
    const lector = new FileReader();
    lector.onload = async () => {
      const foto = await reducirFoto(lector.result);
      if (!foto) {
        mostrarAviso("No se pudo leer la imagen. Intenta con otra.", "error");
        return;
      }
      try {
        await api("POST", "/ordenes/" + numeroOrden + "/evidencias", { imagen: foto });
        await refrescar();
      } catch (err) {
        errorApi(err);
        return;
      }
      pintarGaleria();
      mostrarAviso("Foto agregada. Aparecerá en el certificado.");
    };
    lector.readAsDataURL(archivo);
  });


  /*Cronómetro (siempre visible)*/
  function segundosTranscurridos() {
    return orden.segundos + (orden.inicio ? (Date.now() - orden.inicio) / 1000 : 0);
  }

  function actualizarCronometro() {
    cronometro.textContent = formatoDuracion(segundosTranscurridos());
  }

  function arrancarCronometro() {
    clearInterval(intervalo);
    intervalo = setInterval(actualizarCronometro, 1000);
    cronometro.classList.add("corriendo");
  }

  function detenerIntervalo() {
    clearInterval(intervalo);
    cronometro.classList.remove("corriendo");
  }

  /*Estado de la pantalla según la orden*/
  // Los documentos (Ver / Descargar) siempre se pueden consultar, aunque la visita no haya iniciado
  function habilitarRegistro(habilitar) {
    document.querySelectorAll("#acordeon .acordeon-panel input, #acordeon .acordeon-panel select, #acordeon .acordeon-panel textarea, #acordeon .acordeon-panel button")
      .forEach(control => {
        if (control.closest("#lista-documentos") || control.closest(".ficha-producto")) return;
        control.disabled = !habilitar;
      });
  }

  function textoUbicacion(gps) {
    if (!gps) return "No registrada";
    return `${gps.lat}, ${gps.lon}${gps.precision ? ` (±${gps.precision} m)` : ""}${gps.prueba ? " · 🧪 ubicación de prueba" : ""}`;
  }

  function pintarTiempos() {
    const caja = el("registro-tiempos");
    caja.hidden = !orden.horaInicio;
    if (!orden.horaInicio) return;
    const h = horasServicio(orden);
    el("dato-inicio").textContent = formatoHora(h.inicio);
    el("dato-fin").textContent = orden.estado === "Completado" && h.fin ? formatoHora(h.fin)
      : orden.estado === "Cancelado" ? "Cancelado" : "En curso…";
    el("dato-ubicacion").textContent = textoUbicacion(orden.gpsInicio);
  }

  function pintarEstado() {
    detenerIntervalo();
    pintarTiempos();
    pintarProductos();
    pintarDocumentos();
    const avisoEstado = el("aviso-estado");
    el("botones-inicio").hidden = orden.estado !== "Programado";
    el("botones-trabajo").hidden = orden.estado !== "En ejecución";
    el("bloque-cerrado").hidden = orden.estado !== "Completado";

    if (orden.estado === "Programado") {
      avisoEstado.hidden = false;
      avisoEstado.textContent = "Aún no has iniciado esta visita";
      habilitarRegistro(false);
    } else if (orden.estado === "En ejecución") {
      avisoEstado.hidden = !orden.pausado;
      avisoEstado.textContent = "Trabajo en pausa. Presiona “Reanudar trabajo” para continuar.";
      el("btn-pausar").textContent = orden.pausado ? "Reanudar trabajo" : "Pausar trabajo";
      habilitarRegistro(!orden.pausado);
      if (orden.inicio) arrancarCronometro();
    } else {
      habilitarRegistro(false);
      avisoEstado.hidden = orden.estado === "Completado";
      avisoEstado.textContent = "Este servicio fue cancelado.";
      if (orden.estado === "Completado") {
        const cert = datos.certificados.find(c => c.ods === orden.numero);
        el("texto-certificado").textContent = cert ? `Enviado a ${cert.correo || "el cliente"}` : "Generado";
      }
    }
    actualizarCronometro();
  }

  /*Botones de acción*/
  async function iniciarVisita(gps, mensaje) {
    try {
      await api("POST", "/ordenes/" + numeroOrden + "/iniciar", { gps });
      await refrescar();
    } catch (err) {
      el("btn-empezar").disabled = false;
      el("btn-empezar").textContent = "Empezar trabajo";
      errorApi(err);
      return;
    }
    el("btn-empezar").disabled = false;
    el("btn-empezar").textContent = "Empezar trabajo";
    el("error-ubicacion").hidden = true;
    el("btn-ubicacion-prueba").hidden = true;
    mostrarAviso(mensaje);
    pintarEstado();
  }

  // Muestra el error de ubicación y ofrece el modo de prueba (para portátiles sin GPS)
  function falloUbicacion(texto) {
    const boton = el("btn-empezar");
    el("error-ubicacion").textContent = texto;
    el("error-ubicacion").hidden = false;
    el("btn-ubicacion-prueba").hidden = false;
    boton.disabled = false;
    boton.textContent = "Reintentar: empezar trabajo";
  }

  /* Modo de prueba: solo aparece si falla la ubicación real. Queda marcado en el certificado. */
  el("btn-ubicacion-prueba").addEventListener("click", () => {
    if (!confirm("Se usará una ubicación SIMULADA y quedará marcada como \"ubicación de prueba\" en el certificado.\n\nÚsala solo para demostraciones. ¿Continuar?")) return;
    iniciarVisita(
      { lat: "2.44189", lon: "-76.60631", precision: null, prueba: true },
      "Visita iniciada con ubicación de prueba (demostración)."
    );
  });

  /* Empezar trabajo: se registran la hora de inicio y la ubicación GPS (obligatoria).
     Si no se obtiene la ubicación, la visita no inicia. */
  el("btn-empezar").addEventListener("click", () => {
    const boton = el("btn-empezar");
    const errorUbicacion = el("error-ubicacion");
    errorUbicacion.hidden = true;

    if (!navigator.geolocation) {
      falloUbicacion("⚠️ Este dispositivo no permite obtener la ubicación. No es posible iniciar la visita.");
      return;
    }

    boton.disabled = true;
    boton.textContent = "📍 Obteniendo ubicación…";

    // Si el técnico no responde al permiso de ubicación, el botón se libera a los 20 s
    let respondio = false;
    const limite = setTimeout(() => {
      if (respondio) return;
      respondio = true;
      falloUbicacion("⚠️ No se obtuvo la ubicación. Acepta el permiso de ubicación que muestra el navegador y vuelve a intentarlo. La ubicación es obligatoria.");
    }, 20000);

    navigator.geolocation.getCurrentPosition(
      pos => {
        if (respondio) return;
        respondio = true;
        clearTimeout(limite);
        iniciarVisita({
          lat: pos.coords.latitude.toFixed(5),
          lon: pos.coords.longitude.toFixed(5),
          precision: Math.round(pos.coords.accuracy)
        }, "Visita iniciada. Se registró la hora de inicio y tu ubicación.");
      },
      error => {
        if (respondio) return;
        respondio = true;
        clearTimeout(limite);
        const motivos = {
          1: "Debes permitir el acceso a la ubicación en el navegador para iniciar la visita.",
          2: "No se pudo determinar la ubicación. Activa el GPS e intenta de nuevo.",
          3: "La ubicación tardó demasiado. Intenta de nuevo en un lugar con mejor señal."
        };
        falloUbicacion("⚠️ " + (motivos[error.code] || "No se pudo obtener la ubicación.") + " La ubicación es obligatoria.");
        mostrarAviso("No se pudo iniciar: falta la ubicación.", "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });

  el("btn-pausar").addEventListener("click", async () => {
    const reanudar = orden.pausado;
    try {
      await vaciarProgreso();
      await api("POST", "/ordenes/" + numeroOrden + (reanudar ? "/reanudar" : "/pausar"), {});
      await refrescar();
    } catch (err) {
      errorApi(err);
      return;
    }
    if (reanudar) mostrarAviso("Trabajo reanudado.");
    else mostrarAviso("Trabajo en pausa.", "info");
    pintarEstado();
  });

  el("btn-anular").addEventListener("click", async () => {
    if (!confirm("¿Anular el trabajo? Se borrará el tiempo registrado y la visita volverá a quedar sin iniciar.")) return;
    try {
      await api("POST", "/ordenes/" + numeroOrden + "/anular", {});
      await refrescar();
    } catch (err) {
      errorApi(err);
      return;
    }
    mostrarAviso("Trabajo anulado. La visita quedó sin iniciar.", "info");
    pintarEstado();
  });

  async function cancelarTrabajo() {
    const motivo = prompt("¿Por qué se cancela el trabajo? (por ejemplo: cliente ausente)");
    if (motivo === null) return;
    if (!motivo.trim()) {
      mostrarAviso("Escribe el motivo para poder cancelar.", "error");
      return;
    }
    try {
      await vaciarProgreso();
      await api("POST", "/ordenes/" + numeroOrden + "/cancelar", { motivo: motivo.trim() });
      await refrescar();
    } catch (err) {
      errorApi(err);
      return;
    }
    mostrarAviso("El servicio fue cancelado.", "error");
    pintarEstado();
  }
  el("btn-cancelar").addEventListener("click", cancelarTrabajo);
  el("btn-cancelar-antes").addEventListener("click", cancelarTrabajo);

  el("btn-finalizar").addEventListener("click", () => {
    // Abre una sección del acordeón si está cerrada
    const abrirSeccion = id => {
      const boton = el("acordeon").querySelector(`[aria-controls="${id}"]`);
      if (boton.getAttribute("aria-expanded") !== "true") boton.click();
    };

    if (orden.servicios.length && !orden.serviciosHechos.length) {
      mostrarAviso("Marca al menos un servicio realizado antes de finalizar.", "error");
      abrirSeccion("panel-tareas");
      return;
    }
    const pendiente = productosCompletos();
    if (pendiente) {
      mostrarAviso("Completa el lote y la zona de aplicación de cada producto.", "error");
      abrirSeccion("panel-productos");
      pendiente.focus();
      return;
    }
    abrirFinalizar();
  });

  /*P6. FINALIZAR TRABAJO — FIRMA (RF17, RF19, RF22)*/
  const firmaCliente = crearFirma("lienzo-firma", "campo-firma", "btn-limpiar-firma", "imagen-firma");
  // La firma del técnico la carga el administrador y se pone sola al cerrar la orden
  function mostrarFirmaTecnico() {
    el("firma-tec-guardada").hidden = !tecnico.firma;
    el("firma-tec-falta").hidden = !!tecnico.firma;
    if (tecnico.firma) el("firma-tec-imagen").src = tecnico.firma;
  }

  function abrirFinalizar() {
    const inicio = orden.horaInicio ? new Date(orden.horaInicio) : new Date();
    const ahora = new Date();
    const dosDig = n => String(n).padStart(2, "0");
    const fechaCorta = d => `${dosDig(d.getDate())}/${dosDig(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
    const horaCorta = d => `${dosDig(d.getHours())}:${dosDig(d.getMinutes())}`;
    el("fin-hora-inicio").textContent = `${fechaCorta(inicio)} ${formatoHora(horaCorta(inicio))}`;
    el("fin-hora-fin").textContent = `${fechaCorta(ahora)} ${formatoHora(horaCorta(ahora))}`;
    el("fin-duracion").textContent = formatoDuracion(segundosTranscurridos());
    el("fin-ubicacion").textContent = textoUbicacion(orden.gpsInicio);
    el("fin-chip").innerHTML = el("chip-tecnico").innerHTML;

    el("fin-lista-servicios").innerHTML = serviciosRealizados(orden).map(t => `<li>✓ ${seguro(t.toUpperCase())}</li>`).join("") || "<li>Sin servicios</li>";

    abrirModal("modal-finalizar");
    el("correos-envio").value = cliente.correo;
    el("firma-tecnico-nombre").textContent = tecnico.nombre;
    firmaCliente.preparar();
    mostrarFirmaTecnico();
  }

  // Correos obligatorios solo si se marcó alguna casilla de envío
  function validarCorreos() {
    const campo = el("correos-envio");
    const enviar = el("enviar-parte").checked || el("enviar-certificado").checked;
    const correos = campo.value.split(",").map(c => c.trim()).filter(Boolean);
    if (enviar && !correos.length) {
      marcarError(campo, "Escribe al menos un correo para el envío.");
      return null;
    }
    const malo = correos.find(c => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c));
    if (malo) {
      marcarError(campo, `"${malo}" no es un correo válido.`);
      return null;
    }
    return correos;
  }

  el("form-finalizar").addEventListener("submit", async e => {
    e.preventDefault();
    let valido = validarFormulario(e.target);
    if (!firmaCliente.tieneFirma()) {
      firmaCliente.marcarFalta();
      valido = false;
    }
    const correos = validarCorreos();
    if (!valido || !correos) return;

    const boton = e.target.querySelector('button[type="submit"]');
    boton.disabled = true;
    const enviarCertificado = el("enviar-certificado").checked;
    const enviarParte = el("enviar-parte").checked;

    let r;
    try {
      // Antes de cerrar se guarda lo último que escribió el técnico. El servidor vuelve a revisar todo:
      // servicios marcados, lote y zona de cada producto, firma; descuenta el inventario y crea el certificado.
      programarGuardado({ productos: productosParaGuardar(), serviciosHechos: orden.serviciosHechos });
      if (!(await vaciarProgreso())) { boton.disabled = false; return; }
      r = await api("POST", "/ordenes/" + numeroOrden + "/finalizar", {
        firmadoPor: el("firma-nombre").value.trim(),
        documentoFirma: el("firma-documento").value.trim(),
        firmaImagen: firmaCliente.imagen(),
        correos, enviarCertificado, enviarParte
      });
      await refrescar();
    } catch (err) {
      boton.disabled = false;
      errorApi(err);
      return;
    }
    boton.disabled = false;

    cerrarModal("modal-finalizar");
    if (r.correoSolicitado && r.correoEnviado) mostrarAviso(`Certificado generado y enviado a ${correos.join(", ")}.`);
    else if (r.correoSolicitado && !r.correoConfigurado) mostrarAviso("Servicio finalizado. Certificado generado. El envío por correo no está configurado en el servidor.", "info");
    else if (r.correoSolicitado) mostrarAviso("Servicio finalizado. Certificado generado, pero el correo no pudo enviarse.", "error");
    else mostrarAviso("Servicio finalizado. Certificado generado.");
    if (r.descontados.length) mostrarAviso("Se descontó del inventario: " + r.descontados.join(", ") + ".", "info");
    if (r.sinStock.length) mostrarAviso("⚠️ El inventario no alcanzaba para: " + r.sinStock.join(", ") + ". Quedó en 0; avisa al administrador.", "error");
    pintarEstado();
  });

  el("btn-ver-certificado").addEventListener("click", () => {
    const cert = datos.certificados.find(c => c.ods === orden.numero);
    if (!cert) return;
    el("contenido-certificado").innerHTML = htmlCertificado(cert);
    el("btn-descargar").onclick = () => descargarCertificado(cert);
    abrirModal("modal-certificado");
  });

  /*Inicio*/
  pintarTareas();
  pintarProductos();
  pintarGaleria();
  pintarDocumentos();
  pintarEstado();
  if (parametros.get("finalizar") === "1" && orden.estado === "En ejecución") el("btn-finalizar").click();
}

/*Ejecutar la pantalla actual*/
accesoListo.then(ok => {
  if (!ok) return;
  if (document.getElementById("lista-visitas")) pantallaVisitas();
  if (document.getElementById("acordeon")) pantallaDetalle();
});

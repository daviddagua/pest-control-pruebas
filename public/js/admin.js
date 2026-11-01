const ESTADOS_ODS = ["Pendiente", "Programado", "En ejecución", "Completado", "Cancelado"];

function nombreCliente(id) {
  const c = buscarCliente(id);
  return c ? c.nombre : "—";
}

function nombreTecnico(id) {
  const t = buscarTecnico(id);
  return t ? t.nombre : "Sin asignar";
}
 //P2. DASHBOARD (RF10, RF14, RF18
function pantallaDashboard() {
  const mesActual = hoy().slice(0, 7);
  document.getElementById("kpi-hoy").textContent = datos.ordenes.filter(o => o.fecha === hoy() && o.estado !== "Cancelado").length;
  document.getElementById("kpi-tecnicos").textContent = datos.tecnicos.filter(t => t.estado === "Activo").length;
  document.getElementById("kpi-pendientes").textContent = datos.ordenes.filter(o => o.estado === "Pendiente").length;
  document.getElementById("kpi-mes").textContent = datos.ordenes.filter(o => o.fecha.slice(0, 7) === mesActual).length;

  // Órdenes recientes: las de número más alto primero
  const recientes = [...datos.ordenes]
    .sort((a, b) => b.numero.localeCompare(a.numero))
    .slice(0, 6);

  document.getElementById("tabla-recientes").innerHTML = recientes.map(o => `
    <tr>
      <td><strong>${o.numero}</strong></td>
      <td>${seguro(nombreCliente(o.clienteId))}</td>
      <td>${seguro(textoServicios(o))}</td>
      <td>${seguro(nombreTecnico(o.tecnicoId))}</td>
      <td>${etiquetaEstado(o.estado)}</td>
    </tr>`).join("");

  // Alertas de inventario
  const bajos = datos.productos.filter(p => p.stock <= p.minimo);
  document.getElementById("lista-stock").innerHTML = bajos.length
    ? bajos.map(p => `<li>
        <div class="info"><span class="icono" aria-hidden="true">🧪</span>
          <div><strong>${seguro(p.nombre)}</strong><small>Mínimo: ${p.minimo} ${p.unidad}</small></div></div>
        <span class="estado bajo">Quedan ${p.stock} ${p.unidad}</span></li>`).join("")
    : `<li class="vacio">Todo el inventario está en orden.</li>`;
}

/*CLIENTES (HU-01, RF14)*/
function pantallaClientes() {
  const tabla = document.getElementById("tabla-clientes");
  const buscador = document.getElementById("buscar-cliente");
  const form = document.getElementById("form-cliente");

  function pintar() {
    const texto = buscador.value.trim().toLowerCase();
    const lista = datos.clientes.filter(c =>
      c.nombre.toLowerCase().includes(texto) || c.documento.includes(texto) || c.correo.toLowerCase().includes(texto));

    document.getElementById("total-clientes").textContent = lista.length + " cliente(s)";
    tabla.innerHTML = lista.length ? lista.map(c => `
      <tr>
        <td><strong>${seguro(c.nombre)}</strong><br><small>${seguro(c.tipo)}</small></td>
        <td>${seguro(c.documento)}</td>
        <td>${seguro(c.telefono)}</td>
        <td>${seguro(c.correo)}</td>
        <td>${seguro(c.direccion)}</td>
        <td><div class="acciones">
          <button class="btn btn-secundario btn-chico" data-editar="${c.id}">Editar</button>
          <button class="btn btn-secundario btn-chico" data-historial="${c.id}">Historial</button>
          <a class="btn btn-primario btn-chico" href="admin-ordenes.html?cliente=${c.id}#nueva">Nueva ODS</a>
          <button class="btn btn-secundario btn-chico" data-enlace="${c.id}" title="Copia el enlace seguro para que el cliente entre a su portal">Copiar enlace</button>
        </div></td>
      </tr>`).join("")
      : `<tr><td colspan="6" class="vacio">No se encontraron clientes con "${seguro(texto)}".</td></tr>`;
  }

  buscador.addEventListener("input", pintar);

  document.getElementById("btn-nuevo-cliente").addEventListener("click", () => {
    document.getElementById("titulo-modal-cliente").textContent = "Registrar cliente";
    document.getElementById("cliente-id").value = "";
    abrirModal("modal-cliente");
  });

  tabla.addEventListener("click", async e => {
    const editar = e.target.closest("[data-editar]");
    const historial = e.target.closest("[data-historial]");
    const enlace = e.target.closest("[data-enlace]");

    // Enlace seguro del portal del cliente (el cliente entra con él, sin contraseña)
    if (enlace) {
      try {
        const { url } = await api("GET", "/clientes/" + enlace.dataset.enlace + "/enlace");
        try {
          await navigator.clipboard.writeText(url);
          mostrarAviso("Enlace copiado. Envíaselo al cliente: con él entra a su portal.", "info");
        } catch (e2) {
          prompt("Copia este enlace y envíaselo al cliente:", url);
        }
      } catch (err) { errorApi(err); }
    }

    if (editar) {
      const c = buscarCliente(editar.dataset.editar);
      abrirModal("modal-cliente");
      document.getElementById("titulo-modal-cliente").textContent = "Editar cliente";
      document.getElementById("cliente-id").value = c.id;
      document.getElementById("cliente-nombre").value = c.nombre;
      document.getElementById("cliente-documento").value = c.documento;
      document.getElementById("cliente-telefono").value = c.telefono;
      document.getElementById("cliente-correo").value = c.correo;
      document.getElementById("cliente-direccion").value = c.direccion;
      document.getElementById("cliente-tipo").value = c.tipo;
    }

    // RF14: historial de servicios del cliente
    if (historial) {
      const c = buscarCliente(historial.dataset.historial);
      const ordenes = datos.ordenes.filter(o => o.clienteId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
      document.getElementById("titulo-modal-historial").textContent = "Historial · " + c.nombre;
      document.getElementById("contenido-historial").innerHTML = ordenes.length
        ? `<ul class="lista">${ordenes.map(o => `<li>
            <div><strong>${o.numero}</strong> · ${seguro(textoServicios(o))}<small>${formatoFecha(o.fecha)} · ${seguro(nombreTecnico(o.tecnicoId))}</small></div>
            ${etiquetaEstado(o.estado)}</li>`).join("")}</ul>`
        : `<p class="vacio">Este cliente aún no tiene servicios.</p>`;
      abrirModal("modal-historial");
    }
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validarFormulario(form)) return;

    const id = Number(document.getElementById("cliente-id").value) || null;
    const cliente = {
      nombre: document.getElementById("cliente-nombre").value.trim(),
      documento: document.getElementById("cliente-documento").value.trim(),
      telefono: document.getElementById("cliente-telefono").value.trim(),
      correo: document.getElementById("cliente-correo").value.trim().toLowerCase(),
      direccion: document.getElementById("cliente-direccion").value.trim(),
      tipo: document.getElementById("cliente-tipo").value
    };

    // HU-01: el servidor evita duplicados (documento o correo repetido)
    try {
      if (id) await api("PUT", "/clientes/" + id, cliente);
      else await api("POST", "/clientes", cliente);
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    mostrarAviso(id ? "Cliente actualizado correctamente." : "Cliente registrado correctamente.");
    cerrarModal("modal-cliente");
    pintar();
  });

  pintar();
}

/*TÉCNICOS*/
function pantallaTecnicos() {
  const tabla = document.getElementById("tabla-tecnicos");
  const form = document.getElementById("form-tecnico");

  function pintar() {
    tabla.innerHTML = datos.tecnicos.map(t => {
      const asignadas = datos.ordenes.filter(o => o.tecnicoId === t.id && ["Programado", "En ejecución"].includes(o.estado)).length;
      return `<tr>
        <td><strong>${seguro(t.nombre)}</strong></td>
        <td>${seguro(t.especialidad)}</td>
        <td>${seguro(t.telefono)}</td>
        <td>${t.carga}</td>
        <td>${asignadas}</td>
        <td><div class="celda-firma">
          ${t.firma ? `<img class="mini-firma" src="${t.firma}" alt="Firma de ${seguro(t.nombre)}">` : '<small>Sin registrar</small>'}
          <button class="btn ${t.firma ? "btn-secundario" : "btn-primario"} btn-chico" data-firma="${t.id}">${t.firma ? "Cambiar" : "Cargar firma"}</button>
        </div></td>
        <td>${etiquetaEstado(t.estado)}</td>
        <td><button class="btn btn-secundario btn-chico" data-cambiar="${t.id}">
          ${t.estado === "Activo" ? "Inactivar" : "Activar"}</button></td>
      </tr>`;
    }).join("");
  }

  /*  Firma de cada técnico: la carga el administrador  */
  const firmaAdmin = crearFirma("lienzo-firma-admin", "campo-firma-admin", "btn-limpiar-firma-admin", "imagen-firma-admin");

  function abrirFirma(tecnico) {
    document.getElementById("firma-tec-id").value = tecnico.id;
    document.getElementById("titulo-modal-firma-tecnico").textContent = "Firma de " + tecnico.nombre;
    document.getElementById("btn-quitar-firma-admin").hidden = !tecnico.firma;
    abrirModal("modal-firma-tecnico");
    firmaAdmin.preparar();
    if (tecnico.firma) firmaAdmin.cargar(tecnico.firma); // muestra la firma actual
  }

  document.getElementById("form-firma-tecnico").addEventListener("submit", async e => {
    e.preventDefault();
    if (!firmaAdmin.tieneFirma()) {
      firmaAdmin.marcarFalta();
      return;
    }
    const t = buscarTecnico(document.getElementById("firma-tec-id").value);
    try {
      await api("PUT", "/tecnicos/" + t.id + "/firma", { imagen: firmaAdmin.imagen() });
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    cerrarModal("modal-firma-tecnico");
    mostrarAviso(`Firma de ${t.nombre} guardada. Se pondrá automáticamente en sus certificados.`);
    pintar();
  });

  document.getElementById("btn-quitar-firma-admin").addEventListener("click", async () => {
    const t = buscarTecnico(document.getElementById("firma-tec-id").value);
    if (!confirm(`¿Quitar la firma registrada de ${t.nombre}?`)) return;
    try {
      await api("DELETE", "/tecnicos/" + t.id + "/firma");
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    cerrarModal("modal-firma-tecnico");
    mostrarAviso("Firma eliminada.", "info");
    pintar();
  });

  tabla.addEventListener("click", async e => {
    const botonFirma = e.target.closest("[data-firma]");
    if (botonFirma) {
      abrirFirma(buscarTecnico(botonFirma.dataset.firma));
      return;
    }
    const boton = e.target.closest("[data-cambiar]");
    if (!boton) return;
    const t = buscarTecnico(boton.dataset.cambiar);
    if (t.estado === "Activo" && !confirm(`¿Inactivar a ${t.nombre}? No aparecerá en las sugerencias de asignación.`)) return;
    const nuevoEstado = t.estado === "Activo" ? "Inactivo" : "Activo";
    try {
      await api("PUT", "/tecnicos/" + t.id + "/estado", { estado: nuevoEstado });
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    mostrarAviso(`${t.nombre} ahora está ${nuevoEstado.toLowerCase()}.`);
    pintar();
  });

  document.getElementById("btn-nuevo-tecnico").addEventListener("click", () => abrirModal("modal-tecnico"));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validarFormulario(form)) return;
    try {
      await api("POST", "/tecnicos", {
        nombre: document.getElementById("tec-nombre").value.trim(),
        especialidad: document.getElementById("tec-especialidad").value,
        telefono: document.getElementById("tec-telefono").value.trim()
      });
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    cerrarModal("modal-tecnico");
    mostrarAviso("Técnico registrado correctamente.");
    pintar();
  });

  pintar();
}

/*P3. SERVICIOS (ÓRDENES) + CREAR / EDITAR ODS (HU-01, HU-03, RF10)
   El administrador define los servicios a realizar y los productos
   que usará el técnico (con su dosis).*/
function pantallaOrdenes() {
  const el = id => document.getElementById(id);
  const tabla = el("tabla-ordenes");
  const buscador = el("buscar-orden");
  const filtroEstado = el("filtro-estado");
  const seccionNueva = el("nueva");
  const seccionLista = el("lista-ordenes");
  const form = el("form-ods");
  const selectCliente = el("ods-cliente-existente");
  const camposCliente = ["c-nombre", "c-documento", "c-telefono", "c-correo", "c-direccion", "c-tipo"].map(el);

  let ordenEditando = null;   // orden que se está editando (null = orden nueva)
  let asignados = [];         // productos asignados: { productoId, dosisValor, dosisUnidad, usadoValor, usadoUnidad }

  llenarSelect(filtroEstado, ESTADOS_ODS.map(e => ({ valor: e, texto: e })), "Todos los estados");

  // Casillas de "Servicios a realizar"
  el("ods-servicios").innerHTML = SERVICIOS.map((s, i) => `
    <label class="casilla"><input type="checkbox" name="servicio" value="${s}" id="serv-${i}"> ${s}</label>`).join("");

  function llenarClientes() {
    llenarSelect(selectCliente,
      [{ valor: "nuevo", texto: "+ Registrar cliente nuevo" }, ...datos.clientes.map(c => ({ valor: c.id, texto: `${c.nombre} (${c.documento})` }))],
      "Selecciona un cliente...");
  }

  /*  Lista de órdenes */
  function pintar() {
    const texto = buscador.value.trim().toLowerCase();
    const estado = filtroEstado.value;
    const lista = [...datos.ordenes]
      .filter(o => !estado || o.estado === estado)
      .filter(o => o.numero.toLowerCase().includes(texto) || nombreCliente(o.clienteId).toLowerCase().includes(texto) || textoServicios(o).toLowerCase().includes(texto))
      .sort((a, b) => b.numero.localeCompare(a.numero));

    tabla.innerHTML = lista.length ? lista.map(o => `
      <tr>
        <td><strong>${o.numero}</strong></td>
        <td>${seguro(nombreCliente(o.clienteId))}</td>
        <td>${seguro(textoServicios(o))}</td>
        <td>${formatoFecha(o.fecha)} · ${formatoHora(o.hora)}</td>
        <td>${seguro(nombreTecnico(o.tecnicoId))}</td>
        <td>${etiquetaEstado(o.estado)}</td>
        <td><div class="acciones">
          <button class="btn btn-secundario btn-chico" data-ver="${o.numero}">Ver</button>
          ${["Pendiente", "Programado", "En ejecución"].includes(o.estado) ? `<button class="btn btn-secundario btn-chico" data-editar="${o.numero}">Editar</button>` : ""}
          ${o.estado === "Pendiente" ? `<a class="btn btn-primario btn-chico" href="admin-asignacion.html?ods=${o.numero}">Asignar</a>` : ""}
          ${["Pendiente", "Programado"].includes(o.estado) ? `<button class="btn btn-secundario btn-chico" data-cancelar="${o.numero}">Cancelar</button>` : ""}
        </div></td>
      </tr>`).join("")
      : `<tr><td colspan="7" class="vacio">No hay órdenes con esos filtros.</td></tr>`;
  }

  buscador.addEventListener("input", pintar);
  filtroEstado.addEventListener("change", pintar);

  tabla.addEventListener("click", async e => {
    const ver = e.target.closest("[data-ver]");
    const editar = e.target.closest("[data-editar]");
    const cancelar = e.target.closest("[data-cancelar]");

    if (ver) {
      const o = buscarOrden(ver.dataset.ver);
      const c = buscarCliente(o.clienteId);
      const productos = o.productos.map(p => {
        const prod = buscarProducto(p.productoId);
        return `<li>${seguro(prod ? prod.nombre : "Producto")} — dosis ${seguro(textoDosis(p))} · cantidad ${seguro(textoCantidad(p))}${prod && prod.ficha ? " · 📄 ficha" : ""}</li>`;
      }).join("") || "<li>Sin productos asignados</li>";
      el("titulo-modal-detalle").textContent = o.numero + " · " + c.nombre;
      el("contenido-detalle").innerHTML = `
        <p><strong>Estado:</strong> ${etiquetaEstado(o.estado)}</p>
        <p><strong>Servicios a realizar:</strong> ${seguro(textoServicios(o))}</p>
        <p><strong>Área a intervenir:</strong> ${seguro(o.area)}</p>
        <p><strong>Fecha programada:</strong> ${formatoFechaLarga(o.fecha)}, ${formatoHora(o.hora)}</p>
        <p><strong>Técnico:</strong> ${seguro(nombreTecnico(o.tecnicoId))}</p>
        ${o.estado === "Completado" ? `<p><strong>Hora de inicio:</strong> ${formatoHora(horasServicio(o).inicio)} · <strong>Finalización:</strong> ${formatoHora(horasServicio(o).fin || horasServicio(o).inicio)} · <strong>Duración:</strong> ${horasServicio(o).duracion}</p>` : ""}
        <p><strong>Dirección:</strong> ${seguro(c.direccion)} · Tel. ${seguro(c.telefono)}</p>
        <p><strong>Comentarios:</strong> ${seguro(o.comentarios || "Sin comentarios")}</p>
        <p style="margin-top:.6rem"><strong>Productos asignados:</strong></p>
        <ul style="margin-left:1.2rem">${productos}</ul>`;
      abrirModal("modal-detalle");
    }

    if (editar) mostrarFormulario(true, buscarOrden(editar.dataset.editar));

    if (cancelar) {
      const o = buscarOrden(cancelar.dataset.cancelar);
      if (!confirm(`¿Cancelar la orden ${o.numero}? Esta acción no se puede deshacer.`)) return;
      try {
        await api("POST", "/ordenes/" + o.numero + "/cancelar", {});
        await recargarDatos();
      } catch (err) {
        errorApi(err);
        return;
      }
      mostrarAviso(`La orden ${o.numero} fue cancelada.`, "info");
      pintar();
    }
  });

  /* Productos asignados a la orden: dosis y cantidad con unidades según el producto  */
  const opciones = (lista, actual) => lista.map(u => `<option ${u === actual ? "selected" : ""}>${u}</option>`).join("");

  function pintarAsignados() {
    el("ods-productos").innerHTML = asignados.length
      ? asignados.map((a, i) => {
          const prod = buscarProducto(a.productoId);
          const u = unidadesDe(prod);
          return `<li class="asignado" data-i="${i}">
            <div class="asignado-cabecera">
              <div><strong>${seguro(prod.nombre)}</strong>
                <small>Stock: ${prod.stock} ${seguro(prod.unidad)} · ${prod.ficha ? "📄 Con ficha de seguridad" : "⚠️ Sin ficha (súbela en Productos)"}</small></div>
              <button type="button" class="btn btn-secundario btn-chico" data-quitar-asignado="${i}" aria-label="Quitar ${seguro(prod.nombre)}">Quitar</button>
            </div>
            <div class="asignado-campos">
              <div class="campo">
                <label for="dosis-${i}">Dosis <span class="obligatorio" aria-hidden="true">*</span></label>
                <div class="valor-unidad">
                  <input type="number" id="dosis-${i}" data-campo="dosisValor" value="${a.dosisValor}" min="0" step="any" inputmode="decimal" placeholder="Ej: 15">
                  <select data-campo="dosisUnidad" aria-label="Unidad de la dosis">${opciones(u.dosis, a.dosisUnidad)}</select>
                </div>
                <p class="mensaje-error"></p>
              </div>
              <div class="campo">
                <label for="usado-${i}">Cantidad a utilizar <span class="obligatorio" aria-hidden="true">*</span></label>
                <div class="valor-unidad">
                  <input type="number" id="usado-${i}" data-campo="usadoValor" value="${a.usadoValor}" min="0" step="any" inputmode="decimal" placeholder="Ej: 250">
                  <select data-campo="usadoUnidad" aria-label="Unidad de la cantidad">${opciones(u.cantidad, a.usadoUnidad)}</select>
                </div>
                <small class="equivalencia" id="equiv-${i}"></small>
                <p class="mensaje-error"></p>
              </div>
            </div>
          </li>`;
        }).join("")
      : `<li class="ayuda" style="border:none;background:none;padding:.3rem 0">Aún no has asignado productos.</li>`;

    asignados.forEach((a, i) => mostrarEquivalencia(i));

    // En el selector solo aparecen los productos que no están asignados
    const libres = datos.productos.filter(p => !asignados.some(a => a.productoId === p.id));
    llenarSelect(el("ods-producto-sel"), libres.map(p => ({ valor: p.id, texto: `${p.nombre} (stock: ${p.stock} ${p.unidad})` })), "Selecciona un producto...");
  }

  // Muestra a cuánto equivale en inventario y avisa si no alcanza el stock
  function mostrarEquivalencia(i) {
    const a = asignados[i];
    const prod = buscarProducto(a.productoId);
    const caja = el("equiv-" + i);
    if (!caja) return;
    const enInventario = cantidadEnInventario(a);
    if (!enInventario) { caja.textContent = ""; caja.classList.remove("sin-stock"); return; }
    const falta = enInventario > prod.stock;
    caja.textContent = `= ${numeroBonito(enInventario)} ${prod.unidad} del inventario${falta ? ` · ⚠️ solo hay ${prod.stock} ${prod.unidad}` : ""}`;
    caja.classList.toggle("sin-stock", falta);
  }

  // Cambios en dosis / cantidad / unidades
  el("ods-productos").addEventListener("input", e => {
    const fila = e.target.closest(".asignado");
    if (!fila || !e.target.dataset.campo) return;
    const i = Number(fila.dataset.i);
    const campo = e.target.dataset.campo;
    asignados[i][campo] = campo.endsWith("Valor") ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value;
    if (e.target.getAttribute("aria-invalid")) quitarError(e.target);
    mostrarEquivalencia(i);
  });
  el("ods-productos").addEventListener("change", e => {
    if (e.target.tagName === "SELECT") e.target.dispatchEvent(new Event("input", { bubbles: true }));
  });

  el("btn-asignar-producto").addEventListener("click", () => {
    const prod = buscarProducto(el("ods-producto-sel").value);
    if (!prod) {
      mostrarAviso("Selecciona el producto que vas a asignar.", "error");
      el("ods-producto-sel").focus();
      return;
    }
    asignados.push({ productoId: prod.id, ...valoresPorDefecto(prod) });
    pintarAsignados();
    const i = asignados.length - 1;
    el(asignados[i].dosisValor === "" ? "dosis-" + i : "usado-" + i).focus();
  });

  el("ods-productos").addEventListener("click", e => {
    const boton = e.target.closest("[data-quitar-asignado]");
    if (!boton) return;
    asignados.splice(Number(boton.dataset.quitarAsignado), 1);
    pintarAsignados();
  });

  // Cada producto asignado debe tener dosis y cantidad mayores a 0
  function validarAsignados() {
    let primero = null;
    asignados.forEach((a, i) => {
      [["dosis-" + i, a.dosisValor, "Escribe la dosis."], ["usado-" + i, a.usadoValor, "Escribe la cantidad a utilizar."]].forEach(([id, valor, msg]) => {
        const campo = el(id);
        quitarError(campo);
        if (valor === "" || Number(valor) <= 0) {
          marcarError(campo, msg);
          primero = primero || campo;
        }
      });
    });
    if (primero) primero.focus();
    return !primero;
  }

  /*Mostrar el formulario (nuevo o edición)*/
  function mostrarFormulario(mostrar, orden = null) {
    seccionNueva.hidden = !mostrar;
    seccionLista.hidden = mostrar;
    ordenEditando = orden;

    if (!mostrar) {
      limpiarFormulario(form);
      asignados = [];
      selectCliente.disabled = false;
      cambiarCliente();
      history.replaceState(null, "", "admin-ordenes.html");
      return;
    }

    llenarClientes();
    limpiarFormulario(form);
    el("ods-fecha").min = hoy();

    if (orden) {
      // Modo edición
      el("titulo-form-ods").textContent = "Editar orden " + orden.numero;
      el("sub-form-ods").textContent = "Modifica los servicios, la fecha o los productos asignados. El cliente no se puede cambiar.";
      el("btn-guardar-ods").textContent = "Guardar cambios";
      el("ods-numero").textContent = orden.numero;
      selectCliente.value = orden.clienteId;
      cambiarCliente();
      selectCliente.disabled = true;
      form.querySelectorAll('input[name="servicio"]').forEach(c => c.checked = orden.servicios.includes(c.value));
      el("ods-area").value = orden.area;
      el("ods-fecha").value = orden.fecha;
      el("ods-hora").value = orden.hora;
      el("ods-comentarios").value = orden.comentarios || "";
      asignados = orden.productos.map(p => {
        const prod = buscarProducto(p.productoId);
        const base = valoresPorDefecto(prod);
        return {
          productoId: p.productoId,
          dosisValor: p.dosisValor ?? base.dosisValor, dosisUnidad: p.dosisUnidad || base.dosisUnidad,
          usadoValor: p.usadoValor ?? "", usadoUnidad: p.usadoUnidad || base.usadoUnidad
        };
      });
    } else {
      // Orden nueva
      el("titulo-form-ods").textContent = "Nueva orden de servicio (ODS)";
      el("sub-form-ods").textContent = "Registre el cliente (si es nuevo), los servicios a realizar y los productos que usará el técnico.";
      el("btn-guardar-ods").textContent = "Guardar y generar ODS";
      el("ods-numero").textContent = siguienteNumeroODS(); // RF10
      selectCliente.disabled = false;
      asignados = [];
      const id = new URLSearchParams(location.search).get("cliente");
      if (id) { selectCliente.value = id; cambiarCliente(); }
    }
    pintarAsignados();
    window.scrollTo(0, 0);
    selectCliente.focus();
  }

  // Si elige un cliente existente, sus datos se cargan y bloquean; si es nuevo, se habilitan
  function cambiarCliente() {
    const valor = selectCliente.value;
    const c = valor && valor !== "nuevo" ? buscarCliente(valor) : null;
    const valores = c ? [c.nombre, c.documento, c.telefono, c.correo, c.direccion, c.tipo] : ["", "", "", "", "", ""];
    camposCliente.forEach((campo, i) => {
      campo.value = valores[i];
      campo.disabled = valor !== "nuevo";
      quitarError(campo);
    });
  }

  selectCliente.addEventListener("change", cambiarCliente);
  el("btn-nueva-ods").addEventListener("click", () => mostrarFormulario(true));
  el("btn-cancelar-ods").addEventListener("click", () => {
    if (confirm(ordenEditando ? "¿Salir sin guardar los cambios?" : "¿Descartar la orden? Los datos escritos se perderán.")) mostrarFormulario(false);
  });

  // Quitar el error de servicios apenas marque uno
  el("ods-servicios").addEventListener("change", () => el("campo-servicios").classList.remove("con-error"));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    let valido = validarFormulario(form);

    const servicios = [...form.querySelectorAll('input[name="servicio"]:checked')].map(c => c.value);
    el("campo-servicios").classList.toggle("con-error", !servicios.length);
    if (!servicios.length) {
      if (valido) el("ods-servicios").querySelector("input").focus();
      valido = false;
    }
    if (!valido || !validarAsignados()) return;

    if (!asignados.length && !confirm("No asignaste productos a esta orden. ¿Guardar de todas formas?")) return;

    const datosOrden = {
      servicios,
      area: el("ods-area").value.trim(),
      fecha: el("ods-fecha").value,
      hora: el("ods-hora").value,
      comentarios: el("ods-comentarios").value.trim()
    };

    // Lo que se envía de cada producto asignado: producto, dosis y cantidad (el lote, zona y especie los llena el técnico)
    const productos = asignados.map(a => ({
      productoId: a.productoId, dosisValor: a.dosisValor, dosisUnidad: a.dosisUnidad,
      usadoValor: a.usadoValor, usadoUnidad: a.usadoUnidad
    }));
    const boton = el("btn-guardar-ods");
    boton.disabled = true;

    /*Guardar cambios de una orden existente*/
    if (ordenEditando) {
      try {
        await api("PUT", "/ordenes/" + ordenEditando.numero, { ...datosOrden, productos });
        await recargarDatos();
      } catch (err) {
        boton.disabled = false;
        errorApi(err);
        return;
      }
      boton.disabled = false;
      mostrarAviso(`Orden ${ordenEditando.numero} actualizada.`);
      mostrarFormulario(false);
      pintar();
      return;
    }

    /*Orden nueva*/
    const cuerpo = { ...datosOrden, productos };
    if (selectCliente.value === "nuevo") {
      // Cliente nuevo (HU-01): el servidor valida que el documento y el correo no estén repetidos
      cuerpo.cliente = {
        nombre: el("c-nombre").value.trim(),
        documento: el("c-documento").value.trim(),
        correo: el("c-correo").value.trim().toLowerCase(),
        telefono: el("c-telefono").value.trim(),
        direccion: el("c-direccion").value.trim(),
        tipo: el("c-tipo").value
      };
    } else {
      cuerpo.clienteId = Number(selectCliente.value);
    }

    let numero;
    try {
      ({ numero } = await api("POST", "/ordenes", cuerpo));   // RNF-06: el servidor garantiza que el número sea único
    } catch (err) {
      boton.disabled = false;
      errorApi(err);
      return;
    }
    mostrarAviso(`Orden ${numero} generada. Ahora asígnale un técnico.`);
    setTimeout(() => location.href = "admin-asignacion.html?ods=" + numero, 1200);
  });

  // Abrir el formulario directamente si la dirección termina en #nueva
  if (location.hash === "#nueva") mostrarFormulario(true);
  pintar();
}

/*P4. ASIGNACIÓN DE TÉCNICO EN CALENDARIO (HU-04, RF11)
   Agenda semanal: una fila por técnico y una columna por día.
   - Se arrastra una orden para asignarla o pasarla a otro técnico / día.
   - En celular se toca la orden y se mueve con una ventana.
   - El sistema recomienda al técnico más adecuado; el administrador decide.*/
function pantallaAsignacion() {
  const el = id => document.getElementById(id);
  const selectOds = el("asig-ods");
  const calendario = el("calendario");
  const PESO_CARGA = { Baja: 0, Media: 10, Alta: 25 };
  const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const MOVIBLES = ["Pendiente", "Programado"];
  let inicioSemana = null;   // lunes de la semana que se está viendo
  let arrastrada = null;     // número de la orden que se está arrastrando

  // Fechas en formato AAAA-MM-DD sin problemas de zona horaria
  const aFecha = texto => { const [a, m, d] = texto.split("-").map(Number); return new Date(a, m - 1, d); };
  const aTexto = f => f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0");
  const sumarDias = (f, n) => { const r = new Date(f); r.setDate(r.getDate() + n); return r; };
  const lunesDe = f => sumarDias(f, -((f.getDay() + 6) % 7));
  const minutos = hora => { const [h, m] = hora.split(":").map(Number); return h * 60 + m; };
  const claseEstado = estado => estado.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");

  const pendientes = () => datos.ordenes.filter(o => o.estado === "Pendiente");
  const ordenSeleccionada = () => buscarOrden(selectOds.value);

  /* Puntaje: menos es mejor (cercanía + carga laboral + tiempo estimado; bonifica la especialidad) */
  function puntaje(t, orden) {
    let p = t.distanciaKm * 3 + PESO_CARGA[t.carga] + t.tiempoMin / 2;
    if (!orden) return p;
    const servicios = textoServicios(orden).toLowerCase();
    const especialidades = t.especialidad.toLowerCase().split("/").map(x => x.trim()).filter(Boolean);
    if (especialidades.some(esp => servicios.includes(esp))) p -= 10;
    return p;
  }

  // Otras órdenes del técnico ese día a menos de 2 horas de la hora indicada
  function cruces(tecnicoId, fecha, hora, excluir) {
    return datos.ordenes.filter(o => o.numero !== excluir && o.tecnicoId === Number(tecnicoId) && o.fecha === fecha &&
      ["Programado", "En ejecución"].includes(o.estado) && Math.abs(minutos(o.hora) - minutos(hora)) < 120);
  }

  /*Mover una orden (lo usan el arrastre, el botón Asignar y la ventana de celular)*/
  async function moverOrden(numero, tecnicoId, fecha, hora, preguntar = true) {
    const orden = buscarOrden(numero);
    if (!orden || !MOVIBLES.includes(orden.estado)) return false;
    const nuevo = buscarTecnico(tecnicoId);
    const anterior = orden.tecnicoId ? buscarTecnico(orden.tecnicoId) : null;
    hora = hora || orden.hora;

    if (orden.tecnicoId === nuevo.id && orden.fecha === fecha && orden.hora === hora) return false;
    if (fecha < hoy()) {
      mostrarAviso("No se puede programar una orden en una fecha pasada.", "error");
      return false;
    }

    if (preguntar) {
      const desde = anterior ? `de ${anterior.nombre} (${formatoFechaLarga(orden.fecha)}, ${formatoHora(orden.hora)})` : "(sin asignar)";
      let pregunta = `¿Mover ${orden.numero} ${desde}\na ${nuevo.nombre} el ${formatoFechaLarga(fecha)} a las ${formatoHora(hora)}?`;
      const choques = cruces(nuevo.id, fecha, hora, orden.numero);
      if (choques.length) pregunta = `⚠️ ${nuevo.nombre} ya tiene ${choques.map(o => o.numero + " a las " + formatoHora(o.hora)).join(", ")} cerca de esa hora.\n\n` + pregunta;
      if (!confirm(pregunta)) return false;
    }

    // El servidor guarda la asignación, recalcula la carga del técnico y, si cambió el día u hora, avisa al cliente.
    try {
      await api("PUT", "/ordenes/" + orden.numero + "/asignar", { id_tecnico: nuevo.id, fecha, hora });
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return false;
    }
    mostrarAviso(anterior
      ? `${orden.numero} ahora es de ${nuevo.nombre} · ${formatoFechaLarga(fecha)}, ${formatoHora(hora)}.`
      : `${orden.numero} asignada a ${nuevo.nombre}. Estado: Programado.`);
    return true;
  }

  /* --- Dibujar el calendario --- */
  function pintar() {
    const lista = pendientes();
    el("caja-pendientes").hidden = !lista.length;

    if (lista.length) {
      const actual = selectOds.value;
      llenarSelect(selectOds, lista.map(o => ({ valor: o.numero, texto: `${o.numero} · ${nombreCliente(o.clienteId)} · ${formatoFecha(o.fecha)}` })));
      selectOds.value = lista.some(o => o.numero === actual) ? actual : lista[0].numero;
    } else {
      selectOds.innerHTML = "";
    }
    const orden = ordenSeleccionada();
    if (!inicioSemana) inicioSemana = lunesDe(orden ? aFecha(orden.fecha) : new Date());

    el("asig-resumen").innerHTML = orden
      ? `<strong>${orden.numero} · ${seguro(nombreCliente(orden.clienteId))}</strong> <span class="estado pendiente">Pendiente</span><br>
         ${seguro(textoServicios(orden))} · Área: ${seguro(orden.area)}<br>
         📅 ${formatoFechaLarga(orden.fecha)}, ${formatoHora(orden.hora)} — arrástrala al técnico o usa “Asignar”.`
      : `🎉 <strong>No hay órdenes pendientes por asignar.</strong><br>Puedes reorganizar la agenda arrastrando las órdenes programadas.`;

    const dias = [...Array(7)].map((_, i) => sumarDias(inicioSemana, i));
    const fin = dias[6];
    el("titulo-semana").textContent = `Semana del ${inicioSemana.getDate()} ${MESES[inicioSemana.getMonth()]} al ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;

    const tecnicos = datos.tecnicos.filter(t => t.estado === "Activo").sort((a, b) => puntaje(a, orden) - puntaje(b, orden));
    const mejor = orden ? tecnicos[0] : null;

    let html = `<div class="cal-cabecera cal-esquina">Técnico</div>` + dias.map(d => {
      const clase = [orden && aTexto(d) === orden.fecha ? "dia-orden" : "", aTexto(d) === hoy() ? "hoy" : ""].join(" ");
      return `<div class="cal-cabecera ${clase}">${DIAS[(d.getDay() + 6) % 7]} ${d.getDate()}<small>${MESES[d.getMonth()]}</small></div>`;
    }).join("");

    tecnicos.forEach(t => {
      const recomendado = t === mejor;
      html += `<div class="cal-tecnico ${recomendado ? "recomendado" : ""}">
          <strong>${seguro(t.nombre)}</strong>
          ${recomendado ? `<span class="insignia">⭐ Recomendado</span>` : ""}
          <small>${seguro(t.especialidad)}</small>
          <small>📍 ${t.distanciaKm.toFixed(1)} km · ⏱ ${t.tiempoMin} min</small>
          <small>Carga: ${t.carga}</small>
        </div>`;

      dias.forEach((d, i) => {
        const fecha = aTexto(d);
        const esDiaOrden = orden && fecha === orden.fecha;
        const eventos = datos.ordenes
          .filter(o => o.tecnicoId === t.id && o.fecha === fecha && o.estado !== "Pendiente")
          .sort((a, b) => a.hora.localeCompare(b.hora));
        const clases = ["cal-dia", esDiaOrden ? "dia-orden" : "", esDiaOrden && recomendado ? "recomendado" : "", i >= 5 ? "fin-semana" : ""].join(" ");

        html += `<div class="${clases}" data-tecnico="${t.id}" data-fecha="${fecha}">
          ${eventos.map(o => {
            const movible = MOVIBLES.includes(o.estado);
            const texto = `${formatoHora(o.hora)} · ${o.numero}<small>${seguro(nombreCliente(o.clienteId))}</small>`;
            return movible
              ? `<div role="button" tabindex="0" class="evento movible ${claseEstado(o.estado)}" draggable="true" data-ods="${o.numero}"
                   title="Arrastra o toca para mover ${o.numero}" aria-label="Mover ${o.numero} de ${seguro(t.nombre)}">${texto}</div>`
              : `<div class="evento ${claseEstado(o.estado)}" title="${o.numero} · ${o.estado} (no se puede mover)">${texto}</div>`;
          }).join("")}
          ${esDiaOrden ? `
            ${cruces(t.id, orden.fecha, orden.hora, orden.numero).length ? `<span class="cruce">⚠️ Cruce de horario</span>` : ""}
            <div role="button" tabindex="0" class="evento movible pendiente-nueva" draggable="true" data-ods="${orden.numero}"
                 title="Arrastra a la casilla del técnico" aria-label="Mover ${orden.numero}">${formatoHora(orden.hora)} · ${orden.numero}<small>Por asignar</small></div>
            <button class="btn ${recomendado ? "btn-primario" : "btn-secundario"} btn-chico" data-asignar="${t.id}"
                    aria-label="Asignar ${orden.numero} a ${seguro(t.nombre)}">Asignar</button>` : ""}
        </div>`;
      });
    });

    calendario.innerHTML = html;
    if (arrastrada) calendario.querySelectorAll(`[data-ods="${arrastrada}"]`).forEach(x => x.classList.add("arrastrando"));

    // En pantallas pequeñas, desplazar el calendario hasta el día de la orden (o hoy)
    const contenedor = calendario.parentElement;
    const destino = calendario.querySelector(".cal-cabecera.dia-orden") || calendario.querySelector(".cal-cabecera.hoy");
    if (destino && contenedor.scrollWidth > contenedor.clientWidth) {
      const anchoTecnico = calendario.querySelector(".cal-tecnico").offsetWidth;
      const izquierda = destino.getBoundingClientRect().left - calendario.getBoundingClientRect().left;
      contenedor.scrollLeft = Math.max(0, izquierda - anchoTecnico);
    }
  }

  /*Arrastrar y soltar (computador)*/
  calendario.addEventListener("dragstart", e => {
    const evento = e.target.closest(".evento.movible");
    if (!evento) return;
    arrastrada = evento.dataset.ods;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", arrastrada);
    setTimeout(() => {
      evento.classList.add("arrastrando");
      el("asig-contenido").classList.add("modo-arrastre");
    }, 0);
  });

  // Limpia el estado del arrastre (se escucha en todo el documento porque al cambiar
  // de semana la orden original se vuelve a dibujar)
  function terminarArrastre() {
    arrastrada = null;
    detenerCambioSemana();
    el("asig-contenido").classList.remove("modo-arrastre");
    calendario.querySelectorAll(".arrastrando, .soltar-aqui").forEach(x => x.classList.remove("arrastrando", "soltar-aqui", "con-cruce"));
  }
  document.addEventListener("dragend", terminarArrastre);

  /* Cambiar de semana mientras se arrastra: mantener la orden sobre ◀ o ▶ */
  let temporizadorSemana = null;
  function detenerCambioSemana() {
    clearInterval(temporizadorSemana);
    temporizadorSemana = null;
    document.querySelectorAll(".nav-semana .activo-arrastre").forEach(b => b.classList.remove("activo-arrastre"));
  }
  [["semana-anterior", -7], ["semana-siguiente", 7]].forEach(([id, dias]) => {
    const boton = el(id);
    boton.addEventListener("dragover", e => {
      if (!arrastrada) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (temporizadorSemana) return;
      boton.classList.add("activo-arrastre");
      temporizadorSemana = setInterval(() => {
        inicioSemana = sumarDias(inicioSemana, dias);
        pintar();
      }, 950);
    });
    boton.addEventListener("dragleave", detenerCambioSemana);
    boton.addEventListener("drop", e => { e.preventDefault(); detenerCambioSemana(); });
  });

  calendario.addEventListener("dragover", e => {
    const celda = e.target.closest(".cal-dia");
    if (!celda || !arrastrada) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!celda.classList.contains("soltar-aqui")) {
      calendario.querySelectorAll(".soltar-aqui").forEach(x => x.classList.remove("soltar-aqui", "con-cruce"));
      const orden = buscarOrden(arrastrada);
      celda.classList.add("soltar-aqui");
      celda.classList.toggle("con-cruce", cruces(celda.dataset.tecnico, celda.dataset.fecha, orden.hora, orden.numero).length > 0);
    }
  });

  calendario.addEventListener("dragleave", e => {
    const celda = e.target.closest(".cal-dia");
    if (celda && !celda.contains(e.relatedTarget)) celda.classList.remove("soltar-aqui", "con-cruce");
  });

  calendario.addEventListener("drop", async e => {
    const celda = e.target.closest(".cal-dia");
    if (!celda) return;
    e.preventDefault();
    const numero = e.dataTransfer.getData("text/plain") || arrastrada;
    celda.classList.remove("soltar-aqui", "con-cruce");
    terminarArrastre();
    if (await moverOrden(numero, celda.dataset.tecnico, celda.dataset.fecha)) pintar();
  });

  /*Clic: botón Asignar o tocar una orden para moverla (celular / teclado)*/
  calendario.addEventListener("click", async e => {
    const asignar = e.target.closest("[data-asignar]");
    if (asignar) {
      const orden = ordenSeleccionada();
      if (await moverOrden(orden.numero, asignar.dataset.asignar, orden.fecha)) pintar();
      return;
    }
    const evento = e.target.closest(".evento.movible");
    if (evento) abrirMover(evento.dataset.ods);
  });

  // Teclado: Enter o espacio sobre una orden abre la ventana para moverla
  calendario.addEventListener("keydown", e => {
    const evento = e.target.closest(".evento.movible");
    if (evento && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      abrirMover(evento.dataset.ods);
    }
  });

  function abrirMover(numero) {
    const orden = buscarOrden(numero);
    el("mover-ods").value = numero;
    el("titulo-modal-mover").textContent = "Mover " + numero;
    el("mover-resumen").innerHTML = `<strong>${seguro(nombreCliente(orden.clienteId))}</strong> · ${seguro(textoServicios(orden))}<br>
      Actualmente: ${orden.tecnicoId ? seguro(nombreTecnico(orden.tecnicoId)) : "sin asignar"} · ${formatoFechaLarga(orden.fecha)}, ${formatoHora(orden.hora)}`;
    abrirModal("modal-mover");
    llenarSelect(el("mover-tecnico"), datos.tecnicos.filter(t => t.estado === "Activo").map(t => ({ valor: t.id, texto: `${t.nombre} · ${t.especialidad}` })), "Selecciona...");
    el("mover-tecnico").value = orden.tecnicoId || "";
    el("mover-fecha").value = orden.fecha;
    el("mover-fecha").min = hoy();
    el("mover-hora").value = orden.hora;
    revisarCruce();
  }

  function revisarCruce() {
    const aviso = el("mover-cruce");
    const t = el("mover-tecnico").value, f = el("mover-fecha").value, h = el("mover-hora").value;
    const choques = t && f && h ? cruces(t, f, h, el("mover-ods").value) : [];
    aviso.hidden = !choques.length;
    aviso.textContent = choques.length ? `⚠️ Cruce de horario con ${choques.map(o => o.numero + " (" + formatoHora(o.hora) + ")").join(", ")}` : "";
  }
  ["mover-tecnico", "mover-fecha", "mover-hora"].forEach(id => el(id).addEventListener("change", revisarCruce));

  el("form-mover").addEventListener("submit", async e => {
    e.preventDefault();
    if (!validarFormulario(e.target)) return;
    if (el("mover-fecha").value < hoy()) {
      marcarError(el("mover-fecha"), "No puede ser una fecha pasada.");
      return;
    }
    const numero = el("mover-ods").value;
    const cruce = !el("mover-cruce").hidden;
    if (cruce && !confirm("Hay cruce de horario con otra orden del técnico. ¿Guardar de todas formas?")) return;
    if (await moverOrden(numero, el("mover-tecnico").value, el("mover-fecha").value, el("mover-hora").value, false)) {
      cerrarModal("modal-mover");
      inicioSemana = lunesDe(aFecha(buscarOrden(numero).fecha)); // mostrar la semana a donde quedó
      pintar();
    } else {
      cerrarModal("modal-mover");
    }
  });

  /*Navegación*/
  selectOds.addEventListener("change", () => {
    inicioSemana = lunesDe(aFecha(ordenSeleccionada().fecha));
    pintar();
  });
  el("semana-anterior").addEventListener("click", () => { inicioSemana = sumarDias(inicioSemana, -7); pintar(); });
  el("semana-siguiente").addEventListener("click", () => { inicioSemana = sumarDias(inicioSemana, 7); pintar(); });
  el("semana-hoy").addEventListener("click", () => { inicioSemana = lunesDe(new Date()); pintar(); });

  const odsUrl = new URLSearchParams(location.search).get("ods");
  if (odsUrl && buscarOrden(odsUrl) && buscarOrden(odsUrl).estado === "Pendiente") {
    llenarSelect(selectOds, [{ valor: odsUrl, texto: odsUrl }]);
    selectOds.value = odsUrl;
  }
  pintar();
}

/*PRODUCTOS / INSUMOS + FICHAS DE SEGURIDAD
   La ficha se sube una sola vez y aparece sola en todas las
   órdenes que usen ese producto.*/
function pantallaProductos() {
  const tabla = document.getElementById("tabla-productos");
  const buscador = document.getElementById("buscar-producto");
  const form = document.getElementById("form-producto");
  const formEntrada = document.getElementById("form-entrada");
  const inputFicha = document.getElementById("ficha-archivo");
  const LIMITE_PDF = 2 * 1024 * 1024; // 2 MB
  let productoFicha = null; // producto al que se le está subiendo la ficha

  function celdaFicha(p) {
    if (!p.ficha) {
      return `<button class="btn btn-primario btn-chico" data-subir-ficha="${p.id}">⬆ Subir PDF</button>`;
    }
    return `<div class="ficha-celda">
        <span class="icono-pdf-mini" aria-hidden="true">PDF</span>
        <small title="${seguro(p.ficha.nombre)}">${seguro(p.ficha.nombre)}</small>
      </div>
      <div class="acciones" style="margin-top:.3rem">
        <button class="btn btn-secundario btn-chico" data-ver-ficha="${p.id}">Ver</button>
        <button class="btn btn-secundario btn-chico" data-descargar-ficha="${p.id}">Descargar</button>
        <button class="btn btn-secundario btn-chico" data-subir-ficha="${p.id}">Reemplazar</button>
        <button class="btn btn-secundario btn-chico" data-quitar-ficha="${p.id}">Quitar</button>
      </div>`;
  }

  function pintar() {
    const texto = buscador.value.trim().toLowerCase();
    const soloBajos = document.getElementById("solo-bajos").checked;
    const lista = datos.productos
      .filter(p => p.nombre.toLowerCase().includes(texto) || p.tipo.toLowerCase().includes(texto))
      .filter(p => !soloBajos || p.stock <= p.minimo);

    tabla.innerHTML = lista.length ? lista.map(p => `
      <tr>
        <td><strong>${seguro(p.nombre)}</strong></td>
        <td>${seguro(p.tipo)}</td>
        <td>${p.stock} ${seguro(p.unidad)}</td>
        <td>${p.minimo} ${seguro(p.unidad)}</td>
        <td>${seguro(p.dosis)}</td>
        <td>${celdaFicha(p)}</td>
        <td>${p.stock <= p.minimo ? '<span class="estado bajo">Stock bajo</span>' : '<span class="estado ok">Disponible</span>'}</td>
        <td><div class="acciones">
          <button class="btn btn-primario btn-chico" data-entrada="${p.id}">+ Entrada</button>
          <button class="btn btn-secundario btn-chico" data-movimientos="${p.id}">Movimientos</button>
        </div></td>
      </tr>`).join("")
      : `<tr><td colspan="8" class="vacio">No hay productos con esos filtros.</td></tr>`;
  }

  buscador.addEventListener("input", pintar);
  document.getElementById("solo-bajos").addEventListener("change", pintar);
  document.getElementById("btn-nuevo-producto").addEventListener("click", () => abrirModal("modal-producto"));

  tabla.addEventListener("click", async e => {
    const entrada = e.target.closest("[data-entrada]");
    const movimientos = e.target.closest("[data-movimientos]");
    if (movimientos) {
      const p = buscarProducto(movimientos.dataset.movimientos);
      const lista = (datos.movimientos || []).filter(m => m.productoId === p.id).slice().reverse();
      document.getElementById("titulo-modal-movimientos").textContent = "Movimientos · " + p.nombre;
      document.getElementById("contenido-movimientos").innerHTML = `
        <p class="ayuda" style="margin-bottom:.8rem">Stock actual: <strong>${p.stock} ${seguro(p.unidad)}</strong></p>
        ${lista.length ? `<ul class="lista">${lista.map(m => `<li>
            <div><strong>${seguro(m.detalle)}</strong><small>${formatoFecha(m.fecha)}${m.tecnico ? " · " + seguro(m.tecnico) : ""}</small></div>
            <span class="estado ${m.cantidad < 0 ? "pendiente" : "completado"}">${m.cantidad > 0 ? "+" : ""}${m.cantidad} ${seguro(p.unidad)}</span>
          </li>`).join("")}</ul>` : `<p class="vacio">Aún no hay movimientos de este producto.</p>`}`;
      abrirModal("modal-movimientos");
    }
    const subir = e.target.closest("[data-subir-ficha]");
    const ver = e.target.closest("[data-ver-ficha]");
    const quitar = e.target.closest("[data-quitar-ficha]");
    const descargar = e.target.closest("[data-descargar-ficha]");
    if (descargar) {
      const p = buscarProducto(descargar.dataset.descargarFicha);
      descargarPdf(urlFicha(p.id, true), p.ficha.nombre);
    }

    if (entrada) {
      const p = buscarProducto(entrada.dataset.entrada);
      document.getElementById("entrada-id").value = p.id;
      document.getElementById("titulo-modal-entrada").textContent = "Entrada de inventario · " + p.nombre;
      document.getElementById("entrada-unidad").textContent = "Unidad: " + p.unidad + " · Stock actual: " + p.stock;
      abrirModal("modal-entrada");
    }
    if (subir) {
      productoFicha = buscarProducto(subir.dataset.subirFicha);
      inputFicha.click();
    }
    if (ver) {
      abrirPdf(urlFicha(buscarProducto(ver.dataset.verFicha).id));
    }
    if (quitar) {
      const p = buscarProducto(quitar.dataset.quitarFicha);
      if (!confirm(`¿Quitar la ficha de seguridad de ${p.nombre}? Dejará de aparecer en las órdenes.`)) return;
      try {
        await api("DELETE", "/productos/" + p.id + "/ficha");
        await recargarDatos();
      } catch (err) {
        errorApi(err);
        return;
      }
      mostrarAviso("Ficha de seguridad eliminada.", "info");
      pintar();
    }
  });

  // Subir o reemplazar la ficha de seguridad (PDF)
  inputFicha.addEventListener("change", async () => {
    const archivo = inputFicha.files[0];
    inputFicha.value = "";
    if (!archivo || !productoFicha) return;

    const esPdf = archivo.type === "application/pdf" || archivo.name.toLowerCase().endsWith(".pdf");
    if (!esPdf) {
      mostrarAviso("Solo se permiten archivos PDF.", "error");
      return;
    }
    if (archivo.size > LIMITE_PDF) {
      mostrarAviso(`El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB. El máximo es 2 MB.`, "error");
      return;
    }

    const producto = productoFicha;
    try {
      await api("PUT", "/productos/" + producto.id + "/ficha", { nombre: archivo.name, datos: await leerArchivo(archivo) });
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    mostrarAviso(`Ficha de seguridad de ${producto.nombre} guardada. Ya aparece en las órdenes que usan este producto.`);
    pintar();
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validarFormulario(form)) return;
    try {
      await api("POST", "/productos", {
        nombre: document.getElementById("prod-nombre").value.trim(),
        tipo: document.getElementById("prod-tipo").value,
        stock: Number(document.getElementById("prod-stock").value),
        minimo: Number(document.getElementById("prod-minimo").value),
        unidad: document.getElementById("prod-unidad").value,
        dosis: document.getElementById("prod-dosis").value.trim()
      });
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    cerrarModal("modal-producto");
    mostrarAviso("Producto registrado. Ahora puedes subir su ficha de seguridad.");
    pintar();
  });

  formEntrada.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validarFormulario(formEntrada)) return;
    const p = buscarProducto(document.getElementById("entrada-id").value);
    const cantidad = Number(document.getElementById("entrada-cantidad").value);
    if (cantidad <= 0) {
      marcarError(document.getElementById("entrada-cantidad"), "La cantidad debe ser mayor a 0.");
      return;
    }
    let stock;
    try {
      ({ stock } = await api("POST", "/productos/" + p.id + "/entrada", { cantidad }));
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    cerrarModal("modal-entrada");
    mostrarAviso(`Se sumaron ${cantidad} ${p.unidad} a ${p.nombre}. Nuevo stock: ${stock}.`);
    pintar();
  });

  pintar();
}

/*CERTIFICADOS (HISTORIAL)*/
function pantallaCertificados() {
  const tabla = document.getElementById("tabla-certificados");
  const buscador = document.getElementById("buscar-certificado");

  function pintar() {
    const texto = buscador.value.trim().toLowerCase();
    const lista = [...datos.certificados]
      .filter(c => c.ods.toLowerCase().includes(texto) || nombreCliente(c.clienteId).toLowerCase().includes(texto))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    tabla.innerHTML = lista.length ? lista.map(c => `
      <tr>
        <td><strong>${c.ods}</strong></td>
        <td>${seguro(nombreCliente(c.clienteId))}</td>
        <td>${formatoFecha(c.fecha)}</td>
        <td>${seguro(c.servicio)}</td>
        <td>${seguro(c.tecnico)}</td>
        <td>${seguro(c.firmadoPor)}</td>
        <td>${etiquetaEstado(c.estado)}</td>
        <td><div class="acciones">
          <button class="btn btn-secundario btn-chico" data-ver="${c.ods}">Ver</button>
          <button class="btn btn-secundario btn-chico" data-reenviar="${c.ods}">Reenviar</button>
        </div></td>
      </tr>`).join("")
      : `<tr><td colspan="8" class="vacio">No hay certificados que coincidan.</td></tr>`;
  }

  buscador.addEventListener("input", pintar);

  tabla.addEventListener("click", async e => {
    const ver = e.target.closest("[data-ver]");
    const reenviar = e.target.closest("[data-reenviar]");
    if (ver) {
      const cert = datos.certificados.find(c => c.ods === ver.dataset.ver);
      document.getElementById("contenido-certificado").innerHTML = htmlCertificado(cert);
      document.getElementById("btn-descargar").onclick = () => descargarCertificado(cert);
      abrirModal("modal-certificado");
    }
    if (reenviar) {
      const cert = datos.certificados.find(c => c.ods === reenviar.dataset.reenviar);
      try {
        const r = await api("POST", "/certificados/" + cert.ods + "/reenviar", {});
        await recargarDatos();
        mostrarAviso(`Certificado ${cert.ods} reenviado a ${r.correo}.`, "info");
        pintar();
      } catch (err) { errorApi(err); }
    }
  });

  pintar();
}

/*USUARIOS Y ROLES*/
function pantallaUsuarios() {
  const tabla = document.getElementById("tabla-usuarios");
  const form = document.getElementById("form-usuario");
  const sesion = obtenerSesion();

  function pintar() {
    tabla.innerHTML = datos.usuarios.map(u => `
      <tr>
        <td><strong>${seguro(u.nombre)}</strong><br><small>C.C. ${seguro(u.documento)}</small></td>
        <td>${seguro(u.correo)}</td>
        <td>
          <label class="oculto" for="rol-${u.id}">Rol de ${seguro(u.nombre)}</label>
          <select id="rol-${u.id}" data-rol="${u.id}" ${u.id === sesion.usuarioId ? "disabled" : ""}>
            <option ${u.rol === "Administrador" ? "selected" : ""}>Administrador</option>
            <option ${u.rol === "Técnico" ? "selected" : ""}>Técnico</option>
          </select>
        </td>
        <td>${etiquetaEstado(u.estado)}</td>
        <td>${u.id === sesion.usuarioId ? "<small>Tu cuenta</small>" :
          `<div class="acciones"><button class="btn btn-secundario btn-chico" data-estado="${u.id}">${u.estado === "Activo" ? "Inactivar" : "Activar"}</button>
           <button class="btn btn-peligro btn-chico" data-eliminar="${u.id}">Eliminar</button></div>`}</td>
      </tr>`).join("");
  }

  tabla.addEventListener("change", async e => {
    if (!e.target.dataset.rol) return;
    const u = datos.usuarios.find(x => x.id === Number(e.target.dataset.rol));
    try {
      await api("PUT", "/usuarios/" + u.id + "/rol", { rol: e.target.value });
      await recargarDatos();
      mostrarAviso(`${u.nombre} ahora tiene el rol ${e.target.value}.`);
    } catch (err) {
      errorApi(err);
    }
    pintar();   // deja el selector como quedó en el servidor
  });

  tabla.addEventListener("click", async e => {
    const eliminar = e.target.closest("[data-eliminar]");
    if (eliminar) {
      const u = datos.usuarios.find(x => x.id === Number(eliminar.dataset.eliminar));
      if (!confirm(`¿Eliminar a ${u.nombre}? Esta acción no se puede deshacer.`)) return;
      try {
        await api("DELETE", "/usuarios/" + u.id);
        await recargarDatos();
      } catch (err) {
        errorApi(err);
        return;
      }
      mostrarAviso("Usuario eliminado.");
      pintar();
      return;
    }
    const boton = e.target.closest("[data-estado]");
    if (!boton) return;
    const u = datos.usuarios.find(x => x.id === Number(boton.dataset.estado));
    if (u.estado === "Activo" && !confirm(`¿Inactivar a ${u.nombre}? No podrá iniciar sesión.`)) return;
    const nuevoEstado = u.estado === "Activo" ? "Inactivo" : "Activo";
    try {
      await api("PUT", "/usuarios/" + u.id + "/estado", { estado: nuevoEstado });
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    mostrarAviso(`Usuario ${nuevoEstado.toLowerCase()}.`);
    pintar();
  });

  document.getElementById("btn-nuevo-usuario").addEventListener("click", () => abrirModal("modal-usuario"));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validarFormulario(form)) return;
    try {
      await api("POST", "/usuarios", {
        nombre: document.getElementById("usu-nombre").value.trim(),
        documento: document.getElementById("usu-documento").value.trim(),
        correo: document.getElementById("usu-correo").value.trim().toLowerCase(),
        rol: document.getElementById("usu-rol").value,
        clave: document.getElementById("usu-clave").value
      });
      await recargarDatos();
    } catch (err) {
      errorApi(err);
      return;
    }
    cerrarModal("modal-usuario");
    mostrarAviso("Usuario creado. Ya puede iniciar sesión.");
    pintar();
  });

  pintar();
}

/*REPORTES*/
function pantallaReportes() {
  function grafica(id, conteo, color) {
    const max = Math.max(1, ...Object.values(conteo));
    const caja = document.getElementById(id);
    caja.innerHTML = Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([nombre, n]) => `
      <div class="barra-fila">
        <span>${seguro(nombre)}</span>
        <div class="barra-fondo" role="img" aria-label="${seguro(nombre)}: ${n}">
          <div class="barra-relleno" style="background:${color}" data-ancho="${(n / max) * 100}"></div>
        </div>
        <strong>${n}</strong>
      </div>`).join("");
  }

  function contar(lista, campo) {
    return lista.reduce((acc, item) => {
      const clave = typeof campo === "function" ? campo(item) : item[campo];
      acc[clave] = (acc[clave] || 0) + 1;
      return acc;
    }, {});
  }

  const completadas = datos.ordenes.filter(o => o.estado === "Completado");
  document.getElementById("rep-total").textContent = datos.ordenes.length;
  document.getElementById("rep-completadas").textContent = completadas.length;
  document.getElementById("rep-certificados").textContent = datos.certificados.length;
  document.getElementById("rep-clientes").textContent = datos.clientes.length;

  // Cada orden puede tener varios servicios: se cuenta cada uno
  const porServicio = {};
  datos.ordenes.forEach(o => (o.servicios || []).forEach(sv => porServicio[sv] = (porServicio[sv] || 0) + 1));
  grafica("graf-plaga", porServicio, "#2F6FED");
  grafica("graf-estado", contar(datos.ordenes, "estado"), "#101B3D");
  grafica("graf-tecnico", contar(datos.ordenes.filter(o => o.tecnicoId), o => nombreTecnico(o.tecnicoId)), "#1E8E5A");

  // Animación de las barras
  requestAnimationFrame(() => {
    document.querySelectorAll(".barra-relleno").forEach(b => b.style.width = b.dataset.ancho + "%");
  });

  document.getElementById("btn-imprimir").addEventListener("click", () => window.print());
}

/*Ejecutar la pantalla actual*/
const PANTALLAS_ADMIN = {
  dashboard: pantallaDashboard,
  clientes: pantallaClientes,
  tecnicos: pantallaTecnicos,
  ordenes: pantallaOrdenes,
  asignacion: pantallaAsignacion,
  productos: pantallaProductos,
  certificados: pantallaCertificados,
  usuarios: pantallaUsuarios,
  reportes: pantallaReportes
};

accesoListo.then(ok => { if (ok) PANTALLAS_ADMIN[document.body.dataset.menu](); });
/* Portal Cliente (RF24)
   El cliente entra con el enlace seguro que le llega por correo.*/

/* La sesión del cliente se crea al validar su enlace seguro (ver app.js), por eso se lee cuando se necesita */
function datosDelCliente() {
  const id = obtenerSesion().clienteId;
  return {
    cliente: buscarCliente(id),
    ordenes: datos.ordenes.filter(o => o.clienteId === id),
    certificados: datos.certificados.filter(c => c.clienteId === id).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    facturas: datos.facturas.filter(f => f.clienteId === id),
    avisos: datos.avisos.filter(a => a.clienteId === id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  };
}

function nombreTecnicoC(id) {
  const t = buscarTecnico(id);
  return t ? t.nombre : "Por asignar";
}

/*Resumen*/
function pantallaResumen() {
  const d = datosDelCliente();
  document.getElementById("nombre-cliente").textContent = d.cliente.nombre;
  document.getElementById("cli-servicios").textContent = d.ordenes.filter(o => o.estado !== "Cancelado").length;
  document.getElementById("cli-certificados").textContent = d.certificados.length;
  document.getElementById("cli-facturas").textContent = d.facturas.filter(f => f.estado !== "Pagada").length;

  document.getElementById("lista-cert-recientes").innerHTML = d.certificados.length
    ? d.certificados.slice(0, 3).map(c => `<li>
        <div class="info"><span class="icono" aria-hidden="true">📄</span>
        <div><strong>${c.ods}</strong><small>${seguro(c.servicio)} · ${formatoFecha(c.fecha)}</small></div></div>
        ${etiquetaEstado(c.estado)}</li>`).join("")
    : `<li class="vacio">Aún no tienes certificados.</li>`;

  document.getElementById("datos-cliente").innerHTML = `
    <p><strong>Nombre:</strong> ${seguro(d.cliente.nombre)}</p>
    <p><strong>NIT / C.C.:</strong> ${seguro(d.cliente.documento)}</p>
    <p><strong>Dirección:</strong> ${seguro(d.cliente.direccion)}</p>
    <p><strong>Teléfono:</strong> ${seguro(d.cliente.telefono)}</p>
    <p><strong>Correo:</strong> ${seguro(d.cliente.correo)}</p>
    <p class="nota-info">¿Algún dato está mal? Escríbenos por el chat de atención para actualizarlo.</p>`;
}

/*Servicios y visitas*/
function pantallaServicios() {
  const d = datosDelCliente();
  const proximas = d.ordenes.filter(o => ["Pendiente", "Programado", "En ejecución"].includes(o.estado))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const historial = [...d.ordenes].sort((a, b) => b.fecha.localeCompare(a.fecha));

  document.getElementById("lista-proximas-cliente").innerHTML = proximas.length
    ? proximas.map(o => `<li>
        <div class="info"><span class="icono" aria-hidden="true">📅</span>
        <div><strong>${seguro(textoServicios(o))} · ${o.numero}</strong>
        <small>${formatoFechaLarga(o.fecha)}, ${formatoHora(o.hora)} · Técnico: ${seguro(nombreTecnicoC(o.tecnicoId))}</small></div></div>
        ${etiquetaEstado(o.estado)}</li>`).join("")
    : `<li class="vacio">No tienes visitas programadas.</li>`;

  document.getElementById("tabla-servicios-cliente").innerHTML = historial.map(o => `<tr>
      <td><strong>${o.numero}</strong></td>
      <td>${formatoFecha(o.fecha)}</td>
      <td>${seguro(textoServicios(o))}</td>
      <td>${seguro(o.area)}</td>
      <td>${seguro(nombreTecnicoC(o.tecnicoId))}</td>
      <td>${etiquetaEstado(o.estado)}</td></tr>`).join("");
}

/*Certificados (RF24)*/
function pantallaCertificadosCliente() {
  const d = datosDelCliente();
  const tabla = document.getElementById("tabla-cert-cliente");

  tabla.innerHTML = d.certificados.length
    ? d.certificados.map(c => `<tr>
        <td><strong>${c.ods}</strong></td>
        <td>${formatoFecha(c.fecha)}</td>
        <td>${seguro(c.servicio)}</td>
        <td>${etiquetaEstado(c.estado)}</td>
        <td><button class="btn btn-secundario btn-chico btn-bloque" data-descargar="${c.ods}">Descargar</button></td></tr>`).join("")
    : `<tr><td colspan="5" class="vacio">Aún no tienes certificados.</td></tr>`;

  tabla.addEventListener("click", e => {
    const boton = e.target.closest("[data-descargar]");
    if (!boton) return;
    descargarCertificado(d.certificados.find(c => c.ods === boton.dataset.descargar));
  });
}

/*Facturas*/
function pantallaFacturas() {
  const d = datosDelCliente();
  document.getElementById("tabla-facturas").innerHTML = d.facturas.length
    ? d.facturas.map(f => `<tr>
        <td><strong>${f.numero}</strong></td>
        <td>${formatoFecha(f.fecha)}</td>
        <td>${seguro(f.concepto)}</td>
        <td>${formatoPesos(f.valor)}</td>
        <td>${etiquetaEstado(f.estado)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="vacio">No tienes facturas registradas.</td></tr>`;
}

/*Avisos*/
function pantallaAvisos() {
  const d = datosDelCliente();
  document.getElementById("lista-avisos").innerHTML = d.avisos.length
    ? d.avisos.map(a => `<li>
        <div class="info"><span class="icono" aria-hidden="true">🔔</span>
        <div><strong>${seguro(a.titulo)}</strong><small>${formatoFechaLarga(a.fecha)}</small>
        <p style="margin-top:.2rem">${seguro(a.texto)}</p></div></div></li>`).join("")
    : `<li class="vacio">No tienes avisos nuevos.</li>`;
}

const PANTALLAS_CLIENTE = {
  resumen: pantallaResumen,
  servicios: pantallaServicios,
  certificados: pantallaCertificadosCliente,
  facturas: pantallaFacturas,
  avisos: pantallaAvisos
};

accesoListo.then(ok => { if (ok) PANTALLAS_CLIENTE[document.body.dataset.menu](); });

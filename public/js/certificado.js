/*  Certificado de servicio
   Lo usan el administrador (historial), el técnico (al finalizar)
   y el cliente (descarga desde su portal). RF17, RF24, RNF-09*/

/* Sección "Incidencias": comentario del técnico + fotos de evidencia */
function incidenciasHtml(orden) {
  const texto = (orden.incidencias || "").trim();
  const fotos = Array.isArray(orden.evidencias) ? orden.evidencias : [];
  if (!texto && !fotos.length) return "";

  return `
    <h3 style="margin-top:.8rem;color:#101B3D">Incidencias</h3>
    ${texto
      ? `<p style="white-space:pre-line;background:#fdf3dc;border-left:4px solid #E8A317;padding:.5rem .8rem;border-radius:4px;margin-top:.3rem">${seguro(texto)}</p>`
      : `<p style="color:#6b7390;font-size:.85rem">Sin novedades registradas.</p>`}
    ${fotos.length ? `
      <p style="margin-top:.6rem;font-weight:700;font-size:.9rem">Evidencia fotográfica</p>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.3rem">
        ${fotos.map((foto, i) => `<img src="${foto}" alt="Evidencia fotográfica ${i + 1}"
          style="width:150px;height:110px;object-fit:cover;border-radius:6px;border:1px solid #D6DCEC">`).join("")}
      </div>` : ""}`;
}

function htmlCertificado(cert) {
  const orden = buscarOrden(cert.ods) || { servicios: [], productos: [], area: "", notaCliente: "" };
  const cliente = buscarCliente(cert.clienteId) || { nombre: "", documento: "", direccion: "" };
  // Tabla de productos aplicados: producto, dosis, lote, zona y especie (trazabilidad)
  const celda = "border:1px solid #D6DCEC;padding:.35rem .5rem;text-align:left;font-size:.85rem";
  const productos = orden.productos.length ? `
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;margin-top:.4rem;min-width:0">
      <thead><tr style="background:#101B3D;color:#fff">
        <th style="${celda}">Producto</th><th style="${celda}">Dosis</th><th style="${celda}">Cantidad usada</th><th style="${celda}">Lote</th>
        <th style="${celda}">Zona(s) de aplicación</th><th style="${celda}">Especie a tratar</th>
      </tr></thead>
      <tbody>${orden.productos.map(p => {
        const prod = buscarProducto(p.productoId);
        return `<tr>
          <td style="${celda}">${seguro(prod ? prod.nombre : "Producto")}</td>
          <td style="${celda}">${seguro(textoDosis(p))}</td>
          <td style="${celda}">${seguro(textoCantidad(p))}</td>
          <td style="${celda}">${seguro(p.lote || "—")}</td>
          <td style="${celda}">${seguro(p.zona || "—")}</td>
          <td style="${celda}">${p.especie ? "<em>" + seguro(p.especie) + "</em>" : "—"}</td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>` : "<p>Sin productos registrados.</p>";

  // Solo los servicios que el técnico marcó como realizados
  const servicios = serviciosRealizados(orden).map(s => `<li>${seguro(s)}</li>`).join("") || `<li>${seguro(cert.servicio)}</li>`;

  return `
    <article class="certificado">
      <header style="display:flex;align-items:center;gap:1rem;border-bottom:3px solid #101B3D;padding-bottom:.8rem;margin-bottom:1rem">
        <img src="img/logo.png" alt="Logo PEST CONTROL" style="width:70px;height:70px">
        <div>
          <strong style="font-size:1.2rem;color:#101B3D">PEST CONTROL</strong><br>
          <span style="color:#6b7390">Certificado de servicio de control de plagas</span>
        </div>
        <div style="margin-left:auto;text-align:right">
          <strong style="color:#2F6FED;font-size:1.1rem">${seguro(cert.ods)}</strong><br>
          <span>${formatoFecha(cert.fecha)}</span>
        </div>
      </header>

      <p><strong>Cliente:</strong> ${seguro(cliente.nombre)} · NIT/C.C. ${seguro(cliente.documento)}</p>
      <p><strong>Dirección:</strong> ${seguro(cliente.direccion)}</p>
      ${orden.area ? `<p><strong>Área intervenida:</strong> ${seguro(orden.area)}</p>` : ""}
      ${(() => {
        const h = horasServicio(orden);
        const caja = "background:#F3F5FB;border:1px solid #D6DCEC;border-radius:6px;padding:.4rem .6rem";
        return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.5rem;margin-top:.7rem">
          <div style="${caja}"><small style="color:#6b7390">Fecha del servicio</small><br><strong>${formatoFecha(cert.fecha)}</strong></div>
          <div style="${caja}"><small style="color:#6b7390">Hora de inicio</small><br><strong>${formatoHora(h.inicio)}</strong></div>
          <div style="${caja}"><small style="color:#6b7390">Hora de finalización</small><br><strong>${h.fin ? formatoHora(h.fin) : "—"}</strong></div>
          <div style="${caja}"><small style="color:#6b7390">Duración</small><br><strong>${h.duracion}</strong></div>
        </div>
        ${orden.gpsInicio ? `<p style="margin-top:.5rem;font-size:.85rem">📍 <strong>Ubicación al iniciar:</strong> ${seguro(orden.gpsInicio.lat)}, ${seguro(orden.gpsInicio.lon)}${orden.gpsInicio.precision ? ` (±${orden.gpsInicio.precision} m)` : ""}${orden.gpsInicio.prueba ? ` <em style="color:#b9770e">(ubicación de prueba – demostración)</em>` : ""}</p>` : ""}`;
      })()}

      <h3 style="margin-top:1rem;color:#101B3D">Servicios realizados</h3>
      <ul style="margin-left:1.2rem">${servicios}</ul>

      <h3 style="margin-top:.8rem;color:#101B3D">Productos aplicados</h3>
      ${productos}

      ${incidenciasHtml(orden)}

      ${orden.notaCliente ? `<h3 style="margin-top:.8rem;color:#101B3D">Recomendaciones</h3><p style="white-space:pre-line">${seguro(orden.notaCliente)}</p>` : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:1.5rem;align-items:end">
        <div>
          <div style="height:90px;display:flex;align-items:flex-end;justify-content:center">
            ${cert.firmaImagen
              ? `<img src="${cert.firmaImagen}" alt="Firma de ${seguro(cert.firmadoPor)}" style="max-height:90px;max-width:100%">`
              : `<span style="color:#6b7390;font-size:.8rem;font-style:italic">Sin firma digital (registro de ejemplo)</span>`}
          </div>
          <div style="border-top:1.5px solid #1b2340;padding-top:.4rem;text-align:center">
            <strong>${seguro(cert.firmadoPor)}</strong><br>
            <small>Recibe el servicio · Doc. ${seguro(cert.documentoFirma || "—")}</small>
          </div>
        </div>
        <div>
          <div style="height:90px;display:flex;align-items:flex-end;justify-content:center">
            ${cert.firmaTecnico
              ? `<img src="${cert.firmaTecnico}" alt="Firma de ${seguro(cert.tecnico)}" style="max-height:90px;max-width:100%">`
              : `<span style="color:#6b7390;font-size:.8rem;font-style:italic">${cert.firmaTecnico === null ? "Firma del técnico no registrada" : "Sin firma digital (registro de ejemplo)"}</span>`}
          </div>
          <div style="border-top:1.5px solid #1b2340;padding-top:.4rem;text-align:center">
            <strong>${seguro(cert.tecnico)}</strong><br>
            <small>Técnico responsable · PEST CONTROL</small>
          </div>
        </div>
      </div>

      <p style="margin-top:1rem;font-size:.8rem;color:#6b7390">
        Certificado generado automáticamente al finalizar el servicio y enviado a ${seguro(cert.correo || "el correo registrado")}.
      </p>
    </article>`;
}

/* "Descargar": abre el certificado en una ventana lista para guardar como PDF */
function descargarCertificado(cert) {
  const ventana = window.open("", "_blank");
  if (!ventana) {
    mostrarAviso("Tu navegador bloqueó la ventana. Permite las ventanas emergentes para descargar.", "error");
    return;
  }
  ventana.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Certificado ${cert.ods}</title>
    <base href="${location.href.substring(0, location.href.lastIndexOf("/") + 1)}">
    <style>body{font-family:"Segoe UI",Arial,sans-serif;max-width:760px;margin:2rem auto;padding:0 1rem;color:#1b2340;line-height:1.5}</style>
    </head><body>${htmlCertificado(cert)}</body></html>`);
  ventana.document.close();
  // Se abre el cuadro de impresión cuando cargan las imágenes (firmas y fotos)
  ventana.addEventListener("load", () => ventana.print());
}

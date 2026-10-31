// Carga los datos de demostración (los mismos del frontend original).
// Solo corre si la tabla "rol" está vacía, para no duplicar datos.
//   npm run seed
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const config = require("../src/config");
const db = require("../src/db");

const RAIZ = path.join(__dirname, "..");
const DEMO = path.join(RAIZ, "db", "demo");
const STORAGE = path.join(RAIZ, "storage");

const p2 = (n) => String(n).padStart(2, "0");
// Fecha AAAA-MM-DD sumando días a hoy (así siempre hay visitas "de hoy")
function fecha(dias) {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return f.getFullYear() + "-" + p2(f.getMonth() + 1) + "-" + p2(f.getDate());
}
const dt = (dias, hora) => fecha(dias) + " " + hora + ":00";
const token = () => crypto.randomBytes(12).toString("base64url");
const hash = (clave) => bcrypt.hashSync(clave, 10);

// Copia un archivo de demostración a storage con un nombre aleatorio y devuelve ese nombre.
function copiar(origen, carpeta, extension) {
  const nombre = crypto.randomBytes(16).toString("hex") + extension;
  fs.mkdirSync(path.join(STORAGE, carpeta), { recursive: true });
  fs.copyFileSync(path.join(DEMO, origen), path.join(STORAGE, carpeta, nombre));
  return nombre;
}

(async () => {
  try {
    const hay = await db.one("SELECT COUNT(*) AS n FROM rol");
    if (hay.n > 0) {
      console.log("La base ya tiene datos. Si quieres empezar de cero: npm run setup-db -- --reset y luego npm run seed.");
      return;
    }

    const tokens = {};
    await db.transaction(async (c) => {
      await c.query("INSERT INTO rol (id_rol, nombre_rol) VALUES (1,'Administrador'),(2,'Técnico')");

      await c.query(
        "INSERT INTO usuario (id_usuario, nombre_completo, documento, correo, contrasena, estado, id_rol) VALUES ?",
        [[
          [1, "Maria victoria", "1005934", "admin@pestcontrol.com", hash("Admin1234"), "activo", 1],
          [2, "David Liz", "1061700002", "tecnico@pestcontrol.com", hash("Tecnico123"), "activo", 2],
          [3, "santiago muñoz", "1061700003", "aleon@pestcontrol.com", hash("Tecnico123"), "activo", 2]
        ]]
      );

      const firmaDavid = copiar("firma-tecnico-1.png", "firmas", ".png");
      await c.query(
        "INSERT INTO tecnico (id_tecnico, id_usuario, nombre, telefono, especialidad, distancia_km, tiempo_min, estado, firma_ruta) VALUES ?",
        [[
          [1, 2, "David Liz", "3150001111", "Roedores / Termitas", 1.2, 25, "activo", firmaDavid],
          [2, 3, "santiago. muñoz", "3150002222", "Cucarachas", 4.8, 50, "activo", null],
          [3, null, "neiber. Restrepo", "3150003333", "Termitas", 6.1, 70, "activo", null],
          [4, null, "Juan carlos. Ramos", "3150004444", "Cucarachas / Roedores", 3.4, 40, "activo", null],
          [5, null, "Luis. Castro", "3150005555", "Mosquitos", 8.0, 65, "inactivo", null]
        ]]
      );

      const clientes = [
        [1, "Hotel torre de cal", "Empresa", "900456123-1", "3104567890", "gerencia@hotorrecali.com", "Cra 6 # 3-45, Popayán"],
        [2, "Panadería el antojo", "Empresa", "900321654-8", "3157894561", "contacto@panaderiantojo.com", "Calle 5 # 8-20, Popayán"],
        [3, "Res. Los paisas", "Conjunto residencial", "901112233-5", "3001239876", "admin@lospaisas.co", "Barrio Los Pinos, Mz 4"],
        [4, "Restaurante El Fogón", "Empresa", "900123456-1", "3214567812", "elfogon@gmail.com", "Cra 9 # 10-22, Popayán"],
        [5, "Carlos Muñoz", "Persona natural", "10543210", "3112223344", "carlos.munoz@hotmail.com", "Barrio Bolívar, Casa 7"]
      ];
      clientes.forEach((cl) => { tokens[cl[1]] = token(); cl.push(tokens[cl[1]]); });
      await c.query(
        "INSERT INTO cliente (id_cliente, nombre_empresa, tipo, documento, telefono, correo, direccion, token_acceso) VALUES ?",
        [clientes]
      );

      const fCip = copiar("FDS_Cipermetrina.pdf", "fichas", ".pdf");
      const fCebo = copiar("FDS_Cebo.pdf", "fichas", ".pdf");
      const fGel = copiar("FDS_Gel.pdf", "fichas", ".pdf");
      await c.query(
        `INSERT INTO producto (id_producto, nombre, tipo, unidad_medida, stock_disponible, stock_minimo,
                               dosis_referencia, ficha_nombre, ficha_ruta, ficha_tamano) VALUES ?`,
        [[
          [1, "Cipermetrina 20% EC", "Insecticida", "L", 8, 3, "15 ml/L", "FDS_Cipermetrina.pdf", fCip, 2252],
          [2, "Cebo rodenticida", "Rodenticida", "kg", 2, 5, "1 bloque por estación", "FDS_Cebo.pdf", fCebo, 2234],
          [3, "Gel cucarachicida", "Insecticida", "tubos", 14, 6, "1 punto cada 30 cm", "FDS_Gel.pdf", fGel, 2177],
          [4, "Fipronil 2.5%", "Termiticida", "L", 4, 2, "10 ml/L", null, null, null],
          [5, "Larvicida biológico", "Larvicida", "kg", 1, 2, "5 g por 100 L", null, null, null],
          [6, "Trampas adhesivas", "Trampa", "und", 60, 20, "—", null, null, null]
        ]]
      );

      // [id, ODS, cliente, técnico, fecha, hora, área, estado, comentarios, incidencias, notasTéc, notaCliente, segundos]
      const ordenes = [
        [1, "ODS-2452", 2, 1, 0, "10:30", "Cocina y bodega", "programado", "Revisar desagües de la cocina.", null, null, null, 0],
        [2, "ODS-2451", 1, 1, 0, "08:00", "Sótano y cocina", "finalizado", null, null, "Se sellaron 3 huecos en el sótano.", "Revisar estaciones en 15 días.", 2710],
        [3, "ODS-2454", 4, 1, 0, "15:00", "Comedor y patio", "programado", "El cliente pide horario de la tarde.", null, null, null, 0],
        [4, "ODS-2453", 3, null, 2, "09:00", "Salón comunal", "pendiente", "Madera del techo afectada.", null, null, null, 0],
        [5, "ODS-2450", 5, 2, 1, "17:00", "Patio y jardín", "en_proceso", null, null, null, null, 600],
        [6, "ODS-2401", 2, 2, -60, "07:00", "Toda la panadería", "finalizado", null, null, null, null, 3600],
        [7, "ODS-2355", 2, 1, -120, "08:30", "Bodega", "finalizado", null, null, null, null, 2400],
        [8, "ODS-2420", 4, 4, -20, "14:00", "Cocina", "cancelado", "Cliente reprogramará.", null, null, null, 0]
      ];
      for (const o of ordenes) {
        const [id, ods, cli, tec, dias, hora, area, estado, coment, inc, notasT, notaC, seg] = o;
        const prog = dt(dias, hora);
        const terminado = estado === "finalizado";
        const enCurso = estado === "en_proceso";
        await c.query(
          `INSERT INTO servicio (id_servicio, numero_ods, id_cliente, id_tecnico, fecha_programada, area, estado,
             observaciones, incidencias, notas_tecnicas, nota_cliente, fecha_ejecucion, fecha_fin,
             gps_lat, gps_lon, gps_precision, gps_prueba, segundos_acumulados, reanudado_en, pausado)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, ods, cli, tec, prog, area, estado, coment, inc, notasT, notaC,
            terminado || enCurso ? prog : null,
            terminado ? new Date(new Date(prog.replace(" ", "T")).getTime() + seg * 1000) : null,
            terminado || enCurso ? 2.44189 : null, terminado || enCurso ? -76.60631 : null,
            null, terminado || enCurso ? 1 : 0, seg, null, enCurso ? 1 : 0]
        );
      }
      // La orden terminada de hoy ya descontó su inventario
      await c.query("UPDATE servicio SET inventario_descontado = 1 WHERE estado = 'finalizado'");

      // [orden, servicios[], hechos[]]
      const items = [
        [1, ["Aspersión", "Colocación de cebos"], []],
        [2, ["Control de roedores", "Instalación de estaciones cebaderas"], [0, 1]],
        [3, ["Control de hormigas", "Inspección"], []],
        [4, ["Control de termitas", "Inspección"], []],
        [5, ["Control de mosquitos", "Nebulización"], []],
        [6, ["Fumigación general"], [0]],
        [7, ["Control de roedores"], [0]],
        [8, ["Control de moscas"], []]
      ];
      for (const [id, lista, hechos] of items) {
        await c.query("INSERT INTO servicio_item (id_servicio, posicion, nombre, realizado) VALUES ?",
          [lista.map((n, i) => [id, i, n, hechos.includes(i) ? 1 : 0])]);
      }

      // [orden, producto, posicion, dosisV, dosisU, usadoV, usadoU, cantidadInventario, lote, zona, especie]
      await c.query(
        `INSERT INTO servicio_producto (id_servicio, id_producto, posicion, dosis_valor, dosis_unidad,
           usado_valor, usado_unidad, cantidad_utilizada, lote, zona, especie) VALUES ?`,
        [[
          [1, 1, 0, 15, "ml/L", 250, "ml", 0.25, null, null, null],
          [1, 3, 1, 3, "puntos por m", 1, "tubos", 1, null, null, null],
          [2, 2, 0, 20, "g por estación", 400, "g", 0.4, "RB-231102", "Sótano y cocina", "Rattus norvegicus"],
          [3, 3, 0, 3, "puntos por m", 2, "tubos", 2, null, null, null],
          [4, 4, 0, 10, "ml/L", 500, "ml", 0.5, null, null, null],
          [5, 5, 0, 0.05, "g/L", 100, "g", 0.1, null, null, null],
          [6, 1, 0, 20, "ml/L", 300, "ml", 0.3, "CP-240211", "Toda la panadería", "Blattella germanica"],
          [7, 2, 0, 20, "g por estación", 300, "g", 0.3, "RB-230807", "Bodega", "Mus musculus"]
        ]]
      );

      const firma2451 = copiar("firma-tecnico-1.png", "firmas", ".png");
      const firma2355 = copiar("firma-tecnico-1.png", "firmas", ".png");
      await c.query(
        `INSERT INTO certificado (id_servicio, fecha_emision, nombre_firmante, documento_firmante,
           firma_tecnico_ruta, correo_destino, estado) VALUES ?`,
        [[
          [2, dt(0, "09:00"), "Laura Gómez", "34567890", firma2451, "gerencia@hotorrecali.com", "enviado"],
          [6, dt(-60, "08:30"), "Pedro Sol", "76543210", null, "contacto@panaderiantojo.com", "enviado"],
          [7, dt(-120, "09:30"), "Pedro Sol", "76543210", firma2355, "contacto@panaderiantojo.com", "enviado"]
        ]]
      );

      await c.query(
        "INSERT INTO movimiento_inventario (id_producto, id_servicio, cantidad, detalle, tecnico, fecha) VALUES ?",
        [[
          [2, 7, -0.3, "Usado en ODS-2355", "David Liz", fecha(-120)],
          [1, 6, -0.3, "Usado en ODS-2401", "santiago muñoz", fecha(-60)],
          [1, null, 5, "Entrada de inventario", null, fecha(-30)],
          [2, 2, -0.4, "Usado en ODS-2451", "David Liz", fecha(0)]
        ]]
      );

      await c.query("INSERT INTO factura (numero, id_cliente, fecha, concepto, valor, estado) VALUES ?", [[
        ["FAC-1032", 2, fecha(-60), "Fumigación general (ODS-2401)", 280000, "Pagada"],
        ["FAC-0988", 2, fecha(-120), "Control de roedores (ODS-2355)", 190000, "Pagada"]
      ]]);

      await c.query("INSERT INTO aviso (id_cliente, fecha, titulo, texto) VALUES ?", [[
        [2, fecha(0), "Visita programada para hoy", "El técnico David Liz llegará a las 10:30 a. m. para el servicio de aspersión y colocación de cebos (ODS-2452)."],
        [2, fecha(-55), "Recomendación posterior al servicio", "Mantén cerrados los recipientes de harina y limpia las migas al final del día."]
      ]]);
    });

    console.log("Datos de demostración cargados.\n");
    console.log("Cuentas para probar:");
    console.log("  Administrador: admin@pestcontrol.com    / Admin1234");
    console.log("  Técnico:       tecnico@pestcontrol.com  / Tecnico123");
    console.log("\nEnlace seguro del cliente «Panadería el antojo» (el cliente no usa contraseña):");
    console.log("  " + config.publicUrl + "/cliente.html?token=" + tokens["Panadería el antojo"]);
    console.log("(Después puedes copiar el enlace de cada cliente desde Administrador > Clientes.)");
  } catch (err) {
    console.error("No se pudieron cargar los datos:", err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();

/* ---------- Inicio de sesión ---------- */
const formLogin = document.getElementById("form-login");

if (formLogin) {
  // Mostrar / ocultar contraseña
  document.getElementById("ver-clave").addEventListener("change", e => {
    document.getElementById("login-clave").type = e.target.checked ? "text" : "password";
  });

  formLogin.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validarFormulario(formLogin)) return;

    const boton = formLogin.querySelector("button[type=submit]");
    boton.disabled = true;
    try {
      const s = await api("POST", "/auth/login", {
        correo: document.getElementById("login-correo").value.trim().toLowerCase(),
        clave: document.getElementById("login-clave").value
      }, { sinRedireccion: true });

      // El panel que se abre depende del rol
      guardarSesion(s);
      location.href = s.rol === "admin" ? "admin.html" : "tecnico.html";
    } catch (err) {
      // Credenciales inválidas o cuenta inactiva: se reutiliza la pantalla de error
      if (err.estado === 401 || err.estado === 403) {
        location.href = "error.html?codigo=" + err.estado;
        return;
      }
      boton.disabled = false;
      mostrarAviso(err.message, "error");
    }
  });

  // Recuperar contraseña
  document.getElementById("olvide-clave").addEventListener("click", e => {
    e.preventDefault();
    abrirModal("modal-recuperar");
  });

  const formRecuperar = document.getElementById("form-recuperar");
  formRecuperar.addEventListener("submit", e => {
    e.preventDefault();
    if (!validarFormulario(formRecuperar)) return;
    cerrarModal("modal-recuperar");
    mostrarAviso("Por ahora la clave no se restablece por correo. Comunícate con el administrador para recuperar tu acceso.", "info");
  });
}

/* ---------- Registro de usuario ---------- */
const formRegistro = document.getElementById("form-registro");

if (formRegistro) {
  const alerta = document.getElementById("alerta-registro");

  formRegistro.addEventListener("submit", async e => {
    e.preventDefault();
    alerta.classList.remove("visible");
    if (!validarFormulario(formRegistro)) return;

    if (!document.getElementById("reg-datos").checked) {
      alerta.textContent = "Debes autorizar el tratamiento de datos personales para crear la cuenta.";
      alerta.classList.add("visible");
      return;
    }

    // Las cuentas nuevas quedan como Técnico; el administrador puede cambiar el rol después.
    // Duplicados y reglas de la contraseña los vuelve a revisar el servidor.
    const boton = formRegistro.querySelector("button[type=submit]");
    boton.disabled = true;
    try {
      await api("POST", "/auth/registro", {
        nombre: document.getElementById("reg-nombre").value.trim(),
        correo: document.getElementById("reg-correo").value.trim().toLowerCase(),
        documento: document.getElementById("reg-documento").value.trim(),
        telefono: document.getElementById("reg-telefono").value.trim(),
        clave: document.getElementById("reg-clave").value
      }, { sinRedireccion: true });
      mostrarAviso("¡Cuenta creada! Ya puedes iniciar sesión.");
      setTimeout(() => location.href = "index.html", 1800);
    } catch (err) {
      boton.disabled = false;
      errorApi(err);
    }
  });
}

/* ---------- Pantalla de errores ---------- */
const codigoError = document.getElementById("error-codigo");

if (codigoError) {
  const ERRORES = {
    "401": { titulo: "Credenciales inválidas", detalle: "El usuario o la contraseña no son correctos, o tu sesión terminó. Verifica tus datos e intenta de nuevo.", accion: "Reintentar" },
    "403": { titulo: "Acceso no permitido", detalle: "Tu rol no tiene permiso para ver esta pantalla, o tu cuenta está inactiva. Si crees que es un error, comunícate con el administrador.", accion: "Ir al inicio de sesión" },
    "404": { titulo: "Página no encontrada", detalle: "La pantalla que buscas no existe o fue movida.", accion: "Volver al inicio" }
  };
  const codigo = new URLSearchParams(location.search).get("codigo") || "404";
  const error = ERRORES[codigo] || ERRORES["404"];

  codigoError.textContent = "ERR " + (ERRORES[codigo] ? codigo : "404");
  document.getElementById("error-titulo").textContent = error.titulo;
  document.getElementById("error-detalle").textContent = error.detalle;
  document.getElementById("error-accion").textContent = error.accion;
  document.title = error.titulo + " | PEST CONTROL";
}

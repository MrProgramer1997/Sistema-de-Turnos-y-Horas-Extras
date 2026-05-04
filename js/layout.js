document.addEventListener("DOMContentLoaded", async () => {
  if (esPaginaLoginSidebar()) return;

  let container = document.getElementById("sidebar-container");

  /*
    Regla defensiva:
    Algunos módulos administrativos pueden no traer el contenedor del sidebar
    o pueden quedar con una versión anterior del HTML. Si no existe, se crea
    sin tocar el resto de la página.
  */
  if (!container) {
    container = document.createElement("div");
    container.id = "sidebar-container";
    document.body.prepend(container);
  }

  try {
    const html = await cargarHtmlSidebarSeguro();
    container.innerHTML = html;

    aplicarPermisosSidebar();
    activarLinkActivo();
    configurarLogout();
    configurarToggleMobile();

  } catch (error) {
    console.error("Error cargando sidebar:", error);
  }
});

function esPaginaLoginSidebar() {
  const page = String(window.location.pathname.split("/").pop() || "").toLowerCase();
  return page.includes("login");
}

async function cargarHtmlSidebarSeguro() {
  const rutas = [
    "../components/sidebar.html?v=roles-20260504-fix-admin",
    "./components/sidebar.html?v=roles-20260504-fix-admin",
    "/components/sidebar.html?v=roles-20260504-fix-admin"
  ];

  let ultimoError = null;

  for (const ruta of rutas) {
    try {
      const response = await fetch(ruta);
      if (!response.ok) {
        ultimoError = new Error(`No se pudo cargar ${ruta}`);
        continue;
      }

      const html = await response.text();
      if (html && html.trim()) return html;
    } catch (error) {
      ultimoError = error;
    }
  }

  throw ultimoError || new Error("No se pudo cargar el sidebar.");
}

function obtenerSesionActualSidebar() {
  const llaves = [
    "ccp_sesion",
    "usuarioActual",
    "empleadoActual",
    "sessionUser",
    "userData",
    "authUser",
    "usuarioLogueado",
    "empleadoSesion"
  ];

  for (const llave of llaves) {
    const raw = localStorage.getItem(llave) || sessionStorage.getItem(llave);
    if (!raw) continue;

    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch (error) {
      continue;
    }
  }

  return null;
}

function normalizarTextoSidebar(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function obtenerRolSidebar(sesion) {
  if (!sesion) return "empleado";

  const rolPrincipal = normalizarTextoSidebar(
    sesion.rol ||
    sesion.tipo_usuario ||
    sesion.perfil ||
    ""
  );

  if (!rolPrincipal) return "empleado";

  if (rolPrincipal === "empleado") return "empleado";
  if (rolPrincipal.includes("admin") || rolPrincipal.includes("administrador")) return "admin";
  if (rolPrincipal.includes("gerencia") || rolPrincipal.includes("gerente")) return "gerencia";
  if (rolPrincipal.includes("bienestar")) return "bienestar";
  if (rolPrincipal.includes("direccion_financiera") || rolPrincipal.includes("direccion_administrativa")) return "direccion_financiera";
  if (rolPrincipal.includes("servicios_generales")) return "servicios_generales";

  /*
    Importante:
    A&B solo cuenta como rol administrativo si viene explícitamente en sesion.rol.
    Nunca se infiere desde área, centro de costos o cargo.
  */
  if (
    rolPrincipal === "ayb" ||
    rolPrincipal === "ayb_admin" ||
    rolPrincipal.includes("alimentos_y_bebidas_admin")
  ) {
    return "ayb";
  }

  return rolPrincipal || "empleado";
}

function obtenerModulosPermitidosSidebar(sesion) {
  return Array.isArray(sesion?.modulos_permitidos)
    ? sesion.modulos_permitidos.map((m) => normalizarTextoSidebar(m))
    : [];
}

function usuarioEsAdminSidebar(sesion) {
  if (!sesion) return false;

  const cedula = String(sesion.cedula || sesion.usuario || sesion.username || "").trim();
  const nombre = normalizarTextoSidebar(
    sesion.nombre_completo ||
    `${sesion.nombres || ""} ${sesion.apellidos || ""}`
  );

  const rol = obtenerRolSidebar(sesion);

  return (
    sesion.puede_ver_todo === true ||
    String(sesion.puede_ver_todo).toLowerCase() === "true" ||
    rol === "admin" ||
    cedula === "1088029438" ||
    nombre.includes("jhonnier")
  );
}

function usuarioEsAdministrativoSidebar(sesion) {
  if (!sesion) return false;
  if (usuarioEsAdminSidebar(sesion)) return true;

  const rol = obtenerRolSidebar(sesion);
  const modulos = obtenerModulosPermitidosSidebar(sesion);

  const rolesAdministrativos = [
    "gerencia",
    "bienestar",
    "direccion_financiera",
    "ayb",
    "servicios_generales"
  ];

  return (
    rolesAdministrativos.includes(rol) ||
    modulos.includes("dashboard") ||
    modulos.includes("programacion-ayb") ||
    modulos.includes("solicitudes-bienestar") ||
    modulos.includes("empleados")
  );
}

function obtenerClaveModuloSidebar(href) {
  const valor = String(href || "").toLowerCase();

  if (valor.includes("dashboard")) return "dashboard";
  if (valor.includes("empleados")) return "empleados";
  if (valor.includes("solicitudes-bienestar")) return "solicitudes-bienestar";
  if (valor.includes("programacion-ayb")) return "programacion-ayb";
  if (valor.includes("programacion-administrativo")) return "programacion-administrativo";
  if (valor.includes("programacion-operaciones")) return "programacion-operaciones";
  if (valor.includes("mis-turnos-ayb")) return "mis-turnos-ayb";
  if (valor.includes("mis-turnos-administrativo")) return "mis-turnos-administrativo";
  if (valor.includes("login")) return "login";

  return valor;
}

function usuarioPuedeVerModuloSidebar(sesion, modulo, rolesPermitidos = []) {
  if (modulo === "login") return true;
  if (!sesion) return false;

  const rol = obtenerRolSidebar(sesion);
  const modulos = obtenerModulosPermitidosSidebar(sesion);

  /*
    Regla dura:
    Un empleado operativo no ve módulos administrativos en el menú.
  */
  if (rol === "empleado") {
    return ["mis-turnos-ayb", "mis-turnos-administrativo", "login"].includes(modulo);
  }

  if (usuarioEsAdminSidebar(sesion)) return true;
  if (modulo === "mis-turnos-ayb") return true;
  if (modulos.includes(modulo)) return true;
  if (rolesPermitidos.includes(rol)) return true;

  return usuarioEsAdministrativoSidebar(sesion) && rolesPermitidos.length === 0;
}

function aplicarPermisosSidebar() {
  const sesion = obtenerSesionActualSidebar();
  const rol = obtenerRolSidebar(sesion);
  const container = document.getElementById("sidebar-container");

  if (!container) return;

  const links = container.querySelectorAll(".sidebar-nav .nav-link, .sidebar-global .nav-link, .nav-link");

  links.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const modulo = obtenerClaveModuloSidebar(href);
    const rolesPermitidos = String(link.dataset.roles || "")
      .split(",")
      .map((item) => normalizarTextoSidebar(item))
      .filter(Boolean);

    if (rol === "empleado" && !["mis-turnos-ayb", "mis-turnos-administrativo", "login"].includes(modulo)) {
      ocultarLinkSidebar(link);
      return;
    }

    if (usuarioPuedeVerModuloSidebar(sesion, modulo, rolesPermitidos)) {
      mostrarLinkSidebar(link);
    } else {
      ocultarLinkSidebar(link);
    }
  });
}

function mostrarLinkSidebar(link) {
  link.classList.remove("d-none");
  link.style.display = "";
  link.removeAttribute("aria-hidden");
}

function ocultarLinkSidebar(link) {
  link.classList.add("d-none");
  link.style.display = "none";
  link.setAttribute("aria-hidden", "true");
}

function activarLinkActivo() {
  const links = document.querySelectorAll("#sidebar-container .nav-link");
  const currentPage = window.location.pathname.split("/").pop();

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentPage || String(href || "").endsWith(`/${currentPage}`)) {
      link.classList.add("active");
    }
  });
}

function configurarLogout() {
  const btn = document.getElementById("btnLogout");
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();

    localStorage.removeItem("ccp_sesion");
    localStorage.removeItem("usuarioActual");
    localStorage.removeItem("empleadoActual");
    localStorage.removeItem("sessionUser");
    localStorage.removeItem("userData");
    localStorage.removeItem("authUser");
    localStorage.removeItem("usuarioLogueado");
    localStorage.removeItem("empleadoSesion");

    sessionStorage.clear();

    window.location.href = "login.html";
  });
}

function configurarToggleMobile() {
  const btn = document.querySelector(".btn-toggle-sidebar");
  const sidebar = document.querySelector(".sidebar-global");

  if (!btn || !sidebar) return;

  btn.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    aplicarPermisosSidebar();
  });

  document.querySelectorAll(".sidebar-global .nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      sidebar.classList.remove("open");
    });
  });
}

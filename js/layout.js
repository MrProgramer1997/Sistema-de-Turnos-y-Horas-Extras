document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("sidebar-container");

  if (!container) return;

  try {
    const response = await fetch("../components/sidebar.html?v=roles-20260430");

    if (!response.ok) {
      throw new Error("No se pudo cargar ../components/sidebar.html");
    }

    const html = await response.text();
    container.innerHTML = html;

    aplicarPermisosSidebar();
    activarLinkActivo();
    configurarLogout();
    configurarToggleMobile();

  } catch (error) {
    console.error("Error cargando sidebar:", error);
  }
});

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

  const area = normalizarTextoSidebar(
    sesion.area ||
    sesion.centro_costos ||
    sesion.centro_costo ||
    ""
  );

  const cargo = normalizarTextoSidebar(sesion.cargo || "");

  const combinado = `${rolPrincipal} ${area} ${cargo}`;

  if (rolPrincipal.includes("admin") || rolPrincipal.includes("administrador")) return "admin";
  if (rolPrincipal.includes("gerencia") || rolPrincipal.includes("gerente")) return "gerencia";
  if (rolPrincipal.includes("bienestar")) return "bienestar";
  if (rolPrincipal.includes("ayb") || rolPrincipal.includes("alimentos") || rolPrincipal.includes("bebidas")) return "ayb";
  if (rolPrincipal.includes("servicios_generales")) return "servicios_generales";
  if (rolPrincipal.includes("direccion_financiera") || rolPrincipal.includes("direccion_administrativa")) return "direccion_financiera";

  if (area.includes("bienestar")) return "bienestar";
  if (area.includes("alimentos") || area.includes("bebidas") || area.includes("ayb")) return "ayb";
  if (area.includes("servicios_generales")) return "servicios_generales";
  if (area.includes("direccion_administrativa") || area.includes("direccion_financiera")) return "direccion_financiera";

  if (combinado.includes("bienestar")) return "bienestar";
  if (combinado.includes("alimentos") || combinado.includes("bebidas") || combinado.includes("ayb")) return "ayb";
  if (combinado.includes("servicios_generales")) return "servicios_generales";

  return rolPrincipal || "empleado";
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
    rol === "admin" ||
    cedula === "1088029438" ||
    nombre.includes("jhonnier")
  );
}

function aplicarPermisosSidebar() {
  const sesion = obtenerSesionActualSidebar();
  const rol = obtenerRolSidebar(sesion);
  const esAdmin = usuarioEsAdminSidebar(sesion);

  const links = document.querySelectorAll(".sidebar-nav .nav-link[data-roles]");

  links.forEach((link) => {
    if (esAdmin) {
      link.classList.remove("d-none");
      link.style.display = "";
      return;
    }

    const rolesPermitidos = String(link.dataset.roles || "")
      .split(",")
      .map((item) => normalizarTextoSidebar(item))
      .filter(Boolean);

    if (rolesPermitidos.includes(rol)) {
      link.classList.remove("d-none");
      link.style.display = "";
    } else {
      link.classList.add("d-none");
      link.style.display = "none";
    }
  });
}

function activarLinkActivo() {
  const links = document.querySelectorAll(".sidebar-nav .nav-link");
  const currentPage = window.location.pathname.split("/").pop();

  links.forEach((link) => {
    const href = link.getAttribute("href");

    if (href === currentPage) {
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
  });
}
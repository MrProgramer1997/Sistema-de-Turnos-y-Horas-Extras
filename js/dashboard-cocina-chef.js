import { supabase } from "../supabase/supabaseClient.js";

let cocinaData = [];

document.addEventListener("DOMContentLoaded", async () => {
  setTimeout(async () => {
    insertarBloqueDashboardCocina();
    await cargarDashboardCocinaChef();
  }, 600);
});

function obtenerSesionCocinaDashboard() {
  try {
    return JSON.parse(localStorage.getItem("ccp_sesion") || "{}");
  } catch {
    return {};
  }
}

function usuarioPuedeVerCocinaChefDashboard(sesion) {
  if (!sesion) return false;
  if (sesion.puede_ver_todo === true) return true;

  const rol = String(sesion.rol || "").toLowerCase();
  const modulos = Array.isArray(sesion.modulos_permitidos)
    ? sesion.modulos_permitidos.map((m) => String(m).toLowerCase())
    : [];

  return [
    "admin",
    "administrador",
    "gerencia",
    "ayb",
    "ayb_admin",
    "cocina_chef",
    "chef",
    "bienestar",
    "direccion_financiera"
  ].includes(rol) || modulos.includes("cocina-chef");
}

function insertarBloqueDashboardCocina() {
  const sesion = obtenerSesionCocinaDashboard();

  if (!usuarioPuedeVerCocinaChefDashboard(sesion)) return;
  if (document.getElementById("bloqueDashboardCocinaChef")) return;

  const main = document.querySelector("main.main-content");
  if (!main) return;

  const bloque = document.createElement("section");
  bloque.id = "bloqueDashboardCocinaChef";
  bloque.className = "mb-4";

  bloque.innerHTML = `
    <div class="seccion-titulo">
      <h5>Cocina Chef</h5>
      <span class="subtexto-validacion">Programación operativa integrada desde Cocina Chef</span>
    </div>

    <div class="row g-3 mb-4 seccion-dashboard">
      <div class="col-12 col-md-6 col-xl-3">
        <div class="analitica-card p-3">
          <div class="titulo">Turnos Cocina Chef</div>
          <div class="valor" id="kpiCocinaTurnos">0</div>
          <p class="kpi-subtexto">Registros del periodo filtrado</p>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-3">
        <div class="analitica-card p-3">
          <div class="titulo">Personal programado</div>
          <div class="valor" id="kpiCocinaPersonal">0</div>
          <p class="kpi-subtexto">Colaboradores únicos</p>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-3">
        <div class="analitica-card p-3">
          <div class="titulo">Externos</div>
          <div class="valor" id="kpiCocinaExternos">0</div>
          <p class="kpi-subtexto">Personal externo programado</p>
        </div>
      </div>

      <div class="col-12 col-md-6 col-xl-3">
        <div class="analitica-card p-3">
          <div class="titulo">Eventos</div>
          <div class="valor" id="kpiCocinaEventos">0</div>
          <p class="kpi-subtexto">Turnos asociados a evento</p>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-4 seccion-dashboard">
      <div class="col-12 col-xl-6">
        <div class="card shadow-sm border-0 h-100 dashboard-bloque">
          <div class="card-header bg-white fw-bold">Turnos Cocina Chef por área</div>
          <div class="card-body bloque-scroll">
            <div class="table-responsive">
              <table class="table table-hover mb-0">
                <thead class="table-light">
                  <tr>
                    <th>#</th>
                    <th>Área</th>
                    <th>Turnos</th>
                    <th>Personas</th>
                  </tr>
                </thead>
                <tbody id="tbodyCocinaAreas">
                  <tr>
                    <td colspan="4" class="texto-vacio">Cargando Cocina Chef...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-xl-6">
        <div class="card shadow-sm border-0 h-100 dashboard-bloque">
          <div class="card-header bg-white fw-bold">Distribución por código de turno</div>
          <div class="card-body bloque-scroll">
            <div class="table-responsive">
              <table class="table table-hover mb-0">
                <thead class="table-light">
                  <tr>
                    <th>#</th>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody id="tbodyCocinaCodigos">
                  <tr>
                    <td colspan="4" class="texto-vacio">Cargando códigos...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const referencia = document.querySelector(".seccion-titulo");
  if (referencia && referencia.parentElement === main) {
    main.insertBefore(bloque, referencia);
  } else {
    main.appendChild(bloque);
  }
}

async function cargarDashboardCocinaChef() {
  const sesion = obtenerSesionCocinaDashboard();
  if (!usuarioPuedeVerCocinaChefDashboard(sesion)) return;

  const fechaInicio = document.getElementById("filtroFechaInicio")?.value || "";
  const fechaFin = document.getElementById("filtroFechaFin")?.value || "";

  let query = supabase
    .from("vw_cocina_chef_dashboard")
    .select("*")
    .order("fecha", { ascending: true });

  if (fechaInicio) query = query.gte("fecha", fechaInicio);
  if (fechaFin) query = query.lte("fecha", fechaFin);

  const { data, error } = await query;

  if (error) {
    console.error("Error cargando dashboard Cocina Chef:", error);
    renderDashboardCocinaVacio();
    return;
  }

  cocinaData = filtrarCocinaPorPermisos(data || [], sesion);

  renderKpisCocina();
  renderTablaCocinaAreas();
  renderTablaCocinaCodigos();
  enlazarFiltrosDashboardCocina();
}

function filtrarCocinaPorPermisos(registros, sesion) {
  if (!sesion) return [];
  if (sesion.puede_ver_todo === true) return registros;

  const rol = String(sesion.rol || "").toLowerCase();

  if (["admin", "administrador", "gerencia", "ayb", "ayb_admin", "bienestar", "direccion_financiera"].includes(rol)) {
    return registros;
  }

  const areasPermitidas = Array.isArray(sesion.areas_permitidas)
    ? sesion.areas_permitidas.map((a) => String(a).toUpperCase())
    : [];

  if (!areasPermitidas.length) return registros;

  return registros.filter((r) => {
    const area = String(r.area_nombre || r.area_codigo || "").toUpperCase();
    return areasPermitidas.some((permiso) => area.includes(permiso));
  });
}

function enlazarFiltrosDashboardCocina() {
  const filtros = [
    "filtroFechaInicio",
    "filtroFechaFin",
    "filtroArea",
    "filtroSubarea",
    "filtroEmpleado"
  ];

  filtros.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.cocinaChefListener === "true") return;

    el.dataset.cocinaChefListener = "true";
    el.addEventListener("change", () => {
      aplicarFiltrosLocalesCocina();
    });
  });
}

function aplicarFiltrosLocalesCocina() {
  renderKpisCocina();
  renderTablaCocinaAreas();
  renderTablaCocinaCodigos();
}

function obtenerCocinaFiltradaLocal() {
  const areaFiltro = document.getElementById("filtroArea")?.value || "";
  const empleadoFiltro = document.getElementById("filtroEmpleado")?.value || "";

  return cocinaData.filter((r) => {
    const area = String(r.area_nombre || "").trim();
    const empleado = String(r.nombre_visible || "").trim();

    if (areaFiltro && area !== areaFiltro) return false;
    if (empleadoFiltro && empleado !== empleadoFiltro) return false;

    return true;
  });
}

function renderKpisCocina() {
  const data = obtenerCocinaFiltradaLocal();

  const personas = new Set(data.map((r) => r.cronograma_personal_id).filter(Boolean));
  const externos = data.filter((r) => r.origen_persona === "externo");
  const eventos = data.filter((r) => String(r.evento || "").trim());

  setTextCocina("kpiCocinaTurnos", data.length);
  setTextCocina("kpiCocinaPersonal", personas.size);
  setTextCocina("kpiCocinaExternos", new Set(externos.map((r) => r.cronograma_personal_id)).size);
  setTextCocina("kpiCocinaEventos", eventos.length);
}

function renderTablaCocinaAreas() {
  const tbody = document.getElementById("tbodyCocinaAreas");
  if (!tbody) return;

  const data = obtenerCocinaFiltradaLocal();

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="texto-vacio">No hay datos de Cocina Chef para el filtro actual.</td></tr>`;
    return;
  }

  const mapa = {};

  data.forEach((r) => {
    const area = r.area_nombre || "Sin área";

    if (!mapa[area]) {
      mapa[area] = {
        area,
        total: 0,
        personas: new Set()
      };
    }

    mapa[area].total += 1;
    if (r.cronograma_personal_id) mapa[area].personas.add(r.cronograma_personal_id);
  });

  const ranking = Object.values(mapa)
    .sort((a, b) => b.total - a.total);

  tbody.innerHTML = ranking.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escaparHtmlCocina(item.area)}</td>
      <td>${item.total}</td>
      <td>${item.personas.size}</td>
    </tr>
  `).join("");
}

function renderTablaCocinaCodigos() {
  const tbody = document.getElementById("tbodyCocinaCodigos");
  if (!tbody) return;

  const data = obtenerCocinaFiltradaLocal();

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="texto-vacio">No hay códigos para el filtro actual.</td></tr>`;
    return;
  }

  const mapa = {};

  data.forEach((r) => {
    const codigo = r.codigo_turno || "Sin código";

    if (!mapa[codigo]) {
      mapa[codigo] = {
        codigo,
        descripcion: r.turno_descripcion || "",
        total: 0
      };
    }

    mapa[codigo].total += 1;
  });

  const ranking = Object.values(mapa)
    .sort((a, b) => b.total - a.total);

  tbody.innerHTML = ranking.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escaparHtmlCocina(item.codigo)}</td>
      <td>${escaparHtmlCocina(item.descripcion || "-")}</td>
      <td>${item.total}</td>
    </tr>
  `).join("");
}

function renderDashboardCocinaVacio() {
  setTextCocina("kpiCocinaTurnos", 0);
  setTextCocina("kpiCocinaPersonal", 0);
  setTextCocina("kpiCocinaExternos", 0);
  setTextCocina("kpiCocinaEventos", 0);

  const areas = document.getElementById("tbodyCocinaAreas");
  const codigos = document.getElementById("tbodyCocinaCodigos");

  if (areas) {
    areas.innerHTML = `<tr><td colspan="4" class="texto-vacio">No hay datos de Cocina Chef.</td></tr>`;
  }

  if (codigos) {
    codigos.innerHTML = `<tr><td colspan="4" class="texto-vacio">No hay datos de Cocina Chef.</td></tr>`;
  }
}

function setTextCocina(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escaparHtmlCocina(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
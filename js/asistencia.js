import { supabase } from "../supabase/supabaseClient.js";

const PAGE_SIZE = 30;
let pagina = 0;
let totalResultados = 0;
let detalleOffcanvas = null;
let empleadoSeleccionado = null;
let areaSeleccionada = null;
let cacheAreasEventos = [];
let cacheAreasJornadas = [];

const $ = (id) => document.getElementById(id);

function obtenerSesion() {
  try { return JSON.parse(localStorage.getItem("ccp_sesion") || "null"); }
  catch { return null; }
}

function normalizar(valor) {
  return String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

function puedeVerAsistencia(sesion) {
  if (!sesion) return false;
  const rol = normalizar(sesion.rol || sesion.tipo_usuario || sesion.perfil);
  const cedula = String(sesion.cedula || "").trim();
  const modulos = Array.isArray(sesion.modulos_permitidos) ? sesion.modulos_permitidos.map(normalizar) : [];
  return sesion.puede_ver_todo === true || String(sesion.puede_ver_todo).toLowerCase() === "true" || cedula === "1088029438" || ["admin","administrador","gerencia","bienestar","direccion_financiera","direccion_administrativa"].includes(rol) || modulos.includes("asistencia");
}

function fechaISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function fechaLegible(valor) {
  if (!valor) return "—";
  const [y,m,d] = String(valor).slice(0,10).split("-");
  return `${d}/${m}/${y}`;
}

function horaLegible(valor) {
  if (!valor) return "—";
  const texto = String(valor);
  const match = texto.match(/(?:T|\s)(\d{2}:\d{2})/);
  return match ? match[1] : texto.slice(0,5);
}

function escapeHtml(valor) {
  return String(valor ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

function claseSeveridad(sev) {
  if (sev === "alta") return "danger";
  if (sev === "media") return "warn";
  if (sev === "baja") return "info";
  if (sev === "informativa") return "muted";
  return "ok";
}

function textoEstado(row) {
  if (row.estado_dia === "en_curso") return "En curso";
  if (row.estado_marcaciones === "marcacion_unica") return "Marcación única";
  return "Jornada registrada";
}

function textoAlerta(row) {
  const total = Number(row.total_alertas || 0);
  if (!total) return "Sin alertas";
  if (row.severidad_maxima === "informativa") return `${total} · informativa`;
  return `${total} · ${row.severidad_maxima || "alerta"}`;
}

async function iniciar() {
  const sesion = obtenerSesion();
  if (!sesion) { window.location.href = "login.html"; return; }
  if (!puedeVerAsistencia(sesion)) { alert("No tienes permisos para acceder al módulo de Asistencia."); window.location.href = "dashboard.html"; return; }

  $("usuarioNombre").textContent = sesion.nombre_completo || "Usuario";
  $("usuarioRol").textContent = sesion.rol || "—";
  $("fechaActual").textContent = new Intl.DateTimeFormat("es-CO", { dateStyle: "full" }).format(new Date());
  detalleOffcanvas = new bootstrap.Offcanvas($("detalleJornada"));

  configurarFechasIniciales();
  configurarEventos();
  await cargarCatalogos();
  $("semanalProceso").innerHTML = $("filtroProceso").innerHTML;
  await cargarTodo();
}

function configurarFechasIniciales() {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(hoy.getDate() - 7);
  $("filtroDesde").value = fechaISO(desde);
  $("filtroHasta").value = fechaISO(hoy);
  $("empleadoDesde").value = fechaISO(desde);
  $("empleadoHasta").value = fechaISO(hoy);
  $("areasDesde").value = fechaISO(desde);
  $("areasHasta").value = fechaISO(hoy);
  const isoDow = ((hoy.getDay()+6)%7)+1; const martes = new Date(hoy); martes.setDate(hoy.getDate()-((isoDow-2+7)%7)); $("semanaInicio").value = fechaISO(martes);
}

function configurarEventos() {
  $("btnActualizar").addEventListener("click", async () => {
    if (!$("vistaAreas").classList.contains("d-none")) await cargarVistaAreas();
    else if (!$("vistaEmpleado").classList.contains("d-none") && empleadoSeleccionado) await cargarEmpleadoSeleccionado(empleadoSeleccionado);
    else await cargarTodo();
  });
  $("btnAplicarFiltros").addEventListener("click", () => { pagina = 0; cargarTodo(); });
  $("btnLimpiarFiltros").addEventListener("click", async () => { configurarFechasIniciales(); ["filtroArea","filtroProceso","filtroEstado","filtroSeveridad","filtroAlerta"].forEach(id => $(id).value = ""); $("filtroBusqueda").value = ""; pagina = 0; await cargarTodo(); });
  $("btnAnterior").addEventListener("click", async () => { if (pagina > 0) { pagina--; await cargarTabla(); } });
  $("btnSiguiente").addEventListener("click", async () => { if ((pagina + 1) * PAGE_SIZE < totalResultados) { pagina++; await cargarTabla(); } });
  $("filtroBusqueda").addEventListener("keydown", e => { if (e.key === "Enter") { pagina = 0; cargarTodo(); } });

  $("tabGeneral").addEventListener("click", () => cambiarVista("general"));
  $("tabEmpleado").addEventListener("click", () => cambiarVista("empleado"));
  $("tabAreas").addEventListener("click", () => cambiarVista("areas"));
  $("tabSemanal").addEventListener("click", () => cambiarVista("semanal"));
  $("btnActualizarSemanal").addEventListener("click", cargarVistaSemanal);
  $("btnFiltrarSemanal").addEventListener("click", cargarVistaSemanal);
  $("semanaInicio").addEventListener("change", cargarVistaSemanal);
  $("semanalProceso").addEventListener("change", cargarVistaSemanal);
  $("semanalBusqueda").addEventListener("keydown", e => { if (e.key === "Enter") cargarVistaSemanal(); });
  $("btnBuscarEmpleado").addEventListener("click", buscarEmpleadoIndividual);
  $("busquedaEmpleadoIndividual").addEventListener("keydown", e => { if (e.key === "Enter") buscarEmpleadoIndividual(); });
  $("btnLimpiarEmpleado").addEventListener("click", limpiarVistaEmpleado);
  $("empleadoDesde").addEventListener("change", () => { if (empleadoSeleccionado) cargarEmpleadoSeleccionado(empleadoSeleccionado); });
  $("empleadoHasta").addEventListener("change", () => { if (empleadoSeleccionado) cargarEmpleadoSeleccionado(empleadoSeleccionado); });
  $("btnActualizarAreas").addEventListener("click", cargarVistaAreas);
  $("areasDesde").addEventListener("change", cargarVistaAreas);
  $("areasHasta").addEventListener("change", cargarVistaAreas);
  $("areasFiltroProceso").addEventListener("change", cargarVistaAreas);
  $("btnCerrarAreaDetalle").addEventListener("click", () => {
    areaSeleccionada = null;
    $("areaDetalleCard").classList.add("d-none");
    document.querySelectorAll(".area-card.active").forEach(x => x.classList.remove("active"));
  });
}

function cambiarVista(vista) {
  const esGeneral = vista === "general";
  const esEmpleado = vista === "empleado";
  const esAreas = vista === "areas";
  const esSemanal = vista === "semanal";
  $("vistaGeneral").classList.toggle("d-none", !esGeneral);
  $("vistaEmpleado").classList.toggle("d-none", !esEmpleado);
  $("vistaAreas").classList.toggle("d-none", !esAreas);
  $("vistaSemanal").classList.toggle("d-none", !esSemanal);
  $("tabGeneral").classList.toggle("active", esGeneral);
  $("tabEmpleado").classList.toggle("active", esEmpleado);
  $("tabAreas").classList.toggle("active", esAreas);
  $("tabSemanal").classList.toggle("active", esSemanal);
  if (esEmpleado) $("busquedaEmpleadoIndividual").focus();
  if (esAreas && !cacheAreasEventos.length) cargarVistaAreas();
  if (esSemanal) cargarVistaSemanal();
}

function limpiarVistaEmpleado() {
  empleadoSeleccionado = null;
  $("busquedaEmpleadoIndividual").value = "";
  $("resultadosBusquedaEmpleado").innerHTML = "";
  configurarFechasIniciales();
  $("empleadoResumenContainer").innerHTML = '<section class="card border-0 shadow-sm empleado-empty-card"><div class="card-body empty-state">Busca y selecciona un empleado para consultar su historial de asistencia.</div></section>';
}

async function buscarEmpleadoIndividual() {
  const termino = $("busquedaEmpleadoIndividual").value.trim();
  const contenedor = $("resultadosBusquedaEmpleado");
  if (termino.length < 2) {
    contenedor.innerHTML = '<div class="text-muted small">Escribe al menos 2 caracteres.</div>';
    return;
  }
  contenedor.innerHTML = '<div class="text-muted small">Buscando empleados...</div>';
  const { data, error } = await supabase
    .from("vw_asistencia_resumen_individual_empleado")
    .select("cedula,empleado,cargo,centro_costos,proceso_codigo,proceso_nombre,ultima_fecha_registrada")
    .or(`cedula.ilike.%${termino}%,empleado.ilike.%${termino}%`)
    .order("ultima_fecha_registrada", { ascending: false })
    .limit(20);
  if (error) {
    console.error(error);
    contenedor.innerHTML = `<div class="text-danger small">No fue posible buscar empleados: ${escapeHtml(error.message)}</div>`;
    return;
  }
  const rows = data || [];
  if (!rows.length) {
    contenedor.innerHTML = '<div class="text-muted small">No se encontraron empleados con ese criterio.</div>';
    return;
  }
  contenedor.innerHTML = rows.map((r, i) => `<button type="button" class="empleado-search-item" data-index="${i}">
    <span><strong>${escapeHtml(r.empleado || "Sin nombre")}</strong><small>${escapeHtml(r.cedula || "—")} · ${escapeHtml(r.cargo || "Sin cargo")}</small></span>
    <span class="empleado-search-meta">${escapeHtml(r.proceso_nombre || r.centro_costos || "Sin proceso")}</span>
  </button>`).join("");
  contenedor.querySelectorAll(".empleado-search-item").forEach(btn => btn.addEventListener("click", async () => {
    empleadoSeleccionado = rows[Number(btn.dataset.index)].cedula;
    $("busquedaEmpleadoIndividual").value = `${rows[Number(btn.dataset.index)].empleado} · ${empleadoSeleccionado}`;
    contenedor.innerHTML = "";
    await cargarEmpleadoSeleccionado(empleadoSeleccionado);
  }));
}

async function cargarEmpleadoSeleccionado(cedula) {
  if (!cedula) return;
  marcarConexion("Consultando empleado...", false);
  const desde = $("empleadoDesde").value;
  const hasta = $("empleadoHasta").value;
  let qHist = supabase.from("vw_asistencia_panel_consulta").select("*").eq("cedula", cedula);
  if (desde) qHist = qHist.gte("fecha", desde);
  if (hasta) qHist = qHist.lte("fecha", hasta);
  qHist = qHist.order("fecha", { ascending: false }).order("primera_marcacion", { ascending: false }).limit(366);
  const [resumenRes, histRes] = await Promise.all([
    supabase.from("vw_asistencia_resumen_individual_empleado").select("*").eq("cedula", cedula).maybeSingle(),
    qHist
  ]);
  if (resumenRes.error || histRes.error) {
    console.error(resumenRes.error || histRes.error);
    $("empleadoResumenContainer").innerHTML = `<section class="card border-0 shadow-sm"><div class="card-body text-danger">No fue posible cargar el historial: ${escapeHtml((resumenRes.error || histRes.error).message)}</div></section>`;
    marcarConexion("Error consultando", false, true);
    return;
  }
  renderResumenEmpleado(resumenRes.data || {}, histRes.data || []);
  marcarConexion("Datos actualizados", true);
}

function renderResumenEmpleado(resumen, jornadas) {
  const c = $("empleadoResumenContainer");
  const marcaciones = jornadas.reduce((s, x) => s + Number(x.total_marcaciones || 0), 0);
  const unicas = jornadas.filter(x => x.estado_marcaciones === "marcacion_unica").length;
  const completas = jornadas.filter(x => x.estado_marcaciones === "jornada_con_multiples_marcaciones").length;
  const alertas = jornadas.reduce((s, x) => s + Number(x.total_alertas || 0), 0);
  const areas = new Set(jornadas.flatMap(x => [x.area_primera_marcacion, x.area_ultima_marcacion]).filter(Boolean)).size;
  const comparables = jornadas.filter(x => x.estado_comparacion_programacion === "comparacion_disponible").length;
  const esAyB = resumen.grupo_codigo === "ALIMENTOS_BEBIDAS" || resumen.proceso_codigo === "AYB_OPERACION" || String(resumen.centro_costos || "").includes("ALIMENTOS Y BEBIDAS");

  c.innerHTML = `
    <section class="empleado-profile-card mb-4">
      <div>
        <span class="asistencia-kicker empleado-kicker">Resumen individual</span>
        <h3>${escapeHtml(resumen.empleado || jornadas[0]?.empleado || "Empleado")}</h3>
        <p>${escapeHtml(resumen.cargo || jornadas[0]?.cargo || "Sin cargo")}</p>
        <div class="empleado-profile-meta">
          <span>Cédula <strong>${escapeHtml(resumen.cedula || jornadas[0]?.cedula || "—")}</strong></span>
          <span>Proceso <strong>${escapeHtml(resumen.proceso_nombre || jornadas[0]?.proceso_nombre || "Sin proceso")}</strong></span>
          <span>Centro de costos <strong>${escapeHtml(resumen.centro_costos || jornadas[0]?.centro_costos || "—")}</strong></span>
          ${esAyB ? '<span class="badge-soft ayb">AyB · multipunto</span>' : ''}
        </div>
      </div>
    </section>

    <section class="row g-3 mb-4 empleado-kpis">
      ${kpiEmpleado("Jornadas", jornadas.length, "En el rango seleccionado")}
      ${kpiEmpleado("Marcaciones", marcaciones, "Marcaciones válidas")}
      ${kpiEmpleado("Jornadas completas", completas, "2 o más marcaciones", "ok")}
      ${kpiEmpleado("Marcación única", unicas, "Provisional o consolidada", "warn")}
      ${kpiEmpleado("Alertas", alertas, "Todas las severidades", alertas ? "danger" : "ok")}
      ${kpiEmpleado(esAyB ? "Comparables" : "Áreas", esAyB ? comparables : areas, esAyB ? "Con programación del punto" : "Áreas biométricas")}
    </section>

    <section class="card border-0 shadow-sm tabla-card">
      <div class="card-header bg-white border-0 d-flex align-items-center justify-content-between flex-wrap gap-2 py-3">
        <div><h5 class="mb-1">Historial de jornadas</h5><small class="text-muted">${fechaLegible($("empleadoDesde").value)} a ${fechaLegible($("empleadoHasta").value)} · ${jornadas.length} jornada${jornadas.length === 1 ? "" : "s"}</small></div>
        <span class="badge text-bg-light">${escapeHtml(resumen.proceso_nombre || jornadas[0]?.proceso_nombre || "Histórico")}</span>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0 asistencia-table empleado-historial-table">
          <thead><tr><th>Fecha</th><th>Área</th><th>Primera</th><th>Última</th><th>Marcaciones</th><th>Estado</th><th>Programación</th><th>Alertas</th><th></th></tr></thead>
          <tbody id="tbodyEmpleadoHistorial"></tbody>
        </table>
      </div>
    </section>`;

  const tbody = $("tbodyEmpleadoHistorial");
  if (!jornadas.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state">No hay jornadas para este empleado en el rango seleccionado.</div></td></tr>';
    return;
  }
  tbody.innerHTML = jornadas.map((r, i) => `<tr>
    <td>${fechaLegible(r.fecha)}</td>
    <td>${escapeHtml(r.area_primera_marcacion || "Sin área")}</td>
    <td>${horaLegible(r.primera_marcacion)}</td>
    <td>${horaLegible(r.ultima_marcacion)}</td>
    <td><span class="badge-soft info">${Number(r.total_marcaciones || 0)} marc.</span></td>
    <td><span class="badge-soft ${r.estado_dia === "en_curso" ? "info" : r.estado_marcaciones === "marcacion_unica" ? "warn" : "ok"}">${escapeHtml(textoEstado(r))}</span></td>
    <td>${renderEstadoProgramacionTabla(r)}</td>
    <td><span class="badge-soft ${Number(r.total_alertas || 0) ? claseSeveridad(r.severidad_maxima) : "ok"}">${escapeHtml(textoAlerta(r))}</span></td>
    <td><button class="btn btn-sm btn-outline-primary btn-detalle-empleado" data-index="${i}">Ver</button></td>
  </tr>`).join("");
  tbody.querySelectorAll(".btn-detalle-empleado").forEach(btn => btn.addEventListener("click", () => mostrarDetalle(jornadas[Number(btn.dataset.index)])));
}

function kpiEmpleado(titulo, valor, texto, clase="") {
  return `<div class="col-6 col-xl-2"><article class="kpi-card ${clase}"><span>${escapeHtml(titulo)}</span><strong>${escapeHtml(valor)}</strong><small>${escapeHtml(texto)}</small></article></div>`;
}

function renderEstadoProgramacionTabla(r) {
  const estado = r.estado_comparacion_programacion || "";
  if (estado === "comparacion_disponible") {
    const dif = Number(r.diferencia_inicio_programacion_minutos);
    const texto = Number.isFinite(dif) ? (dif === 0 ? "En hora" : dif < 0 ? `${Math.abs(dif)} min antes` : `${dif} min después`) : "Disponible";
    return `<span class="badge-soft ok">${escapeHtml(texto)}</span>`;
  }
  if (estado === "sin_programacion") return '<span class="badge-soft warn">Sin programación</span>';
  if (estado === "punto_diferente_programado") return '<span class="badge-soft info">Punto diferente</span>';
  if (estado === "punto_fuera_tramo_programado") return '<span class="badge-soft info">Fuera de tramo</span>';
  return '<span class="badge-soft muted">No aplica</span>';
}

async function cargarCatalogos() {
  const { data, error } = await supabase.from("vw_asistencia_panel_catalogos").select("tipo,codigo,nombre").order("nombre");
  if (error) { console.error(error); return; }
  llenarSelect("filtroArea", data.filter(x => x.tipo === "area"));
  llenarSelect("filtroProceso", data.filter(x => x.tipo === "proceso"));
  llenarSelect("areasFiltroProceso", data.filter(x => x.tipo === "proceso"));
  llenarSelect("filtroEstado", data.filter(x => x.tipo === "estado_marcacion"));
  llenarSelect("filtroSeveridad", data.filter(x => x.tipo === "severidad"));
}

function llenarSelect(id, items) {
  const select = $(id);
  const primera = select.options[0]?.outerHTML || '<option value="">Todos</option>';
  select.innerHTML = primera + items.map(x => `<option value="${escapeHtml(x.codigo)}">${escapeHtml(x.nombre)}</option>`).join("");
}

function aplicarFiltros(query) {
  const desde = $("filtroDesde").value;
  const hasta = $("filtroHasta").value;
  const area = $("filtroArea").value;
  const proceso = $("filtroProceso").value;
  const estado = $("filtroEstado").value;
  const severidad = $("filtroSeveridad").value;
  const alerta = $("filtroAlerta").value;
  const busqueda = $("filtroBusqueda").value.trim();

  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);
  if (area) query = query.eq("area_primera_marcacion", area);
  if (proceso) query = query.eq("proceso_codigo", proceso);
  if (estado) query = query.eq("estado_marcaciones", estado);
  if (severidad) query = query.eq("severidad_maxima", severidad);
  if (alerta === "true") query = query.eq("tiene_alertas", true);
  if (alerta === "false") query = query.eq("tiene_alertas", false);
  if (busqueda) query = query.or(`cedula.ilike.%${busqueda}%,empleado.ilike.%${busqueda}%`);
  return query;
}

async function cargarTodo() {
  marcarConexion("Consultando...", false);
  await Promise.all([cargarKPIs(), cargarTabla()]);
  marcarConexion("Datos actualizados", true);
}

async function cargarKPIs() {
  let query = supabase.from("vw_asistencia_panel_consulta").select("cedula,total_marcaciones,estado_marcaciones,total_alertas,sin_proceso", { count: "exact" });
  query = aplicarFiltros(query);
  const { data, error } = await query.limit(5000);
  if (error) { console.error(error); return; }
  const rows = data || [];
  $("kpiEmpleados").textContent = new Set(rows.map(x => x.cedula).filter(Boolean)).size;
  $("kpiMarcaciones").textContent = rows.reduce((s,x) => s + Number(x.total_marcaciones || 0), 0);
  $("kpiCompletas").textContent = rows.filter(x => x.estado_marcaciones === "jornada_con_multiples_marcaciones").length;
  $("kpiUnicas").textContent = rows.filter(x => x.estado_marcaciones === "marcacion_unica").length;
  $("kpiAlertas").textContent = rows.reduce((s,x) => s + Number(x.total_alertas || 0), 0);
  $("kpiSinProceso").textContent = rows.filter(x => x.sin_proceso).length;
}

async function cargarTabla() {
  const desdeFila = pagina * PAGE_SIZE;
  const hastaFila = desdeFila + PAGE_SIZE - 1;
  let query = supabase.from("vw_asistencia_panel_consulta").select("*", { count: "exact" });
  query = aplicarFiltros(query).order("fecha", { ascending: false }).order("primera_marcacion", { ascending: false }).range(desdeFila, hastaFila);
  const { data, error, count } = await query;
  if (error) { console.error(error); renderError(error.message); marcarConexion("Error consultando", false, true); return; }
  totalResultados = count || 0;
  renderTabla(data || []);
  actualizarPaginacion();
}

function renderTabla(rows) {
  const tbody = $("tbodyAsistencia");
  $("resultadoResumen").textContent = `${totalResultados} resultado${totalResultados === 1 ? "" : "s"}`;
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state">No hay registros con los filtros seleccionados.</div></td></tr>'; return; }

  tbody.innerHTML = rows.map((r, i) => {
    const alertas = Number(r.total_alertas || 0);
    return `<tr>
      <td class="empleado-cell"><strong>${escapeHtml(r.empleado || "Sin nombre")}</strong><small>${escapeHtml(r.cedula || "—")} · ${escapeHtml(r.cargo || "Sin cargo")}</small></td>
      <td>${escapeHtml(r.area_primera_marcacion || "Sin área")}</td>
      <td>${escapeHtml(r.proceso_nombre || "Sin proceso")}</td>
      <td>${fechaLegible(r.fecha)}</td>
      <td>${horaLegible(r.primera_marcacion)}</td>
      <td>${horaLegible(r.ultima_marcacion)}</td>
      <td><span class="badge-soft info">${Number(r.total_marcaciones || 0)} marc.</span></td>
      <td><span class="badge-soft ${r.estado_dia === "en_curso" ? "info" : r.estado_marcaciones === "marcacion_unica" ? "warn" : "ok"}">${escapeHtml(textoEstado(r))}</span></td>
      <td><span class="badge-soft ${alertas ? claseSeveridad(r.severidad_maxima) : "ok"}">${escapeHtml(textoAlerta(r))}</span></td>
      <td><button class="btn btn-sm btn-outline-primary btn-detalle" data-index="${i}">Ver</button></td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll(".btn-detalle").forEach(btn => btn.addEventListener("click", () => mostrarDetalle(rows[Number(btn.dataset.index)])));
}

function actualizarPaginacion() {
  const inicio = totalResultados ? pagina * PAGE_SIZE + 1 : 0;
  const fin = Math.min((pagina + 1) * PAGE_SIZE, totalResultados);
  $("paginacionTexto").textContent = `${inicio}-${fin} de ${totalResultados}`;
  $("btnAnterior").disabled = pagina === 0;
  $("btnSiguiente").disabled = (pagina + 1) * PAGE_SIZE >= totalResultados;
}

function mostrarDetalle(r) {
  $("detalleJornadaLabel").textContent = r.empleado || "Empleado";
  const timeline = Array.isArray(r.linea_tiempo) ? r.linea_tiempo : [];
  const alertas = Array.isArray(r.alertas_detalle) ? r.alertas_detalle : [];
  const modo = timeline[0]?.modo_visualizacion || (r.grupo_codigo === "ALIMENTOS_BEBIDAS" ? "multipunto" : "general");
  const esAyB = modo === "multipunto" || r.grupo_codigo === "ALIMENTOS_BEBIDAS" || r.proceso_codigo === "AYB_OPERACION";
  const alertasProvisionales = alertas.filter(a => a.estado_alerta === "provisional").length;
  const alertasConsolidadas = alertas.filter(a => a.estado_alerta === "consolidada").length;

  $("detalleJornadaBody").innerHTML = `
    <div class="detalle-jornada-top">
      <span class="badge-soft ${r.estado_dia === "en_curso" ? "info" : "ok"}">${r.estado_dia === "en_curso" ? "Jornada en curso" : "Jornada cerrada"}</span>
      <span class="badge-soft ${esAyB ? "ayb" : "muted"}">${esAyB ? "AyB · recorrido multipunto" : "Control de jornada"}</span>
      ${alertasProvisionales ? `<span class="badge-soft provisional">${alertasProvisionales} provisional${alertasProvisionales === 1 ? "" : "es"}</span>` : ""}
      ${alertasConsolidadas ? `<span class="badge-soft consolidada">${alertasConsolidadas} consolidada${alertasConsolidadas === 1 ? "" : "s"}</span>` : ""}
    </div>

    <section class="detalle-section">
      <div class="detalle-section-title"><h6>Empleado</h6><span>${escapeHtml(r.proceso_nombre || "Sin proceso")}</span></div>
      <div class="detalle-grid">
        ${detalleItem("Cédula", r.cedula)}${detalleItem("Cargo", r.cargo)}${detalleItem("Centro de costos", r.centro_costos)}${detalleItem("Proceso", r.proceso_nombre || "Sin proceso")}
      </div>
    </section>

    <section class="detalle-section resumen-jornada-section">
      <div class="detalle-section-title"><h6>Resumen de jornada</h6><span>${fechaLegible(r.fecha)}</span></div>
      <div class="detalle-grid">
        ${detalleItem("Estado", textoEstado(r))}${detalleItem("Marcaciones válidas", r.total_marcaciones)}${detalleItem(esAyB ? "Primera marcación" : "Entrada", horaLegible(r.primera_marcacion))}${detalleItem(esAyB ? "Última marcación" : "Salida", horaLegible(r.ultima_marcacion))}${detalleItem("Áreas visitadas", r.total_areas_visitadas)}${detalleItem("Terminales", r.total_terminales_visitadas)}
      </div>
      ${esAyB ? `<div class="detalle-note mt-3"><strong>Lectura AyB:</strong> las marcaciones intermedias representan cambios de punto. La primera y la última delimitan el recorrido disponible de la jornada; durante pruebas no se asume incumplimiento por marcaciones faltantes.</div>` : ""}
    </section>

    ${esAyB ? renderComparacionProgramacion(r) : ""}

    <section class="detalle-section">
      <div class="detalle-section-title"><h6>Línea de tiempo</h6><span>${timeline.length} evento${timeline.length === 1 ? "" : "s"}</span></div>
      ${timeline.length ? `<div class="timeline ${esAyB ? "timeline-ayb" : ""}">${timeline.map((t, index) => renderTimelineItem(t, index, timeline.length, esAyB)).join("")}</div>` : '<p class="text-muted mb-0">Sin eventos de línea de tiempo.</p>'}
    </section>

    <section class="detalle-section">
      <div class="detalle-section-title"><h6>Alertas</h6><span>${alertas.length ? `${alertas.length} registrada${alertas.length === 1 ? "" : "s"}` : "Sin novedades"}</span></div>
      ${alertas.length ? alertas.map(renderAlertaDetalle).join("") : '<div class="sin-alertas-box"><span class="badge-soft ok">Sin alertas para esta jornada</span><small>No hay incidencias operativas registradas.</small></div>'}
    </section>`;
  detalleOffcanvas.show();
}

function renderComparacionProgramacion(r) {
  const estado = r.estado_comparacion_programacion || "";
  const diferencia = r.diferencia_inicio_programacion_minutos;
  const inicio = r.hora_inicio_programada_punto || "—";
  const fin = r.hora_fin_programada_punto || "—";
  const turno = r.turno_programado_punto || "—";
  const tramo = r.tramo_programado ? `Tramo ${r.tramo_programado}` : "—";
  const primera = horaLegible(r.primera_marcacion);

  let clase = "muted";
  let titulo = "Comparación pendiente";
  let descripcion = "No hay información suficiente para comparar esta marcación con la programación.";
  let diferenciaTexto = "No aplica";

  if (estado === "comparacion_disponible") {
    clase = "ok";
    titulo = "Programación encontrada para este punto";
    if (Number.isFinite(Number(diferencia))) {
      const min = Number(diferencia);
      diferenciaTexto = min === 0 ? "Coincide con la hora programada" : min < 0 ? `${Math.abs(min)} min antes` : `${min} min después`;
      descripcion = "La diferencia corresponde únicamente a la primera marcación válida del punto. No se genera por sí sola una alerta de tardanza.";
    }
  } else if (estado === "sin_programacion") {
    clase = "warn";
    titulo = "Sin programación cargada para la fecha";
    descripcion = "La marcación se conserva como evidencia operativa. Durante la etapa de pruebas no se interpreta automáticamente como incumplimiento.";
  } else if (estado === "punto_diferente_programado") {
    clase = "info";
    titulo = "Punto diferente al programado";
    descripcion = `La persona marcó en ${r.area_primera_marcacion || "otro punto"}, pero ese punto no coincide con las subáreas programadas para la fecha. Se muestra para revisión, sin calcular tardanza.`;
  } else if (estado === "punto_fuera_tramo_programado") {
    clase = "info";
    titulo = "Marcación fuera del tramo programado para este punto";
    descripcion = "El punto sí aparece en la programación, pero corresponde a otro tramo horario. Por seguridad no se calcula diferencia de llegada contra ese tramo.";
  } else if (estado === "marcacion_intermedia_punto") {
    clase = "muted";
    titulo = "Movimiento intermedio";
    descripcion = "Esta marcación pertenece al recorrido multipunto y no se utiliza como referencia de llegada.";
  }

  return `<section class="detalle-section comparacion-programacion-section">
    <div class="detalle-section-title"><h6>Programación vs. marcación</h6><span class="badge-soft ${clase}">${escapeHtml(titulo)}</span></div>
    <div class="detalle-grid">
      ${detalleItem("Turno del punto", turno)}
      ${detalleItem("Tramo", tramo)}
      ${detalleItem("Horario programado", inicio !== "—" ? `${inicio} - ${fin}` : "—")}
      ${detalleItem("Primera marcación", primera)}
      ${detalleItem("Diferencia informativa", diferenciaTexto)}
      ${detalleItem("Punto biométrico", r.area_primera_marcacion || "—")}
    </div>
    <div class="comparacion-note mt-3">${escapeHtml(descripcion)}</div>
  </section>`;
}

function renderTimelineItem(t, index, total, esAyB) {
  const tipo = t.tipo_evento || "marcacion";
  const clase = claseEventoTimeline(tipo);
  const etiqueta = etiquetaEventoTimeline(tipo, esAyB, index, total);
  return `<div class="timeline-item ${clase}">
    <div class="timeline-time">${horaLegible(t.hora)}</div>
    <div class="timeline-content">
      <div class="timeline-title"><strong>${escapeHtml(etiqueta)}</strong><span class="timeline-position">${index + 1}/${total}</span></div>
      <small>${escapeHtml(t.terminal || "Sin terminal")} · ${escapeHtml(t.area || "Sin área")}</small>
    </div>
  </div>`;
}

function renderAlertaDetalle(a) {
  const estado = a.estado_alerta || "";
  const estadoLabel = estado === "provisional" ? "Provisional" : estado === "consolidada" ? "Consolidada" : estado;
  return `<div class="alerta-item ${escapeHtml(a.severidad)} ${escapeHtml(estado)}">
    <div class="alerta-head">
      <strong>${escapeHtml(String(a.severidad || "").toUpperCase())} · ${escapeHtml(formatearCodigoAlerta(a.codigo_alerta || "Alerta"))}</strong>
      ${estadoLabel ? `<span class="alerta-estado ${escapeHtml(estado)}">${escapeHtml(estadoLabel)}</span>` : ""}
    </div>
    <div>${escapeHtml(a.descripcion || "")}</div>
    ${a.estado_temporal ? `<small class="text-muted">Estado de jornada: ${escapeHtml(formatearTipoEvento(a.estado_temporal))}</small>` : ""}
  </div>`;
}

function detalleItem(label, value) { return `<div class="detalle-item"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value ?? "—")}</strong></div>`; }
function formatearTipoEvento(tipo) { return String(tipo || "marcación").replaceAll("_", " "); }
function formatearCodigoAlerta(codigo) { return String(codigo || "Alerta").replaceAll("_", " "); }
function claseEventoTimeline(tipo) {
  if (["entrada", "entrada_jornada", "entrada_punto", "primera_marcacion"].includes(tipo)) return "evento-entrada";
  if (["salida", "salida_jornada", "salida_punto", "ultima_marcacion"].includes(tipo)) return "evento-salida";
  if (tipo === "unica") return "evento-unica";
  return "evento-intermedio";
}
function etiquetaEventoTimeline(tipo, esAyB, index, total) {
  const etiquetas = {
    entrada: "Entrada",
    salida: "Salida",
    entrada_jornada: "Entrada de jornada",
    salida_jornada: "Salida de jornada",
    salida_punto: "Salida de punto",
    entrada_punto: "Entrada a punto",
    unica: esAyB ? "Marcación única disponible" : "Marcación única",
    primera_marcacion: "Primera marcación",
    ultima_marcacion: "Última marcación",
    marcacion_intermedia: "Marcación intermedia"
  };
  if (etiquetas[tipo]) return etiquetas[tipo];
  if (esAyB && index > 0 && index < total - 1) return "Movimiento entre puntos";
  return formatearTipoEvento(tipo);
}

async function cargarVistaAreas() {
  marcarConexion("Consultando puntos...", false);
  const desde = $("areasDesde").value;
  const hasta = $("areasHasta").value;
  const proceso = $("areasFiltroProceso").value;

  let qEventos = supabase.from("vw_asistencia_recorrido_frontend").select("cedula,empleado,cargo,fecha,punch_time,hora_marcacion,terminal_alias,area_biometrico,proceso_codigo,proceso_nombre,grupo_codigo,tipo_evento_jornada,modo_visualizacion,posicion,total_marcaciones_jornada");
  let qJornadas = supabase.from("vw_asistencia_panel_consulta").select("*");
  if (desde) { qEventos = qEventos.gte("fecha", desde); qJornadas = qJornadas.gte("fecha", desde); }
  if (hasta) { qEventos = qEventos.lte("fecha", hasta); qJornadas = qJornadas.lte("fecha", hasta); }
  if (proceso) { qEventos = qEventos.eq("proceso_codigo", proceso); qJornadas = qJornadas.eq("proceso_codigo", proceso); }
  qEventos = qEventos.order("fecha", { ascending: false }).order("punch_time", { ascending: false }).limit(5000);
  qJornadas = qJornadas.order("fecha", { ascending: false }).limit(5000);

  const [eventosRes, jornadasRes] = await Promise.all([qEventos, qJornadas]);
  if (eventosRes.error || jornadasRes.error) {
    const error = eventosRes.error || jornadasRes.error;
    console.error(error);
    $("areasCards").innerHTML = `<div class="card border-0 shadow-sm"><div class="card-body empty-state text-danger">No fue posible cargar la actividad por puntos: ${escapeHtml(error.message)}</div></div>`;
    marcarConexion("Error consultando", false, true);
    return;
  }
  cacheAreasEventos = eventosRes.data || [];
  cacheAreasJornadas = jornadasRes.data || [];
  renderVistaAreas();
  marcarConexion("Datos actualizados", true);
}

function claveJornada(cedula, fecha) { return `${cedula || ""}|${fecha || ""}`; }

function renderVistaAreas() {
  const eventos = cacheAreasEventos.filter(x => x.area_biometrico);
  const jornadaMap = new Map(cacheAreasJornadas.map(j => [claveJornada(j.cedula, j.fecha), j]));
  const grupos = new Map();
  for (const ev of eventos) {
    const area = ev.area_biometrico || "SIN_AREA";
    if (!grupos.has(area)) grupos.set(area, { area, eventos: [], empleados: new Set(), jornadas: new Set(), revisar: new Set(), multipunto: new Set(), primera: null, ultima: null });
    const g = grupos.get(area);
    g.eventos.push(ev);
    g.empleados.add(ev.cedula);
    const key = claveJornada(ev.cedula, ev.fecha);
    g.jornadas.add(key);
    const jornada = jornadaMap.get(key);
    if (jornada && Number(jornada.total_alertas || 0) > 0) g.revisar.add(key);
    if (ev.modo_visualizacion === "multipunto" || Number(jornada?.total_areas_visitadas || 0) > 1) g.multipunto.add(key);
    if (ev.punch_time) {
      if (!g.primera || String(ev.punch_time) < String(g.primera)) g.primera = ev.punch_time;
      if (!g.ultima || String(ev.punch_time) > String(g.ultima)) g.ultima = ev.punch_time;
    }
  }

  const gruposArr = [...grupos.values()].sort((a,b) => b.eventos.length - a.eventos.length || a.area.localeCompare(b.area));
  const empleadosUnicos = new Set(eventos.map(x => x.cedula).filter(Boolean));
  const jornadasRevisar = new Set();
  for (const j of cacheAreasJornadas) if (Number(j.total_alertas || 0) > 0) jornadasRevisar.add(claveJornada(j.cedula,j.fecha));
  $("kpiAreasPuntos").textContent = gruposArr.length;
  $("kpiAreasEmpleados").textContent = empleadosUnicos.size;
  $("kpiAreasMarcaciones").textContent = eventos.length;
  $("kpiAreasRevisar").textContent = jornadasRevisar.size;

  if (!gruposArr.length) {
    $("areasCards").innerHTML = '<div class="card border-0 shadow-sm"><div class="card-body empty-state">No hay actividad biométrica con los filtros seleccionados.</div></div>';
    $("areaDetalleCard").classList.add("d-none");
    return;
  }

  $("areasCards").innerHTML = gruposArr.map(g => {
    const revision = g.revisar.size > 0;
    return `<article class="area-card ${areaSeleccionada === g.area ? "active" : ""}" data-area="${escapeHtml(g.area)}">
      <div class="area-card-head">
        <div><h6>${escapeHtml(g.area)}</h6><small>${g.jornadas.size} jornada${g.jornadas.size === 1 ? "" : "s"} con actividad</small></div>
        <span class="badge-soft ${revision ? "warn" : "ok"}">${revision ? `${g.revisar.size} revisar` : "Sin incidencias altas"}</span>
      </div>
      <div class="area-card-kpis">
        <div class="area-mini-kpi"><strong>${g.empleados.size}</strong><span>Empleados</span></div>
        <div class="area-mini-kpi"><strong>${g.eventos.length}</strong><span>Marcaciones</span></div>
        <div class="area-mini-kpi"><strong>${g.multipunto.size}</strong><span>Multipunto</span></div>
      </div>
      <div class="area-card-footer">
        <span>${g.ultima ? `Última actividad ${horaLegible(g.ultima)}` : "Sin hora"}</span>
        <span>Ver detalle →</span>
      </div>
    </article>`;
  }).join("");
  $("areasCards").querySelectorAll(".area-card").forEach(card => card.addEventListener("click", () => mostrarDetalleArea(card.dataset.area)));

  if (areaSeleccionada && grupos.has(areaSeleccionada)) mostrarDetalleArea(areaSeleccionada, false);
}

function mostrarDetalleArea(area, desplazar = true) {
  areaSeleccionada = area;
  document.querySelectorAll(".area-card").forEach(x => x.classList.toggle("active", x.dataset.area === area));
  const eventos = cacheAreasEventos.filter(x => x.area_biometrico === area);
  const jornadaMap = new Map(cacheAreasJornadas.map(j => [claveJornada(j.cedula,j.fecha), j]));
  const jornadasArea = new Map();
  for (const ev of eventos) {
    const key = claveJornada(ev.cedula, ev.fecha);
    if (!jornadasArea.has(key)) jornadasArea.set(key, { jornada: jornadaMap.get(key), eventos: [] });
    jornadasArea.get(key).eventos.push(ev);
  }
  const rows = [...jornadasArea.values()].sort((a,b) => String(b.jornada?.fecha || b.eventos[0]?.fecha).localeCompare(String(a.jornada?.fecha || a.eventos[0]?.fecha)) || String(b.eventos[0]?.punch_time).localeCompare(String(a.eventos[0]?.punch_time)));
  const empleados = new Set(eventos.map(x => x.cedula));
  const revisar = rows.filter(x => Number(x.jornada?.total_alertas || 0) > 0).length;
  $("areaDetalleTitulo").textContent = area;
  $("areaDetalleResumen").textContent = `${empleados.size} empleado${empleados.size === 1 ? "" : "s"} · ${eventos.length} marcaciones · ${revisar} jornada${revisar === 1 ? "" : "s"} con alertas`;
  $("areaDetalleCard").classList.remove("d-none");
  const tbody = $("tbodyAreaDetalle");
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state">Sin actividad en este punto.</div></td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((x,i) => {
    const j = x.jornada || {};
    const evs = x.eventos.sort((a,b) => String(a.punch_time).localeCompare(String(b.punch_time)));
    const primero = evs[0];
    const tipos = [...new Set(evs.map(e => etiquetaEventoTimeline(e.tipo_evento_jornada, e.modo_visualizacion === "multipunto", Number(e.posicion||1)-1, Number(e.total_marcaciones_jornada||evs.length))))];
    const tieneMulti = evs.some(e => e.modo_visualizacion === "multipunto") || Number(j.total_areas_visitadas || 0) > 1;
    const alertas = Number(j.total_alertas || 0);
    return `<tr>
      <td class="empleado-cell"><strong>${escapeHtml(primero.empleado || j.empleado || "Sin nombre")}</strong><small>${escapeHtml(primero.cedula || j.cedula || "—")} · ${escapeHtml(primero.cargo || j.cargo || "Sin cargo")}</small></td>
      <td>${fechaLegible(primero.fecha || j.fecha)}</td>
      <td>${evs.map(e => horaLegible(e.punch_time)).join(" · ")}</td>
      <td><span class="area-event-badge ${tieneMulti ? "multipunto" : ""}">${escapeHtml(tipos.join(" / "))}</span></td>
      <td>${escapeHtml(primero.proceso_nombre || j.proceso_nombre || "Sin proceso")}</td>
      <td><span class="badge-soft ${j.estado_dia === "en_curso" ? "info" : j.estado_marcaciones === "marcacion_unica" ? "warn" : "ok"}">${escapeHtml(j.estado_dia ? textoEstado(j) : "Actividad registrada")}</span></td>
      <td><span class="badge-soft ${alertas ? claseSeveridad(j.severidad_maxima) : "ok"}">${escapeHtml(j.estado_dia ? textoAlerta(j) : "Sin alertas")}</span></td>
      <td>${j.cedula ? `<button class="btn btn-sm btn-outline-primary btn-area-jornada" data-index="${i}">Ver</button>` : ""}</td>
    </tr>`;
  }).join("");
  tbody.querySelectorAll(".btn-area-jornada").forEach(btn => btn.addEventListener("click", () => {
    const item = rows[Number(btn.dataset.index)];
    if (item?.jornada) mostrarDetalle(item.jornada);
  }));
  if (desplazar) $("areaDetalleCard").scrollIntoView({ behavior: "smooth", block: "start" });
}


async function cargarVistaSemanal() {
  const inicio = $("semanaInicio").value; if (!inicio) return;
  const finD = new Date(inicio + "T12:00:00"); finD.setDate(finD.getDate()+6);
  $("semanaLeyenda").textContent = `${fechaLegible(inicio)} al ${fechaLegible(fechaISO(finD))}`;
  let q = supabase.from("vw_asistencia_consolidado_semanal").select("*").eq("semana_inicio", inicio).order("empleado");
  const proc=$("semanalProceso").value; if(proc) q=q.eq("proceso_codigo",proc);
  const term=$("semanalBusqueda").value.trim(); if(term) q=q.or(`cedula.ilike.%${term}%,empleado.ilike.%${term}%`);
  const {data,error}=await q; if(error){ $("tbodySemanal").innerHTML=`<tr><td colspan="9"><div class="empty-state text-danger">${escapeHtml(error.message)}</div></td></tr>`; return; }
  const rows=data||[];
  $("kpiSemEmpleados").textContent=rows.length; $("kpiSemProgramados").textContent=rows.reduce((s,r)=>s+Number(r.dias_programados||0),0); $("kpiSemMarcados").textContent=rows.reduce((s,r)=>s+Number(r.dias_con_marcaciones||0),0); $("kpiSemMarcas").textContent=rows.reduce((s,r)=>s+Number(r.total_marcaciones||0),0); $("kpiSemUnicas").textContent=rows.reduce((s,r)=>s+Number(r.jornadas_marcacion_unica||0),0); $("kpiSemAlertas").textContent=rows.reduce((s,r)=>s+Number(r.total_alertas||0),0);
  $("tbodySemanal").innerHTML=rows.length?rows.map(r=>{ const ayb=Number(r.referencia_semanal_informativa_horas||0)===42; const comp=Number(r.comparaciones_programacion_disponibles||0); const sin=Number(r.dias_sin_programacion_detectada||0); return `<tr><td class="empleado-cell"><strong>${escapeHtml(r.empleado)}</strong><small>${escapeHtml(r.cedula)} · ${escapeHtml(r.proceso_nombre||r.centro_costos||"Sin proceso")}</small></td><td>${r.dias_programados}</td><td>${r.dias_con_marcaciones}</td><td>${r.total_marcaciones}</td><td><span class="badge-soft ${Number(r.jornadas_marcacion_unica)>0?'warn':'ok'}">${r.jornadas_multiples} múltiples · ${r.jornadas_marcacion_unica} únicas</span></td><td><span class="badge-soft ${Number(r.total_alertas)>0?'warn':'ok'}">${r.total_alertas}</span></td><td>${ayb?`<span class="badge-soft info">${comp} comparables${sin?` · ${sin} sin programación`:''}</span>`:'—'}</td><td>${ayb?Number(r.horas_programadas_brutas||0).toFixed(2):'—'}</td><td>${ayb?`<span class="badge-soft info">42.00 h</span>`:'—'}</td></tr>`;}).join(''):'<tr><td colspan="9"><div class="empty-state">No hay marcaciones para esta semana con los filtros seleccionados.</div></td></tr>';
}

function renderError(msg) { $("tbodyAsistencia").innerHTML = `<tr><td colspan="10"><div class="empty-state text-danger">No fue posible cargar la información: ${escapeHtml(msg)}</div></td></tr>`; }
function marcarConexion(texto, ok=false, error=false) { const el = $("estadoConexion"); el.textContent = texto; el.classList.toggle("ok", ok); el.classList.toggle("error", error); }

document.addEventListener("DOMContentLoaded", iniciar);

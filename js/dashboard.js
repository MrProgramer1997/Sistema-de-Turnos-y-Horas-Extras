import { supabase } from "../supabase/supabaseClient.js";

let sesionActiva = null;
let registrosBase = [];
let filtrosActuales = {
  fechaInicio: "",
  fechaFin: "",
  area: "",
  subarea: "",
  empleado: ""
};

let chartAreas = null;
let chartDias = null;
let chartTopEmpleados = null;
let chartDistribucionAreas = null;
let chartTendenciaFechas = null;
let chartMeses = null;
let chartAnios = null;

document.addEventListener("DOMContentLoaded", async () => {
  const sesion = JSON.parse(localStorage.getItem("ccp_sesion") || "null");

  if (!sesion) {
    window.location.href = "login.html";
    return;
  }

  sesionActiva = sesion;

  cargarDatosUsuario(sesion);
  cargarFechaDashboard();
  aplicarPermisosNavegacion(sesion);
  aplicarPermisosAccesosRapidos(sesion);
  protegerPaginaActual(sesion);
  configurarCerrarSesion();
  configurarBotonActualizar();
  configurarFiltros();

  await cargarDashboardReal(sesion);
});

function cargarDatosUsuario(sesion) {
  setText("nombreUsuario", sesion.nombre_completo || "Usuario");
  setText("rolUsuario", traducirRol(sesion.rol));
  setText("cargoUsuario", sesion.cargo || "Sin cargo");
  setText("centroCostosUsuario", sesion.centro_costos || "Sin área");
}

function cargarFechaDashboard() {
  const hoy = new Date();
  const texto = `${obtenerNombreDia(hoy)} ${hoy.getDate()} de ${obtenerNombreMes(hoy.getMonth())} de ${hoy.getFullYear()}`;
  setText("fechaDashboard", texto);
}

async function cargarDashboardReal(sesion) {
  try {
    const hoy = new Date();
    const fechaHoy = formatearFechaISO(hoy);
    const inicioSemana = obtenerInicioSemanaOperativa(new Date());
    const semana = construirSemana(inicioSemana);
    const fechasSemana = semana.map((d) => d.fecha);

    const { data, error } = await supabase
      .from("programacion_turnos")
      .select("*")
      .order("fecha", { ascending: true });

    if (error) {
      console.error("Error cargando dashboard:", error);
      renderResumenOperativo([]);
      renderVaciosAnaliticos();
      return;
    }

    registrosBase = filtrarRegistrosPorPermisos(data || [], sesion);

    inicializarFiltrosRango();
    poblarOpcionesFiltros(registrosBase);

    const registrosHoy = registrosBase.filter((item) => String(item.fecha || "") === fechaHoy);
    const registrosSemana = registrosBase.filter((item) => fechasSemana.includes(String(item.fecha || "")));

    const programadosHoy = registrosHoy.length;
    const subareasHoy = new Set(registrosHoy.map((r) => String(r.subarea || "").trim()).filter(Boolean)).size;
    const novedadesHoy = registrosHoy.filter((r) => esNovedad(r)).length;
    const asignacionesSemana = registrosSemana.length;

    const semanaAyb = registrosSemana.filter((r) => esAyb(r)).length;
    const semanaAdmin = registrosSemana.filter((r) => esAdministrativo(r)).length;
    const semanaOperaciones = registrosSemana.filter((r) => esOperaciones(r)).length;
    const empleadosSemana = new Set(
      registrosSemana.map((r) => String(r.cedula || "").trim()).filter(Boolean)
    ).size;

    setText("kpiProgramadosHoy", programadosHoy);
    setText("kpiPresentes", subareasHoy);
    setText("kpiAusentes", novedadesHoy);
    setText("kpiValidaciones", asignacionesSemana);

    setText("kpiSemanaAyb", semanaAyb);
    setText("kpiSemanaAdmin", semanaAdmin);
    setText("kpiSemanaOperaciones", semanaOperaciones);
    setText("kpiSemanaEmpleados", empleadosSemana);

    renderResumenOperativo(registrosHoy);
    aplicarFiltrosAnaliticos();
  } catch (err) {
    console.error("Error general dashboard:", err);
    renderResumenOperativo([]);
    renderVaciosAnaliticos();
  }
}

function configurarFiltros() {
  const filtroFechaInicio = document.getElementById("filtroFechaInicio");
  const filtroFechaFin = document.getElementById("filtroFechaFin");
  const filtroArea = document.getElementById("filtroArea");
  const filtroSubarea = document.getElementById("filtroSubarea");
  const filtroEmpleado = document.getElementById("filtroEmpleado");
  const btnLimpiar = document.getElementById("btnLimpiarFiltros");

  [filtroFechaInicio, filtroFechaFin, filtroArea, filtroSubarea, filtroEmpleado].forEach((elemento) => {
    if (!elemento) return;

    elemento.addEventListener("change", () => {
      filtrosActuales.fechaInicio = filtroFechaInicio?.value || "";
      filtrosActuales.fechaFin = filtroFechaFin?.value || "";
      filtrosActuales.area = filtroArea?.value || "";
      filtrosActuales.subarea = filtroSubarea?.value || "";
      filtrosActuales.empleado = filtroEmpleado?.value || "";
      aplicarFiltrosAnaliticos();
    });
  });

  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", () => {
      limpiarFiltros();
      aplicarFiltrosAnaliticos();
    });
  }
}

function inicializarFiltrosRango() {
  const filtroFechaInicio = document.getElementById("filtroFechaInicio");
  const filtroFechaFin = document.getElementById("filtroFechaFin");

  if (!filtroFechaInicio || !filtroFechaFin) return;

  if (!filtrosActuales.fechaInicio || !filtrosActuales.fechaFin) {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    filtroFechaInicio.value = formatearFechaISO(inicioMes);
    filtroFechaFin.value = formatearFechaISO(hoy);

    filtrosActuales.fechaInicio = filtroFechaInicio.value;
    filtrosActuales.fechaFin = filtroFechaFin.value;
  } else {
    filtroFechaInicio.value = filtrosActuales.fechaInicio;
    filtroFechaFin.value = filtrosActuales.fechaFin;
  }
}

function poblarOpcionesFiltros(registros) {
  const filtroArea = document.getElementById("filtroArea");
  const filtroSubarea = document.getElementById("filtroSubarea");
  const filtroEmpleado = document.getElementById("filtroEmpleado");

  if (!filtroArea || !filtroSubarea || !filtroEmpleado) return;

  const areas = [...new Set(
    registros.map((item) => obtenerAreaAmigable(item)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const subareas = [...new Set(
    registros.map((item) => String(item.subarea || "").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const empleados = [...new Set(
    registros.map((item) => obtenerNombreEmpleado(item)).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  filtroArea.innerHTML = `<option value="">Todas</option>${areas
    .map((area) => `<option value="${escaparHtml(area)}">${escaparHtml(area)}</option>`)
    .join("")}`;

  filtroSubarea.innerHTML = `<option value="">Todas</option>${subareas
    .map((subarea) => `<option value="${escaparHtml(subarea)}">${escaparHtml(subarea)}</option>`)
    .join("")}`;

  filtroEmpleado.innerHTML = `<option value="">Todos</option>${empleados
    .map((empleado) => `<option value="${escaparHtml(empleado)}">${escaparHtml(empleado)}</option>`)
    .join("")}`;

  filtroArea.value = filtrosActuales.area || "";
  filtroSubarea.value = filtrosActuales.subarea || "";
  filtroEmpleado.value = filtrosActuales.empleado || "";
}

function limpiarFiltros() {
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const filtroFechaInicio = document.getElementById("filtroFechaInicio");
  const filtroFechaFin = document.getElementById("filtroFechaFin");
  const filtroArea = document.getElementById("filtroArea");
  const filtroSubarea = document.getElementById("filtroSubarea");
  const filtroEmpleado = document.getElementById("filtroEmpleado");

  if (filtroFechaInicio) filtroFechaInicio.value = formatearFechaISO(inicioMes);
  if (filtroFechaFin) filtroFechaFin.value = formatearFechaISO(hoy);
  if (filtroArea) filtroArea.value = "";
  if (filtroSubarea) filtroSubarea.value = "";
  if (filtroEmpleado) filtroEmpleado.value = "";

  filtrosActuales = {
    fechaInicio: filtroFechaInicio?.value || "",
    fechaFin: filtroFechaFin?.value || "",
    area: "",
    subarea: "",
    empleado: ""
  };
}

function aplicarFiltrosAnaliticos() {
  const registrosFiltrados = registrosBase.filter((item) => {
    const fecha = String(item.fecha || "");
    const area = obtenerAreaAmigable(item);
    const subarea = String(item.subarea || "").trim();
    const empleado = obtenerNombreEmpleado(item);

    if (filtrosActuales.fechaInicio && fecha < filtrosActuales.fechaInicio) return false;
    if (filtrosActuales.fechaFin && fecha > filtrosActuales.fechaFin) return false;
    if (filtrosActuales.area && area !== filtrosActuales.area) return false;
    if (filtrosActuales.subarea && subarea !== filtrosActuales.subarea) return false;
    if (filtrosActuales.empleado && empleado !== filtrosActuales.empleado) return false;

    return true;
  });

  actualizarBadgesAnaliticos(registrosFiltrados);
  renderKPIsGeneralesAnaliticos(registrosFiltrados);
  renderKPIsAnaliticos(registrosFiltrados);
  renderKPIsNovedades(registrosFiltrados);
  renderKPIsAlertas(registrosFiltrados);
  renderComparativosPeriodo();
  renderTopEmpleados(registrosFiltrados);
  renderTopAsistencia(registrosFiltrados);
  renderTopSubareas(registrosFiltrados);
  renderNovedadesPorArea(registrosFiltrados);
  renderTablaNovedadesActivas(registrosFiltrados);
  renderTablaIncapacidades(registrosFiltrados);
  renderTablaAusentesHoy(registrosFiltrados);
  renderTablaAlertasCriticas(registrosFiltrados);

  renderGraficaAreas(registrosFiltrados);
  renderGraficaDias(registrosFiltrados);
  renderGraficaTopEmpleados(registrosFiltrados);
  renderGraficaDistribucionAreas(registrosFiltrados);
  renderGraficaTendenciaFechas(registrosFiltrados);
  renderGraficaMeses(registrosBase);
  renderGraficaAnios(registrosBase);
}

function actualizarBadgesAnaliticos(registros) {
  const empleados = new Set(
    registros.map((item) => String(item.cedula || item.empleado_id || obtenerNombreEmpleado(item)).trim()).filter(Boolean)
  ).size;

  const dias = new Set(
    registros.map((item) => String(item.fecha || "").trim()).filter(Boolean)
  ).size;

  const rangoTexto = filtrosActuales.fechaInicio || filtrosActuales.fechaFin
    ? `Rango activo: ${filtrosActuales.fechaInicio || "inicio"} a ${filtrosActuales.fechaFin || "hoy"}`
    : "Rango activo: todo el historial";

  setText("badgeRangoActivo", rangoTexto);
  setText("badgeRegistrosAnalizados", `Registros analizados: ${registros.length}`);
  setText("badgeEmpleadosAnalizados", `Empleados: ${empleados}`);
  setText("badgeDiasAnalizados", `Días con registros: ${dias}`);
}

function renderKPIsGeneralesAnaliticos(registros) {
  const dias = new Set(registros.map((item) => String(item.fecha || "")).filter(Boolean)).size;
  const empleados = new Set(
    registros.map((item) => String(item.cedula || item.empleado_id || obtenerNombreEmpleado(item)).trim()).filter(Boolean)
  ).size;
  const promedioDiario = dias > 0 ? (registros.length / dias) : 0;

  setText("kpiTotalPeriodo", registros.length);
  setText("kpiPromedioDiario", formatearNumero(promedioDiario));
  setText("kpiEmpleadosActivos", empleados);
  setText("kpiDiasConRegistros", dias);
}

function renderKPIsAnaliticos(registros) {
  if (!registros.length) {
    setText("kpiTopEmpleado", "Sin datos");
    setText("kpiTopEmpleadoDetalle", "0 registros");
    setText("kpiTopDia", "Sin datos");
    setText("kpiTopDiaDetalle", "0 asignaciones");
    setText("kpiTopArea", "Sin datos");
    setText("kpiTopAreaDetalle", "0 registros");
    setText("kpiTopSubarea", "Sin datos");
    setText("kpiTopSubareaDetalle", "0 registros");
    return;
  }

  const topEmpleado = Object.values(agruparEmpleados(registros))
    .sort((a, b) => b.asignaciones - a.asignaciones)[0];

  const topDia = Object.entries(
    contarPor(registros, (item) => String(item.fecha || ""))
  ).sort((a, b) => b[1] - a[1])[0];

  const topArea = Object.entries(
    contarPor(registros, (item) => obtenerAreaAmigable(item))
  ).sort((a, b) => b[1] - a[1])[0];

  const topSubarea = Object.entries(
    contarPor(registros, (item) => String(item.subarea || "").trim() || "Sin subárea")
  ).sort((a, b) => b[1] - a[1])[0];

  setText("kpiTopEmpleado", topEmpleado?.nombre || "Sin datos");
  setText(
    "kpiTopEmpleadoDetalle",
    `${topEmpleado?.asignaciones || 0} asignaciones en ${topEmpleado?.dias || 0} días`
  );

  setText("kpiTopDia", formatearFechaCorta(topDia?.[0]) || "Sin datos");
  setText("kpiTopDiaDetalle", `${topDia?.[1] || 0} asignaciones`);

  setText("kpiTopArea", topArea?.[0] || "Sin datos");
  setText("kpiTopAreaDetalle", `${topArea?.[1] || 0} registros`);

  setText("kpiTopSubarea", topSubarea?.[0] || "Sin datos");
  setText("kpiTopSubareaDetalle", `${topSubarea?.[1] || 0} registros`);
}

function renderKPIsNovedades(registros) {
  const novedades = registros.filter((item) => esNovedad(item));
  const incap = novedades.filter((item) => clasificarNovedad(item) === "incapacidad").length;
  const vaca = novedades.filter((item) => clasificarNovedad(item) === "vacaciones").length;
  const lic = novedades.filter((item) => clasificarNovedad(item) === "licencia").length;
  const otras = novedades.filter((item) => !["incapacidad", "vacaciones", "licencia"].includes(clasificarNovedad(item))).length;

  setText("kpiIncapacidades", incap);
  setText("kpiVacaciones", vaca);
  setText("kpiLicencias", lic);
  setText("kpiOtrasNovedades", otras);
}

function renderKPIsAlertas(registros) {
  const hoy = formatearFechaISO(new Date());
  const ausentesHoy = registros.filter((item) => esNovedad(item) && String(item.fecha || "") === hoy);

  const agrupadas = agruparNovedadesPorEmpleado(registros);
  const ordenadas = [...agrupadas].sort((a, b) => b.maxConsecutivos - a.maxConsecutivos || b.totalFechas - a.totalFechas);
  const top = ordenadas[0];

  const rankingAreas = Object.entries(
    contarPor(registros.filter((item) => esNovedad(item)), (item) => obtenerAreaAmigable(item))
  ).sort((a, b) => b[1] - a[1]);
  const topArea = rankingAreas[0];

  const criticos = agrupadas.filter((item) => item.maxConsecutivos >= 5).length;

  setText("kpiAusentesHoy", ausentesHoy.length);
  setText("kpiNovedadMasLarga", top ? top.nombre : "Sin datos");
  setText("kpiNovedadMasLargaDetalle", top ? `${top.maxConsecutivos} días consecutivos - ${top.label}` : "0 días");
  setText("kpiAreaMasAusencias", topArea?.[0] || "Sin datos");
  setText("kpiAreaMasAusenciasDetalle", `${topArea?.[1] || 0} novedades`);
  setText("kpiCasosCriticos", criticos);
}

function renderComparativosPeriodo() {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  const mesAnteriorDate = new Date(anioActual, hoy.getMonth() - 1, 1);
  const anioMesAnterior = mesAnteriorDate.getFullYear();
  const mesAnterior = mesAnteriorDate.getMonth() + 1;

  const anioAnterior = anioActual - 1;

  const totalMesActual = registrosBase.filter((item) => {
    const partes = String(item.fecha || "").split("-");
    return Number(partes[0]) === anioActual && Number(partes[1]) === mesActual;
  }).length;

  const totalMesAnterior = registrosBase.filter((item) => {
    const partes = String(item.fecha || "").split("-");
    return Number(partes[0]) === anioMesAnterior && Number(partes[1]) === mesAnterior;
  }).length;

  const totalAnioActual = registrosBase.filter((item) => {
    const partes = String(item.fecha || "").split("-");
    return Number(partes[0]) === anioActual;
  }).length;

  const totalAnioAnterior = registrosBase.filter((item) => {
    const partes = String(item.fecha || "").split("-");
    return Number(partes[0]) === anioAnterior;
  }).length;

  setText("kpiMesActual", totalMesActual);
  setText("kpiMesActualDetalle", `${obtenerNombreMes(mesActual - 1)} ${anioActual}`);
  pintarComparativo("kpiMesComparativo", totalMesActual, totalMesAnterior, "mes anterior");

  setText("kpiAnioActual", totalAnioActual);
  setText("kpiAnioActualDetalle", `${anioActual}`);
  pintarComparativo("kpiAnioComparativo", totalAnioActual, totalAnioAnterior, "año anterior");
}

function pintarComparativo(id, actual, anterior, textoBase) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!anterior) {
    el.textContent = `Sin base de comparación con ${textoBase}`;
    el.className = "kpi-comparativo neutro";
    return;
  }

  const diferencia = actual - anterior;
  const porcentaje = ((diferencia / anterior) * 100);

  if (diferencia > 0) {
    el.textContent = `Subió ${formatearNumero(porcentaje)}% vs ${textoBase}`;
    el.className = "kpi-comparativo sube";
  } else if (diferencia < 0) {
    el.textContent = `Bajó ${formatearNumero(Math.abs(porcentaje))}% vs ${textoBase}`;
    el.className = "kpi-comparativo baja";
  } else {
    el.textContent = `Sin variación vs ${textoBase}`;
    el.className = "kpi-comparativo neutro";
  }
}

function renderTopEmpleados(registros) {
  const tbody = document.getElementById("tbodyTopEmpleados");
  if (!tbody) return;

  const top = Object.values(agruparEmpleados(registros))
    .sort((a, b) => b.asignaciones - a.asignaciones)
    .slice(0, 10);

  if (!top.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-vacio">No hay datos para este filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = top.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escaparHtml(item.nombre)}</td>
      <td>${escaparHtml(item.cedula)}</td>
      <td>${item.asignaciones}</td>
      <td>${item.dias}</td>
    </tr>
  `).join("");
}

function renderTopAsistencia(registros) {
  const tbody = document.getElementById("tbodyTopAsistencia");
  if (!tbody) return;

  const top = Object.values(agruparEmpleados(registros))
    .sort((a, b) => b.dias - a.dias || b.asignaciones - a.asignaciones)
    .slice(0, 10);

  if (!top.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="texto-vacio">No hay datos para este filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = top.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escaparHtml(item.nombre)}</td>
      <td>${escaparHtml(item.area)}</td>
      <td>${item.dias}</td>
    </tr>
  `).join("");
}

function renderTopSubareas(registros) {
  const tbody = document.getElementById("tbodyTopSubareas");
  if (!tbody) return;

  const ranking = Object.entries(
    contarPor(registros, (item) => String(item.subarea || "").trim() || "Sin subárea")
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!ranking.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="texto-vacio">No hay datos para este filtro.</td></tr>`;
    return;
  }

  tbody.innerHTML = ranking.map(([subarea, total], index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escaparHtml(subarea)}</td>
      <td>${total}</td>
    </tr>
  `).join("");
}

function renderNovedadesPorArea(registros) {
  const tbody = document.getElementById("tbodyNovedadesArea");
  if (!tbody) return;

  const novedades = registros.filter((item) => esNovedad(item));
  const ranking = Object.entries(
    contarPor(novedades, (item) => obtenerAreaAmigable(item))
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!ranking.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="texto-vacio">No hay novedades en el rango seleccionado.</td></tr>`;
    return;
  }

  tbody.innerHTML = ranking.map(([area, total], index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escaparHtml(area)}</td>
      <td>${total}</td>
    </tr>
  `).join("");
}

function renderTablaNovedadesActivas(registros) {
  const tbody = document.getElementById("tbodyNovedadesActivas");
  if (!tbody) return;

  const novedades = agruparNovedadesPorEmpleado(registros).slice(0, 20);

  if (!novedades.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-vacio">No hay novedades en el filtro actual.</td></tr>`;
    return;
  }

  tbody.innerHTML = novedades.map((item, index) => `
    <tr class="${item.tipo === "incapacidad" ? "fila-alerta" : ""}">
      <td>${index + 1}</td>
      <td>${escaparHtml(item.nombre)}</td>
      <td>${escaparHtml(item.area)}</td>
      <td>${crearBadgeNovedad(item.tipo, item.label)}</td>
      <td>${escaparHtml(item.fechasTexto)}</td>
    </tr>
  `).join("");
}

function renderTablaIncapacidades(registros) {
  const tbody = document.getElementById("tbodyIncapacidades");
  if (!tbody) return;

  const incap = agruparNovedadesPorEmpleado(registros)
    .filter((item) => item.tipo === "incapacidad")
    .slice(0, 20);

  if (!incap.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-vacio">No hay incapacidades en el filtro actual.</td></tr>`;
    return;
  }

  tbody.innerHTML = incap.map((item, index) => `
    <tr class="${item.maxConsecutivos >= 5 ? "fila-critica" : "fila-alerta"}">
      <td>${index + 1}</td>
      <td>${escaparHtml(item.nombre)}</td>
      <td>${escaparHtml(item.area)}</td>
      <td>${item.maxConsecutivos}</td>
      <td>${escaparHtml(item.fechasTexto)}</td>
    </tr>
  `).join("");
}

function renderTablaAusentesHoy(registros) {
  const tbody = document.getElementById("tbodyAusentesHoy");
  if (!tbody) return;

  const hoy = formatearFechaISO(new Date());
  const ausentes = registros
    .filter((item) => esNovedad(item) && String(item.fecha || "") === hoy)
    .sort((a, b) => obtenerNombreEmpleado(a).localeCompare(obtenerNombreEmpleado(b)));

  if (!ausentes.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-vacio">No hay ausentes hoy.</td></tr>`;
    return;
  }

  tbody.innerHTML = ausentes.map((item, index) => {
    const tipo = clasificarNovedad(item);
    const label = obtenerLabelNovedad(item);
    return `
      <tr class="${tipo === "incapacidad" ? "fila-alerta" : ""}">
        <td>${index + 1}</td>
        <td>${escaparHtml(obtenerNombreEmpleado(item))}</td>
        <td>${escaparHtml(obtenerAreaAmigable(item))}</td>
        <td>${crearBadgeNovedad(tipo, label)}</td>
        <td>${escaparHtml(formatearFechaCorta(item.fecha))}</td>
      </tr>
    `;
  }).join("");
}

function renderTablaAlertasCriticas(registros) {
  const tbody = document.getElementById("tbodyAlertasCriticas");
  if (!tbody) return;

  const alertas = agruparNovedadesPorEmpleado(registros)
    .filter((item) => item.maxConsecutivos >= 3)
    .sort((a, b) => b.maxConsecutivos - a.maxConsecutivos || a.nombre.localeCompare(b.nombre))
    .slice(0, 20);

  if (!alertas.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="texto-vacio">No hay alertas críticas en el filtro actual.</td></tr>`;
    return;
  }

  tbody.innerHTML = alertas.map((item, index) => `
    <tr class="${item.maxConsecutivos >= 5 ? "fila-critica" : "fila-alerta"}">
      <td>${index + 1}</td>
      <td>${escaparHtml(item.nombre)}</td>
      <td>${crearBadgeNovedad(item.tipo, item.label)}</td>
      <td>${item.maxConsecutivos}</td>
      <td>${crearSemaforo(item.maxConsecutivos)}</td>
    </tr>
  `).join("");
}

function renderGraficaAreas(registros) {
  const canvas = document.getElementById("graficaAreas");
  if (!canvas) return;

  destruirGrafica("areas");

  const ranking = Object.entries(
    contarPor(registros, (item) => obtenerAreaAmigable(item))
  ).sort((a, b) => b[1] - a[1]);

  chartAreas = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ranking.map(([label]) => label),
      datasets: [{
        label: "Asignaciones",
        data: ranking.map(([, value]) => value),
        backgroundColor: [
          "rgba(13,110,253,0.75)",
          "rgba(25,135,84,0.75)",
          "rgba(255,193,7,0.75)",
          "rgba(13,202,240,0.75)",
          "rgba(108,117,125,0.75)",
          "rgba(220,53,69,0.75)"
        ],
        borderRadius: 8,
        borderWidth: 1.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function renderGraficaDias(registros) {
  const canvas = document.getElementById("graficaDias");
  if (!canvas) return;

  destruirGrafica("dias");

  const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const conteo = {
    "Domingo": 0,
    "Lunes": 0,
    "Martes": 0,
    "Miércoles": 0,
    "Jueves": 0,
    "Viernes": 0,
    "Sábado": 0
  };

  registros.forEach((item) => {
    if (!item.fecha) return;
    const fecha = new Date(`${item.fecha}T00:00:00`);
    const dia = diasSemana[fecha.getDay()];
    conteo[dia] += 1;
  });

  chartDias = new Chart(canvas, {
    type: "line",
    data: {
      labels: diasSemana,
      datasets: [{
        label: "Carga laboral",
        data: diasSemana.map((dia) => conteo[dia]),
        borderColor: "rgba(13,110,253,1)",
        backgroundColor: "rgba(13,110,253,0.15)",
        fill: true,
        tension: 0.35,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function renderGraficaTopEmpleados(registros) {
  const canvas = document.getElementById("graficaTopEmpleados");
  if (!canvas) return;

  destruirGrafica("topEmpleados");

  const top = Object.values(agruparEmpleados(registros))
    .sort((a, b) => b.asignaciones - a.asignaciones)
    .slice(0, 8);

  chartTopEmpleados = new Chart(canvas, {
    type: "bar",
    data: {
      labels: top.map((item) => recortarTexto(item.nombre, 18)),
      datasets: [{
        label: "Asignaciones",
        data: top.map((item) => item.asignaciones),
        backgroundColor: "rgba(25,135,84,0.75)",
        borderColor: "rgba(25,135,84,1)",
        borderWidth: 1.5,
        borderRadius: 8
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function renderGraficaDistribucionAreas(registros) {
  const canvas = document.getElementById("graficaDistribucionAreas");
  if (!canvas) return;

  destruirGrafica("distribucionAreas");

  const ranking = Object.entries(
    contarPor(registros, (item) => obtenerAreaAmigable(item))
  ).sort((a, b) => b[1] - a[1]);

  chartDistribucionAreas = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ranking.map(([label]) => label),
      datasets: [{
        data: ranking.map(([, value]) => value),
        backgroundColor: [
          "rgba(13,110,253,0.85)",
          "rgba(25,135,84,0.85)",
          "rgba(255,193,7,0.85)",
          "rgba(220,53,69,0.85)",
          "rgba(13,202,240,0.85)",
          "rgba(108,117,125,0.85)",
          "rgba(111,66,193,0.85)",
          "rgba(253,126,20,0.85)"
        ],
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" }
      }
    }
  });
}

function renderGraficaTendenciaFechas(registros) {
  const canvas = document.getElementById("graficaTendenciaFechas");
  if (!canvas) return;

  destruirGrafica("tendenciaFechas");

  const ranking = Object.entries(
    contarPor(registros, (item) => String(item.fecha || ""))
  ).sort((a, b) => a[0].localeCompare(b[0]));

  chartTendenciaFechas = new Chart(canvas, {
    type: "line",
    data: {
      labels: ranking.map(([fecha]) => formatearFechaCorta(fecha)),
      datasets: [{
        label: "Asignaciones por fecha",
        data: ranking.map(([, total]) => total),
        borderColor: "rgba(111,66,193,1)",
        backgroundColor: "rgba(111,66,193,0.12)",
        fill: true,
        tension: 0.25,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function renderGraficaMeses(registros) {
  const canvas = document.getElementById("graficaMeses");
  if (!canvas) return;

  destruirGrafica("meses");

  const mapa = {};

  registros.forEach((item) => {
    const fecha = String(item.fecha || "");
    const [anio, mes] = fecha.split("-");
    if (!anio || !mes) return;

    const clave = `${anio}-${mes}`;
    mapa[clave] = (mapa[clave] || 0) + 1;
  });

  const ordenado = Object.entries(mapa)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12);

  chartMeses = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ordenado.map(([clave]) => formatearMesAnio(clave)),
      datasets: [{
        label: "Registros por mes",
        data: ordenado.map(([, total]) => total),
        backgroundColor: "rgba(13,202,240,0.75)",
        borderColor: "rgba(13,202,240,1)",
        borderWidth: 1.5,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function renderGraficaAnios(registros) {
  const canvas = document.getElementById("graficaAnios");
  if (!canvas) return;

  destruirGrafica("anios");

  const mapa = {};

  registros.forEach((item) => {
    const fecha = String(item.fecha || "");
    const [anio] = fecha.split("-");
    if (!anio) return;
    mapa[anio] = (mapa[anio] || 0) + 1;
  });

  const ordenado = Object.entries(mapa).sort((a, b) => a[0].localeCompare(b[0]));

  chartAnios = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ordenado.map(([anio]) => anio),
      datasets: [{
        label: "Registros por año",
        data: ordenado.map(([, total]) => total),
        backgroundColor: "rgba(255,193,7,0.75)",
        borderColor: "rgba(255,193,7,1)",
        borderWidth: 1.5,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });
}

function agruparEmpleados(registros) {
  const mapa = {};

  registros.forEach((item) => {
    const cedula = String(item.cedula || "").trim() || "Sin cédula";
    const nombre = obtenerNombreEmpleado(item);
    const area = obtenerAreaAmigable(item);
    const fecha = String(item.fecha || "");

    if (!mapa[cedula]) {
      mapa[cedula] = {
        cedula,
        nombre,
        area,
        asignaciones: 0,
        fechas: new Set()
      };
    }

    mapa[cedula].asignaciones += 1;
    if (fecha) mapa[cedula].fechas.add(fecha);
  });

  Object.values(mapa).forEach((item) => {
    item.dias = item.fechas.size;
    delete item.fechas;
  });

  return mapa;
}

function agruparNovedadesPorEmpleado(registros) {
  const novedades = registros.filter((item) => esNovedad(item));
  const mapa = {};

  novedades.forEach((item) => {
    const cedula = String(item.cedula || "").trim() || obtenerNombreEmpleado(item);
    const nombre = obtenerNombreEmpleado(item);
    const area = obtenerAreaAmigable(item);
    const fecha = String(item.fecha || "").trim();
    const tipo = clasificarNovedad(item);
    const label = obtenerLabelNovedad(item);

    const clave = `${cedula}__${tipo}`;

    if (!mapa[clave]) {
      mapa[clave] = {
        cedula,
        nombre,
        area,
        tipo,
        label,
        fechas: []
      };
    }

    if (fecha) {
      mapa[clave].fechas.push(fecha);
    }
  });

  return Object.values(mapa)
    .map((item) => {
      const fechasOrdenadas = [...new Set(item.fechas)].sort((a, b) => a.localeCompare(b));
      const maxConsecutivos = calcularMaximoConsecutivo(fechasOrdenadas);

      return {
        ...item,
        fechasOrdenadas,
        totalFechas: fechasOrdenadas.length,
        maxConsecutivos,
        fechasTexto: resumirFechas(fechasOrdenadas)
      };
    })
    .sort((a, b) => b.maxConsecutivos - a.maxConsecutivos || b.totalFechas - a.totalFechas || a.nombre.localeCompare(b.nombre));
}

function contarPor(registros, fnClave) {
  return registros.reduce((acc, item) => {
    const clave = fnClave(item);
    acc[clave] = (acc[clave] || 0) + 1;
    return acc;
  }, {});
}

function filtrarRegistrosPorPermisos(registros, sesion) {
  if (sesion.puede_ver_todo === true) {
    return registros;
  }

  const areasPermitidas = Array.isArray(sesion.areas_permitidas) ? sesion.areas_permitidas : [];
  if (areasPermitidas.length === 0) {
    return [];
  }

  return registros.filter((registro) => {
    const area = String(registro.area || "").toUpperCase();
    const subarea = String(registro.subarea || "").toUpperCase();

    return areasPermitidas.some((permitida) => {
      const permiso = String(permitida || "").toUpperCase();
      return area.includes(permiso) || subarea.includes(permiso);
    });
  });
}

function renderResumenOperativo(registrosHoy) {
  const tbody = document.getElementById("tbodyResumenOperativo");
  if (!tbody) return;

  if (!registrosHoy.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted">No hay registros para hoy.</td>
      </tr>
    `;
    return;
  }

  const resumen = {};

  registrosHoy.forEach((item) => {
    const area = obtenerAreaAmigable(item);

    if (!resumen[area]) {
      resumen[area] = {
        programados: 0,
        novedades: 0,
        subareas: new Set()
      };
    }

    resumen[area].programados += 1;

    if (esNovedad(item)) {
      resumen[area].novedades += 1;
    }

    if (item.subarea) {
      resumen[area].subareas.add(item.subarea);
    }
  });

  tbody.innerHTML = Object.entries(resumen).map(([area, datos]) => `
    <tr>
      <td>${escaparHtml(area)}</td>
      <td>${datos.programados}</td>
      <td>${datos.novedades}</td>
      <td>${datos.subareas.size}</td>
    </tr>
  `).join("");
}

function renderVaciosAnaliticos() {
  renderTopEmpleados([]);
  renderTopAsistencia([]);
  renderTopSubareas([]);
  renderNovedadesPorArea([]);
  renderTablaNovedadesActivas([]);
  renderTablaIncapacidades([]);
  renderTablaAusentesHoy([]);
  renderTablaAlertasCriticas([]);
  renderKPIsGeneralesAnaliticos([]);
  renderKPIsAnaliticos([]);
  renderKPIsNovedades([]);
  actualizarBadgesAnaliticos([]);

  [
    "areas",
    "dias",
    "topEmpleados",
    "distribucionAreas",
    "tendenciaFechas",
    "meses",
    "anios"
  ].forEach(destruirGrafica);
}

function destruirGrafica(tipo) {
  if (tipo === "areas" && chartAreas) {
    chartAreas.destroy();
    chartAreas = null;
  }

  if (tipo === "dias" && chartDias) {
    chartDias.destroy();
    chartDias = null;
  }

  if (tipo === "topEmpleados" && chartTopEmpleados) {
    chartTopEmpleados.destroy();
    chartTopEmpleados = null;
  }

  if (tipo === "distribucionAreas" && chartDistribucionAreas) {
    chartDistribucionAreas.destroy();
    chartDistribucionAreas = null;
  }

  if (tipo === "tendenciaFechas" && chartTendenciaFechas) {
    chartTendenciaFechas.destroy();
    chartTendenciaFechas = null;
  }

  if (tipo === "meses" && chartMeses) {
    chartMeses.destroy();
    chartMeses = null;
  }

  if (tipo === "anios" && chartAnios) {
    chartAnios.destroy();
    chartAnios = null;
  }
}

function obtenerNombreEmpleado(item) {
  return String(
    item.nombre_completo ||
    item.empleado ||
    item.nombre ||
    item.colaborador ||
    "Sin nombre"
  ).trim();
}

function obtenerAreaAmigable(item) {
  const area = String(item.area || "").toUpperCase();
  const subarea = String(item.subarea || "").toUpperCase();

  if (area.includes("ALIMENTOS") || area.includes("BEBIDAS")) return "Alimentos y Bebidas";
  if (area.includes("OPERACIONES") || area.includes("SERVICIOS")) return "Operaciones";
  if (area.includes("ADMIN")) return "Administrativo";
  if (subarea) return String(item.subarea || "").trim();
  return String(item.area || "Sin área").trim();
}

function esNovedad(item) {
  return String(item.tipo_registro || "").toLowerCase() === "novedad" || Boolean(item.novedad_codigo);
}

function clasificarNovedad(item) {
  const texto = `${String(item.novedad_codigo || "")} ${String(item.tipo_registro || "")} ${String(item.novedad || "")} ${String(item.observacion || "")}`.toLowerCase();

  if (texto.includes("incap")) return "incapacidad";
  if (texto.includes("vacac")) return "vacaciones";
  if (texto.includes("licen") || texto.includes("permiso")) return "licencia";
  if (texto.includes("descanso")) return "descanso";
  return "otra";
}

function obtenerLabelNovedad(item) {
  const tipo = clasificarNovedad(item);
  const codigo = String(item.novedad_codigo || "").trim();
  const novedad = String(item.novedad || "").trim();

  if (novedad) return novedad;
  if (codigo) return codigo;

  if (tipo === "incapacidad") return "Incapacidad";
  if (tipo === "vacaciones") return "Vacaciones";
  if (tipo === "licencia") return "Licencia";
  if (tipo === "descanso") return "Descanso";
  return "Otra novedad";
}

function crearBadgeNovedad(tipo, label) {
  const texto = escaparHtml(label || obtenerTextoTipoNovedad(tipo));
  const clase = obtenerClaseBadgeNovedad(tipo);
  return `<span class="badge-novedad ${clase}">${texto}</span>`;
}

function obtenerClaseBadgeNovedad(tipo) {
  if (tipo === "incapacidad") return "badge-incapacidad";
  if (tipo === "vacaciones") return "badge-vacaciones";
  if (tipo === "licencia") return "badge-licencia";
  if (tipo === "descanso") return "badge-descanso";
  return "badge-otra";
}

function obtenerTextoTipoNovedad(tipo) {
  if (tipo === "incapacidad") return "Incapacidad";
  if (tipo === "vacaciones") return "Vacaciones";
  if (tipo === "licencia") return "Licencia";
  if (tipo === "descanso") return "Descanso";
  return "Otra novedad";
}

function resumirFechas(fechas) {
  if (!fechas.length) return "Sin fechas";
  const convertidas = fechas.map((fecha) => formatearFechaCorta(fecha));
  if (convertidas.length <= 3) return convertidas.join(", ");
  return `${convertidas.slice(0, 3).join(", ")} y ${convertidas.length - 3} más`;
}

function crearSemaforo(dias) {
  if (dias >= 5) return `<span class="alerta-semaforo alerta-rojo">Crítico</span>`;
  if (dias >= 3) return `<span class="alerta-semaforo alerta-amarillo">Seguimiento</span>`;
  return `<span class="alerta-semaforo alerta-verde">Normal</span>`;
}

function calcularMaximoConsecutivo(fechasOrdenadas) {
  if (!fechasOrdenadas.length) return 0;
  if (fechasOrdenadas.length === 1) return 1;

  let maximo = 1;
  let actual = 1;

  for (let i = 1; i < fechasOrdenadas.length; i++) {
    const anterior = new Date(`${fechasOrdenadas[i - 1]}T00:00:00`);
    const actualFecha = new Date(`${fechasOrdenadas[i]}T00:00:00`);
    const diferencia = Math.round((actualFecha - anterior) / 86400000);

    if (diferencia === 1) {
      actual += 1;
    } else {
      actual = 1;
    }

    if (actual > maximo) {
      maximo = actual;
    }
  }

  return maximo;
}

function esAyb(item) {
  const area = String(item.area || "").toUpperCase();
  return area.includes("ALIMENTOS") || area.includes("BEBIDAS");
}

function esOperaciones(item) {
  const area = String(item.area || "").toUpperCase();
  return area.includes("OPERACIONES") || area.includes("SERVICIOS");
}

function esAdministrativo(item) {
  return !esAyb(item) && !esOperaciones(item);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function recortarTexto(texto, maximo = 20) {
  const valor = String(texto || "");
  return valor.length <= maximo ? valor : `${valor.slice(0, maximo)}...`;
}

function formatearNumero(valor) {
  const numero = Number(valor || 0);
  return numero % 1 === 0 ? String(numero) : numero.toFixed(1);
}

function formatearMesAnio(clave) {
  const [anio, mes] = String(clave).split("-");
  if (!anio || !mes) return clave;
  return `${obtenerNombreMes(Number(mes) - 1).slice(0, 3)} ${anio}`;
}

function traducirRol(rol) {
  const mapa = {
    admin: "Administrador",
    gerencia: "Gerencia",
    bienestar: "Bienestar Institucional",
    direccion_financiera: "Dirección Administrativa y Financiera",
    ayb: "Alimentos y Bebidas",
    servicios_generales: "Servicios Generales",
    empleado: "Empleado"
  };

  return mapa[String(rol || "").trim().toLowerCase()] || rol || "Sin rol";
}

function aplicarPermisosNavegacion(sesion) {
  const links = document.querySelectorAll(".nav-link");

  links.forEach((link) => {
    const href = link.getAttribute("href") || "";

    if (href.includes("login.html")) return;
    if (sesion.puede_ver_todo === true) return;

    const modulo = obtenerClaveModulo(href);

    if (!tieneAccesoModulo(sesion, modulo)) {
      link.style.display = "none";
    }
  });
}

function aplicarPermisosAccesosRapidos(sesion) {
  const accesos = document.querySelectorAll(".acceso-rapido");

  accesos.forEach((acceso) => {
    const modulo = acceso.dataset.modulo;

    if (sesion.puede_ver_todo === true) return;

    if (!tieneAccesoModulo(sesion, modulo)) {
      acceso.style.display = "none";
    }
  });
}

function protegerPaginaActual(sesion) {
  const paginaActual = window.location.pathname.split("/").pop() || "";
  const moduloActual = obtenerClaveModulo(paginaActual);

  if (moduloActual === "dashboard") return;
  if (sesion.puede_ver_todo === true) return;

  if (!tieneAccesoModulo(sesion, moduloActual)) {
    alert("No tienes permisos para acceder a este módulo.");
    window.location.href = "dashboard.html";
  }
}

function tieneAccesoModulo(sesion, modulo) {
  if (sesion.puede_ver_todo === true) return true;
  if (!Array.isArray(sesion.modulos_permitidos)) return false;
  return sesion.modulos_permitidos.includes(modulo);
}

function obtenerClaveModulo(href) {
  if (href.includes("dashboard")) return "dashboard";
  if (href.includes("programacion-ayb")) return "programacion-ayb";
  if (href.includes("programacion-administrativo")) return "programacion-administrativo";
  if (href.includes("programacion-operaciones")) return "programacion-operaciones";
  if (href.includes("mis-turnos-ayb")) return "mis-turnos-ayb";
  if (href.includes("mis-turnos-administrativo")) return "mis-turnos-administrativo";
  if (href.includes("mis-turnos-operaciones")) return "mis-turnos-operaciones";
  if (href.includes("usuarios")) return "usuarios";
  if (href.includes("reportes")) return "reportes";
  if (href.includes("cronograma-aseo-diario")) return "cronograma-aseo-diario";
  if (href.includes("cronograma-aseo-profundo")) return "cronograma-aseo-profundo";
  if (href.includes("eventos-operaciones")) return "eventos-operaciones";
  if (href.includes("configuracion")) return "configuracion";
  return href;
}

function configurarCerrarSesion() {
  const linksCerrar = document.querySelectorAll('.nav-link[href="login.html"]');

  linksCerrar.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("ccp_sesion");
      window.location.href = "login.html";
    });
  });
}

function configurarBotonActualizar() {
  const btnActualizar = document.getElementById("btnActualizarTablero");
  if (!btnActualizar) return;

  btnActualizar.addEventListener("click", async () => {
    await cargarDashboardReal(sesionActiva);
  });
}

function obtenerInicioSemanaOperativa(fechaBase) {
  const fecha = new Date(fechaBase);
  const dia = fecha.getDay();
  const diasDesdeMartes = (dia + 5) % 7;
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() - diasDesdeMartes);
  return fecha;
}

function construirSemana(inicio) {
  const dias = [];

  for (let i = 0; i < 7; i++) {
    const fecha = new Date(inicio);
    fecha.setDate(inicio.getDate() + i);
    dias.push({ fecha: formatearFechaISO(fecha) });
  }

  return dias;
}

function formatearFechaISO(fecha) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatearFechaCorta(fechaIso) {
  if (!fechaIso) return "";
  const [year, month, day] = String(fechaIso).split("-");
  if (!year || !month || !day) return fechaIso;
  return `${day}/${month}/${year}`;
}

function obtenerNombreDia(fecha) {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return dias[fecha.getDay()];
}

function obtenerNombreMes(index) {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  return meses[index];
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
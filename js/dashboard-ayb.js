import { supabase } from "../supabase/supabaseClient.js";

let sesionActiva = null;
let registrosBase = [];
let solicitudesBienestarBase = [];
let directorioEmpleadosBase = [];
let directorioEmpleadosCompleto = [];
let registrosExternosChefBase = [];
let registrosRevisionChefBase = [];
let registrosDuplicadosBase = [];
let festivosDashboard = [];
let revisionNominaRealBase = [];
let filtrosActuales = {
  fechaInicio: "",
  fechaFin: "",
  area: "",
  subarea: "",
  empleado: "",
  estadoExtra: ""
};

let chartAreas = null;
let chartDias = null;
let chartTopEmpleados = null;
let chartDistribucionAreas = null;
let chartTendenciaFechas = null;
let chartMeses = null;
let chartAnios = null;
let chartHorasTipo = null;
let chartHorasExtraEmpleados = null;

// Ley 2466 de 2025: trabajo nocturno entre las 7:00 p. m. y las 6:00 a. m.
const HORA_INICIO_NOCTURNO = 19 * 60;
const HORA_FIN_NOCTURNO = 6 * 60;
const DESCANSO_ESTANDAR_HORAS = 0.5;
const STORAGE_PERIODO_OPERATIVO_AYB = "ccp_periodo_operativo_ayb";
const JORNADA_SEMANAL_AYB_HORAS = 44;
const JORNADA_SEMANAL_AYB_HORAS_REDUCIDA = 42;
const FECHA_CAMBIO_REDUCCION_JORNADA_AYB = "2026-07-15";
const JORNADA_SEMANAL_AYB_MINUTOS = JORNADA_SEMANAL_AYB_HORAS * 60;
// El 26/08/2026 hubo pérdida parcial de marcaciones por incidente de base de datos.
// El historial permanece consultable/exportable, pero los KPI comienzan cuando
// la operación biométrica volvió a estar estable.
const FECHA_INICIO_METRICAS_AYB = "2026-08-27";

const DASHBOARD_ALCANCE_AYB = true;
const PALABRAS_CLAVE_AYB_DASHBOARD = [
  "ALIMENTOS",
  "BEBIDAS",
  "ALIMENTOS Y BEBIDAS",
  "ALIMENTOS & BEBIDAS",
  "A&B",
  "AYB",
  "COCINA"
];

function obtenerJornadaSemanalAybHoras(fechaReferenciaISO = "") {
  return String(fechaReferenciaISO || "") >= FECHA_CAMBIO_REDUCCION_JORNADA_AYB
    ? JORNADA_SEMANAL_AYB_HORAS_REDUCIDA
    : JORNADA_SEMANAL_AYB_HORAS;
}

function obtenerJornadaSemanalAybMinutos(fechaReferenciaISO = "") {
  return obtenerJornadaSemanalAybHoras(fechaReferenciaISO) * 60;
}

function normalizarTextoAlcanceAyb(valor) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function textoContieneAybDashboard(valor) {
  const texto = normalizarTextoAlcanceAyb(valor);
  if (!texto) return false;
  return PALABRAS_CLAVE_AYB_DASHBOARD.some((clave) =>
    texto.includes(normalizarTextoAlcanceAyb(clave))
  );
}

function esEmpleadoAybDashboard(empleado) {
  if (!empleado) return false;

  /*
    Regla institucional: el empleado pertenece al panel oficial solo cuando
    su área o centro de costos oficial corresponde a A&B/Cocina.
    El cargo, subárea o punto de servicio no habilitan inclusión.
  */
  const textoOrigen = [
    empleado.raw?.area,
    empleado.raw?.centro_costos,
    empleado.raw?.centro_costo,
    empleado.raw?.nombre_area,
    empleado.raw?.nombre_centro_costo,
    empleado.raw?.departamento,
    empleado.raw?.dependencia,
    empleado.area
  ].join(" ");

  return textoContieneAybDashboard(textoOrigen);
}

function obtenerEmpleadoOficialAybPorCedula(cedula) {
  const documento = normalizarDocumentoEmpleado(cedula);
  if (!documento) return null;

  return directorioEmpleadosBase.find(
    (empleado) => normalizarDocumentoEmpleado(empleado.cedula) === documento
  ) || null;
}

function obtenerEmpleadoOficialAybPorId(idEmpleado) {
  const id = String(idEmpleado || "").trim();
  if (!id) return null;

  return directorioEmpleadosBase.find(
    (empleado) => String(empleado.raw?.id || "").trim() === id
  ) || null;
}

function esRegistroAybDashboard(registro) {
  if (!registro) return false;
  const cedula = registro.cedula || registro.documento || registro.numero_documento || "";
  return Boolean(obtenerEmpleadoOficialAybPorCedula(cedula));
}

function esSolicitudAybDashboard(solicitud) {
  if (!solicitud) return false;
  const cedula = normalizarDocumentoEmpleado(
    solicitud._cedula || solicitud.cedula || solicitud.documento ||
    solicitud.numero_documento || solicitud.identificacion || ""
  );

  return Boolean(obtenerEmpleadoOficialAybPorCedula(cedula));
}

function aplicarAlcanceAybRegistros(registros) {
  return (registros || []).filter(esRegistroAybDashboard);
}

function aplicarAlcanceAybSolicitudes(solicitudes) {
  return (solicitudes || []).filter(esSolicitudAybDashboard);
}

function obtenerRolSeguroDashboard(sesion) {
  return String(sesion?.rol || sesion?.tipo_usuario || sesion?.perfil || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function obtenerModulosPermitidosDashboard(sesion) {
  return Array.isArray(sesion?.modulos_permitidos)
    ? sesion.modulos_permitidos.map((m) => String(m || "").trim().toLowerCase())
    : [];
}

function usuarioPuedeAccederDashboard(sesion) {
  if (!sesion) return false;

  const cedula = String(sesion.cedula || sesion.usuario || sesion.username || "").trim();
  const nombre = String(sesion.nombre_completo || `${sesion.nombres || ""} ${sesion.apellidos || ""}`)
    .trim()
    .toLowerCase();
  const rol = obtenerRolSeguroDashboard(sesion);
  const modulos = obtenerModulosPermitidosDashboard(sesion);
  const areasPermitidas = Array.isArray(sesion.areas_permitidas)
    ? sesion.areas_permitidas.map(normalizarTextoAlcanceAyb)
    : [];
  const esAprobadorAyb = rol === "aprobador" && areasPermitidas.some((area) =>
    area.includes("ALIMENTOS") || area.includes("AYB") || area.includes("A&B")
  );

  const rolesDashboard = [
    "admin",
    "administrador",
    "gerencia",
    "ayb",
    "ayb_admin"
  ];

  return (
    sesion.puede_ver_todo === true ||
    String(sesion.puede_ver_todo).toLowerCase() === "true" ||
    cedula === "1088029438" ||
    nombre.includes("jhonnier") ||
    esAprobadorAyb ||
    rolesDashboard.includes(rol) ||
    modulos.includes("dashboard") || modulos.includes("dashboard-ayb")
  );
}

function redirigirEmpleadoASusTurnos() {
  window.location.href = "mis-turnos-ayb.html";
}


document.addEventListener("DOMContentLoaded", async () => {
  const sesion = JSON.parse(localStorage.getItem("ccp_sesion") || "null");

  if (!sesion) {
    window.location.href = "login.html";
    return;
  }

  const { data: authSessionData, error: authSessionError } = await supabase.auth.getSession();
  if (authSessionError || !authSessionData?.session?.access_token || sesion.tipo_ingreso !== "admin_auth") {
    localStorage.removeItem("ccp_sesion");
    await supabase.auth.signOut({ scope: "local" });
    alert("La sesión anterior no es una sesión segura de Supabase Auth. Ingrese nuevamente con la contraseña nueva del Excel.");
    window.location.href = "login.html";
    return;
  }

  if (!usuarioPuedeAccederDashboard(sesion)) {
    alert("No tienes permisos para acceder al Dashboard.");
    redirigirEmpleadoASusTurnos();
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
  configurarBotonExportarPDF();
  configurarBotonExportarExcel();
  configurarDetalleInteractivoAyb();
  configurarRevisionNominaReal();
  configurarFiltros();

  await cargarDashboardReal(sesion);
  await cargarRevisionNominaReal();
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

async function cargarFestivosDashboardSeguro() {
  try {
    const { data, error } = await supabase
      .from("festivos")
      .select("fecha,nombre,tipo,activo")
      .eq("activo", true);

    if (error) {
      console.warn("No se pudieron cargar festivos en Dashboard A&B:", error.message || error);
      festivosDashboard = [];
      return;
    }

    festivosDashboard = data || [];
  } catch (error) {
    console.warn("Error consultando festivos en Dashboard A&B:", error);
    festivosDashboard = [];
  }
}

async function cargarFuenteCocinaChefDashboard() {
  try {
    const [respuestaTurnos, respuestaPersonal, respuestaCodigos] = await Promise.all([
      supabase.from("cocina_programacion_turnos").select("*").order("fecha", { ascending: true }),
      supabase.from("cocina_cronograma_personal").select("*"),
      supabase.from("cocina_codigos_turno").select("*")
    ]);

    if (respuestaTurnos.error || respuestaPersonal.error || respuestaCodigos.error) {
      console.warn(
        "No se pudo cargar completamente la fuente Cocina Chef:",
        respuestaTurnos.error || respuestaPersonal.error || respuestaCodigos.error
      );
      return { oficiales: [], externos: [], revision: [] };
    }

    const personalPorId = new Map(
      (respuestaPersonal.data || []).map((persona) => [String(persona.id), persona])
    );
    const codigosPorCodigo = new Map(
      (respuestaCodigos.data || []).map((codigo) => [String(codigo.codigo), codigo])
    );

    const oficiales = [];
    const externos = [];
    const revision = [];

    (respuestaTurnos.data || []).forEach((turno) => {
      const persona = personalPorId.get(String(turno.cronograma_personal_id));
      if (!persona) {
        revision.push({
          tipo_revision: "Sin persona relacionada",
          fecha: turno.fecha,
          nombre: "Registro Cocina Chef sin colaborador",
          detalle: `Turno ${turno.codigo_turno || "-"}`
        });
        return;
      }

      const empleadoOficial =
        obtenerEmpleadoOficialAybPorId(persona.empleado_id) ||
        obtenerEmpleadoOficialAybPorCedula(persona.documento);

      const registro = transformarRegistroCocinaChefDashboard(
        turno,
        persona,
        empleadoOficial,
        codigosPorCodigo
      );

      if (empleadoOficial) {
        oficiales.push(registro);
        return;
      }

      const tipoPersonal = String(persona.tipo_personal || "").trim().toLowerCase();
      if (tipoPersonal === "externo" || Boolean(persona.externo_id)) {
        externos.push(registro);
        return;
      }

      revision.push({
        tipo_revision: "Vinculación sin confirmar",
        fecha: turno.fecha,
        nombre: persona.nombre_visible || "Sin nombre",
        detalle: `${persona.tipo_personal || "Sin tipo"} · ${turno.area_cocina || persona.area_cocina || "Sin área"}`
      });
    });

    return { oficiales, externos, revision };
  } catch (error) {
    console.warn("Error cargando integración de Cocina Chef:", error);
    return { oficiales: [], externos: [], revision: [] };
  }
}

function transformarRegistroCocinaChefDashboard(turno, persona, empleadoOficial, codigosPorCodigo) {
  const codigo1 = codigosPorCodigo.get(String(turno.codigo_turno || ""));
  const codigo2 = codigosPorCodigo.get(String(turno.codigo_turno_2 || ""));
  const esOficial = Boolean(empleadoOficial);

  return {
    id: `chef_${turno.id}`,
    id_origen: turno.id,
    origen_datos: "cocina_chef",
    origen_lectura: esOficial ? "Cocina Chef - empleado Club" : "Cocina Chef - externo",
    cronograma_personal_id: turno.cronograma_personal_id,
    empleado_id: persona.empleado_id || null,
    externo_id: persona.externo_id || null,
    tipo_personal: persona.tipo_personal || "",
    cedula: empleadoOficial?.cedula || persona.documento || "",
    nombre: empleadoOficial?.nombre || persona.nombre_visible || "Sin nombre",
    cargo: persona.cargo || (esOficial ? "" : "Externo"),
    area: esOficial ? "ALIMENTOS Y BEBIDAS" : "PERSONAL EXTERNO COCINA CHEF",
    centro_costos: esOficial ? "ALIMENTOS Y BEBIDAS" : "PERSONAL EXTERNO COCINA CHEF",
    subarea: turno.area_cocina || persona.area_cocina || "Cocina Chef",
    fecha: turno.fecha,
    tipo_registro: "turno",
    turno: turno.codigo_turno || "",
    hora_inicio: codigo1?.hora_inicio ? String(codigo1.hora_inicio).substring(0, 5) : null,
    hora_fin: codigo1?.hora_fin ? String(codigo1.hora_fin).substring(0, 5) : null,
    subarea_2: turno.area_cocina_2 || null,
    turno_2: turno.codigo_turno_2 || null,
    hora_inicio_2: codigo2?.hora_inicio ? String(codigo2.hora_inicio).substring(0, 5) : null,
    hora_fin_2: codigo2?.hora_fin ? String(codigo2.hora_fin).substring(0, 5) : null,
    observacion: turno.observacion || "",
    observacion_2: turno.observacion_2 || "",
    evento: turno.evento || "",
    evento_2: turno.evento_2 || "",
    estado_extra: turno.estado_extra || "pendiente",
    aprobado_por: turno.aprobado_por || "",
    fecha_aprobacion: turno.fecha_aprobacion || null,
    observacion_aprobacion: turno.observacion_aprobacion || (
      esOficial
        ? "Pendiente de validación."
        : "Personal externo; lectura operativa independiente."
    )
  };
}

function consolidarRegistrosOficialesDashboard(registrosProgramacion, registrosChef) {
  const llavesChef = new Set(
    registrosChef.map((registro) =>
      `${normalizarDocumentoEmpleado(registro.cedula)}__${String(registro.fecha || "")}`
    )
  );

  const registrosConsolidados = [];
  const duplicados = [];

  registrosProgramacion.forEach((registro) => {
    const llave = `${normalizarDocumentoEmpleado(registro.cedula)}__${String(registro.fecha || "")}`;

    if (llavesChef.has(llave)) {
      duplicados.push({
        cedula: registro.cedula || "",
        nombre: obtenerNombreEmpleado(registro),
        fecha: registro.fecha || "",
        registro_ayb: registro,
        motivo: "Existe programación en Programación A&B y Cocina Chef para el mismo colaborador y fecha. Se contabiliza Cocina Chef."
      });
      return;
    }

    registrosConsolidados.push(registro);
  });

  registrosConsolidados.push(...registrosChef);

  return {
    registros: registrosConsolidados.sort((a, b) =>
      String(a.fecha || "").localeCompare(String(b.fecha || ""))
    ),
    duplicados
  };
}

async function cargarDashboardReal(sesion) {
  try {
    const hoy = new Date();
    const fechaHoy = formatearFechaISO(hoy);
    const inicioSemana = obtenerInicioSemanaOperativa(new Date());
    const semana = construirSemana(inicioSemana);
    const fechasSemana = semana.map((d) => d.fecha);

    directorioEmpleadosCompleto = await cargarDirectorioEmpleadosSeguro();
    directorioEmpleadosBase = directorioEmpleadosCompleto.filter(esEmpleadoAybDashboard);

    await cargarFestivosDashboardSeguro();

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

    const registrosPermitidos = filtrarRegistrosPorPermisos(data || [], sesion);
    const registrosProgramacionAyb = aplicarAlcanceAybRegistros(registrosPermitidos)
      .map((registro) => enriquecerRegistroDashboard({
        ...registro,
        origen_datos: "programacion_ayb",
        origen_lectura: "Programación A&B"
      }));

    const fuenteChef = await cargarFuenteCocinaChefDashboard();
    const registrosChefOficiales = fuenteChef.oficiales.map(enriquecerRegistroDashboard);

    registrosExternosChefBase = fuenteChef.externos.map(enriquecerRegistroDashboard);
    registrosRevisionChefBase = fuenteChef.revision;

    const consolidado = consolidarRegistrosOficialesDashboard(
      registrosProgramacionAyb,
      registrosChefOficiales
    );

    registrosBase = aplicarCalculoSemanal44Dashboard(consolidado.registros);
    registrosDuplicadosBase = consolidado.duplicados;

    const solicitudesBienestar = await cargarSolicitudesBienestarSeguras(sesion);
    solicitudesBienestarBase = aplicarAlcanceAybSolicitudes(solicitudesBienestar);

    inicializarFiltrosRango();
    poblarOpcionesFiltros(registrosBase);
    actualizarBadgeFiltroUsuario();

    const registrosHoy = registrosBase.filter((item) => String(item.fecha || "") === fechaHoy);
    const registrosSemana = registrosBase.filter((item) => fechasSemana.includes(String(item.fecha || "")));

    const turnosHoy = registrosHoy.filter((r) => !esNovedad(r));
    const turnosSemana = registrosSemana.filter((r) => !esNovedad(r));
    const programadosHoy = turnosHoy.length;
    const subareasHoy = new Set(turnosHoy.map((r) => String(r.subarea || "").trim()).filter(Boolean)).size;
    const novedadesHoy = registrosHoy.filter((r) => esNovedad(r)).length;
    const asignacionesSemana = turnosSemana.length;

    const semanaAyb = turnosSemana.filter((r) => esAyb(r)).length;
    const semanaAdmin = 0;
    const semanaOperaciones = 0;
    const empleadosSemana = new Set(
      turnosSemana.map((r) => String(r.cedula || "").trim()).filter(Boolean)
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

function enriquecerRegistroDashboard(registro) {
  const estadoExtraNormalizado = normalizarEstadoExtra(registro.estado_extra);

  if (esNovedad(registro)) {
    return {
      ...registro,
      estado_extra: estadoExtraNormalizado,
      aprobado_por: registro.aprobado_por || "",
      fecha_aprobacion: registro.fecha_aprobacion || null,
      observacion_aprobacion: registro.observacion_aprobacion || "",
      ...normalizarMetricasGuardadasDashboard(registro)
    };
  }

  const tieneHorarioCalculable = Boolean(
    (registro.hora_inicio && registro.hora_fin) ||
    (registro.hora_inicio_2 && registro.hora_fin_2)
  );

  if (!tieneHorarioCalculable) {
    return {
      ...registro,
      estado_extra: estadoExtraNormalizado,
      aprobado_por: registro.aprobado_por || "",
      fecha_aprobacion: registro.fecha_aprobacion || null,
      observacion_aprobacion: registro.observacion_aprobacion || "",
      ...normalizarMetricasGuardadasDashboard(registro)
    };
  }

  const calculado = calcularMetricasRegistroDashboard(registro);

  return {
    ...registro,
    estado_extra: estadoExtraNormalizado,
    aprobado_por: registro.aprobado_por || "",
    fecha_aprobacion: registro.fecha_aprobacion || null,
    observacion_aprobacion: registro.observacion_aprobacion || "",
    ...calculado
  };
}


function normalizarMetricasGuardadasDashboard(registro) {
  const jornadaInfo = obtenerJornadaEsperadaPorFecha(registro.fecha);
  const esFestivo = jornadaInfo.esFestivo === true || String(registro.tipo_jornada || jornadaInfo.tipo || "").toLowerCase().includes("festivo");
  const extraDiurnaOriginal = Number(registro.extra_diurna || 0);
  const extraNocturnaOriginal = Number(registro.extra_nocturna || 0);

  return {
    horas_diurnas: Number(registro.horas_diurnas || 0),
    horas_nocturnas: Number(registro.horas_nocturnas || 0),
    horas_netas: Number(registro.horas_netas || 0),
    extra_diurna: esFestivo ? 0 : extraDiurnaOriginal,
    extra_nocturna: esFestivo ? 0 : extraNocturnaOriginal,
    extra_diurna_festiva: Number(registro.extra_diurna_festiva || (esFestivo ? extraDiurnaOriginal : 0)),
    extra_nocturna_festiva: Number(registro.extra_nocturna_festiva || (esFestivo ? extraNocturnaOriginal : 0)),
    horas_extra_estimadas: Number(registro.horas_extra_estimadas || 0),
    tipo_jornada: registro.tipo_jornada || jornadaInfo.tipo,
    es_festivo: esFestivo,
    nombre_festivo: jornadaInfo.nombreFestivo || ""
  };
}

function normalizarEstadoExtra(valor) {
  const estado = String(valor || "").trim().toLowerCase();
  if (estado === "aprobado" || estado === "rechazado" || estado === "pendiente") {
    return estado;
  }
  return "pendiente";
}

function calcularMetricasRegistroDashboard(registro) {
  const detalle = calcularDetalleHorasRegistroDashboard(registro);
  const jornadaInfo = obtenerJornadaEsperadaPorFecha(registro.fecha);

  return {
    horas_diurnas: detalle.horas_diurnas,
    horas_nocturnas: detalle.horas_nocturnas,
    horas_netas: detalle.horas_netas,
    horas_totales: detalle.horas_totales,
    descuento_almuerzo: detalle.descuento_almuerzo,
    extra_diurna: 0,
    extra_nocturna: 0,
    extra_diurna_festiva: 0,
    extra_nocturna_festiva: 0,
    horas_extra_estimadas: 0,
    jornada_esperada: JORNADA_SEMANAL_AYB_HORAS,
    tipo_jornada: jornadaInfo.tipo,
    es_festivo: Boolean(jornadaInfo.esFestivo),
    nombre_festivo: jornadaInfo.nombreFestivo || "",
    _segmentos_netos_ayb: detalle.segmentos_netos
  };
}

function calcularDetalleHorasRegistroDashboard(registro) {
  const segmentosB1 = construirSegmentosMinutoDashboard(registro.hora_inicio, registro.hora_fin, "bloque_1");
  const segmentosB2 = construirSegmentosMinutoDashboard(registro.hora_inicio_2, registro.hora_fin_2, "bloque_2");
  const segmentosBrutos = [...segmentosB1, ...segmentosB2];
  const minutosBrutos = segmentosBrutos.length;
  const descuentoMinutos = minutosBrutos > 0 ? Math.min(DESCANSO_ESTANDAR_HORAS * 60, minutosBrutos) : 0;
  const segmentosNetos = aplicarDescuentoAlmuerzoUnaVezDashboard(segmentosBrutos, descuentoMinutos);
  const minutosDiurnos = segmentosNetos.filter((s) => s.tipo === "diurna").length;
  const minutosNocturnos = segmentosNetos.filter((s) => s.tipo === "nocturna").length;

  return {
    horas_totales: redondearHoras(minutosBrutos / 60),
    descuento_almuerzo: redondearHoras(descuentoMinutos / 60),
    horas_diurnas: redondearHoras(minutosDiurnos / 60),
    horas_nocturnas: redondearHoras(minutosNocturnos / 60),
    horas_netas: redondearHoras((minutosDiurnos + minutosNocturnos) / 60),
    segmentos_netos: segmentosNetos
  };
}

function construirSegmentosMinutoDashboard(inicio, fin, bloque) {
  if (!inicio || !fin) return [];
  const inicioMin = horaTextoAMinutos(inicio);
  let finMin = horaTextoAMinutos(fin);
  if (inicioMin === null || finMin === null) return [];
  if (finMin < inicioMin) finMin += 24 * 60;

  const segmentos = [];
  for (let m = inicioMin; m < finMin; m++) {
    const minuto = m % (24 * 60);
    segmentos.push({
      bloque,
      tipo: esMinutoNocturno(minuto) ? "nocturna" : "diurna"
    });
  }
  return segmentos;
}

function aplicarDescuentoAlmuerzoUnaVezDashboard(segmentos, descuentoMinutos) {
  if (!segmentos.length || descuentoMinutos <= 0) return segmentos.slice();
  const remover = new Set();
  let pendiente = descuentoMinutos;

  for (let i = 0; i < segmentos.length && pendiente > 0; i++) {
    if (segmentos[i].tipo === "diurna") {
      remover.add(i);
      pendiente--;
    }
  }
  for (let i = 0; i < segmentos.length && pendiente > 0; i++) {
    if (!remover.has(i)) {
      remover.add(i);
      pendiente--;
    }
  }
  return segmentos.filter((_, index) => !remover.has(index));
}

function aplicarCalculoSemanal44Dashboard(registros) {
  const grupos = new Map();
  registros.forEach((registro) => {
    if (esNovedad(registro)) return;
    const cedula = String(registro.cedula || "").trim();
    const semana = obtenerClaveSemanaOperativaDashboard(registro.fecha);
    if (!cedula || !semana) return;
    const clave = `${cedula}__${semana}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(registro);
  });

  grupos.forEach((items) => {
    const fechaReferenciaGrupo = items[0]?.fecha || periodoOperativoDashboardAyb?.inicio || "";
    const limitePeriodoHoras = obtenerJornadaSemanalAybHoras(fechaReferenciaGrupo);
    const minutosAcumuladosDia = new Map();
    let minutosAcumuladosPeriodo = 0;
    items.sort(compararRegistrosPorFechaHoraDashboard);

    items.forEach((registro) => {
      const segmentos = Array.isArray(registro._segmentos_netos_ayb) ? registro._segmentos_netos_ayb : [];
      const fechaRegistro = String(registro.fecha || "");
      const jornadaDiaInfo = obtenerJornadaEsperadaPorFecha(fechaRegistro);
      const limiteDiaMinutos = Math.max(0, Number(jornadaDiaInfo.horas || 0) * 60);
      let minutosDia = minutosAcumuladosDia.get(fechaRegistro) || 0;
      let extraDiurnaMin = 0;
      let extraNocturnaMin = 0;

      // Las horas nocturnas/festivas trabajadas son recargos.
      // Solo son horas extra si superan la jornada neta esperada del día o las
      // 42 horas netas del periodo. Cada minuto se clasifica una sola vez.
      segmentos.forEach((segmento) => {
        const excedeJornadaDia = minutosDia >= limiteDiaMinutos;
        const excedeJornadaPeriodo = minutosAcumuladosPeriodo >= limitePeriodoHoras * 60;

        if (excedeJornadaDia || excedeJornadaPeriodo) {
          if (segmento.tipo === "nocturna") extraNocturnaMin++;
          else extraDiurnaMin++;
        }

        minutosDia++;
        minutosAcumuladosPeriodo++;
      });

      minutosAcumuladosDia.set(fechaRegistro, minutosDia);

      const esFestivo = Boolean(registro.es_festivo || obtenerFestivoDashboard(registro.fecha));
      const extraDiurnaHoras = redondearHoras(extraDiurnaMin / 60);
      const extraNocturnaHoras = redondearHoras(extraNocturnaMin / 60);

      registro.extra_diurna = esFestivo ? 0 : extraDiurnaHoras;
      registro.extra_nocturna = esFestivo ? 0 : extraNocturnaHoras;
      registro.extra_diurna_festiva = esFestivo ? extraDiurnaHoras : 0;
      registro.extra_nocturna_festiva = esFestivo ? extraNocturnaHoras : 0;
      registro.horas_extra_estimadas = redondearHoras(extraDiurnaHoras + extraNocturnaHoras);
      registro.jornada_esperada = jornadaDiaInfo.horas;
      registro.jornada_periodo = limitePeriodoHoras;
      registro.tipo_jornada = esFestivo
        ? `Festivo - ${registro.nombre_festivo || obtenerFestivoDashboard(registro.fecha)?.nombre || "Festivo"}`
        : `${jornadaDiaInfo.tipo} · Referencia periodo ${limitePeriodoHoras} horas`;
      delete registro._segmentos_netos_ayb;
    });
  });

  return registros.map((registro) => {
    if (registro._segmentos_netos_ayb) delete registro._segmentos_netos_ayb;
    return registro;
  });
}

function compararRegistrosPorFechaHoraDashboard(a, b) {
  const fa = String(a.fecha || "");
  const fb = String(b.fecha || "");
  if (fa !== fb) return fa.localeCompare(fb);
  const ha = horaTextoAMinutos(a.hora_inicio) ?? 0;
  const hb = horaTextoAMinutos(b.hora_inicio) ?? 0;
  if (ha !== hb) return ha - hb;
  return String(a.created_at || a.id || "").localeCompare(String(b.created_at || b.id || ""));
}

function obtenerClaveSemanaOperativaDashboard(fechaISO) {
  if (!fechaISO) return "";

  // Dashboard A&B calcula 42 horas sobre el rango filtrado
  // o periodo operativo cargado, no sobre semanas calendario lunes-domingo.
  const inicioFiltro = filtrosActuales?.fechaInicio || document.getElementById("filtroFechaInicio")?.value || "";
  const finFiltro = filtrosActuales?.fechaFin || document.getElementById("filtroFechaFin")?.value || "";
  if (inicioFiltro && finFiltro && fechaISO >= inicioFiltro && fechaISO <= finFiltro) {
    return `${inicioFiltro}__${finFiltro}`;
  }

  const fecha = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return "";
  const inicio = obtenerInicioSemanaOperativa(fecha);
  return formatearFechaISO(inicio);
}

function calcularHorasTurnoProtegiendoNocturnas(inicio, fin) {
  const detalle = calcularDetalleHorasRegistroDashboard({ hora_inicio: inicio, hora_fin: fin });
  return {
    total: detalle.horas_totales,
    diurnas: detalle.horas_diurnas,
    nocturnas: detalle.horas_nocturnas,
    netas: detalle.horas_netas
  };
}

function obtenerFestivoDashboard(fechaISO) {
  return festivosDashboard.find((item) => String(item.fecha) === String(fechaISO));
}

function obtenerJornadaEsperadaPorFecha(fechaISO) {
  if (!fechaISO) {
    return { horas: 6.5, tipo: "Día hábil / 6,5h netas", esFestivo: false };
  }

  const festivo = festivosDashboard.find(
    (item) => String(item.fecha) === String(fechaISO)
  );

  if (festivo) {
    return { horas: 8, tipo: `Festivo - ${festivo.nombre || "Festivo"}`, esFestivo: true, nombreFestivo: festivo.nombre || "Festivo" };
  }

  const fecha = new Date(`${fechaISO}T00:00:00`);
  const dia = fecha.getDay();

  if (dia === 6 || dia === 0) {
    return { horas: 8, tipo: "Sábado/Domingo / 8h netas", esFestivo: false };
  }

  return { horas: 6.5, tipo: "Día hábil / 6,5h netas", esFestivo: false };
}

function horaTextoAMinutos(horaTexto) {
  if (!horaTexto) return null;
  const partes = String(horaTexto).split(":").map(Number);
  if (partes.length < 2 || partes.some(Number.isNaN)) return null;
  const [h, m] = partes;
  return (h * 60) + m;
}

function esMinutoNocturno(minutoDelDia) {
  return minutoDelDia >= HORA_INICIO_NOCTURNO || minutoDelDia < HORA_FIN_NOCTURNO;
}

function configurarFiltros() {
  const filtroFechaInicio = document.getElementById("filtroFechaInicio");
  const filtroFechaFin = document.getElementById("filtroFechaFin");
  const filtroArea = document.getElementById("filtroArea");
  const filtroSubarea = document.getElementById("filtroSubarea");
  const filtroEmpleado = document.getElementById("filtroEmpleado");
  const filtroEstadoExtra = document.getElementById("filtroEstadoExtra");
  const btnLimpiar = document.getElementById("btnLimpiarFiltros");

  [filtroFechaInicio, filtroFechaFin, filtroArea, filtroSubarea, filtroEmpleado, filtroEstadoExtra].forEach((elemento) => {
    if (!elemento) return;

    elemento.addEventListener("change", () => {
      filtrosActuales.fechaInicio = filtroFechaInicio?.value || "";
      filtrosActuales.fechaFin = filtroFechaFin?.value || "";
      filtrosActuales.area = filtroArea?.value || "";
      filtrosActuales.subarea = filtroSubarea?.value || "";
      filtrosActuales.empleado = filtroEmpleado?.value || "";
      filtrosActuales.estadoExtra = filtroEstadoExtra?.value || "";
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
  const filtroEstadoExtra = document.getElementById("filtroEstadoExtra");

  if (!filtroFechaInicio || !filtroFechaFin) return;

  if (!filtrosActuales.fechaInicio || !filtrosActuales.fechaFin) {
    const periodoAyb = leerPeriodoOperativoDashboardAyb();
    if (periodoAyb) {
      filtroFechaInicio.value = periodoAyb.inicio;
      filtroFechaFin.value = periodoAyb.fin;
    } else {
      const hoy = new Date();
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      filtroFechaInicio.value = formatearFechaISO(inicioMes);
      filtroFechaFin.value = formatearFechaISO(hoy);
    }

    filtrosActuales.fechaInicio = filtroFechaInicio.value;
    filtrosActuales.fechaFin = filtroFechaFin.value;
  } else {
    filtroFechaInicio.value = filtrosActuales.fechaInicio;
    filtroFechaFin.value = filtrosActuales.fechaFin;
  }

  if (filtroEstadoExtra) {
    filtroEstadoExtra.value = filtrosActuales.estadoExtra || "";
  }
}

function leerPeriodoOperativoDashboardAyb() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_PERIODO_OPERATIVO_AYB) || "null");
    if (!raw?.inicio || !raw?.fin) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.fin)) return null;
    if (raw.fin < raw.inicio) return null;
    return { inicio: raw.inicio, fin: raw.fin };
  } catch {
    return null;
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

function actualizarBadgeFiltroUsuario() {
  const sesion = sesionActiva || {};
  const partes = [];

  if (sesion.puede_ver_todo === true) {
    partes.push("Acceso total");
  } else {
    const areas = Array.isArray(sesion.areas_permitidas) ? sesion.areas_permitidas.filter(Boolean) : [];
    if (areas.length) {
      partes.push(`Áreas: ${areas.join(", ")}`);
    }

    if (sesion.centro_costos) {
      partes.push(`Centro costos: ${sesion.centro_costos}`);
    }
  }

  if (sesion.rol) {
    partes.push(`Rol: ${traducirRol(sesion.rol)}`);
  }

  setText("badgeFiltroUsuario", `Filtro usuario: ${partes.join(" | ") || "Automático"}`);
}

function limpiarFiltros() {
  const periodoAyb = leerPeriodoOperativoDashboardAyb();
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const filtroFechaInicio = document.getElementById("filtroFechaInicio");
  const filtroFechaFin = document.getElementById("filtroFechaFin");
  const filtroArea = document.getElementById("filtroArea");
  const filtroSubarea = document.getElementById("filtroSubarea");
  const filtroEmpleado = document.getElementById("filtroEmpleado");
  const filtroEstadoExtra = document.getElementById("filtroEstadoExtra");

  if (filtroFechaInicio) filtroFechaInicio.value = periodoAyb?.inicio || formatearFechaISO(inicioMes);
  if (filtroFechaFin) filtroFechaFin.value = periodoAyb?.fin || formatearFechaISO(hoy);
  if (filtroArea) filtroArea.value = "";
  if (filtroSubarea) filtroSubarea.value = "";
  if (filtroEmpleado) filtroEmpleado.value = "";
  if (filtroEstadoExtra) filtroEstadoExtra.value = "";

  filtrosActuales = {
    fechaInicio: filtroFechaInicio?.value || "",
    fechaFin: filtroFechaFin?.value || "",
    area: "",
    subarea: "",
    empleado: "",
    estadoExtra: ""
  };
}

function aplicarFiltrosAnaliticos() {
  const registrosFiltrados = obtenerRegistrosMetricasAyb(obtenerRegistrosFiltrados());

  actualizarBadgesAnaliticos(registrosFiltrados);
  renderKPIsGeneralesAnaliticos(registrosFiltrados);
  renderKPIsAnaliticos(registrosFiltrados);
  renderKPIsHoras(registrosFiltrados);
  renderKPIsNovedades(registrosFiltrados);
  renderKPIsAlertas(registrosFiltrados);
  renderKPIsValidacion(registrosFiltrados);
  renderLecturaEjecutivaDashboard(registrosFiltrados);
  renderComparativosPeriodo();
  renderTopEmpleados(registrosFiltrados);
  renderTopAsistencia(registrosFiltrados);
  renderTopSubareas(registrosFiltrados);
  renderNovedadesPorArea(registrosFiltrados);
  renderTablaNovedadesActivas(registrosFiltrados);
  renderTablaIncapacidades(registrosFiltrados);
  renderTablaAusentesHoy(registrosFiltrados);
  renderTablaAlertasCriticas(registrosFiltrados);
  renderTablaValidacionExtras(registrosFiltrados);
  renderDashboardBienestar();
  renderTablaMenorCarga(registrosFiltrados);
  renderPanelExternosChef();
  renderControlIntegracionChef();

  renderGraficaAreas(registrosFiltrados);
  renderGraficaDias(registrosFiltrados);
  renderGraficaHorasTipo(registrosFiltrados);
  renderGraficaHorasExtraEmpleados(registrosFiltrados);
  renderGraficaTopEmpleados(registrosFiltrados);
  renderGraficaDistribucionAreas(registrosFiltrados);
  renderGraficaTendenciaFechas(registrosFiltrados);
  renderGraficaMeses(obtenerRegistrosMetricasAyb(registrosBase));
  renderGraficaAnios(obtenerRegistrosMetricasAyb(registrosBase));
}

function obtenerRegistrosExternosChefFiltrados() {
  return registrosExternosChefBase.filter((item) => {
    const fecha = String(item.fecha || "");
    const subarea = String(item.subarea || "").trim();
    const empleado = obtenerNombreEmpleado(item);

    if (filtrosActuales.fechaInicio && fecha < filtrosActuales.fechaInicio) return false;
    if (filtrosActuales.fechaFin && fecha > filtrosActuales.fechaFin) return false;
    if (filtrosActuales.subarea && subarea !== filtrosActuales.subarea) return false;
    if (filtrosActuales.empleado && empleado !== filtrosActuales.empleado) return false;

    return true;
  });
}

function renderPanelExternosChef() {
  const registros = obtenerRegistrosExternosChefFiltrados();
  const empleados = new Set(
    registros.map((item) => String(item.externo_id || item.cedula || obtenerNombreEmpleado(item))).filter(Boolean)
  ).size;
  const soloTurnos = registros.filter((item) => !esNovedad(item));

  const diurnas = redondearHoras(soloTurnos.reduce((total, item) => total + Number(item.horas_diurnas || 0), 0));
  const nocturnas = redondearHoras(soloTurnos.reduce((total, item) => total + Number(item.horas_nocturnas || 0), 0));
  const netas = redondearHoras(soloTurnos.reduce((total, item) => total + Number(item.horas_netas || 0), 0));
  const extraDiurna = redondearHoras(soloTurnos.reduce((total, item) => total + Number(item.extra_diurna || 0), 0));
  const extraNocturna = redondearHoras(soloTurnos.reduce((total, item) => total + Number(item.extra_nocturna || 0), 0));
  const extraTotal = redondearHoras(soloTurnos.reduce((total, item) => total + Number(item.horas_extra_estimadas || 0), 0));

  setText("kpiExternosPersonas", empleados);
  setText("kpiExternosTurnos", registros.length);
  setText("kpiExternosHorasDiurnas", formatearNumero(diurnas));
  setText("kpiExternosHorasNocturnas", formatearNumero(nocturnas));
  setText("kpiExternosHorasNetas", formatearNumero(netas));
  setText("kpiExternosExtraDiurna", formatearNumero(extraDiurna));
  setText("kpiExternosExtraNocturna", formatearNumero(extraNocturna));
  setText("kpiExternosExtraTotal", formatearNumero(extraTotal));

  const tbody = document.getElementById("tbodyExternosChef");
  if (!tbody) return;

  if (!registros.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="texto-vacio">No hay personal externo programado en Cocina Chef para el filtro actual.</td></tr>`;
    return;
  }

  tbody.innerHTML = registros
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
    .map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escaparHtml(obtenerNombreEmpleado(item))}</td>
        <td>${escaparHtml(item.cedula || "-")}</td>
        <td>${escaparHtml(formatearFechaCorta(item.fecha))}${item.es_festivo ? `<div class="badge-festivo-dashboard">FESTIVO${item.nombre_festivo ? ` · ${escaparHtml(item.nombre_festivo)}` : ""}</div>` : ""}</td>
        <td>${escaparHtml(item.subarea || "-")}</td>
        <td>${escaparHtml(item.turno || "-")}${item.turno_2 ? ` / ${escaparHtml(item.turno_2)}` : ""}</td>
        <td>${formatearNumero(item.horas_diurnas || 0)}</td>
        <td>${formatearNumero(item.horas_nocturnas || 0)}</td>
        <td>${formatearNumero(item.horas_netas || 0)}</td>
        <td>${formatearNumero(item.extra_diurna || 0)}</td>
        <td>${formatearNumero(item.extra_nocturna || 0)}</td>
        <td>${formatearNumero(item.extra_diurna_festiva || 0)}</td>
        <td>${formatearNumero(item.extra_nocturna_festiva || 0)}</td>
        <td>${formatearNumero(item.horas_extra_estimadas || 0)}</td>
      </tr>
    `).join("");
}

function renderControlIntegracionChef() {
  setText("kpiDuplicidadesChef", registrosDuplicadosBase.length);
  setText("kpiRevisionChef", registrosRevisionChefBase.length);

  const tbodyDuplicados = document.getElementById("tbodyDuplicidadesChef");
  if (tbodyDuplicados) {
    if (!registrosDuplicadosBase.length) {
      tbodyDuplicados.innerHTML = `<tr><td colspan="5" class="texto-vacio">No se detectaron duplicidades entre Programación A&B y Cocina Chef.</td></tr>`;
    } else {
      tbodyDuplicados.innerHTML = registrosDuplicadosBase.map((item, index) => `
        <tr class="fila-alerta">
          <td>${index + 1}</td>
          <td>${escaparHtml(item.nombre)}</td>
          <td>${escaparHtml(item.cedula)}</td>
          <td>${escaparHtml(formatearFechaCorta(item.fecha))}${item.es_festivo ? `<div class="badge-festivo-dashboard">FESTIVO${item.nombre_festivo ? ` · ${escaparHtml(item.nombre_festivo)}` : ""}</div>` : ""}</td>
          <td>${escaparHtml(item.motivo)}</td>
        </tr>
      `).join("");
    }
  }

  const tbodyRevision = document.getElementById("tbodyRevisionChef");
  if (tbodyRevision) {
    if (!registrosRevisionChefBase.length) {
      tbodyRevision.innerHTML = `<tr><td colspan="4" class="texto-vacio">No hay registros pendientes de clasificación.</td></tr>`;
    } else {
      tbodyRevision.innerHTML = registrosRevisionChefBase.map((item, index) => `
        <tr class="fila-alerta">
          <td>${index + 1}</td>
          <td>${escaparHtml(item.nombre)}</td>
          <td>${escaparHtml(formatearFechaCorta(item.fecha))}${item.es_festivo ? `<div class="badge-festivo-dashboard">FESTIVO${item.nombre_festivo ? ` · ${escaparHtml(item.nombre_festivo)}` : ""}</div>` : ""}</td>
          <td>${escaparHtml(item.tipo_revision)} · ${escaparHtml(item.detalle)}</td>
        </tr>
      `).join("");
    }
  }
}

function obtenerRegistrosFiltrados() {
  return registrosBase.filter((item) => {
    const fecha = String(item.fecha || "");
    const area = obtenerAreaAmigable(item);
    const subarea = String(item.subarea || "").trim();
    const empleado = obtenerNombreEmpleado(item);
    const estadoExtra = normalizarEstadoExtra(item.estado_extra);

    if (filtrosActuales.fechaInicio && fecha < filtrosActuales.fechaInicio) return false;
    if (filtrosActuales.fechaFin && fecha > filtrosActuales.fechaFin) return false;
    if (filtrosActuales.area && area !== filtrosActuales.area) return false;
    if (filtrosActuales.subarea && subarea !== filtrosActuales.subarea) return false;
    if (filtrosActuales.empleado && empleado !== filtrosActuales.empleado) return false;
    if (filtrosActuales.estadoExtra && estadoExtra !== filtrosActuales.estadoExtra) return false;

    return true;
  });
}

function obtenerRegistrosMetricasAyb(registros) {
  return (registros || []).filter((item) => String(item.fecha || "") >= FECHA_INICIO_METRICAS_AYB);
}

function fechaInicioEfectivaMetricasAyb() {
  const inicioSeleccionado = String(filtrosActuales.fechaInicio || "");
  return inicioSeleccionado && inicioSeleccionado > FECHA_INICIO_METRICAS_AYB
    ? inicioSeleccionado
    : FECHA_INICIO_METRICAS_AYB;
}

function actualizarBadgesAnaliticos(registros) {
  const empleados = new Set(
    registros.map((item) => String(item.cedula || item.empleado_id || obtenerNombreEmpleado(item)).trim()).filter(Boolean)
  ).size;

  const dias = new Set(
    registros.map((item) => String(item.fecha || "").trim()).filter(Boolean)
  ).size;

  const rangoTexto = `Métricas: ${fechaInicioEfectivaMetricasAyb()} a ${filtrosActuales.fechaFin || "hoy"}`;

  setText("badgeRangoActivo", rangoTexto);
  setText("badgeRegistrosAnalizados", `Turnos + novedades: ${registros.length}`);
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

function renderKPIsHoras(registros) {
  const soloTurnos = registros.filter((r) => !esNovedad(r));

  const horasDiurnas = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.horas_diurnas || 0), 0));
  const horasNocturnas = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.horas_nocturnas || 0), 0));
  const horasNetas = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.horas_netas || 0), 0));
  const extraDiurna = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.extra_diurna || 0), 0));
  const extraNocturna = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.extra_nocturna || 0), 0));
  const extraTotal = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.horas_extra_estimadas || 0), 0));

  setText("kpiHorasDiurnas", formatearNumero(horasDiurnas));
  setText("kpiHorasNocturnas", formatearNumero(horasNocturnas));
  setText("kpiExtraDiurna", formatearNumero(extraDiurna));
  setText("kpiExtraNocturna", formatearNumero(extraNocturna));
  setText("kpiPreviewHorasNetas", formatearNumero(horasNetas));
  setText("kpiPreviewHorasExtra", formatearNumero(extraTotal));
}

function renderKPIsValidacion(registros) {
  const extras = obtenerRegistrosConExtras(registros);
  const pendientes = extras.filter((r) => normalizarEstadoExtra(r.estado_extra) === "pendiente");
  const aprobados = extras.filter((r) => normalizarEstadoExtra(r.estado_extra) === "aprobado");
  const rechazados = extras.filter((r) => normalizarEstadoExtra(r.estado_extra) === "rechazado");
  const horasAprobadas = redondearHoras(aprobados.reduce((acc, r) => acc + Number(r.horas_extra_estimadas || 0), 0));

  setText("kpiExtrasPendientes", pendientes.length);
  setText("kpiExtrasAprobadas", aprobados.length);
  setText("kpiExtrasRechazadas", rechazados.length);
  setText("kpiHorasExtraAprobadas", formatearNumero(horasAprobadas));
}


function renderLecturaEjecutivaDashboard(registros) {
  const extras = obtenerRegistrosConExtras(registros);
  const pendientes = extras.filter((r) => normalizarEstadoExtra(r.estado_extra) === "pendiente");
  const aprobados = extras.filter((r) => normalizarEstadoExtra(r.estado_extra) === "aprobado");
  const rechazados = extras.filter((r) => normalizarEstadoExtra(r.estado_extra) === "rechazado");
  const horasAprobadas = redondearHoras(aprobados.reduce((acc, r) => acc + Number(r.horas_extra_estimadas || 0), 0));

  const empleados = new Set(
    registros.map((item) => String(item.cedula || item.empleado_id || obtenerNombreEmpleado(item)).trim()).filter(Boolean)
  ).size;
  const dias = new Set(registros.map((item) => String(item.fecha || "").trim()).filter(Boolean)).size;

  const solicitudes = typeof obtenerSolicitudesBienestarFiltradas === "function"
    ? obtenerSolicitudesBienestarFiltradas()
    : [];
  const solicitudesPendientes = solicitudes.filter((s) => ["pendiente", "pendiente_documentos"].includes(s._estado_bienestar));
  const solicitudesFueraTiempo = solicitudes.filter((s) => s._fuera_tiempo === true);
  const solicitudesDocs = solicitudes.filter((s) => s._requiere_documento === true || s._estado_bienestar === "pendiente_documentos");

  setText("insightValidacionExtras", pendientes.length ? `${pendientes.length} pendiente(s)` : "Sin pendientes");
  setText("insightValidacionExtrasDetalle", `${aprobados.length} aprobado(s), ${rechazados.length} rechazado(s), ${extras.length} registro(s) con extra.`);

  setText("insightNomina", `${aprobados.length} registro(s) aprobados`);
  setText("insightNominaDetalle", `${formatearNumero(horasAprobadas)} hora(s) extra listas para exportar.`);

  const totalAlertasBienestar = solicitudesPendientes.length + solicitudesFueraTiempo.length + solicitudesDocs.length;
  setText("insightBienestar", totalAlertasBienestar ? `${totalAlertasBienestar} alerta(s)` : "Sin alertas críticas");
  setText("insightBienestarDetalle", `${solicitudesPendientes.length} pendiente(s), ${solicitudesDocs.length} con documentos, ${solicitudesFueraTiempo.length} fuera de tiempo.`);

  setText("insightCobertura", `${empleados} empleado(s)`);
  setText("insightCoberturaDetalle", `${dias} día(s) con programación y ${registros.length} registro(s) analizados.`);

  actualizarClaseInsight("cardInsightValidacion", pendientes.length > 0 ? "alerta" : "ok");
  actualizarClaseInsight("cardInsightNomina", aprobados.length > 0 ? "ok" : "alerta");
  actualizarClaseInsight("cardInsightBienestar", totalAlertasBienestar > 0 ? (solicitudesFueraTiempo.length > 0 ? "critico" : "alerta") : "ok");
  actualizarClaseInsight("cardInsightCobertura", registros.length > 0 ? "ok" : "alerta");
  actualizarUltimaActualizacionDashboard();
}

function actualizarClaseInsight(id, clase) {
  const card = document.getElementById(id);
  if (!card) return;
  card.classList.remove("ok", "alerta", "critico");
  if (clase) card.classList.add(clase);
}

function actualizarUltimaActualizacionDashboard() {
  const ahora = new Date();
  setText("dashboardUltimaActualizacion", `Última actualización: ${ahora.toLocaleString("es-CO")}`);
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

  const registrosMetricas = obtenerRegistrosMetricasAyb(registrosBase);

  const totalMesActual = registrosMetricas.filter((item) => {
    const partes = String(item.fecha || "").split("-");
    return Number(partes[0]) === anioActual && Number(partes[1]) === mesActual;
  }).length;

  const totalMesAnterior = registrosMetricas.filter((item) => {
    const partes = String(item.fecha || "").split("-");
    return Number(partes[0]) === anioMesAnterior && Number(partes[1]) === mesAnterior;
  }).length;

  const totalAnioActual = registrosMetricas.filter((item) => {
    const partes = String(item.fecha || "").split("-");
    return Number(partes[0]) === anioActual;
  }).length;

  const totalAnioAnterior = registrosMetricas.filter((item) => {
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

  // Este dashboard mide programación, no presencia biométrica. Por eso este
  // ranking usa solamente turnos y se presenta como días programados.
  const top = Object.values(agruparEmpleados(registros.filter((item) => !esNovedad(item))))
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
        <td>${escaparHtml(formatearFechaCorta(item.fecha))}${item.es_festivo ? `<div class="badge-festivo-dashboard">FESTIVO${item.nombre_festivo ? ` · ${escaparHtml(item.nombre_festivo)}` : ""}</div>` : ""}</td>
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

function renderTablaValidacionExtras(registros) {
  const tbody = document.getElementById("tbodyValidacionExtras");
  if (!tbody) return;

  const extras = obtenerRegistrosConExtras(registros)
    .sort((a, b) => {
      const estadoDiff = prioridadEstado(a.estado_extra) - prioridadEstado(b.estado_extra);
      if (estadoDiff !== 0) return estadoDiff;
      return String(b.fecha || "").localeCompare(String(a.fecha || ""));
    });

  if (!extras.length) {
    tbody.innerHTML = `<tr><td colspan="16" class="texto-vacio">No hay registros con horas extra o festivos por validar en el filtro actual.</td></tr>`;
    return;
  }

  tbody.innerHTML = extras.map((item, index) => {
    const puedeValidar = usuarioPuedeValidarRegistro(sesionActiva, item);
    const estado = normalizarEstadoExtra(item.estado_extra);

    return `
      <tr class="${estado === "pendiente" ? "fila-alerta" : ""} ${item.es_festivo ? "fila-festivo-validacion" : ""}">
        <td>${index + 1}</td>
        <td>${escaparHtml(obtenerNombreEmpleado(item))}</td>
        <td>${escaparHtml(item.cedula || "")}</td>
        <td>${escaparHtml(formatearFechaCorta(item.fecha))}${item.es_festivo ? `<div class="badge-festivo-dashboard">FESTIVO${item.nombre_festivo ? ` · ${escaparHtml(item.nombre_festivo)}` : ""}</div>` : ""}</td>
        <td>${escaparHtml(obtenerAreaAmigable(item))}</td>
        <td>${escaparHtml(String(item.subarea || "").trim() || "-")}</td>
        <td>${formatearNumero(item.extra_diurna || 0)}</td>
        <td>${formatearNumero(item.extra_nocturna || 0)}</td>
        <td>${formatearNumero(item.extra_diurna_festiva || 0)}</td>
        <td>${formatearNumero(item.extra_nocturna_festiva || 0)}</td>
        <td>${formatearNumero(item.horas_extra_estimadas || 0)}</td>
        <td>${crearBadgeEstadoExtra(estado)}</td>
        <td>${escaparHtml(item.aprobado_por || "-")}</td>
        <td>${escaparHtml(formatearFechaHora(item.fecha_aprobacion) || "-")}</td>
        <td>${escaparHtml(item.observacion_aprobacion || "-")}</td>
        <td class="columna-acciones">
          ${puedeValidar ? `
            <div class="acciones-validacion">
              <button
                class="btn btn-sm btn-success btn-aprobar-extra"
                data-id="${item.id}"
              >
                Aprobar
              </button>
              <button
                class="btn btn-sm btn-outline-danger btn-rechazar-extra"
                data-id="${item.id}"
              >
                Rechazar
              </button>
            </div>
          ` : `<span class="text-muted small">${String(item.tipo_personal || "").trim().toLowerCase() === "externo" ? "Externo · solo lectura" : "Sin permiso"}</span>`}
        </td>
      </tr>
    `;
  }).join("");

  enlazarEventosValidacion();
  configurarScrollSuperiorValidacionExtras();
}


function configurarScrollSuperiorValidacionExtras() {
  const scrollSuperior = document.getElementById("scrollSuperiorValidacionExtras");
  const scrollTabla = document.getElementById("scrollTablaValidacionExtras");
  const tabla = scrollTabla?.querySelector("table");
  const relleno = scrollSuperior?.firstElementChild;
  if (!scrollSuperior || !scrollTabla || !tabla || !relleno) return;

  const actualizarAncho = () => {
    relleno.style.width = `${tabla.scrollWidth}px`;
    if (scrollSuperior.scrollLeft !== scrollTabla.scrollLeft) {
      scrollSuperior.scrollLeft = scrollTabla.scrollLeft;
    }
  };

  actualizarAncho();
  requestAnimationFrame(actualizarAncho);

  if (!scrollSuperior.dataset.sincronizado) {
    let sincronizando = false;
    scrollSuperior.addEventListener("scroll", () => {
      if (sincronizando) return;
      sincronizando = true;
      scrollTabla.scrollLeft = scrollSuperior.scrollLeft;
      sincronizando = false;
    });
    scrollTabla.addEventListener("scroll", () => {
      if (sincronizando) return;
      sincronizando = true;
      scrollSuperior.scrollLeft = scrollTabla.scrollLeft;
      sincronizando = false;
    });
    window.addEventListener("resize", actualizarAncho);
    scrollSuperior.dataset.sincronizado = "1";
  }
}

function enlazarEventosValidacion() {
  document.querySelectorAll(".btn-aprobar-extra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const observacion = window.prompt("Observación de aprobación (opcional):", "") || "";
      await actualizarEstadoExtraRegistro(id, "aprobado", observacion);
    });
  });

  document.querySelectorAll(".btn-rechazar-extra").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const observacion = window.prompt("Motivo del rechazo:", "") || "";
      await actualizarEstadoExtraRegistro(id, "rechazado", observacion);
    });
  });
}

async function actualizarEstadoExtraRegistro(id, estado, observacion) {
  try {
    const registroLocal = registrosBase.find((item) => String(item.id) === String(id));
    if (!registroLocal) {
      alert("No se encontró el registro a actualizar.");
      return;
    }

    if (!usuarioPuedeValidarRegistro(sesionActiva, registroLocal)) {
      alert("No tienes permisos para validar este registro.");
      return;
    }

    const payload = {
      estado_extra: estado,
      aprobado_por: sesionActiva?.nombre_completo || sesionActiva?.usuario || "Usuario",
      fecha_aprobacion: new Date().toISOString(),
      observacion_aprobacion: String(observacion || "").trim() || null
    };

    const vieneDeCocinaChef = String(registroLocal.origen_datos || "") === "cocina_chef";
    const tablaDestino = vieneDeCocinaChef ? "cocina_programacion_turnos" : "programacion_turnos";
    const idDestino = vieneDeCocinaChef ? registroLocal.id_origen : registroLocal.id;

    if (!idDestino) {
      alert("No se encontró el identificador de origen del registro.");
      return;
    }

    const { error } = await supabase
      .from(tablaDestino)
      .update(payload)
      .eq("id", idDestino);

    if (error) {
      console.error(`Error actualizando estado_extra en ${tablaDestino}:`, error);
      alert("No fue posible actualizar el estado de validación. Valida que el SQL de aprobación ya se haya ejecutado en Supabase.");
      return;
    }

    await cargarDashboardReal(sesionActiva);
  } catch (error) {
    console.error("Error general validando extra:", error);
    alert("Ocurrió un error al validar el registro.");
  }
}

function prioridadEstado(estado) {
  const valor = normalizarEstadoExtra(estado);
  if (valor === "pendiente") return 0;
  if (valor === "aprobado") return 1;
  if (valor === "rechazado") return 2;
  return 9;
}


async function cargarDirectorioEmpleadosSeguro() {
  const mapa = {};

  try {
    const { data, error } = await supabase
      .from("empleados")
      .select("*");

    if (error) {
      console.warn("No se pudo cargar directorio desde empleados:", error.message || error);
      return [];
    }

    (data || [])
      .map((item) => normalizarEmpleadoDirectorio(item, "empleados"))
      .filter((empleado) => empleado.cedula)
      .forEach((empleado) => {
        mapa[empleado.cedula] = empleado;
      });
  } catch (error) {
    console.warn("Error consultando directorio empleados:", error);
  }

  return Object.values(mapa);
}

function normalizarEmpleadoDirectorio(item, tablaOrigen = "") {
  const cedula = normalizarDocumentoEmpleado(
    item.cedula ||
    item.documento ||
    item.numero_documento ||
    item.identificacion ||
    item.identificacion_empleado ||
    item.id_empleado ||
    item.cedula_empleado ||
    item.nit ||
    item.usuario ||
    ""
  );

  const nombresCompuestos = [
    item.primer_nombre,
    item.segundo_nombre,
    item.primer_apellido,
    item.segundo_apellido
  ].filter(Boolean).join(" ").trim();

  const nombresApellidos = [item.nombres, item.apellidos].filter(Boolean).join(" ").trim();

  const nombre = String(
    item.nombre_completo ||
    item.nombres_apellidos ||
    item.nombre_empleado ||
    item.empleado ||
    item.nombre ||
    item.full_name ||
    item.display_name ||
    item.colaborador ||
    item.tercero ||
    item.razon_social ||
    nombresCompuestos ||
    nombresApellidos ||
    ""
  ).trim();

  const area = String(
    item.centro_costos ||
    item.area ||
    item.nombre_centro_costo ||
    item.dependencia ||
    item.departamento ||
    item.direccion ||
    item.subarea ||
    ""
  ).trim();

  return { cedula, nombre: nombre || "Sin nombre", area: area || "Sin área", tablaOrigen, raw: item };
}

function normalizarDocumentoEmpleado(valor) {
  return String(valor || "").replace(/[^0-9A-Za-z]/g, "").trim();
}

async function cargarSolicitudesBienestarSeguras(sesion) {
  try {
    const { data, error } = await supabase
      .from("solicitudes_empleado")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("No se pudieron cargar solicitudes_empleado para el dashboard de Bienestar:", error);
      return [];
    }

    return filtrarSolicitudesBienestarPorPermisos(data || [], sesion).map(normalizarSolicitudBienestar);
  } catch (error) {
    console.warn("Error consultando solicitudes_empleado:", error);
    return [];
  }
}

function filtrarSolicitudesBienestarPorPermisos(solicitudes, sesion) {
  if (!sesion) return [];

  const rol = obtenerRolSeguroDashboard(sesion);

  // En Dashboard A&B se permite cargar la base y luego aplicar el alcance A&B obligatorio.
  // Esto evita depender de que cada usuario A&B tenga areas_permitidas perfectamente configuradas.
  if (rol === "ayb" || rol === "ayb_admin") return solicitudes;

  if (sesion.puede_ver_todo === true) return solicitudes;

  if (usuarioPuedeAccederDashboard(sesion) && ["admin", "administrador", "gerencia", "bienestar"].includes(rol)) {
    return solicitudes;
  }

  const areasPermitidas = Array.isArray(sesion.areas_permitidas) ? sesion.areas_permitidas : [];
  if (!areasPermitidas.length) return [];

  return solicitudes.filter((solicitud) => {
    const area = String(solicitud.centro_costos || solicitud.area || "").toUpperCase();
    const subarea = String(solicitud.subarea || solicitud.cargo || "").toUpperCase();
    return areasPermitidas.some((permitida) => {
      const permiso = String(permitida || "").toUpperCase();
      return area.includes(permiso) || subarea.includes(permiso);
    });
  });
}

function normalizarSolicitudBienestar(solicitud) {
  const fecha = obtenerFechaSolicitudBienestar(solicitud);
  const fechaInicio = String(solicitud.fecha_inicio || fecha || "").slice(0, 10);
  const fechaFin = String(solicitud.fecha_fin || solicitud.fecha_inicio || fecha || "").slice(0, 10);
  const fechaRadicacion = String(solicitud.fecha_radicacion || solicitud.created_at || "").slice(0, 10);
  const estado = normalizarEstadoSolicitudBienestar(solicitud.estado || solicitud.estado_solicitud || solicitud.estado_bienestar);
  const tipo = String(solicitud.tipo_solicitud || solicitud.tipo || solicitud.categoria || solicitud.motivo || solicitud.codigo_tipo || solicitud.subtipo || "").trim();
  const texto = String(
    tipo + " " +
    (solicitud.subtipo || "") + " " +
    (solicitud.codigo_tipo || "") + " " +
    (solicitud.descripcion || "") + " " +
    (solicitud.observacion_empleado || "") + " " +
    (solicitud.observacion_revision || "") + " " +
    (solicitud.observacion || "") + " " +
    (solicitud.observaciones || "")
  ).toLowerCase();

  return {
    ...solicitud,
    _fecha_bienestar: fecha,
    _fecha_inicio_bienestar: fechaInicio,
    _fecha_fin_bienestar: fechaFin,
    _fecha_radicacion_bienestar: fechaRadicacion,
    _estado_bienestar: estado,
    _tipo_bienestar: tipo || "Sin tipo",
    _es_incapacidad: texto.includes("incap"),
    _requiere_documento: evaluarPendienteDocumentoBienestar(solicitud, texto),
    _fuera_tiempo: evaluarFueraTiempoBienestar(solicitud, fecha),
    _cedula: normalizarDocumentoEmpleado(solicitud.cedula || solicitud.documento || solicitud.numero_documento || solicitud.identificacion || solicitud.id_empleado || solicitud.usuario || ""),
    _nombre: obtenerNombreSolicitudBienestar(solicitud),
    _area: obtenerAreaSolicitudBienestar(solicitud)
  };
}

function obtenerNombreSolicitudBienestar(solicitud) {
  const cedula = normalizarDocumentoEmpleado(solicitud.cedula || solicitud.documento || solicitud.numero_documento || solicitud.identificacion || solicitud.id_empleado || solicitud.usuario || "");
  const empleadoBase = obtenerEmpleadoBasePorCedula(cedula);
  if (empleadoBase?.nombre && empleadoBase.nombre !== "Sin nombre") return empleadoBase.nombre;

  const nombreDirecto = String(
    solicitud.nombre_empleado ||
    solicitud.nombre_completo ||
    solicitud.empleado ||
    solicitud.nombre ||
    solicitud.colaborador ||
    ""
  ).trim();

  return nombreDirecto || "Sin nombre";
}

function obtenerAreaSolicitudBienestar(solicitud) {
  const cedula = normalizarDocumentoEmpleado(solicitud.cedula || solicitud.documento || solicitud.numero_documento || solicitud.identificacion || solicitud.id_empleado || solicitud.usuario || "");
  const empleadoBase = obtenerEmpleadoBasePorCedula(cedula);
  if (empleadoBase?.area && empleadoBase.area !== "Sin área") return empleadoBase.area;

  const areaDirecta = String(solicitud.centro_costos || solicitud.area || solicitud.dependencia || solicitud.cargo || "").trim();
  return areaDirecta || "Sin área";
}

function obtenerFechaSolicitudBienestar(solicitud) {
  // Para cruzar una novedad con la programación importa primero la fecha del
  // evento. La fecha de creación/radicación se conserva aparte para auditoría.
  const valor = solicitud.fecha_inicio || solicitud.fecha_novedad || solicitud.fecha || solicitud.fecha_solicitud || solicitud.fecha_radicacion || solicitud.created_at;
  if (!valor) return "";
  return String(valor).slice(0, 10);
}

function normalizarEstadoSolicitudBienestar(valor) {
  const estado = String(valor || "pendiente").trim().toLowerCase();
  if (estado.includes("aprob")) return "aprobado";
  if (estado.includes("rech") || estado.includes("nega")) return "rechazado";
  if (estado.includes("doc") || estado.includes("soporte")) return "pendiente_documentos";
  if (estado.includes("pend")) return "pendiente";
  return estado || "pendiente";
}

function evaluarPendienteDocumentoBienestar(solicitud, texto) {
  const estado = normalizarEstadoSolicitudBienestar(solicitud.estado || solicitud.estado_solicitud || solicitud.estado_bienestar);
  const requiereDocumento = solicitud.requiere_documentos ?? solicitud.pendiente_documentos ?? solicitud.requiere_documento ?? solicitud.requiere_soporte ?? solicitud.documento_pendiente;
  const documentacionCompleta = solicitud.documentacion_completa;
  const documentosRequeridos = Array.isArray(solicitud.documentos_requeridos) ? solicitud.documentos_requeridos : [];
  const documentosCargados = Array.isArray(solicitud.documentos_cargados) ? solicitud.documentos_cargados : [];
  const tieneAdjunto = Boolean(solicitud.archivo_url || solicitud.soporte_url || solicitud.documento_url || solicitud.adjunto_url || solicitud.evidencia_url || documentosCargados.length);

  if (estado === "pendiente_documentos") return true;
  if (documentacionCompleta === false) return true;
  if ((requiereDocumento === true || String(requiereDocumento || "").toLowerCase() === "true") && !tieneAdjunto) return true;
  if (documentosRequeridos.length && documentosCargados.length < documentosRequeridos.length) return true;
  if ((texto.includes("document") || texto.includes("soporte") || texto.includes("adjunto")) && !tieneAdjunto) return true;
  return false;
}

function evaluarFueraTiempoBienestar(solicitud, fechaSolicitud) {
  const flag = solicitud.fuera_tiempo ?? solicitud.extemporanea ?? solicitud.solicitud_extemporanea;
  if (flag === true || String(flag || "").toLowerCase() === "true") return true;

  const fechaEvento = String(solicitud.fecha_inicio || solicitud.fecha_novedad || solicitud.fecha_evento || "").slice(0, 10);
  if (!fechaSolicitud || !fechaEvento) return false;

  const radicacion = new Date(`${fechaSolicitud}T00:00:00`);
  const evento = new Date(`${fechaEvento}T00:00:00`);
  if (Number.isNaN(radicacion.getTime()) || Number.isNaN(evento.getTime())) return false;

  const diferenciaDias = Math.round((radicacion - evento) / 86400000);
  return diferenciaDias > 2;
}

function obtenerSolicitudesBienestarFiltradas() {
  return solicitudesBienestarBase.filter((solicitud) => {
    const inicio = solicitud._fecha_inicio_bienestar || solicitud._fecha_bienestar || "";
    const fin = solicitud._fecha_fin_bienestar || inicio;
    const area = String(solicitud._area || "").toUpperCase();
    const empleado = `${solicitud._nombre || ""} ${solicitud._cedula || ""}`.toUpperCase();

    // Se incluye cualquier solicitud cuyo intervalo se cruce con el filtro.
    if (filtrosActuales.fechaInicio && fin && fin < filtrosActuales.fechaInicio) return false;
    if (filtrosActuales.fechaFin && inicio && inicio > filtrosActuales.fechaFin) return false;
    if (filtrosActuales.area && !area.includes(String(filtrosActuales.area).toUpperCase())) return false;
    if (filtrosActuales.empleado && !empleado.includes(String(filtrosActuales.empleado).toUpperCase())) return false;
    return true;
  });
}

function renderDashboardBienestar() {
  const solicitudes = obtenerSolicitudesBienestarFiltradas().filter((solicitud) => {
    const fin = String(solicitud._fecha_fin_bienestar || solicitud._fecha_inicio_bienestar || solicitud._fecha_bienestar || "").slice(0, 10);
    return !fin || fin >= FECHA_INICIO_METRICAS_AYB;
  });
  const hoy = new Date();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

  const pendientes = solicitudes.filter((s) => s._estado_bienestar === "pendiente" || s._estado_bienestar === "pendiente_documentos");
  const aprobadas = solicitudes.filter((s) => s._estado_bienestar === "aprobado");
  const rechazadas = solicitudes.filter((s) => s._estado_bienestar === "rechazado");
  const incapacidadesMes = solicitudes.filter((s) => s._es_incapacidad && String(s._fecha_inicio_bienestar || s._fecha_bienestar || "").startsWith(mesActual));
  const pendientesDocs = solicitudes.filter((s) => s._requiere_documento);
  const fueraTiempo = solicitudes.filter((s) => s._fuera_tiempo);

  setText("kpiBienestarPendientes", pendientes.length);
  setText("kpiBienestarIncapacidadesMes", incapacidadesMes.length);
  setText("kpiBienestarAprobadasRechazadas", `${aprobadas.length} / ${rechazadas.length}`);
  setText("kpiBienestarPendientesDocs", pendientesDocs.length);
  setText("kpiBienestarFueraTiempo", fueraTiempo.length);

  renderRankingNovedadesBienestar(solicitudes);
}

function renderDashboardBienestarVacio() {
  setText("kpiBienestarPendientes", 0);
  setText("kpiBienestarIncapacidadesMes", 0);
  setText("kpiBienestarAprobadasRechazadas", "0 / 0");
  setText("kpiBienestarPendientesDocs", 0);
  setText("kpiBienestarFueraTiempo", 0);
  renderRankingNovedadesBienestar([]);
}

function renderRankingNovedadesBienestar(solicitudes) {
  const tbody = document.getElementById("tbodyRankingNovedadesBienestar");
  if (!tbody) return;

  if (!solicitudes.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="texto-vacio">No hay solicitudes de Bienestar en el filtro actual.</td></tr>`;
    return;
  }

  const mapa = {};

  solicitudes.forEach((solicitud) => {
    const cedula = solicitud._cedula || `sin-cedula-${solicitud._nombre}`;
    if (!mapa[cedula]) {
      const empleadoBase = obtenerEmpleadoBasePorCedula(solicitud._cedula);
      mapa[cedula] = {
        cedula: solicitud._cedula || "-",
        nombre: empleadoBase?.nombre || solicitud._nombre || "Sin nombre",
        area: empleadoBase?.area || solicitud._area || "Sin área",
        total: 0,
        pendientes: 0,
        aprobadas: 0,
        rechazadas: 0,
        incapacidades: 0,
        ultima: ""
      };
    }

    mapa[cedula].total += 1;
    if (solicitud._estado_bienestar === "pendiente" || solicitud._estado_bienestar === "pendiente_documentos") mapa[cedula].pendientes += 1;
    if (solicitud._estado_bienestar === "aprobado") mapa[cedula].aprobadas += 1;
    if (solicitud._estado_bienestar === "rechazado") mapa[cedula].rechazadas += 1;
    if (solicitud._es_incapacidad) mapa[cedula].incapacidades += 1;
    if (solicitud._fecha_bienestar && solicitud._fecha_bienestar > mapa[cedula].ultima) mapa[cedula].ultima = solicitud._fecha_bienestar;
  });

  const ranking = Object.values(mapa)
    .sort((a, b) => b.total - a.total || b.incapacidades - a.incapacidades || String(b.ultima).localeCompare(String(a.ultima)))
    .slice(0, 15);

  tbody.innerHTML = ranking.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escaparHtml(item.nombre)}</td>
      <td>${escaparHtml(item.cedula)}</td>
      <td>${escaparHtml(item.area)}</td>
      <td>${item.total}</td>
      <td>${item.pendientes}</td>
      <td>${item.aprobadas}</td>
      <td>${item.rechazadas}</td>
      <td>${item.incapacidades}</td>
      <td>${escaparHtml(formatearFechaCorta(item.ultima) || "-")}</td>
    </tr>
  `).join("");
}

function obtenerRegistrosConExtras(registros) {
  return registros.filter((item) => {
    if (esNovedad(item)) return false;
    const esFestivo = item.es_festivo === true || String(item.tipo_jornada || "").toLowerCase().includes("festivo");
    const extras = Number(item.horas_extra_estimadas || 0) > 0
      || Number(item.extra_diurna || 0) > 0
      || Number(item.extra_nocturna || 0) > 0
      || Number(item.extra_diurna_festiva || 0) > 0
      || Number(item.extra_nocturna_festiva || 0) > 0;
    return esFestivo || extras;
  });
}

function usuarioPuedeValidarRegistro(sesion, registro) {
  if (!sesion || !registro) return false;

  // Los externos nunca ingresan al flujo oficial de aprobación de nómina.
  if (
    String(registro.origen_datos || "") === "cocina_chef" &&
    String(registro.tipo_personal || "").trim().toLowerCase() === "externo"
  ) {
    return false;
  }

  if (sesion.puede_ver_todo === true) return true;

  const rol = String(sesion.rol || "").trim().toLowerCase();
  const rolesConValidacion = [
    "admin",
    "gerencia",
    "bienestar",
    "direccion_financiera",
    "ayb",
    "servicios_generales"
  ];

  if (!rolesConValidacion.includes(rol)) {
    return false;
  }

  const areasPermitidas = Array.isArray(sesion.areas_permitidas) ? sesion.areas_permitidas : [];
  if (!areasPermitidas.length) return false;

  const areaRegistro = String(registro.area || "").toUpperCase();
  const subareaRegistro = String(registro.subarea || "").toUpperCase();

  return areasPermitidas.some((permitida) => {
    const permiso = String(permitida || "").toUpperCase();
    return areaRegistro.includes(permiso) || subareaRegistro.includes(permiso);
  });
}

function crearBadgeEstadoExtra(estado) {
  const valor = normalizarEstadoExtra(estado);
  const clase =
    valor === "aprobado" ? "estado-aprobado" :
      valor === "rechazado" ? "estado-rechazado" :
        "estado-pendiente";

  return `<span class="badge-estado ${clase}">${escaparHtml(valor)}</span>`;
}

function renderTablaMenorCarga(registros) {
  const tbody = document.getElementById("tbodyMenorCarga");
  if (!tbody) return;

  const universoAyb = obtenerUniversoEmpleadosAyb();

  if (!universoAyb.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="texto-vacio">No hay empleados de Alimentos y Bebidas para analizar.</td></tr>`;
    return;
  }

  const mapa = {};
  const fechasPeriodo = obtenerFechasPeriodoFiltrado(registros);
  const solicitudesPorCedula = agruparSolicitudesBienestarPorCedula(obtenerSolicitudesBienestarFiltradas());

  universoAyb.forEach((empleado) => {
    mapa[empleado.cedula] = {
      cedula: empleado.cedula,
      nombre: empleado.nombre,
      area: empleado.area,
      diasProgramados: new Set(),
      diasConRegistro: new Set(),
      novedades: 0,
      incapacidades: 0,
      vacaciones: 0,
      permisos: 0,
      horasNetas: 0,
      ultimaProgramacion: ""
    };
  });

  registros
    .filter((item) => String(item.cedula || "").trim())
    .forEach((item) => {
      const cedula = normalizarDocumentoEmpleado(item.cedula || "");
      if (!mapa[cedula]) return;

      const fecha = String(item.fecha || "").trim();
      const esRegistroNovedad = esNovedad(item);
      const tipoNovedad = clasificarNovedad(item);

      if (fecha) {
        mapa[cedula].diasConRegistro.add(fecha);

        if (esRegistroNovedad) {
          mapa[cedula].novedades += 1;
          if (tipoNovedad === "incapacidad") mapa[cedula].incapacidades += 1;
          if (tipoNovedad === "vacaciones") mapa[cedula].vacaciones += 1;
          if (tipoNovedad === "licencia" || tipoNovedad === "permiso") mapa[cedula].permisos += 1;
        } else {
          mapa[cedula].diasProgramados.add(fecha);
          mapa[cedula].ultimaProgramacion = !mapa[cedula].ultimaProgramacion || fecha > mapa[cedula].ultimaProgramacion
            ? fecha
            : mapa[cedula].ultimaProgramacion;
        }
      }

      if (!esRegistroNovedad) {
        mapa[cedula].horasNetas += Number(item.horas_netas || 0);
      }
    });

  const ranking = Object.values(mapa)
    .map((item) => {
      const solicitudes = solicitudesPorCedula[item.cedula] || obtenerResumenSolicitudesVacio();
      const dias = item.diasProgramados.size;
      const horas = redondearHoras(item.horasNetas);
      const promedio = dias > 0 ? redondearHoras(horas / dias) : 0;
      const ausenciasValidas = item.incapacidades + item.vacaciones + item.permisos + solicitudes.incapacidades + solicitudes.vacaciones + solicitudes.permisosAprobados;
      const diasSinProgramacion = Math.max(0, fechasPeriodo.length - item.diasConRegistro.size - ausenciasValidas);

      let estado = "Normal";
      let clase = "alerta-verde";
      let causa = "Carga coherente con la programación registrada";

      if (dias === 0 && ausenciasValidas > 0) {
        estado = "Justificado";
        clase = "alerta-verde";
        causa = construirCausaMenorCarga(ausenciasValidas, diasSinProgramacion, "Ausencia válida registrada");
      } else if (dias === 0 && item.novedades > 0) {
        estado = "Revisar";
        clase = "alerta-amarillo";
        causa = construirCausaMenorCarga(ausenciasValidas, diasSinProgramacion, "Sin programación activa; registra novedades en el periodo");
      } else if (dias === 0) {
        estado = diasSinProgramacion > 0 ? "Crítico" : "Revisar";
        clase = diasSinProgramacion > 0 ? "alerta-rojo" : "alerta-amarillo";
        causa = construirCausaMenorCarga(ausenciasValidas, diasSinProgramacion, "Empleado A&B sin programación visible en el periodo filtrado");
      } else if ((horas <= 8 || promedio < 4) && ausenciasValidas > 0) {
        estado = "Justificado";
        clase = "alerta-verde";
        causa = construirCausaMenorCarga(ausenciasValidas, diasSinProgramacion, "Baja carga con novedad/solicitud aprobada asociada");
      } else if (horas <= 8 || promedio < 4) {
        estado = "Revisar";
        clase = "alerta-amarillo";
        causa = construirCausaMenorCarga(ausenciasValidas, diasSinProgramacion, "Baja carga horaria registrada");
      }

      return {
        ...item,
        dias,
        horas,
        promedio,
        ausenciasValidas,
        diasSinProgramacion,
        estado,
        clase,
        causa
      };
    })
    .sort((a, b) => {
      const peso = { "Crítico": 0, "Revisar": 1, "Justificado": 2, "Normal": 3 };
      return (peso[a.estado] ?? 4) - (peso[b.estado] ?? 4) || a.horas - b.horas || a.dias - b.dias || a.nombre.localeCompare(b.nombre);
    });

  if (!ranking.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="texto-vacio">No hay datos para analizar menor carga en el filtro actual.</td></tr>`;
    return;
  }

  tbody.innerHTML = ranking.map((item, index) => `
    <tr class="${item.estado === "Crítico" ? "fila-critica" : item.estado === "Revisar" ? "fila-alerta" : ""}">
      <td>${index + 1}</td>
      <td>${escaparHtml(item.nombre)}</td>
      <td>${escaparHtml(item.cedula)}</td>
      <td>${escaparHtml(item.area)}</td>
      <td>${item.dias}</td>
      <td>${formatearNumero(item.horas)}</td>
      <td>${formatearNumero(item.promedio)}</td>
      <td>${item.novedades} / ${item.ausenciasValidas}</td>
      <td>${escaparHtml(formatearFechaCorta(item.ultimaProgramacion) || "-")}</td>
      <td><span class="alerta-semaforo ${item.clase}">${escaparHtml(item.estado)}</span></td>
      <td>${escaparHtml(item.causa)}</td>
    </tr>
  `).join("");
}

function obtenerFechasPeriodoFiltrado(registros) {
  const fechas = new Set(registros.map((r) => String(r.fecha || "").trim()).filter(Boolean));
  if (fechas.size) return Array.from(fechas);

  if (!filtrosActuales.fechaInicio || !filtrosActuales.fechaFin) return [];

  const resultado = [];
  const inicio = new Date(`${filtrosActuales.fechaInicio}T00:00:00`);
  const fin = new Date(`${filtrosActuales.fechaFin}T00:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return [];

  for (let fecha = new Date(inicio); fecha <= fin; fecha.setDate(fecha.getDate() + 1)) {
    resultado.push(formatearFechaISO(fecha));
  }

  return resultado;
}

function agruparSolicitudesBienestarPorCedula(solicitudes) {
  const mapa = {};

  solicitudes.forEach((solicitud) => {
    const cedula = String(solicitud._cedula || "").trim();
    if (!cedula) return;
    if (!mapa[cedula]) mapa[cedula] = obtenerResumenSolicitudesVacio();

    const tipo = String(solicitud._tipo_bienestar || "").toLowerCase();
    const estado = solicitud._estado_bienestar;
    if (solicitud._es_incapacidad) mapa[cedula].incapacidades += 1;
    if (tipo.includes("vacac") && estado === "aprobado") mapa[cedula].vacaciones += 1;
    if ((tipo.includes("permiso") || tipo.includes("ausencia")) && estado === "aprobado") mapa[cedula].permisosAprobados += 1;
  });

  return mapa;
}

function obtenerResumenSolicitudesVacio() {
  return { incapacidades: 0, vacaciones: 0, permisosAprobados: 0 };
}

function construirCausaMenorCarga(ausenciasValidas, diasSinProgramacion, base) {
  const partes = [base];
  if (ausenciasValidas > 0) partes.push(`${ausenciasValidas} ausencia(s) válida(s)`);
  if (diasSinProgramacion > 0) partes.push(`${diasSinProgramacion} día(s) sin programación`);
  return partes.join(" | ");
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
          "rgba(23,75,56,0.88)",
          "rgba(36,130,91,0.82)",
          "rgba(83,151,119,0.78)",
          "rgba(118,169,145,0.74)",
          "rgba(147,179,164,0.72)",
          "rgba(102,123,114,0.72)"
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
        borderColor: "rgba(23,75,56,1)",
        backgroundColor: "rgba(36,130,91,0.13)",
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

function renderGraficaHorasTipo(registros) {
  const canvas = document.getElementById("graficaHorasTipo");
  if (!canvas) return;

  destruirGrafica("horasTipo");

  const soloTurnos = registros.filter((r) => !esNovedad(r));
  const horasDiurnas = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.horas_diurnas || 0), 0));
  const horasNocturnas = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.horas_nocturnas || 0), 0));

  chartHorasTipo = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Horas diurnas", "Horas nocturnas"],
      datasets: [{
        data: [horasDiurnas, horasNocturnas],
        backgroundColor: [
          "rgba(36,130,91,0.88)",
          "rgba(23,75,56,0.92)"
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

function renderGraficaHorasExtraEmpleados(registros) {
  const canvas = document.getElementById("graficaHorasExtraEmpleados");
  if (!canvas) return;

  destruirGrafica("horasExtraEmpleados");

  const mapa = {};

  registros.filter((r) => !esNovedad(r)).forEach((item) => {
    const clave = String(item.cedula || obtenerNombreEmpleado(item));
    if (!mapa[clave]) {
      mapa[clave] = {
        nombre: obtenerNombreEmpleado(item),
        total: 0
      };
    }

    mapa[clave].total += Number(item.horas_extra_estimadas || 0);
  });

  const ranking = Object.values(mapa)
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  chartHorasExtraEmpleados = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ranking.map((item) => recortarTexto(item.nombre, 18)),
      datasets: [{
        label: "Horas extra",
        data: ranking.map((item) => redondearHoras(item.total)),
        backgroundColor: "rgba(199,122,18,0.78)",
        borderColor: "rgba(199,122,18,1)",
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
          beginAtZero: true
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
          "rgba(23,75,56,0.90)",
          "rgba(36,130,91,0.86)",
          "rgba(72,145,110,0.82)",
          "rgba(99,160,131,0.78)",
          "rgba(124,174,151,0.76)",
          "rgba(148,185,168,0.74)",
          "rgba(103,126,116,0.72)",
          "rgba(174,196,185,0.72)"
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
        borderColor: "rgba(23,75,56,1)",
        backgroundColor: "rgba(36,130,91,0.12)",
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
        backgroundColor: "rgba(36,130,91,0.78)",
        borderColor: "rgba(23,75,56,1)",
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
        backgroundColor: "rgba(83,151,119,0.78)",
        borderColor: "rgba(23,75,56,1)",
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
  if (!sesion) return [];

  const rol = String(sesion.rol || "").toLowerCase();
  const area = String(sesion.area || sesion.centro_costos || "").toLowerCase();

  // Acceso global solo por rol o permiso explícito. No se infiere por área/cargo.
  if (usuarioPuedeAccederDashboard(sesion)) {
    return registros;
  }

  const areasPermitidas = Array.isArray(sesion.areas_permitidas) ? sesion.areas_permitidas : [];

  if (areasPermitidas.length === 0) {
    return [];
  }

  return registros.filter((registro) => {
    const areaRegistro = String((registro.centro_costos || "") + " " + (registro.area || "")).toUpperCase();
    const subareaRegistro = String((registro.subarea || "") + " " + (registro.cargo || "")).toUpperCase();

    return areasPermitidas.some((permitida) => {
      const permiso = String(permitida || "").toUpperCase();
      return areaRegistro.includes(permiso) || subareaRegistro.includes(permiso);
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

    if (esNovedad(item)) {
      resumen[area].novedades += 1;
    } else {
      resumen[area].programados += 1;
    }

    if (!esNovedad(item) && item.subarea) {
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
  renderTablaValidacionExtras([]);
  renderDashboardBienestarVacio();
  renderTablaMenorCarga([]);
  renderPanelExternosChef();
  renderControlIntegracionChef();
  renderKPIsGeneralesAnaliticos([]);
  renderKPIsAnaliticos([]);
  renderKPIsHoras([]);
  renderKPIsNovedades([]);
  renderKPIsAlertas([]);
  renderKPIsValidacion([]);
  actualizarBadgesAnaliticos([]);

  [
    "areas",
    "dias",
    "horasTipo",
    "horasExtraEmpleados",
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

  if (tipo === "horasTipo" && chartHorasTipo) {
    chartHorasTipo.destroy();
    chartHorasTipo = null;
  }

  if (tipo === "horasExtraEmpleados" && chartHorasExtraEmpleados) {
    chartHorasExtraEmpleados.destroy();
    chartHorasExtraEmpleados = null;
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

function obtenerEmpleadoBasePorCedula(cedula) {
  const documento = normalizarDocumentoEmpleado(cedula);
  if (!documento) return null;

  const registroDirectorio = directorioEmpleadosBase.find((item) => normalizarDocumentoEmpleado(item.cedula) === documento);
  if (registroDirectorio) {
    return {
      cedula: documento,
      nombre: registroDirectorio.nombre || "Sin nombre",
      area: registroDirectorio.area || "Sin área"
    };
  }

  const registroProgramacion = registrosBase.find((item) => normalizarDocumentoEmpleado(item.cedula) === documento);
  if (registroProgramacion) {
    return {
      cedula: documento,
      nombre: obtenerNombreEmpleado(registroProgramacion),
      area: obtenerAreaAmigable(registroProgramacion)
    };
  }

  return null;
}

function obtenerUniversoEmpleadosAyb() {
  return directorioEmpleadosBase
    .filter((item) => item.cedula)
    .filter((item) => {
      const textoEmpleado = `${item.nombre || ""} ${item.cedula || ""}`.toUpperCase();
      return !filtrosActuales.empleado ||
        textoEmpleado.includes(String(filtrosActuales.empleado).toUpperCase());
    })
    .map((item) => ({
      cedula: item.cedula,
      nombre: item.nombre || "Sin nombre",
      area: item.area || "Alimentos y Bebidas"
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function obtenerNombreEmpleado(item) {
  const nombresCompuestos = [
    item.primer_nombre,
    item.segundo_nombre,
    item.primer_apellido,
    item.segundo_apellido
  ].filter(Boolean).join(" ").trim();

  const nombresApellidos = [item.nombres, item.apellidos].filter(Boolean).join(" ").trim();

  return String(
    item.nombre_completo ||
    item.nombres_apellidos ||
    item.nombre_empleado ||
    item.empleado ||
    item.nombre ||
    item.colaborador ||
    item.full_name ||
    item.display_name ||
    item.tercero ||
    item.razon_social ||
    nombresCompuestos ||
    nombresApellidos ||
    "Sin nombre"
  ).trim();
}

function obtenerAreaAmigable(item) {
  const areaBase = String(item.centro_costos || item.area || "").trim();
  const area = areaBase.toUpperCase();
  const subarea = String(item.subarea || "").toUpperCase();

  if (area.includes("ALIMENTOS") || area.includes("BEBIDAS") || area.includes("A&B") || area.includes("AYB")) return "Alimentos y Bebidas";
  if (area.includes("OPERACIONES") || area.includes("SERVICIOS")) return "Operaciones";
  if (area.includes("ADMIN")) return "Administrativo";
  if (areaBase) return areaBase;
  if (subarea) return String(item.subarea || "").trim();
  return "Sin área";
}

function esNovedad(item) {
  return String(item.tipo_registro || "").toLowerCase() === "novedad" || Boolean(item.novedad_codigo);
}

function clasificarNovedad(item) {
  const codigo = String(item.novedad_codigo || "").trim().toLowerCase();
  const novedad = String(item.novedad || "").trim().toLowerCase();
  const tipoRegistro = String(item.tipo_registro || "").trim().toLowerCase();
  const observacion = String(item.observacion || "").trim().toLowerCase();

  const texto = `${codigo} ${tipoRegistro} ${novedad} ${observacion}`.toLowerCase();

  if (
    codigo === "inc" ||
    codigo === "inca" ||
    texto.includes("incap") ||
    texto.includes("incapacidad") ||
    texto.includes("incapacitado")
  ) {
    return "incapacidad";
  }

  if (
    codigo === "vac" ||
    codigo === "vaca" ||
    texto.includes("vacac") ||
    texto.includes("vacaciones")
  ) {
    return "vacaciones";
  }

  if (
    codigo === "lic" ||
    codigo === "perm" ||
    texto.includes("licen") ||
    texto.includes("licencia") ||
    texto.includes("permiso")
  ) {
    return "licencia";
  }

  if (
    codigo === "des" ||
    texto.includes("descanso")
  ) {
    return "descanso";
  }

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
  if (!item) return false;
  return String(item.area || "").toUpperCase().includes("ALIMENTOS") ||
    String(item.centro_costos || "").toUpperCase().includes("ALIMENTOS") ||
    String(item.origen_datos || "") === "cocina_chef";
}

function esOperaciones(item) {
  const area = String(item.area || "").toUpperCase();
  return area.includes("OPERACIONES") || area.includes("SERVICIOS");
}

function esAdministrativo(item) {
  return !esAyb(item) && !esOperaciones(item);
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

let detalleAybActual = null;

function configurarDetalleInteractivoAyb() {
  const drawer = document.getElementById("aybDetailDrawer");
  const backdrop = document.getElementById("aybDetailBackdrop");
  const cerrar = document.getElementById("aybDetailClose");
  const buscador = document.getElementById("aybDetailSearch");
  if (!drawer || !backdrop) return;

  const activar = (elemento) => abrirDetalleIndicadorAyb(elemento.dataset.aybDetail);
  document.querySelectorAll("[data-ayb-detail]").forEach((elemento) => {
    elemento.addEventListener("click", () => activar(elemento));
    elemento.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        activar(elemento);
      }
    });
  });

  cerrar?.addEventListener("click", cerrarDetalleIndicadorAyb);
  backdrop.addEventListener("click", cerrarDetalleIndicadorAyb);
  document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && drawer.classList.contains("open")) cerrarDetalleIndicadorAyb();
  });
  buscador?.addEventListener("input", () => pintarDetalleIndicadorAyb(buscador.value));
}

function cerrarDetalleIndicadorAyb() {
  document.getElementById("aybDetailDrawer")?.classList.remove("open");
  document.getElementById("aybDetailBackdrop")?.classList.remove("open");
  document.getElementById("aybDetailDrawer")?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("ayb-detail-open");
}

function abrirDetalleIndicadorAyb(tipo) {
  detalleAybActual = construirDetalleIndicadorAyb(tipo);
  const drawer = document.getElementById("aybDetailDrawer");
  const backdrop = document.getElementById("aybDetailBackdrop");
  const buscador = document.getElementById("aybDetailSearch");
  if (!drawer || !backdrop || !detalleAybActual) return;

  setText("aybDetailTitle", detalleAybActual.titulo);
  setText("aybDetailSubtitle", detalleAybActual.subtitulo);
  if (buscador) buscador.value = "";
  pintarDetalleIndicadorAyb("");
  drawer.classList.add("open");
  backdrop.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("ayb-detail-open");
  window.setTimeout(() => buscador?.focus(), 180);
}

function construirDetalleIndicadorAyb(tipo) {
  const registros = obtenerRegistrosMetricasAyb(obtenerRegistrosFiltrados());
  const hoy = formatearFechaISO(new Date());
  const turnos = registros.filter((item) => !esNovedad(item));
  const turnosHoy = turnos.filter((item) => String(item.fecha || "") === hoy);
  const novedadesHoy = registros.filter((item) => esNovedad(item) && String(item.fecha || "") === hoy);

  const filaRegistro = (item) => ({
    Fecha: formatearFechaCorta(item.fecha) || item.fecha || "—",
    Empleado: obtenerNombreEmpleado(item) || "Sin nombre",
    Cédula: item.cedula || "—",
    Área: obtenerAreaAmigable(item) || "—",
    Punto: item.subarea || "—",
    Turno: esNovedad(item) ? obtenerLabelNovedad(item) : (item.turno || item.codigo_turno || "—"),
    Horario: esNovedad(item) ? "No aplica" : `${String(item.hora_inicio || "—").slice(0,5)} – ${String(item.hora_fin || "—").slice(0,5)}`,
    "Horas netas": esNovedad(item) ? "—" : formatearNumero(Number(item.horas_netas || 0)),
    "Extra candidata": esNovedad(item) ? "—" : formatearNumero(Number(item.horas_extra_estimadas || 0))
  });

  if (tipo === "turnos-hoy") return {
    titulo: "Turnos programados hoy",
    subtitulo: "Personas y horarios que forman el indicador; no incluye novedades.",
    filas: turnosHoy.map(filaRegistro), columnas: ["Empleado", "Cédula", "Área", "Punto", "Turno", "Horario", "Horas netas"]
  };

  if (tipo === "novedades-hoy") return {
    titulo: "Novedades aplicadas hoy",
    subtitulo: "Incapacidades, vacaciones, descansos, permisos y demás novedades registradas en programación.",
    filas: novedadesHoy.map(filaRegistro), columnas: ["Empleado", "Cédula", "Área", "Turno", "Fecha"]
  };

  if (tipo === "subareas-hoy") {
    const grupos = new Map();
    turnosHoy.forEach((item) => {
      const punto = String(item.subarea || "Sin punto").trim();
      if (!grupos.has(punto)) grupos.set(punto, { Punto: punto, Turnos: 0, Personas: new Set(), "Horas netas": 0 });
      const grupo = grupos.get(punto);
      grupo.Turnos += 1;
      grupo.Personas.add(String(item.cedula || obtenerNombreEmpleado(item)));
      grupo["Horas netas"] += Number(item.horas_netas || 0);
    });
    const filas = [...grupos.values()].map((grupo) => ({
      Punto: grupo.Punto, Turnos: grupo.Turnos, Personas: grupo.Personas.size,
      "Horas netas": formatearNumero(grupo["Horas netas"])
    })).sort((a, b) => b.Turnos - a.Turnos);
    return { titulo: "Subáreas activas hoy", subtitulo: "Carga programada por punto de operación.", filas, columnas: ["Punto", "Personas", "Turnos", "Horas netas"] };
  }

  if (tipo === "personas-periodo") {
    const grupos = new Map();
    registros.forEach((item) => {
      const clave = String(item.cedula || obtenerNombreEmpleado(item));
      if (!grupos.has(clave)) grupos.set(clave, { Empleado: obtenerNombreEmpleado(item), Cédula: item.cedula || "—", Área: obtenerAreaAmigable(item), Fechas: new Set(), Turnos: 0, Novedades: 0, Horas: 0 });
      const grupo = grupos.get(clave); grupo.Fechas.add(String(item.fecha || ""));
      if (esNovedad(item)) grupo.Novedades += 1; else { grupo.Turnos += 1; grupo.Horas += Number(item.horas_netas || 0); }
    });
    const filas = [...grupos.values()].map((grupo) => ({ Empleado: grupo.Empleado, Cédula: grupo.Cédula, Área: grupo.Área, "Días registrados": grupo.Fechas.size, Turnos: grupo.Turnos, Novedades: grupo.Novedades, "Horas netas": formatearNumero(grupo.Horas) })).sort((a,b) => b["Días registrados"] - a["Días registrados"]);
    return { titulo: "Personas con registro", subtitulo: "Cada persona se muestra una sola vez con su programación y novedades del período.", filas, columnas: ["Empleado", "Cédula", "Área", "Días registrados", "Turnos", "Novedades", "Horas netas"] };
  }

  if (tipo === "horas-netas") return {
    titulo: "Composición de horas netas",
    subtitulo: "Detalle de turnos que suma las horas netas del período filtrado.",
    filas: turnos.map(filaRegistro).sort((a,b) => String(b.Fecha).localeCompare(String(a.Fecha))),
    columnas: ["Fecha", "Empleado", "Área", "Punto", "Horario", "Horas netas"]
  };

  const extras = turnos.filter((item) => Number(item.horas_extra_estimadas || 0) > 0);
  return {
    titulo: "Horas candidatas a extra",
    subtitulo: "Son diferencias calculadas para revisión; no equivalen a horas aprobadas.",
    filas: extras.map(filaRegistro).sort((a,b) => Number(b["Extra candidata"] || 0) - Number(a["Extra candidata"] || 0)),
    columnas: ["Fecha", "Empleado", "Cédula", "Área", "Punto", "Horario", "Horas netas", "Extra candidata"]
  };
}

function pintarDetalleIndicadorAyb(busqueda = "") {
  const cuerpo = document.getElementById("aybDetailBody");
  if (!cuerpo || !detalleAybActual) return;
  const texto = normalizarTextoAlcanceAyb(busqueda);
  const filas = detalleAybActual.filas.filter((fila) => !texto || normalizarTextoAlcanceAyb(Object.values(fila).join(" ")).includes(texto));
  setText("aybDetailCount", `${filas.length} ${filas.length === 1 ? "registro" : "registros"}`);
  if (!filas.length) {
    cuerpo.innerHTML = '<div class="ayb-detail-empty"><strong>Sin información para mostrar</strong><div class="mt-1">No hay registros que coincidan con el período, los filtros y la búsqueda actual.</div></div>';
    return;
  }
  const columnas = detalleAybActual.columnas;
  cuerpo.innerHTML = `<div class="table-responsive"><table class="table table-sm table-hover align-middle"><thead><tr>${columnas.map((columna) => `<th>${escaparHtml(columna)}</th>`).join("")}</tr></thead><tbody>${filas.map((fila) => `<tr>${columnas.map((columna) => `<td>${escaparHtml(fila[columna] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function configurarBotonExportarPDF() {
  const btnExportarPDF = document.getElementById("btnExportarPDF");
  if (!btnExportarPDF) return;

  // Este texto permite confirmar visualmente que el navegador cargó esta versión.
  btnExportarPDF.textContent = "Descargar vista PDF";
  btnExportarPDF.dataset.exportVersion = "ayb-descargas-v2";

  btnExportarPDF.addEventListener("click", async () => {
    await exportarDashboardAPDF();
  });
}

function configurarBotonExportarExcel() {
  const btnExportarExcel = document.getElementById("btnExportarExcel");
  if (!btnExportarExcel) return;

  // Este texto permite confirmar visualmente que el navegador cargó esta versión.
  btnExportarExcel.textContent = "Descargar período Excel";
  btnExportarExcel.dataset.exportVersion = "ayb-excel-marcaciones-v3";

  btnExportarExcel.addEventListener("click", async () => {
    await exportarDashboardExcel();
  });
}

function valorExcelSeguro(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  const texto = String(valor);
  return /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
}

function descargarArchivoLocal(contenido, nombreArchivo, tipoMime) {
  const blob = contenido instanceof Blob
    ? contenido
    : new Blob([contenido], { type: tipoMime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function esMarcacionPorteria(marcacion) {
  const texto = normalizarTextoAlcanceAyb(`${marcacion?.area_biometrico || ""} ${marcacion?.terminal_alias || ""}`);
  return texto.includes("PORTERIA");
}

function horaMarcacionExcel(marcacion) {
  return String(marcacion?.hora_marcacion || marcacion?.punch_time || "").match(/(\d{2}:\d{2}:\d{2})/)?.[1] || "";
}

function claveMarcacionesExcel(cedula, fecha) {
  return `${normalizarDocumentoEmpleado(cedula)}|${String(fecha || "").slice(0, 10)}`;
}

function claveEventoMarcacionExcel(marcacion) {
  return String(marcacion?.biotime_id || `${claveMarcacionesExcel(marcacion?.cedula, marcacion?.fecha)}|${marcacion?.punch_time || ""}|${marcacion?.terminal_sn || ""}`);
}

async function cargarMarcacionesExportacionAyb(desde, hasta) {
  const pagina = 1000;
  const resultado = [];
  for (let inicio = 0; ; inicio += pagina) {
    let consulta = supabase
      .from("vw_asistencia_recorrido_frontend")
      .select("cedula,empleado,fecha,punch_time,hora_marcacion,posicion,total_marcaciones_jornada,biotime_id,terminal_sn,terminal_alias,area_biometrico,tipo_evento_jornada,tipo_marcacion_operativa,regla_operativa")
      .eq("regla_operativa", "ayb_multi_punto")
      .order("fecha", { ascending: true })
      .order("cedula", { ascending: true })
      .order("punch_time", { ascending: true })
      .range(inicio, inicio + pagina - 1);
    if (desde) consulta = consulta.gte("fecha", desde);
    if (hasta) consulta = consulta.lte("fecha", hasta);
    const { data, error } = await consulta;
    if (error) throw new Error(`No fue posible consultar las marcaciones biométricas: ${error.message}`);
    resultado.push(...(data || []));
    if (!data || data.length < pagina) break;
  }
  return resultado;
}

function resumirMarcacionesPorDia(marcaciones) {
  const mapa = new Map();
  (marcaciones || []).forEach((marcacion) => {
    const clave = claveMarcacionesExcel(marcacion.cedula, marcacion.fecha);
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(marcacion);
  });
  mapa.forEach((eventos) => eventos.sort((a, b) => String(a.punch_time || "").localeCompare(String(b.punch_time || ""))));
  return mapa;
}

function detalleMarcacionesProgramacion(item, mapaMarcaciones) {
  const eventos = mapaMarcaciones.get(claveMarcacionesExcel(item.cedula, item.fecha)) || [];
  const entradaPorteria = eventos.find(esMarcacionPorteria) || null;
  const llegadaPunto = eventos.find((evento) => !esMarcacionPorteria(evento)) || null;
  const ultima = eventos[eventos.length - 1] || null;
  const horaPunto = horaMarcacionExcel(llegadaPunto);
  const inicioProgramado = String(item.hora_inicio || "").slice(0, 5);
  const minutosProgramados = horaTextoAMinutos(inicioProgramado);
  const minutosPunto = horaTextoAMinutos(horaPunto);
  let diferencia = "";
  if (minutosProgramados != null && minutosPunto != null) {
    diferencia = minutosPunto - minutosProgramados;
    if (diferencia > 720) diferencia -= 1440;
    if (diferencia < -720) diferencia += 1440;
  }
  return {
    eventos,
    entradaPorteria,
    llegadaPunto,
    ultima,
    horaPunto,
    diferencia
  };
}

function configurarHojaExcel(hoja, anchos) {
  hoja["!cols"] = anchos.map((wch) => ({ wch }));
  if (hoja["!ref"]) hoja["!autofilter"] = { ref: hoja["!ref"] };
  return hoja;
}

function exportarProgramacionComoCSV(registros, nombreBase, mapaMarcaciones = new Map()) {
  const columnas = [
    "Fecha", "Empleado", "Cédula", "Área", "Subárea / punto",
    "Tipo de registro", "Turno", "Inicio", "Fin", "Novedad",
    "Entrada portería", "Llegada al punto de trabajo", "Punto biométrico",
    "Minutos llegada vs turno", "Última marcación", "Total marcaciones",
    "Horas netas", "Horas nocturnas", "Extra candidata", "Estado extra"
  ];

  const escapar = (valor) => {
    const texto = String(valor ?? "").replace(/"/g, '""');
    return `"${texto}"`;
  };

  const filas = registros.map((item) => {
    const detalle = detalleMarcacionesProgramacion(item, mapaMarcaciones);
    return [
    item.fecha,
    obtenerNombreEmpleado(item),
    item.cedula,
    obtenerAreaAmigable(item),
    item.subarea,
    esNovedad(item) ? "Novedad" : "Turno",
    item.turno,
    item.hora_inicio,
    item.hora_fin,
    esNovedad(item) ? obtenerLabelNovedad(item) : "",
    horaMarcacionExcel(detalle.entradaPorteria),
    detalle.horaPunto,
    detalle.llegadaPunto?.area_biometrico || detalle.llegadaPunto?.terminal_alias || "",
    detalle.diferencia,
    horaMarcacionExcel(detalle.ultima),
    detalle.eventos.length,
    esNovedad(item) ? "" : Number(item.horas_netas || 0),
    esNovedad(item) ? "" : Number(item.horas_nocturnas || 0),
    esNovedad(item) ? "" : Number(item.horas_extra_estimadas || 0),
    esNovedad(item) ? "" : normalizarEstadoExtra(item.estado_extra)
    ];
  });

  const csv = `\uFEFF${[columnas, ...filas].map((fila) => fila.map(escapar).join(";")).join("\r\n")}`;
  descargarArchivoLocal(csv, `${nombreBase}.csv`, "text/csv;charset=utf-8;");
}

async function exportarDashboardExcel() {
  const btn = document.getElementById("btnExportarExcel");
  const textoOriginal = btn?.textContent || "Descargar período Excel";
  try {
    const registrosFiltrados = obtenerRegistrosFiltrados();
    const novedadesFiltradas = registrosFiltrados.filter(esNovedad);
    const solicitudesFiltradas = typeof obtenerSolicitudesBienestarFiltradas === "function"
      ? obtenerSolicitudesBienestarFiltradas()
      : [];
    const aprobados = obtenerRegistrosConExtras(registrosFiltrados)
      .filter((item) =>
        normalizarEstadoExtra(item.estado_extra) === "aprobado" &&
        String(item.tipo_personal || "").trim().toLowerCase() !== "externo"
      );

    if (!registrosFiltrados.length && !solicitudesFiltradas.length) {
      alert("No hay información para exportar con los filtros actuales.");
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = "Generando Excel..."; }

    const marcaciones = await cargarMarcacionesExportacionAyb(
      filtrosActuales.fechaInicio,
      filtrosActuales.fechaFin
    );
    const mapaMarcaciones = resumirMarcacionesPorDia(marcaciones);

    const fecha = new Date();
    const nombreBase = `dashboard_ayb_${filtrosActuales.fechaInicio || "inicio"}_${filtrosActuales.fechaFin || formatearFechaISO(fecha)}`;

    // Si el CDN de SheetJS no responde, se descarga un CSV compatible con
    // Excel. Así el botón nunca queda inutilizado por una librería externa.
    if (!window.XLSX) {
      exportarProgramacionComoCSV(registrosFiltrados, nombreBase, mapaMarcaciones);
      alert("Se descargó un CSV compatible con Excel porque el componente XLSX no estaba disponible.");
      return;
    }

    const workbook = window.XLSX.utils.book_new();
    const programacion = registrosFiltrados.map((item) => {
      const detalle = detalleMarcacionesProgramacion(item, mapaMarcaciones);
      return ({
      Fecha: valorExcelSeguro(item.fecha),
      Empleado: valorExcelSeguro(obtenerNombreEmpleado(item)),
      Cédula: valorExcelSeguro(item.cedula),
      Área: valorExcelSeguro(obtenerAreaAmigable(item)),
      "Subárea / punto": valorExcelSeguro(item.subarea),
      "Tipo de registro": esNovedad(item) ? "Novedad" : "Turno",
      Turno: valorExcelSeguro(item.turno),
      Inicio: valorExcelSeguro(item.hora_inicio),
      Fin: valorExcelSeguro(item.hora_fin),
      Novedad: esNovedad(item) ? valorExcelSeguro(obtenerLabelNovedad(item)) : "",
      "Entrada por portería": valorExcelSeguro(horaMarcacionExcel(detalle.entradaPorteria)),
      "Llegada al punto de trabajo": valorExcelSeguro(detalle.horaPunto),
      "Punto biométrico de llegada": valorExcelSeguro(detalle.llegadaPunto?.area_biometrico || detalle.llegadaPunto?.terminal_alias),
      "Terminal de llegada": valorExcelSeguro(detalle.llegadaPunto?.terminal_alias),
      "Minutos llegada vs inicio programado": detalle.diferencia,
      "Última marcación": valorExcelSeguro(horaMarcacionExcel(detalle.ultima)),
      "Total marcaciones": detalle.eventos.length,
      "Horas netas": esNovedad(item) ? "" : Number(item.horas_netas || 0),
      "Horas nocturnas": esNovedad(item) ? "" : Number(item.horas_nocturnas || 0),
      "Extra candidata": esNovedad(item) ? "" : Number(item.horas_extra_estimadas || 0),
      "Estado extra": esNovedad(item) ? "" : normalizarEstadoExtra(item.estado_extra)
      });
    });
    const hojaProgramacion = configurarHojaExcel(
      window.XLSX.utils.json_to_sheet(programacion),
      [12, 32, 16, 24, 22, 16, 10, 10, 10, 22, 18, 24, 24, 22, 18, 16, 16, 16, 16, 16, 14]
    );
    window.XLSX.utils.book_append_sheet(
      workbook,
      hojaProgramacion,
      "Programación y asistencia"
    );

    if (marcaciones.length) {
      const llegadasPunto = new Set();
      mapaMarcaciones.forEach((eventos) => {
        const llegada = eventos.find((evento) => !esMarcacionPorteria(evento));
        if (llegada) llegadasPunto.add(claveEventoMarcacionExcel(llegada));
      });
      const dataMarcaciones = marcaciones.map((item) => ({
        Fecha: valorExcelSeguro(item.fecha),
        Empleado: valorExcelSeguro(item.empleado),
        Cédula: valorExcelSeguro(item.cedula),
        Hora: valorExcelSeguro(horaMarcacionExcel(item)),
        "Fecha y hora": valorExcelSeguro(item.punch_time),
        Posición: Number(item.posicion || 0),
        "Área biométrico": valorExcelSeguro(item.area_biometrico),
        Terminal: valorExcelSeguro(item.terminal_alias),
        "Serial terminal": valorExcelSeguro(item.terminal_sn),
        "Tipo de evento": valorExcelSeguro(item.tipo_evento_jornada),
        "Es portería": esMarcacionPorteria(item) ? "Sí" : "No",
        "Marca de llegada al punto": llegadasPunto.has(claveEventoMarcacionExcel(item)) ? "Sí" : "No"
      }));
      const hojaMarcaciones = configurarHojaExcel(
        window.XLSX.utils.json_to_sheet(dataMarcaciones),
        [12, 32, 16, 12, 22, 10, 22, 22, 20, 22, 12, 24]
      );
      window.XLSX.utils.book_append_sheet(workbook, hojaMarcaciones, "Marcaciones biométricas");
    }

    if (novedadesFiltradas.length) {
      const dataNovedades = novedadesFiltradas.map((item) => ({
        Fecha: valorExcelSeguro(item.fecha),
        Empleado: valorExcelSeguro(obtenerNombreEmpleado(item)),
        Cédula: valorExcelSeguro(item.cedula),
        Área: valorExcelSeguro(obtenerAreaAmigable(item)),
        Novedad: valorExcelSeguro(obtenerLabelNovedad(item)),
        Código: valorExcelSeguro(item.novedad_codigo),
        Descripción: valorExcelSeguro(item.novedad_descripcion || item.observacion)
      }));
      window.XLSX.utils.book_append_sheet(
        workbook,
        window.XLSX.utils.json_to_sheet(dataNovedades),
        "Novedades aplicadas"
      );
    }

    if (solicitudesFiltradas.length) {
      const dataBienestar = solicitudesFiltradas.map((item) => ({
        Empleado: valorExcelSeguro(item._nombre || item.nombre_empleado),
        Cédula: valorExcelSeguro(item._cedula || item.cedula),
        Área: valorExcelSeguro(item._area || item.area),
        Solicitud: valorExcelSeguro(item._tipo_bienestar || item.tipo_solicitud),
        "Fecha inicio": valorExcelSeguro(item._fecha_inicio_bienestar || item.fecha_inicio),
        "Fecha fin": valorExcelSeguro(item._fecha_fin_bienestar || item.fecha_fin),
        "Fecha radicación": valorExcelSeguro(item._fecha_radicacion_bienestar || item.fecha_radicacion),
        Estado: valorExcelSeguro(item._estado_bienestar || item.estado),
        "Aplicada en programación": item.aplicada_programacion === true ? "Sí" : "No"
      }));
      window.XLSX.utils.book_append_sheet(
        workbook,
        window.XLSX.utils.json_to_sheet(dataBienestar),
        "Solicitudes Bienestar"
      );
    }

    if (aprobados.length) {
      const dataAprobados = aprobados.map((item) => ({
        Empleado: valorExcelSeguro(obtenerNombreEmpleado(item)),
        Cédula: valorExcelSeguro(item.cedula),
        Fecha: valorExcelSeguro(item.fecha),
        "Horas aprobadas": Number(item.horas_extra_estimadas || 0),
        "Aprobado por": valorExcelSeguro(item.aprobado_por),
        "Fecha aprobación": valorExcelSeguro(formatearFechaHora(item.fecha_aprobacion)),
        Observación: valorExcelSeguro(item.observacion_aprobacion)
      }));
      window.XLSX.utils.book_append_sheet(
        workbook,
        window.XLSX.utils.json_to_sheet(dataAprobados),
        "Extras aprobadas"
      );
    }

    window.XLSX.writeFile(workbook, `${nombreBase}.xlsx`);
  } catch (error) {
    console.error("Error exportando Excel:", error);
    alert(`Ocurrió un error al exportar el Excel: ${error.message || error}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
  }
}

async function exportarDashboardAPDF() {
  const contenedor = document.getElementById("dashboardExportable");
  const btn = document.getElementById("btnExportarPDF");

  if (!contenedor || !window.html2canvas || !window.jspdf) {
    alert("No fue posible exportar el PDF.");
    return;
  }

  const textoOriginal = btn ? btn.textContent : "";
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generando PDF...";
    }

    document.body.classList.add("ayb-exportando");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await window.html2canvas(contenedor, {
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(contenedor.scrollWidth, 1200),
      logging: false
    });

    if (!canvas.width || !canvas.height) {
      throw new Error("La vista visible no produjo una imagen exportable.");
    }

    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const margin = 8;
    const usableWidth = pageWidth - (margin * 2);
    const usableHeight = pageHeight - (margin * 2);

    const imgWidth = usableWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= usableHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= usableHeight;
    }

    const fecha = new Date();
    const nombreArchivo = `dashboard_turnos_${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}.pdf`;
    pdf.save(nombreArchivo);
  } catch (error) {
    console.error("Error exportando PDF:", error);
    alert("Ocurrió un error al generar el PDF.");
  } finally {
    document.body.classList.remove("ayb-exportando");
    if (btn) {
      btn.disabled = false;
      btn.textContent = textoOriginal || "Descargar vista PDF";
    }
  }
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

  if (moduloActual === "dashboard" && !usuarioPuedeAccederDashboard(sesion)) {
    alert("No tienes permisos para acceder al Dashboard.");
    redirigirEmpleadoASusTurnos();
    return;
  }

  if (sesion.puede_ver_todo === true) return;

  if (!tieneAccesoModulo(sesion, moduloActual)) {
    alert("No tienes permisos para acceder a este módulo.");
    redirigirEmpleadoASusTurnos();
  }
}

function tieneAccesoModulo(sesion, modulo) {
  if (modulo === "mis-turnos-ayb") return true;
  if (modulo === "dashboard") return usuarioPuedeAccederDashboard(sesion);
  if (sesion.puede_ver_todo === true) return true;
  if (!Array.isArray(sesion.modulos_permitidos)) return false;
  return sesion.modulos_permitidos.includes(modulo);
}

function obtenerClaveModulo(href) {
  if (href.includes("dashboard")) return "dashboard";
  if (href.includes("solicitudes-bienestar")) return "solicitudes-bienestar";
  if (href.includes("programacion-ayb")) return "programacion-ayb";
  if (href.includes("programacion-administrativo")) return "programacion-administrativo";
  if (href.includes("programacion-operaciones")) return "programacion-operaciones";
  if (href.includes("mis-turnos-ayb")) return "mis-turnos-ayb";
  if (href.includes("mis-turnos-administrativo")) return "mis-turnos-administrativo";
  return href;
}

function obtenerInicioSemanaOperativa(fechaBase) {
  const fecha = new Date(fechaBase);
  const dia = fecha.getDay();
  const diasDesdeLunes = (dia + 6) % 7;
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() - diasDesdeLunes);
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

function formatearFechaHora(fechaIso) {
  if (!fechaIso) return "";
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return String(fechaIso);

  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const yyyy = fecha.getFullYear();
  const hh = String(fecha.getHours()).padStart(2, "0");
  const min = String(fecha.getMinutes()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
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

function redondearHoras(valor) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============================================================
// REVISION BIOMETRICA / PROSOF - CAPA NUEVA E INDEPENDIENTE
// ============================================================
function usuarioRevisionActual() {
  return String(sesionActiva?.usuario || "").trim();
}

function usuarioPuedeDecidirRevisionAyb() {
  return !["auditor"].includes(String(sesionActiva?.rol_auth || sesionActiva?.rol || "").toLowerCase());
}

function fechaISORevision(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
}

function inicializarFechasRevision() {
  const desde=document.getElementById("revisionFechaDesde");
  const hasta=document.getElementById("revisionFechaHasta");
  if (!desde || !hasta || desde.value || hasta.value) return;
  const h=new Date(); const d=new Date(h); d.setDate(h.getDate()-14);
  desde.value=fechaISORevision(d); hasta.value=fechaISORevision(h);
}

function configurarRevisionNominaReal() {
  inicializarFechasRevision();
  ["revisionFechaDesde","revisionFechaHasta","revisionEstado","revisionBuscar"].forEach(id=>{
    document.getElementById(id)?.addEventListener(id==="revisionBuscar"?"input":"change", renderRevisionNominaReal);
  });
  document.getElementById("btnActualizarRevisionNomina")?.addEventListener("click", cargarRevisionNominaReal);
  document.getElementById("btnGenerarProsof")?.addEventListener("click", generarPlantillaProsof);
}

async function cargarRevisionNominaReal() {
  const tbody=document.getElementById("tbodyRevisionNominaReal");
  if (!tbody) return;
  tbody.innerHTML='<tr><td colspan="11" class="text-muted text-center">Actualizando información real...</td></tr>';
  try {
    const desde=document.getElementById("revisionFechaDesde")?.value;
    const hasta=document.getElementById("revisionFechaHasta")?.value;
    let actualizacionSegundoPlano=null;
    if (desde && hasta) {
      actualizacionSegundoPlano=Promise.all([
        supabase.rpc("preparar_conceptos_revision", {p_fecha_desde:desde,p_fecha_hasta:hasta,p_grupo_codigo:"ALIMENTOS_BEBIDAS",p_proceso_codigo:null}),
        supabase.rpc("sincronizar_recargos_nocturnos_programados", {p_fecha_desde:desde,p_fecha_hasta:hasta,p_grupo_codigo:"ALIMENTOS_BEBIDAS",p_proceso_codigo:null})
      ]);
    }
    let q=supabase.from("turnos_conceptos_revision").select("*").eq("grupo_codigo","ALIMENTOS_BEBIDAS").order("fecha",{ascending:false});
    if (desde) q=q.gte("fecha",desde); if (hasta) q=q.lte("fecha",hasta);
    const {data,error}=await q;
    if (error) throw error;
    revisionNominaRealBase=await completarRevisionNominaAyb(Array.isArray(data)?data:[],desde,hasta);
    renderRevisionNominaReal();
    actualizacionSegundoPlano?.then(async ([prep,nocturno])=>{
      if(prep.error)console.warn("No se pudo materializar candidatos:",prep.error.message);
      if(nocturno.error)console.warn("No se pudo sincronizar el cálculo nocturno central:",nocturno.error.message);
      if(prep.error&&nocturno.error)return;
      let fresca=supabase.from("turnos_conceptos_revision").select("*").eq("grupo_codigo","ALIMENTOS_BEBIDAS").order("fecha",{ascending:false});
      if(desde)fresca=fresca.gte("fecha",desde);if(hasta)fresca=fresca.lte("fecha",hasta);
      const resultado=await fresca;
      if(!resultado.error){revisionNominaRealBase=await completarRevisionNominaAyb(resultado.data||[],desde,hasta);renderRevisionNominaReal();}
    }).catch(error=>console.warn("Actualización de candidatos:",error));
  } catch(e) {
    console.error("Bandeja revisión:",e);
    tbody.innerHTML=`<tr><td colspan="11" class="text-danger text-center">No fue posible cargar la bandeja: ${escaparHtml(e.message||String(e))}</td></tr>`;
  }
}

async function completarRevisionNominaAyb(revisiones,desde,hasta) {
  if (!revisiones.length) return [];
  const cedulas=[...new Set(revisiones.map(x=>String(x.cedula||"").trim()).filter(Boolean))];
  const empleados=[]; const marcas=[];
  const fin=new Date(`${hasta}T00:00:00`); fin.setDate(fin.getDate()+1);
  const finExclusivo=fechaISORevision(fin);
  for(let i=0;i<cedulas.length;i+=80){
    const lote=cedulas.slice(i,i+80);
    const [re,rm]=await Promise.all([
      supabase.from("empleados").select("cedula,nombres,apellidos,cargo,centro_costos,area,codigo").in("cedula",lote),
      supabase.from("biotime_marcaciones").select("emp_code,punch_time,is_attendance").in("emp_code",lote).gte("punch_time",`${desde}T00:00:00`).lt("punch_time",`${finExclusivo}T00:00:00`).order("punch_time")
    ]);
    if(re.error)console.warn("Empleados revisión:",re.error.message); else empleados.push(...(re.data||[]));
    if(rm.error)console.warn("Marcaciones revisión:",rm.error.message); else marcas.push(...(rm.data||[]));
  }
  const porCedula=new Map(empleados.map(x=>[String(x.cedula||"").trim(),x]));
  const porDia=new Map();
  marcas.forEach(m=>{
    if(m.is_attendance===false)return;
    const k=`${String(m.emp_code||"").trim()}|${String(m.punch_time||"").slice(0,10)}`;
    const lista=porDia.get(k)||[]; lista.push(m.punch_time); porDia.set(k,lista);
  });
  return revisiones.map(r=>{
    const d=r.detalle||{},e=porCedula.get(String(r.cedula||"").trim())||{};
    const lista=porDia.get(`${String(r.cedula||"").trim()}|${String(r.fecha||"").slice(0,10)}`)||[];
    return {...r,
      empleado:`${e.nombres||""} ${e.apellidos||""}`.trim()||r.cedula,
      cargo:e.cargo||"", centro_costos:e.centro_costos||"", area:e.area||"",
      turno:d.turno||"", turno_2:d.turno_2||"", hora_inicio:d.hora_inicio||"", hora_fin:d.hora_fin||"",
      hora_inicio_2:d.hora_inicio_2||"", hora_fin_2:d.hora_fin_2||"",
      horas_programadas_netas:d.horas_programadas_netas??d.horas_programadas,
      horas_reales:d.horas_reales, horas_candidatas:r.horas_calculadas,
      primera_marcacion:lista[0]||null, ultima_marcacion:lista.at(-1)||null, total_marcaciones:lista.length,
      revision_id:r.id, estado_revision:r.estado,
      permite_revision:!["aprobado","rechazado"].includes(String(r.estado||"").toLowerCase())
    };
  });
}

function registrosRevisionFiltrados() {
  const estado=String(document.getElementById("revisionEstado")?.value||"").toLowerCase();
  const buscar=String(document.getElementById("revisionBuscar")?.value||"").trim().toLowerCase();
  return revisionNominaRealBase.filter(x=>{
    if (estado && String(x.estado_revision||"").toLowerCase()!==estado) return false;
    if (buscar && !`${x.empleado||""} ${x.cedula||""} ${x.concepto_codigo||""} ${x.concepto_nombre||""}`.toLowerCase().includes(buscar)) return false;
    return true;
  });
}

function formatearHorasRevision(valor) {
  const decimal = Number(valor || 0);
  if (!Number.isFinite(decimal)) return "0.00 h (0 h 00 min)";
  let horas = Math.floor(decimal);
  let minutos = Math.round((decimal - horas) * 60);
  if (minutos === 60) { horas += 1; minutos = 0; }
  return `${decimal.toFixed(2)} h (${horas} h ${String(minutos).padStart(2,"0")} min)`;
}

function horasCalculadasRevision(registro) {
  return Number(registro?.horas_calculadas ?? registro?.horas_candidatas ?? 0);
}

function descripcionCalculoRevision(registro) {
  const codigo = String(registro?.concepto_codigo || "").toUpperCase();
  const calculadas = horasCalculadasRevision(registro);
  if (codigo === "P005") {
    const bloques = [
      registro?.hora_inicio && registro?.hora_fin ? `${String(registro.hora_inicio).slice(0,5)}–${String(registro.hora_fin).slice(0,5)}` : "",
      registro?.hora_inicio_2 && registro?.hora_fin_2 ? `${String(registro.hora_inicio_2).slice(0,5)}–${String(registro.hora_fin_2).slice(0,5)}` : ""
    ].filter(Boolean).join(" + ");
    return `Recargo nocturno central desde las 19:00${bloques ? ` · Turno ${bloques}` : ""} · ${formatearHorasRevision(calculadas)}`;
  }
  if (codigo === "P004") return `Tiempo adicional nocturno posterior al turno · ${formatearHorasRevision(calculadas)}`;
  return `Cálculo candidato para revisión · ${formatearHorasRevision(calculadas)}`;
}

function minutosHoraRevision(valor) {
  const texto = String(valor || "").trim();
  const m = texto.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function horaTimestampRevision(valor) {
  if (!valor) return "-";
  const texto = String(valor);
  const m = texto.match(/(?:T|\s)(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : (texto.match(/^(\d{1,2}:\d{2})/)?.[1] || "-");
}

function diferenciaHorarioRevision(programada, real, tipo) {
  const p = minutosHoraRevision(programada);
  const r = minutosHoraRevision(real);
  if (p == null || r == null) return '<span class="small text-muted">Sin comparación</span>';
  let diff = r - p;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  const minutos = Math.abs(diff);
  if (minutos === 0) return '<span class="badge bg-success-subtle text-success">A tiempo</span>';
  if (tipo === "entrada") {
    return diff > 0
      ? `<span class="badge bg-warning-subtle text-warning-emphasis">Llegó ${minutos} min tarde</span>`
      : `<span class="badge bg-info-subtle text-info-emphasis">Llegó ${minutos} min antes</span>`;
  }
  return diff > 0
    ? `<span class="badge bg-warning-subtle text-warning-emphasis">Salió ${minutos} min tarde</span>`
    : `<span class="badge bg-danger-subtle text-danger-emphasis">Salió ${minutos} min temprano</span>`;
}

function bloqueHorarioRevision(programada, realTimestamp, tipo) {
  const real = horaTimestampRevision(realTimestamp);
  const prog = String(programada || "").slice(0,5) || "-";
  return `<div><strong>Prog.</strong> ${escaparHtml(prog)}</div><div><strong>Real</strong> ${escaparHtml(real)}</div><div class="mt-1">${diferenciaHorarioRevision(prog, real, tipo)}</div>`;
}

function renderRevisionNominaReal() {
  const tbody=document.getElementById("tbodyRevisionNominaReal"); if(!tbody)return;
  const rows=registrosRevisionFiltrados();
  if(!rows.length){tbody.innerHTML='<tr><td colspan="11" class="text-muted text-center">No hay conceptos para los filtros seleccionados.</td></tr>';return;}
  tbody.innerHTML=rows.map(x=>{
    const estado=String(x.estado_revision||"pendiente");
    const cerrado=["aprobado","rechazado"].includes(estado);
    const horasCalculadas=horasCalculadasRevision(x);
    const diferenciaAprobada=x.horas_aprobadas!=null && Math.abs(Number(x.horas_aprobadas)-horasCalculadas)>0.01;
    return `<tr>
      <td><strong>${escaparHtml(x.empleado||"")}</strong><div class="small text-muted">${escaparHtml(x.codigo_erp||"Sin código ERP")} · ${escaparHtml(x.cedula||"")}</div></td>
      <td>${escaparHtml(formatearFechaCorta(x.fecha)||x.fecha||"")}</td>
      <td>${formatearHorasRevision(x.horas_programadas_netas||0)}<div class="small text-muted">${escaparHtml(x.turno||"")} · ${escaparHtml((x.hora_inicio||"-").slice(0,5))}–${escaparHtml((x.hora_fin||"-").slice(0,5))}</div></td>
      <td>${formatearHorasRevision(x.horas_reales||0)}<div class="small text-muted">${x.total_marcaciones||0} marcación(es)</div></td>
      <td>${bloqueHorarioRevision(x.hora_inicio,x.primera_marcacion,"entrada")}</td>
      <td>${bloqueHorarioRevision(x.hora_fin,x.ultima_marcacion,"salida")}</td>
      <td><strong>${escaparHtml(x.concepto_codigo||"")}</strong><div class="small">${escaparHtml(x.concepto_nombre||"")}</div></td>
      <td><strong>${formatearHorasRevision(horasCalculadas)}</strong><div class="small text-muted mt-1">${escaparHtml(descripcionCalculoRevision(x))}</div></td>
      <td>${x.horas_aprobadas==null?"-":`${formatearHorasRevision(x.horas_aprobadas)}${diferenciaAprobada?'<div class="small text-warning-emphasis mt-1">Difiere del cálculo actual</div>':""}`}</td>
      <td>${crearBadgeEstadoExtra(estado)}</td>
      <td>${!usuarioPuedeDecidirRevisionAyb()?'<span class="small text-muted">Solo lectura</span>':cerrado ? `<div class="d-flex flex-column align-items-start gap-1"><span class="small text-muted">Cerrado</span><button class="btn btn-outline-primary btn-sm" onclick="window.editarRevisionNomina('${x.revision_id}',${Number(x.horas_aprobadas||0)})">Editar</button></div>` : !x.permite_revision ? `<span class="small text-muted">Solo seguimiento</span>` : `<div class="d-flex flex-wrap gap-1"><button class="btn btn-success btn-sm" onclick="window.resolverRevisionNomina('${x.revision_id}','aprobar')">Aprobar ${horasCalculadas.toFixed(2)} h</button><button class="btn btn-outline-primary btn-sm" onclick="window.resolverRevisionNomina('${x.revision_id}','ajustar')">Ajustar</button><button class="btn btn-outline-warning btn-sm" onclick="window.resolverRevisionNomina('${x.revision_id}','observar')">Observar</button><button class="btn btn-outline-danger btn-sm" onclick="window.resolverRevisionNomina('${x.revision_id}','rechazar')">Rechazar</button></div>`}</td>
    </tr>`;
  }).join("");
}

window.resolverRevisionNomina=async function(id,accion){
  const usuario=usuarioRevisionActual(); if(!usuario){alert("No se pudo identificar el usuario de la sesión.");return;}
  const registro=revisionNominaRealBase.find(x=>String(x.revision_id||"")===String(id));
  if(!registro){alert("No fue posible localizar el concepto seleccionado. Actualiza la bandeja e inténtalo nuevamente.");return;}
  const calculadas=horasCalculadasRevision(registro);
  const descripcion=descripcionCalculoRevision(registro);
  let horas=null,obs=null;
  if(accion==="ajustar"){
    const raw=prompt(`Horas que se aprobarán\n\n${descripcion}`,calculadas.toFixed(2)); if(raw===null)return; horas=Number(String(raw).replace(",","."));
    if(!Number.isFinite(horas)||horas<=0){alert("Ingresa una cantidad de horas válida.");return;}
    obs=prompt("Justificación obligatoria del ajuste:"); if(!obs?.trim())return alert("El ajuste requiere justificación.");
  } else if(["rechazar","observar"].includes(accion)){
    obs=prompt(accion==="rechazar"?"Motivo obligatorio del rechazo:":"Observación obligatoria:"); if(!obs?.trim())return alert("Debes registrar una observación.");
  } else {
    horas=calculadas;
    const turno=`${String(registro.hora_inicio||"-").slice(0,5)}–${String(registro.hora_fin||"-").slice(0,5)}`;
    if(!confirm(`APROBACIÓN DE HORAS\n\nHoras: ${formatearHorasRevision(calculadas)}\nConcepto: ${registro.concepto_codigo||"-"} · ${registro.concepto_nombre||"-"}\nTurno programado: ${turno}\n\n¿Confirmas esta aprobación?`)) return;
  }
  const {error}=await supabase.rpc("resolver_concepto_revision",{p_revision_id:id,p_accion:accion,p_usuario:usuario,p_horas_aprobadas:horas,p_observacion:obs});
  if(error){console.error(error);alert("No fue posible guardar la decisión: "+error.message);return;}
  await cargarRevisionNominaReal();
};

window.editarRevisionNomina=async function(id,horasActuales){
  const usuario=usuarioRevisionActual();
  if(!usuario){alert("No se pudo identificar el usuario de la sesión.");return;}
  const actual=Number(horasActuales||0);
  const raw=prompt(`Horas aprobadas corregidas (actual: ${formatearHorasRevision(actual)}):`,actual.toFixed(2));
  if(raw===null)return;
  const horas=Number(String(raw).replace(",","."));
  if(!Number.isFinite(horas)||horas<0){alert("Ingresa una cantidad de horas válida.");return;}
  const obs=prompt("Motivo obligatorio de la corrección. Este cambio quedará registrado en auditoría:");
  if(!obs?.trim()){alert("Debes registrar el motivo de la corrección.");return;}
  if(!confirm(`¿Confirmas cambiar las horas aprobadas a ${formatearHorasRevision(horas)}?`))return;
  const {error}=await supabase.rpc("editar_concepto_revision",{p_revision_id:id,p_usuario:usuario,p_horas_aprobadas:horas,p_observacion:obs.trim()});
  if(error){console.error(error);alert("No fue posible corregir la decisión: "+error.message);return;}
  await cargarRevisionNominaReal();
};

async function generarPlantillaProsof(){
  try{
    const desde=document.getElementById("revisionFechaDesde")?.value; const hasta=document.getElementById("revisionFechaHasta")?.value;
    let q=supabase.from("vw_prosof_exportacion_por_area").select('*').eq("grupo_codigo","ALIMENTOS_BEBIDAS").order("Fecha",{ascending:true});
    if(desde)q=q.gte("Fecha",desde); if(hasta)q=q.lte("Fecha",hasta);
    const {data,error}=await q; if(error)throw error;
    if(!data?.length)return alert("No hay conceptos aprobados y elegibles para PROSOF en el período seleccionado.");
    const filas=data.map(x=>({Empleado:x.Empleado||"",Concepto:x.Concepto||"",Fecha:x.Fecha||"",Dias:x.Dias??"",FechaInici:x.FechaInici??"",Horas:Number(x.Horas||0),Valor:x.Valor??"",LiquidarEnPrima:x.LiquidarEnPrima||"N","Centro de costos":x["Centro de costos"]??""}));
    const ws=window.XLSX.utils.json_to_sheet(filas,{header:["Empleado","Concepto","Fecha","Dias","FechaInici","Horas","Valor","LiquidarEnPrima","Centro de costos"]});
    const wb=window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb,ws,"PROSOF");
    window.XLSX.writeFile(wb,`PROSOF_AYB_${desde||"inicio"}_${hasta||"fin"}.xlsx`);
  }catch(e){console.error("PROSOF:",e);alert("No fue posible generar la plantilla PROSOF: "+(e.message||e));}
}

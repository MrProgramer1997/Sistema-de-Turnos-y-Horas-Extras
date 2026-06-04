// ======================================================
// COCINA CHEF - JS COMPLETO
// Integrado al cliente Supabase central del proyecto
// Filtro estricto A&B + botón quitar + tabla operativa
// ======================================================

import { supabase } from "../supabase/supabaseClient.js";

const HORA_INICIO_NOCTURNO_CHEF = 19 * 60; // 7:00 p.m.
const HORA_FIN_NOCTURNO_CHEF = 6 * 60; // 6:00 a.m.
const DESCANSO_ESTANDAR_HORAS_CHEF = 0.5;

let fechaBase = new Date();
let semana = [];
let personal = [];
let codigos = [];
let programacion = [];
let areas = [];
let empleadosCache = [];
let selectedCelda = null;
let sesionActual = null;
let turnoCopiadoChef = null;
let festivosSemanaChef = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    sesionActual = obtenerSesion();

    document.getElementById("fechaBase").valueAsDate = fechaBase;

    configurarEventos();
    cargarTurnoCopiadoChef();

    generarSemana();

    await cargarAreas();
    await cargarCodigos();
    await cargarPersonal();
    await cargarProgramacion();
    await cargarFestivosSemanaChef();

    pintarSelectAreas();
    renderTabla();
    renderKPIs();
    renderSelectEmpleadoPdfChef();
  } catch (error) {
    console.error("Error inicializando Cocina Chef:", error);
    pintarErrorInicial(error);
  }
});

// ======================================================
// SESIÓN / PERMISOS
// ======================================================
function obtenerSesion() {
  try {
    return JSON.parse(localStorage.getItem("ccp_sesion") || "{}");
  } catch {
    return {};
  }
}

function puedeAdministrarCocina() {
  const rol = String(sesionActual?.rol || "").toLowerCase();

  if (sesionActual?.puede_ver_todo === true) return true;

  return [
    "admin",
    "administrador",
    "ayb",
    "ayb_admin",
    "cocina_chef",
    "chef",
    "gerencia"
  ].includes(rol);
}

function obtenerUsuarioId() {
  return sesionActual?.id || null;
}

// ======================================================
// EVENTOS
// ======================================================
function configurarEventos() {
  document.getElementById("btnPrevSemana").onclick = async () => {
    fechaBase.setDate(fechaBase.getDate() - 7);
    document.getElementById("fechaBase").valueAsDate = fechaBase;
    await recargar();
  };

  document.getElementById("btnNextSemana").onclick = async () => {
    fechaBase.setDate(fechaBase.getDate() + 7);
    document.getElementById("fechaBase").valueAsDate = fechaBase;
    await recargar();
  };

  document.getElementById("fechaBase").onchange = async (e) => {
    if (!e.target.value) return;
    fechaBase = new Date(e.target.value + "T00:00:00");
    await recargar();
  };

  document.getElementById("filtroArea").onchange = () => {
    renderTabla();
    renderKPIs();
  };

  document.getElementById("filtroTipoPersonal").onchange = () => {
    renderTabla();
    renderKPIs();
  };

  document.getElementById("btnAgregarExterno").onclick = () => {
    if (!puedeAdministrarCocina()) {
      alert("No tienes permisos para crear externos.");
      return;
    }

    limpiarFormularioExterno();
    abrirModal("modalExterno");
  };

  document.getElementById("btnAgregarEmpleado").onclick = abrirModalEmpleados;
  document.getElementById("btnGestionCodigos").onclick = abrirModalCodigos;

  document.getElementById("guardarExterno").onclick = guardarExterno;

  document.getElementById("buscarEmpleado").oninput = () => {
    renderListaEmpleados(filtrarEmpleadosModal());
  };

  document.getElementById("guardarTurno").onclick = guardarTurno;
  document.getElementById("eliminarTurno").onclick = eliminarTurno;
  document.getElementById("guardarCodigo").onclick = guardarCodigo;

  const btnLimpiarCopia = document.getElementById("btnLimpiarTurnoCopiadoChef");
  if (btnLimpiarCopia) {
    btnLimpiarCopia.onclick = limpiarTurnoCopiadoChef;
  }

  const btnPdfGeneral = document.getElementById("btnPdfGeneralChef");
  if (btnPdfGeneral) {
    btnPdfGeneral.onclick = generarPdfGeneralChef;
  }

  const btnPdfEmpleado = document.getElementById("btnPdfEmpleadoChef");
  if (btnPdfEmpleado) {
    btnPdfEmpleado.onclick = generarPdfEmpleadoChef;
  }

  const checkTurnoPartido = document.getElementById("checkTurnoPartidoChef");
  if (checkTurnoPartido) {
    checkTurnoPartido.onchange = actualizarVistaTurnoPartidoChef;
  }
}

// ======================================================
// RECARGA
// ======================================================
async function recargar() {
  generarSemana();

  await cargarAreas();
  await cargarCodigos();
  await cargarPersonal();
  await cargarProgramacion();
  await cargarFestivosSemanaChef();

  pintarSelectAreas();
  renderTabla();
  renderKPIs();
  renderSelectEmpleadoPdfChef();
}

// ======================================================
// SEMANA
// ======================================================
function generarSemana() {
  semana = [];

  const base = new Date(fechaBase);
  const diaSemana = base.getDay();

  const lunes = new Date(base);
  lunes.setDate(base.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));

  for (let i = 0; i < 7; i++) {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    semana.push(d);
  }

  document.getElementById("rangoSemana").innerText =
    `${formatearFechaCorta(semana[0])} - ${formatearFechaCorta(semana[6])}`;
}

function formatearFechaISO(fecha) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatearFechaCorta(fecha) {
  return fecha.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function nombreDia(fecha) {
  return fecha.toLocaleDateString("es-CO", { weekday: "short" }).toUpperCase();
}

// ======================================================
// CARGA DE DATOS
// ======================================================
async function cargarAreas() {
  const { data, error } = await supabase
    .from("cocina_areas_operativas")
    .select("*")
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error cargando áreas cocina:", error);
    areas = [];
    return;
  }

  areas = data || [];
}

async function cargarCodigos() {
  const { data, error } = await supabase
    .from("cocina_codigos_turno")
    .select("*")
    .eq("activo", true)
    .order("codigo", { ascending: true });

  if (error) {
    console.error("Error cargando códigos:", error);
    codigos = [];
    return;
  }

  codigos = data || [];
}

async function cargarPersonal() {
  const { data, error } = await supabase
    .from("cocina_cronograma_personal")
    .select(`
      *,
      area:cocina_areas_operativas (
        id,
        codigo,
        nombre
      )
    `)
    .eq("activo", true)
    .order("orden", { ascending: true })
    .order("nombre_visible", { ascending: true });

  if (error) {
    console.error("Error cargando personal cocina:", error);
    personal = [];
    return;
  }

  personal = data || [];
}

async function cargarProgramacion() {
  const fechas = semana.map((d) => formatearFechaISO(d));

  const { data, error } = await supabase
    .from("cocina_programacion_turnos")
    .select("*")
    .in("fecha", fechas);

  if (error) {
    console.error("Error cargando programación cocina:", error);
    programacion = [];
    return;
  }

  programacion = data || [];
}


// ======================================================
// FESTIVOS PARA CÁLCULO DE HORAS
// ======================================================
async function cargarFestivosSemanaChef() {
  try {
    const fechas = semana.map((dia) => formatearFechaISO(dia));
    const fechaInicio = fechas[0];
    const fechaFin = fechas[fechas.length - 1];

    const { data, error } = await supabase
      .from("festivos")
      .select("fecha,nombre,activo")
      .eq("activo", true)
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin);

    if (error) {
      console.warn("No se pudieron cargar festivos para Cocina Chef:", error.message);
      festivosSemanaChef = [];
      return;
    }

    festivosSemanaChef = data || [];
  } catch (error) {
    console.warn("Error consultando festivos para Cocina Chef:", error);
    festivosSemanaChef = [];
  }
}

// ======================================================
// SELECTS ÁREA
// ======================================================
function pintarSelectAreas() {
  llenarSelectArea("filtroArea", "Todas las áreas");
  llenarSelectArea("extArea", "Seleccione área");
  llenarSelectArea("empleadoAreaAgregar", "Autodetectar área");
  llenarSelectArea("turnoArea", "Usar área del colaborador");
  llenarSelectArea("turnoArea2", "Usar área del bloque 1");
}

function llenarSelectArea(idSelect, placeholder) {
  const select = document.getElementById(idSelect);
  if (!select) return;

  const valorActual = select.value;
  select.innerHTML = "";

  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = placeholder;
  select.appendChild(opt);

  areas.forEach((area) => {
    const optArea = document.createElement("option");
    optArea.value = area.id;
    optArea.textContent = area.nombre;
    select.appendChild(optArea);
  });

  if (valorActual) {
    select.value = valorActual;
  }
}

function obtenerAreaPorId(id) {
  return areas.find((a) => a.id === id) || null;
}

function obtenerAreaPorCodigo(codigo) {
  const valor = normalizarTexto(codigo);
  return areas.find((a) => normalizarTexto(a.codigo) === valor) || null;
}

function obtenerNombreAreaPersona(persona) {
  if (persona?.area?.nombre) return persona.area.nombre;
  if (persona?.area_cocina) return persona.area_cocina;

  const area = obtenerAreaPorId(persona?.area_cocina_id);
  return area?.nombre || "Sin área";
}

// ======================================================
// HOMOLOGACIÓN AUTOMÁTICA DE ÁREAS
// ======================================================
function sugerirAreaOperativaEmpleado(emp) {
  const texto = normalizarTexto([
    emp.cargo,
    emp.centro_costos,
    emp.centro_costo,
    emp.area,
    emp.subarea,
    emp.nombre,
    emp.nombre_completo,
    emp.nombres,
    emp.apellidos
  ].filter(Boolean).join(" "));

  const reglas = [
    {
      codigo: "STEWARD",
      palabras: ["steward", "lavaplatos", "aseo cocina", "loza"]
    },
    {
      codigo: "FRIA",
      palabras: ["fria", "fría", "cocina fria", "cocina fría", "ensaladas", "postres"]
    },
    {
      codigo: "PORCIONAMIENTO",
      palabras: ["porcionamiento", "porcion", "porción", "porcionador"]
    },
    {
      codigo: "RIALTO",
      palabras: ["rialto", "restaurante", "mesero", "mesera", "cajero", "cajera"]
    },
    {
      codigo: "PISCINA",
      palabras: ["piscina"]
    },
    {
      codigo: "TENIS",
      palabras: ["tenis"]
    },
    {
      codigo: "HOYO_19",
      palabras: ["hoyo 19", "hoyo19", "hoyo", "barista"]
    }
  ];

  for (const regla of reglas) {
    const coincide = regla.palabras.some((palabra) =>
      texto.includes(normalizarTexto(palabra))
    );

    if (coincide) {
      const area = obtenerAreaPorCodigo(regla.codigo);
      if (area) return area;
    }
  }

  const textoAyB = [
    "alimentos",
    "bebidas",
    "ayb",
    "a&b",
    "cocina",
    "chef",
    "cocinero",
    "cocinera"
  ];

  const perteneceAyB = textoAyB.some((palabra) =>
    texto.includes(normalizarTexto(palabra))
  );

  if (perteneceAyB) {
    return obtenerAreaPorCodigo("RIALTO") || areas[0] || null;
  }

  return null;
}

function normalizarTexto(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escaparHtmlCocina(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function colorSeguroCocina(valor) {
  const color = String(valor || "").trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#2563eb";
}

function perteneceEmpleadoBaseAybCocina(emp) {
  const areaOrigen = normalizarTexto(emp.area);
  const centroCostos = normalizarTexto(emp.centro_costos || emp.centro_costo);
  const dependencia = `${areaOrigen} ${centroCostos}`;

  /*
    El cargo o el punto de servicio no habilitan por sí solos al empleado.
    Esto evita traer personal de Tenis u otras áreas solo porque su texto
    coincide con un punto operativo o con un cargo parecido.
  */
  const identificadoresOrigenAyb = [
    "alimentos",
    "bebidas",
    "alimentos y bebidas",
    "alimentos & bebidas",
    "a&b",
    "ayb",
    "cocina"
  ];

  return identificadoresOrigenAyb.some((clave) =>
    dependencia.includes(normalizarTexto(clave))
  );
}

function obtenerResumenPersonaSemana(persona) {
  const registrosPersona = programacion.filter((registro) =>
    registro.cronograma_personal_id === persona.id
  );

  return {
    turnos: registrosPersona.length,
    areas: new Set(
      registrosPersona
        .map((registro) => registro.area_cocina || obtenerAreaPorId(registro.area_cocina_id)?.nombre)
        .filter(Boolean)
    ).size
  };
}

function obtenerTextoTipoPersonal(tipo) {
  const mapa = {
    fijo: "Fijo",
    externo: "Externo",
    medio_tiempo: "Medio tiempo",
    pendiente: "Pendiente"
  };

  return mapa[tipo] || tipo || "Fijo";
}

// ======================================================
// FILTROS
// ======================================================
function obtenerPersonalFiltrado() {
  const filtroArea = document.getElementById("filtroArea").value;
  const filtroTipo = document.getElementById("filtroTipoPersonal").value;

  return personal.filter((p) => {
    const pasaArea = !filtroArea || p.area_cocina_id === filtroArea;
    const pasaTipo = !filtroTipo || p.tipo_personal === filtroTipo;

    return pasaArea && pasaTipo;
  });
}


// ======================================================
// COPIAR / PEGAR TURNOS EN MATRIZ CHEF
// ======================================================
function cargarTurnoCopiadoChef() {
  try {
    turnoCopiadoChef = JSON.parse(localStorage.getItem("ccp_turno_copiado_cocina_chef") || "null");
  } catch {
    turnoCopiadoChef = null;
  }

  renderBannerTurnoCopiadoChef();
}

function renderBannerTurnoCopiadoChef() {
  const banner = document.getElementById("bannerTurnoCopiadoChef");
  const textoBanner = document.getElementById("textoTurnoCopiadoChef");

  if (!banner || !textoBanner) return;

  if (!turnoCopiadoChef) {
    banner.classList.add("d-none");
    textoBanner.textContent = "No hay turno copiado";
    return;
  }

  const area = turnoCopiadoChef.area_cocina || "Área base del colaborador destino";
  const origen = turnoCopiadoChef.nombre_origen ? ` · Origen: ${turnoCopiadoChef.nombre_origen}` : "";

  banner.classList.remove("d-none");
  textoBanner.textContent = `Código ${turnoCopiadoChef.codigo_turno || ""}${turnoCopiadoChef.codigo_turno_2 ? ` + ${turnoCopiadoChef.codigo_turno_2} (partido)` : ""} · ${area}${origen}`;
}

function copiarTurnoChef(registro, persona) {
  if (!registro) return;

  turnoCopiadoChef = {
    codigo_turno: registro.codigo_turno || "",
    observacion: registro.observacion || "",
    evento: registro.evento || "",
    area_cocina_id: registro.area_cocina_id || null,
    area_cocina: registro.area_cocina || obtenerAreaPorId(registro.area_cocina_id)?.nombre || obtenerNombreAreaPersona(persona),
    codigo_turno_2: registro.codigo_turno_2 || null,
    observacion_2: registro.observacion_2 || null,
    evento_2: registro.evento_2 || null,
    area_cocina_id_2: registro.area_cocina_id_2 || null,
    area_cocina_2: registro.area_cocina_2 || obtenerAreaPorId(registro.area_cocina_id_2)?.nombre || null,
    nombre_origen: persona?.nombre_visible || "",
    copiado_en: new Date().toISOString()
  };

  localStorage.setItem("ccp_turno_copiado_cocina_chef", JSON.stringify(turnoCopiadoChef));
  renderBannerTurnoCopiadoChef();
  renderTabla();
}

function limpiarTurnoCopiadoChef() {
  turnoCopiadoChef = null;
  localStorage.removeItem("ccp_turno_copiado_cocina_chef");
  renderBannerTurnoCopiadoChef();
  renderTabla();
}

async function pegarTurnoChef(persona, fecha) {
  if (!puedeAdministrarCocina()) {
    alert("No tienes permisos para modificar la programación.");
    return;
  }

  if (!turnoCopiadoChef) {
    alert("Primero copia un turno.");
    return;
  }

  const yaExisteEnVista = programacion.some(
    (registro) => registro.cronograma_personal_id === persona.id && registro.fecha === fecha
  );

  if (yaExisteEnVista) {
    alert("El colaborador ya tiene un turno asignado en esta fecha.");
    return;
  }

  const { data: existente, error: errorConsulta } = await supabase
    .from("cocina_programacion_turnos")
    .select("id")
    .eq("cronograma_personal_id", persona.id)
    .eq("fecha", fecha)
    .maybeSingle();

  if (errorConsulta) {
    console.error("Error validando turno destino:", errorConsulta);
    alert("No se pudo validar la celda destino.");
    return;
  }

  if (existente) {
    alert("El colaborador ya tiene un turno asignado en esta fecha.");
    await recargar();
    return;
  }

  const areaFinalId = turnoCopiadoChef.area_cocina_id || persona.area_cocina_id || null;
  const areaFinal = obtenerAreaPorId(areaFinalId);

  const payload = {
    cronograma_personal_id: persona.id,
    fecha,
    codigo_turno: turnoCopiadoChef.codigo_turno,
    observacion: turnoCopiadoChef.observacion || "",
    evento: turnoCopiadoChef.evento || "",
    area_cocina_id: areaFinalId,
    area_cocina: areaFinal?.nombre || turnoCopiadoChef.area_cocina || persona.area_cocina || null,
    codigo_turno_2: turnoCopiadoChef.codigo_turno_2 || null,
    observacion_2: turnoCopiadoChef.observacion_2 || null,
    evento_2: turnoCopiadoChef.evento_2 || null,
    area_cocina_id_2: turnoCopiadoChef.area_cocina_id_2 || null,
    area_cocina_2: turnoCopiadoChef.area_cocina_2 || null,
    estado: "programado",
    origen_programacion: "cocina_chef",
    creado_por: obtenerUsuarioId(),
    actualizado_por: obtenerUsuarioId()
  };

  const { error } = await supabase
    .from("cocina_programacion_turnos")
    .insert(payload);

  if (error) {
    console.error("Error pegando turno:", error);
    alert("No se pudo pegar el turno.");
    return;
  }

  await recargar();
}

// ======================================================
// RENDER TABLA
// ======================================================
function renderTabla() {
  const header = document.getElementById("headerDias");
  const body = document.getElementById("bodyTabla");
  const contador = document.getElementById("textoResultadoMatrizChef");
  const personalFiltrado = obtenerPersonalFiltrado();

  header.innerHTML = `
    <th class="colaborador-col-header">Colaborador / Área</th>
  `;

  semana.forEach((dia) => {
    const th = document.createElement("th");
    th.innerHTML = `
      <div>${nombreDia(dia)}</div>
      <div>${dia.getDate()}</div>
    `;
    header.appendChild(th);
  });

  const idsPersonalVisible = new Set(personalFiltrado.map((persona) => persona.id));
  const turnosVisibles = programacion.filter((registro) =>
    idsPersonalVisible.has(registro.cronograma_personal_id)
  ).length;

  if (contador) {
    contador.textContent = `${personalFiltrado.length} colaborador(es) visible(s) · ${turnosVisibles} turno(s)`;
  }

  body.innerHTML = "";

  if (!personalFiltrado.length) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted p-4">
          No hay personal para los filtros seleccionados.
        </td>
      </tr>
    `;
    return;
  }

  personalFiltrado.forEach((persona) => {
    const tr = document.createElement("tr");
    const resumen = obtenerResumenPersonaSemana(persona);
    const nombreAreaBase = obtenerNombreAreaPersona(persona);
    const tipoPersona = obtenerTextoTipoPersonal(persona.tipo_personal);

    const tdPersona = document.createElement("td");
    tdPersona.className = "colaborador-matriz-cell";
    tdPersona.innerHTML = `
      <div class="chef-persona-nombre">${escaparHtmlCocina(persona.nombre_visible || "")}</div>
      <div class="chef-persona-cargo">${escaparHtmlCocina(persona.cargo || tipoPersona)}</div>
      <div class="chef-persona-badges">
        <span class="chef-chip-area">${escaparHtmlCocina(nombreAreaBase)}</span>
        <span class="chef-chip-tipo">${escaparHtmlCocina(tipoPersona)}</span>
      </div>
      <div class="chef-persona-resumen">
        <span>${resumen.turnos} turno(s)</span>
        <button class="btn-quitar-persona" type="button" title="Quitar del cronograma">Quitar</button>
      </div>
    `;

    tdPersona.querySelector(".btn-quitar-persona").onclick = async (event) => {
      event.stopPropagation();
      await quitarColaboradorCronograma(persona);
    };

    tr.appendChild(tdPersona);

    semana.forEach((dia) => {
      const fecha = formatearFechaISO(dia);
      const registro = programacion.find(
        (item) => item.cronograma_personal_id === persona.id && item.fecha === fecha
      );
      const td = document.createElement("td");
      td.className = "celda-dia-chef";

      if (registro) {
        const codigo = codigos.find((item) => item.codigo === registro.codigo_turno);
        const areaTurno = obtenerAreaPorId(registro.area_cocina_id);
        const horario = codigo?.hora_inicio && codigo?.hora_fin
          ? `${String(codigo.hora_inicio).substring(0, 5)}-${String(codigo.hora_fin).substring(0, 5)}`
          : "Horario por código";
        const nombreAreaTurno = areaTurno?.nombre || registro.area_cocina || nombreAreaBase;
        const color = colorSeguroCocina(codigo?.color);
        const codigo2 = registro.codigo_turno_2
          ? codigos.find((item) => item.codigo === registro.codigo_turno_2)
          : null;
        const areaTurno2 = registro.area_cocina_id_2 ? obtenerAreaPorId(registro.area_cocina_id_2) : null;
        const horario2 = codigo2?.hora_inicio && codigo2?.hora_fin
          ? `${String(codigo2.hora_inicio).substring(0, 5)}-${String(codigo2.hora_fin).substring(0, 5)}`
          : "";
        const nombreAreaTurno2 = areaTurno2?.nombre || registro.area_cocina_2 || "";

        td.innerHTML = `
          <div class="accion-celda-chef">
            <button type="button" class="btn-celda-chef btn-editar-chef" title="Editar turno">Editar</button>
            <button type="button" class="btn-celda-chef btn-copiar-chef" title="Copiar turno">Copiar</button>
          </div>
          <div class="turno-chef-card" style="--codigo-color:${color}">
            <div class="turno-chef-superior">
              <span class="chip-codigo-chef">${escaparHtmlCocina(registro.codigo_turno || "")}</span>
              <span class="chip-area-turno-chef">${escaparHtmlCocina(nombreAreaTurno)}</span>
            </div>
            <div class="turno-chef-horario">${escaparHtmlCocina(horario)}</div>
            ${registro.evento ? `<div class="turno-chef-evento">${escaparHtmlCocina(registro.evento)}</div>` : ""}
            ${registro.codigo_turno_2 ? `
              <div class="turno-chef-divider"></div>
              <div class="turno-chef-superior">
                <span class="chip-partido-chef">B2</span>
                <span class="chip-codigo-chef">${escaparHtmlCocina(registro.codigo_turno_2)}</span>
                ${nombreAreaTurno2 ? `<span class="chip-area-turno-chef">${escaparHtmlCocina(nombreAreaTurno2)}</span>` : ""}
              </div>
              <div class="turno-chef-horario">${escaparHtmlCocina(horario2 || "Horario por código")}</div>
              ${registro.evento_2 ? `<div class="turno-chef-evento">${escaparHtmlCocina(registro.evento_2)}</div>` : ""}
            ` : ""}
          </div>
        `;

        td.title = [
          codigo?.descripcion || registro.codigo_turno,
          horario,
          nombreAreaTurno ? `Área: ${nombreAreaTurno}` : "",
          registro.evento ? `Evento: ${registro.evento}` : "",
          registro.observacion ? `Obs: ${registro.observacion}` : "",
          registro.codigo_turno_2 ? `Bloque 2: ${registro.codigo_turno_2} ${horario2}` : "",
          registro.evento_2 ? `Evento B2: ${registro.evento_2}` : "",
          registro.observacion_2 ? `Obs B2: ${registro.observacion_2}` : ""
        ].filter(Boolean).join(" | ");

        td.querySelector(".btn-editar-chef").onclick = (event) => {
          event.stopPropagation();
          abrirModalTurno(persona, fecha, registro);
        };

        td.querySelector(".btn-copiar-chef").onclick = (event) => {
          event.stopPropagation();
          copiarTurnoChef(registro, persona);
        };

        td.querySelector(".turno-chef-card").onclick = () =>
          abrirModalTurno(persona, fecha, registro);
      } else {
        td.innerHTML = `
          <div class="accion-celda-chef">
            <button type="button" class="btn-celda-chef btn-agregar-chef" title="Asignar turno">+</button>
            ${turnoCopiadoChef ? `<button type="button" class="btn-celda-chef btn-pegar-chef" title="Pegar turno">P</button>` : ""}
          </div>
          <div class="celda-libre-chef">Libre</div>
        `;

        td.querySelector(".btn-agregar-chef").onclick = (event) => {
          event.stopPropagation();
          abrirModalTurno(persona, fecha, null);
        };

        const btnPegar = td.querySelector(".btn-pegar-chef");
        if (btnPegar) {
          btnPegar.onclick = async (event) => {
            event.stopPropagation();
            await pegarTurnoChef(persona, fecha);
          };
        }

        td.querySelector(".celda-libre-chef").onclick = () =>
          abrirModalTurno(persona, fecha, null);
      }

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
}


// ======================================================
// QUITAR COLABORADOR
// ======================================================
async function quitarColaboradorCronograma(persona) {
  if (!puedeAdministrarCocina()) {
    alert("No tienes permisos para quitar colaboradores.");
    return;
  }

  const nombre = persona.nombre_visible || "este colaborador";

  const confirmar = confirm(
    `¿Quitar a ${nombre} del cronograma de Cocina Chef?\n\nNo se eliminará el empleado de la base de datos.`
  );

  if (!confirmar) return;

  const eliminarFuturos = confirm(
    `¿También deseas eliminar los turnos futuros de ${nombre} desde hoy?\n\nAceptar: elimina turnos futuros.\nCancelar: solo lo oculta del cronograma y conserva la programación existente.`
  );

  if (eliminarFuturos) {
    const hoy = formatearFechaISO(new Date());

    const { error: errorDelete } = await supabase
      .from("cocina_programacion_turnos")
      .delete()
      .eq("cronograma_personal_id", persona.id)
      .gte("fecha", hoy);

    if (errorDelete) {
      console.error("Error eliminando turnos futuros:", errorDelete);
      alert("No se pudieron eliminar los turnos futuros.");
      return;
    }
  }

  const { error } = await supabase
    .from("cocina_cronograma_personal")
    .update({
      activo: false,
      actualizado_at: new Date().toISOString()
    })
    .eq("id", persona.id);

  if (error) {
    console.error("Error quitando colaborador:", error);
    alert("No se pudo quitar el colaborador del cronograma.");
    return;
  }

  await recargar();
}

// ======================================================
// KPIS
// ======================================================
function renderKPIs() {
  const personalFiltrado = obtenerPersonalFiltrado();
  const idsPersonalFiltrado = new Set(personalFiltrado.map((p) => p.id));
  const turnosFiltrados = programacion.filter((p) =>
    idsPersonalFiltrado.has(p.cronograma_personal_id)
  );

  document.getElementById("kpiPersonas").innerText = personalFiltrado.length;
  document.getElementById("kpiTurnos").innerText = turnosFiltrados.length;
  document.getElementById("kpiExternos").innerText =
    personalFiltrado.filter((p) => p.tipo_personal === "externo").length;

  const areasActivas = new Set(
    personalFiltrado
      .map((p) => p.area_cocina_id || p.area_cocina)
      .filter(Boolean)
  );

  document.getElementById("kpiAreas").innerText = areasActivas.size;

  const registrosCalculados = turnosFiltrados.map(enriquecerRegistroHorasChef);
  const ranking = construirRankingHorasChef(registrosCalculados, personalFiltrado);
  const totalNetas = redondearHorasChef(
    registrosCalculados.reduce((total, registro) => total + Number(registro.horas_netas || 0), 0)
  );
  const totalExtra = redondearHorasChef(
    registrosCalculados.reduce((total, registro) => total + Number(registro.horas_extra_estimadas || 0), 0)
  );
  const calculables = registrosCalculados.filter((registro) => registro.horario_calculable).length;
  const top = ranking[0];

  asignarTextoChef("kpiHorasNetasChef", formatoHorasChef(totalNetas));
  asignarTextoChef("kpiHorasExtraChef", formatoHorasChef(totalExtra));
  asignarTextoChef("kpiTurnosCalculablesChef", String(calculables));
  asignarTextoChef("kpiTopEmpleadoChef", top ? limitarTextoChef(top.nombre, 22) : "-");
  asignarTextoChef(
    "kpiTopEmpleadoDetalleChef",
    top ? `${formatoHorasChef(top.extra)} h extra estimadas` : "Sin datos"
  );

  renderResumenSemanalHorasChef(ranking);
}

function asignarTextoChef(id, valor) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = valor;
}

function obtenerTurnosVisiblesCalculadosChef() {
  const ids = new Set(obtenerPersonalFiltrado().map((persona) => persona.id));
  return programacion
    .filter((registro) => ids.has(registro.cronograma_personal_id))
    .map(enriquecerRegistroHorasChef);
}

function enriquecerRegistroHorasChef(registro) {
  const codigo1 = codigos.find((item) => String(item.codigo) === String(registro.codigo_turno));
  const inicio1 = codigo1?.hora_inicio ? String(codigo1.hora_inicio).substring(0, 5) : "";
  const fin1 = codigo1?.hora_fin ? String(codigo1.hora_fin).substring(0, 5) : "";
  const bloque1 = calcularHorasTurnoChef(inicio1, fin1);

  const codigo2 = registro.codigo_turno_2
    ? codigos.find((item) => String(item.codigo) === String(registro.codigo_turno_2))
    : null;
  const inicio2 = codigo2?.hora_inicio ? String(codigo2.hora_inicio).substring(0, 5) : "";
  const fin2 = codigo2?.hora_fin ? String(codigo2.hora_fin).substring(0, 5) : "";
  const bloque2 = calcularHorasTurnoChef(inicio2, fin2);

  const horasTotales = redondearHorasChef(bloque1.total + bloque2.total);
  const horasDiurnas = redondearHorasChef(bloque1.diurnas + bloque2.diurnas);
  const horasNocturnas = redondearHorasChef(bloque1.nocturnas + bloque2.nocturnas);
  const horasNetas = redondearHorasChef(horasDiurnas + horasNocturnas);

  const jornadaInfo = obtenerJornadaEsperadaChef(registro.fecha);
  const horasExtra = redondearHorasChef(Math.max(0, horasNetas - jornadaInfo.horas));

  let extraDiurna = 0;
  let extraNocturna = 0;

  if (horasExtra > 0) {
    const ordinariasDiurnas = Math.min(horasDiurnas, jornadaInfo.horas);
    extraDiurna = redondearHorasChef(Math.max(0, horasDiurnas - ordinariasDiurnas));
    extraNocturna = redondearHorasChef(Math.max(0, horasExtra - extraDiurna));
  }

  return {
    ...registro,
    codigo_info: codigo1 || null,
    codigo_info_2: codigo2 || null,
    hora_inicio_calculada: inicio1,
    hora_fin_calculada: fin1,
    hora_inicio_calculada_2: inicio2,
    hora_fin_calculada_2: fin2,
    horario_calculable: Boolean(inicio1 && fin1) && (!registro.codigo_turno_2 || Boolean(inicio2 && fin2)),
    horas_bloque_1: bloque1.netas,
    horas_bloque_2: bloque2.netas,
    horas_totales: horasTotales,
    horas_diurnas: horasDiurnas,
    horas_nocturnas: horasNocturnas,
    horas_netas: horasNetas,
    descuento_almuerzo: horasTotales > 0
      ? (registro.codigo_turno_2 ? DESCANSO_ESTANDAR_HORAS_CHEF * 2 : DESCANSO_ESTANDAR_HORAS_CHEF)
      : 0,
    jornada_esperada: jornadaInfo.horas,
    tipo_jornada: jornadaInfo.tipo,
    horas_extra_estimadas: horasExtra,
    extra_diurna: extraDiurna,
    extra_nocturna: extraNocturna
  };
}

function calcularHorasTurnoChef(inicio, fin) {
  if (!inicio || !fin) {
    return { total: 0, diurnas: 0, nocturnas: 0, netas: 0 };
  }

  const inicioMin = horaChefAMinutos(inicio);
  let finMin = horaChefAMinutos(fin);

  if (inicioMin === null || finMin === null) {
    return { total: 0, diurnas: 0, nocturnas: 0, netas: 0 };
  }

  if (finMin < inicioMin) {
    finMin += 24 * 60;
  }

  let minutosDiurnos = 0;
  let minutosNocturnos = 0;

  for (let minuto = inicioMin; minuto < finMin; minuto++) {
    const minutoDia = minuto % (24 * 60);
    if (minutoDia >= HORA_INICIO_NOCTURNO_CHEF || minutoDia < HORA_FIN_NOCTURNO_CHEF) {
      minutosNocturnos += 1;
    } else {
      minutosDiurnos += 1;
    }
  }

  const minutosTotales = minutosDiurnos + minutosNocturnos;
  if (minutosTotales === 0) {
    return { total: 0, diurnas: 0, nocturnas: 0, netas: 0 };
  }

  let descuento = DESCANSO_ESTANDAR_HORAS_CHEF * 60;

  if (minutosDiurnos >= descuento) {
    minutosDiurnos -= descuento;
  } else {
    const restante = descuento - minutosDiurnos;
    minutosDiurnos = 0;
    minutosNocturnos = Math.max(0, minutosNocturnos - restante);
  }

  return {
    total: redondearHorasChef(minutosTotales / 60),
    diurnas: redondearHorasChef(minutosDiurnos / 60),
    nocturnas: redondearHorasChef(minutosNocturnos / 60),
    netas: redondearHorasChef((minutosDiurnos + minutosNocturnos) / 60)
  };
}

function horaChefAMinutos(hora) {
  const partes = String(hora || "").split(":").map(Number);
  if (partes.length < 2 || partes.some(Number.isNaN)) return null;
  return (partes[0] * 60) + partes[1];
}

function obtenerJornadaEsperadaChef(fechaISO) {
  if (festivosSemanaChef.some((festivo) => String(festivo.fecha) === String(fechaISO))) {
    return { horas: 8.5, tipo: "Festivo" };
  }

  const dia = new Date(`${fechaISO}T00:00:00`).getDay();
  if (dia === 0 || dia === 6) {
    return { horas: 8.5, tipo: "Sábado/Domingo" };
  }

  return { horas: 7.5, tipo: "Lunes a viernes / día hábil" };
}

function redondearHorasChef(valor) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;
}

function formatoHorasChef(valor) {
  return Number(valor || 0).toFixed(2);
}

function limitarTextoChef(valor, maximo) {
  const texto = String(valor || "");
  return texto.length > maximo ? `${texto.substring(0, maximo - 3)}...` : texto;
}

function construirRankingHorasChef(registros, personalVisible) {
  const personasPorId = new Map(personalVisible.map((persona) => [persona.id, persona]));
  const mapa = new Map();

  registros.forEach((registro) => {
    const persona = personasPorId.get(registro.cronograma_personal_id);
    const llave = registro.cronograma_personal_id;

    if (!mapa.has(llave)) {
      mapa.set(llave, {
        id: llave,
        nombre: persona?.nombre_visible || "Colaborador",
        cargo: persona?.cargo || obtenerTextoTipoPersonal(persona?.tipo_personal),
        diurnas: 0,
        nocturnas: 0,
        netas: 0,
        extraDiurna: 0,
        extraNocturna: 0,
        extra: 0,
        registros: 0
      });
    }

    const item = mapa.get(llave);
    item.diurnas = redondearHorasChef(item.diurnas + Number(registro.horas_diurnas || 0));
    item.nocturnas = redondearHorasChef(item.nocturnas + Number(registro.horas_nocturnas || 0));
    item.netas = redondearHorasChef(item.netas + Number(registro.horas_netas || 0));
    item.extraDiurna = redondearHorasChef(item.extraDiurna + Number(registro.extra_diurna || 0));
    item.extraNocturna = redondearHorasChef(item.extraNocturna + Number(registro.extra_nocturna || 0));
    item.extra = redondearHorasChef(item.extra + Number(registro.horas_extra_estimadas || 0));
    item.registros += 1;
  });

  return Array.from(mapa.values()).sort((a, b) => b.extra - a.extra || b.netas - a.netas);
}

function renderResumenSemanalHorasChef(ranking) {
  const contenedor = document.getElementById("resumenSemanalHorasChef");
  if (!contenedor) return;

  if (!ranking.length) {
    contenedor.innerHTML = `<div class="text-muted">No hay turnos programados en la semana visible.</div>`;
    return;
  }

  contenedor.innerHTML = `
    <div class="mb-3">
      <div class="fw-semibold">Top colaboradores con mayor sobreprogramación teórica</div>
      <div class="small text-muted">
        Descanso de 0.5 h; nocturna de 7:00 p.m. a 6:00 a.m.; festivos y fines de semana con jornada de 8.5 h.
      </div>
    </div>
    <div class="table-responsive">
      <table class="table table-sm table-striped table-horas-chef mb-0">
        <thead>
          <tr>
            <th>#</th>
            <th>Colaborador</th>
            <th>D</th>
            <th>N</th>
            <th>Netas</th>
            <th>ED</th>
            <th>EN</th>
            <th>Extra</th>
            <th>Registros</th>
          </tr>
        </thead>
        <tbody>
          ${ranking.slice(0, 8).map((item, indice) => `
            <tr>
              <td>${indice + 1}</td>
              <td>
                <div class="fw-semibold">${escaparHtmlCocina(item.nombre)}</div>
                <div class="small text-muted">${escaparHtmlCocina(item.cargo || "")}</div>
              </td>
              <td>${formatoHorasChef(item.diurnas)} h</td>
              <td>${formatoHorasChef(item.nocturnas)} h</td>
              <td>${formatoHorasChef(item.netas)} h</td>
              <td>${formatoHorasChef(item.extraDiurna)} h</td>
              <td>${formatoHorasChef(item.extraNocturna)} h</td>
              <td>${formatoHorasChef(item.extra)} h</td>
              <td>${item.registros}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSelectEmpleadoPdfChef() {
  const select = document.getElementById("selectEmpleadoPdfChef");
  if (!select) return;

  const valorActual = select.value;
  const opciones = [...personal].sort((a, b) =>
    String(a.nombre_visible || "").localeCompare(String(b.nombre_visible || ""), "es")
  );

  select.innerHTML = `<option value="">Seleccione</option>` + opciones.map((persona) =>
    `<option value="${escaparHtmlCocina(persona.id)}">${escaparHtmlCocina(persona.nombre_visible || "Colaborador")}${persona.cargo ? ` - ${escaparHtmlCocina(persona.cargo)}` : ""}</option>`
  ).join("");

  if (opciones.some((persona) => String(persona.id) === String(valorActual))) {
    select.value = valorActual;
  }
}

function obtenerNombreSemanaChef() {
  return `${formatearFechaCorta(semana[0])} - ${formatearFechaCorta(semana[6])}`;
}

function generarPdfGeneralChef() {
  if (!window.jspdf?.jsPDF) {
    alert("La librería de PDF no está disponible.");
    return;
  }

  const personalVisible = obtenerPersonalFiltrado();
  const idsVisibles = new Set(personalVisible.map((persona) => persona.id));
  const registros = programacion
    .filter((registro) => idsVisibles.has(registro.cronograma_personal_id))
    .map(enriquecerRegistroHorasChef);

  if (!personalVisible.length) {
    alert("No hay colaboradores visibles para exportar.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margenX = 10;
  const maxY = 190;
  let y = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Programación general - Cocina Chef", margenX, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Semana: ${obtenerNombreSemanaChef()}`, margenX, y);
  y += 5;
  doc.text(`Colaboradores visibles: ${personalVisible.length} | Turnos: ${registros.length}`, margenX, y);
  y += 8;

  personalVisible.forEach((persona) => {
    const turnosPersona = registros.filter((registro) => registro.cronograma_personal_id === persona.id);

    if (y > maxY - 12) {
      doc.addPage();
      y = 12;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(limitarTextoChef(`${persona.nombre_visible || "Colaborador"} - ${persona.cargo || obtenerTextoTipoPersonal(persona.tipo_personal)}`, 100), margenX, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);

    if (!turnosPersona.length) {
      doc.text("Sin turnos programados", margenX + 3, y);
      y += 6;
      return;
    }

    turnosPersona.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).forEach((turno) => {
      if (y > maxY) {
        doc.addPage();
        y = 12;
      }

      const area = turno.area_cocina || obtenerAreaPorId(turno.area_cocina_id)?.nombre || "";
      const horario = turno.horario_calculable
        ? `${turno.hora_inicio_calculada}-${turno.hora_fin_calculada}`
        : "Sin horario";
      const bloque2 = turno.codigo_turno_2
        ? ` | B2 ${turno.codigo_turno_2} ${turno.hora_inicio_calculada_2 || ""}-${turno.hora_fin_calculada_2 || ""}`
        : "";
      const linea = `${turno.fecha} | B1 ${turno.codigo_turno || ""} | ${area} | ${horario}${bloque2} | Netas ${formatoHorasChef(turno.horas_netas)} h | Extra ${formatoHorasChef(turno.horas_extra_estimadas)} h`;

      doc.text(limitarTextoChef(linea, 145), margenX + 3, y);
      y += 5;
    });

    y += 3;
  });

  doc.save(`programacion_general_cocina_chef_${formatearFechaISO(semana[0])}.pdf`);
}

function generarPdfEmpleadoChef() {
  if (!window.jspdf?.jsPDF) {
    alert("La librería de PDF no está disponible.");
    return;
  }

  const personaId = document.getElementById("selectEmpleadoPdfChef")?.value || "";
  if (!personaId) {
    alert("Selecciona un colaborador para generar el PDF.");
    return;
  }

  const persona = personal.find((item) => String(item.id) === String(personaId));
  if (!persona) {
    alert("No se encontró el colaborador seleccionado.");
    return;
  }

  const registros = programacion
    .filter((registro) => String(registro.cronograma_personal_id) === String(personaId))
    .map(enriquecerRegistroHorasChef)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margenX = 12;
  const maxY = 275;
  let y = 15;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Programación semanal - Cocina Chef", margenX, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Semana: ${obtenerNombreSemanaChef()}`, margenX, y);
  y += 6;
  doc.text(`Colaborador: ${persona.nombre_visible || ""}`, margenX, y);
  y += 6;
  doc.text(`Cargo / tipo: ${persona.cargo || obtenerTextoTipoPersonal(persona.tipo_personal)}`, margenX, y);
  y += 6;
  doc.text(`Área base: ${obtenerNombreAreaPersona(persona)}`, margenX, y);
  y += 9;

  if (!registros.length) {
    doc.text("No hay turnos programados para este colaborador en la semana visible.", margenX, y);
    doc.save(`programacion_cocina_chef_${persona.id}_${formatearFechaISO(semana[0])}.pdf`);
    return;
  }

  registros.forEach((turno) => {
    if (y > maxY - 45) {
      doc.addPage();
      y = 15;
    }

    const area = turno.area_cocina || obtenerAreaPorId(turno.area_cocina_id)?.nombre || "";
    const horario = turno.horario_calculable
      ? `${turno.hora_inicio_calculada} - ${turno.hora_fin_calculada}`
      : "Sin horario configurado";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${turno.fecha} - Código ${turno.codigo_turno || ""}`, margenX, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    [
      `Área operativa bloque 1: ${area}`,
      `Horario bloque 1: ${horario}`,
      ...(turno.codigo_turno_2 ? [
        `Bloque 2: Código ${turno.codigo_turno_2} | Área: ${turno.area_cocina_2 || obtenerAreaPorId(turno.area_cocina_id_2)?.nombre || ""}`,
        `Horario bloque 2: ${turno.hora_inicio_calculada_2 || ""} - ${turno.hora_fin_calculada_2 || ""}`
      ] : []),
      `Horas diurnas: ${formatoHorasChef(turno.horas_diurnas)} h | Horas nocturnas: ${formatoHorasChef(turno.horas_nocturnas)} h`,
      `Horas netas: ${formatoHorasChef(turno.horas_netas)} h | Extra total: ${formatoHorasChef(turno.horas_extra_estimadas)} h`,
      `Extra diurna: ${formatoHorasChef(turno.extra_diurna)} h | Extra nocturna: ${formatoHorasChef(turno.extra_nocturna)} h`,
      `Jornada esperada: ${formatoHorasChef(turno.jornada_esperada)} h | ${turno.tipo_jornada}`
    ].forEach((linea) => {
      doc.text(limitarTextoChef(linea, 95), margenX + 3, y);
      y += 5;
    });

    if (turno.evento) {
      doc.text(limitarTextoChef(`Evento: ${turno.evento}`, 95), margenX + 3, y);
      y += 5;
    }

    if (turno.observacion) {
      doc.text(limitarTextoChef(`Observación B1: ${turno.observacion}`, 95), margenX + 3, y);
      y += 5;
    }

    if (turno.evento_2) {
      doc.text(limitarTextoChef(`Evento B2: ${turno.evento_2}`, 95), margenX + 3, y);
      y += 5;
    }

    if (turno.observacion_2) {
      doc.text(limitarTextoChef(`Observación B2: ${turno.observacion_2}`, 95), margenX + 3, y);
      y += 5;
    }

    y += 4;
  });

  doc.save(`programacion_cocina_chef_${persona.id}_${formatearFechaISO(semana[0])}.pdf`);
}

// ======================================================
// TURNO PARTIDO / SEGUNDO BLOQUE
// ======================================================
function actualizarVistaTurnoPartidoChef() {
  const check = document.getElementById("checkTurnoPartidoChef");
  const bloque = document.getElementById("bloqueTurnoPartidoChef");
  if (!check || !bloque) return;

  bloque.classList.toggle("d-none", !check.checked);

  if (!check.checked) {
    const select2 = document.getElementById("selectTurno2");
    const area2 = document.getElementById("turnoArea2");
    const evento2 = document.getElementById("turnoEvento2");
    const obs2 = document.getElementById("obsTurno2");

    if (select2) select2.value = "";
    if (area2) area2.value = "";
    if (evento2) evento2.value = "";
    if (obs2) obs2.value = "";
  }
}

function cargarOpcionesCodigoTurnoChef(selectElement, permitirVacio = false) {
  if (!selectElement) return;

  selectElement.innerHTML = "";

  if (permitirVacio) {
    const optVacio = document.createElement("option");
    optVacio.value = "";
    optVacio.textContent = "Seleccione código";
    selectElement.appendChild(optVacio);
  }

  if (!codigos.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No hay códigos activos";
    selectElement.appendChild(opt);
    return;
  }

  codigos.forEach((codigo) => {
    const opt = document.createElement("option");
    opt.value = codigo.codigo;
    const hora =
      codigo.hora_inicio && codigo.hora_fin
        ? ` (${String(codigo.hora_inicio).substring(0, 5)} - ${String(codigo.hora_fin).substring(0, 5)})`
        : "";
    opt.textContent = `${codigo.codigo} - ${codigo.descripcion || ""}${hora}`;
    selectElement.appendChild(opt);
  });
}

// ======================================================
// MODAL TURNO
// ======================================================
function abrirModalTurno(persona, fecha, registro) {
  if (!puedeAdministrarCocina()) {
    alert("No tienes permisos para modificar la programación.");
    return;
  }

  selectedCelda = {
    persona,
    personaId: persona.id,
    fecha,
    registro
  };

  const select1 = document.getElementById("selectTurno");
  const select2 = document.getElementById("selectTurno2");
  const obs1 = document.getElementById("obsTurno");
  const obs2 = document.getElementById("obsTurno2");
  const btnEliminar = document.getElementById("eliminarTurno");
  const turnoArea1 = document.getElementById("turnoArea");
  const turnoArea2 = document.getElementById("turnoArea2");
  const turnoEvento1 = document.getElementById("turnoEvento");
  const turnoEvento2 = document.getElementById("turnoEvento2");
  const checkPartido = document.getElementById("checkTurnoPartidoChef");
  const info = document.getElementById("infoTurnoSeleccionado");

  cargarOpcionesCodigoTurnoChef(select1, false);
  cargarOpcionesCodigoTurnoChef(select2, true);
  pintarSelectAreas();

  info.innerHTML = `
    <strong>${escaparHtmlCocina(persona.nombre_visible || "")}</strong><br>
    <span>${formatearFechaCorta(new Date(fecha + "T00:00:00"))}</span><br>
    <small>Área base: ${escaparHtmlCocina(obtenerNombreAreaPersona(persona))}</small>
  `;

  if (registro) {
    select1.value = registro.codigo_turno || "";
    obs1.value = registro.observacion || "";
    turnoEvento1.value = registro.evento || "";
    turnoArea1.value = registro.area_cocina_id || "";

    const tieneBloque2 = Boolean(
      registro.codigo_turno_2 ||
      registro.area_cocina_id_2 ||
      registro.area_cocina_2 ||
      registro.evento_2 ||
      registro.observacion_2
    );

    checkPartido.checked = tieneBloque2;
    select2.value = registro.codigo_turno_2 || "";
    obs2.value = registro.observacion_2 || "";
    turnoEvento2.value = registro.evento_2 || "";
    turnoArea2.value = registro.area_cocina_id_2 || "";

    btnEliminar.style.display = "inline-block";
  } else {
    if (select1.options.length) select1.selectedIndex = 0;
    obs1.value = "";
    turnoEvento1.value = "";
    turnoArea1.value = "";

    checkPartido.checked = false;
    select2.value = "";
    obs2.value = "";
    turnoEvento2.value = "";
    turnoArea2.value = "";

    btnEliminar.style.display = "none";
  }

  actualizarVistaTurnoPartidoChef();
  abrirModal("modalTurno");
}

// ======================================================
// GUARDAR TURNO
// ======================================================
async function guardarTurno() {
  if (!selectedCelda) return;

  const codigo1 = document.getElementById("selectTurno").value;
  const observacion1 = document.getElementById("obsTurno").value.trim();
  const evento1 = document.getElementById("turnoEvento").value.trim();
  const areaId1 = document.getElementById("turnoArea").value;

  const esPartido = document.getElementById("checkTurnoPartidoChef").checked;
  const codigo2 = document.getElementById("selectTurno2").value;
  const observacion2 = document.getElementById("obsTurno2").value.trim();
  const evento2 = document.getElementById("turnoEvento2").value.trim();
  const areaId2Seleccionada = document.getElementById("turnoArea2").value;

  if (!codigo1) {
    alert("Selecciona un código de turno para el bloque 1.");
    return;
  }

  if (esPartido && !codigo2) {
    alert("Selecciona un código de turno para el bloque 2.");
    return;
  }

  const areaFinalId1 = areaId1 || selectedCelda.persona.area_cocina_id || null;
  const areaFinal1 = obtenerAreaPorId(areaFinalId1);

  const areaFinalId2 = esPartido
    ? (areaId2Seleccionada || areaFinalId1 || selectedCelda.persona.area_cocina_id || null)
    : null;
  const areaFinal2 = obtenerAreaPorId(areaFinalId2);

  const payload = {
    cronograma_personal_id: selectedCelda.personaId,
    fecha: selectedCelda.fecha,
    codigo_turno: codigo1,
    observacion: observacion1,
    evento: evento1,
    area_cocina_id: areaFinalId1,
    area_cocina: areaFinal1?.nombre || selectedCelda.persona.area_cocina || null,

    codigo_turno_2: esPartido ? codigo2 : null,
    observacion_2: esPartido ? observacion2 : null,
    evento_2: esPartido ? evento2 : null,
    area_cocina_id_2: esPartido ? String(areaFinalId2 || "") || null : null,
    area_cocina_2: esPartido
      ? (areaFinal2?.nombre || areaFinal1?.nombre || selectedCelda.persona.area_cocina || null)
      : null,

    estado: "programado",
    origen_programacion: "cocina_chef",
    actualizado_por: obtenerUsuarioId()
  };

  if (!selectedCelda.registro) {
    payload.creado_por = obtenerUsuarioId();
  }

  const { error } = await supabase
    .from("cocina_programacion_turnos")
    .upsert(payload, {
      onConflict: "cronograma_personal_id,fecha"
    });

  if (error) {
    console.error("Error guardando turno:", error);
    alert("No se pudo guardar el turno. Valida que hayas ejecutado el SQL de turno partido en Supabase.");
    return;
  }

  cerrarModal("modalTurno");
  await recargar();
}

// ======================================================
// ELIMINAR TURNO
// ======================================================
async function eliminarTurno() {
  if (!selectedCelda || !selectedCelda.registro) return;

  const confirmar = confirm("¿Eliminar este turno?");
  if (!confirmar) return;

  const { error } = await supabase
    .from("cocina_programacion_turnos")
    .delete()
    .eq("id", selectedCelda.registro.id);

  if (error) {
    console.error("Error eliminando turno:", error);
    alert("No se pudo eliminar el turno.");
    return;
  }

  cerrarModal("modalTurno");
  await recargar();
}

// ======================================================
// EXTERNOS
// ======================================================
function limpiarFormularioExterno() {
  document.getElementById("extNombre").value = "";
  document.getElementById("extDocumento").value = "";
  document.getElementById("extTelefono").value = "";
  document.getElementById("extTipoPersonal").value = "externo";
  document.getElementById("extArea").value = "";
  document.getElementById("extObservacion").value = "";
}

async function guardarExterno() {
  const nombre = document.getElementById("extNombre").value.trim();
  const documento = document.getElementById("extDocumento").value.trim();
  const telefono = document.getElementById("extTelefono").value.trim();
  const tipoPersonal = document.getElementById("extTipoPersonal").value;
  const areaId = document.getElementById("extArea").value;
  const observacion = document.getElementById("extObservacion").value.trim();

  if (!nombre) {
    alert("El nombre es obligatorio.");
    return;
  }

  if (!areaId) {
    alert("Selecciona el área operativa.");
    return;
  }

  const area = obtenerAreaPorId(areaId);

  const { data: externo, error: errorExterno } = await supabase
    .from("cocina_personal_externo")
    .insert({
      nombre,
      documento,
      telefono,
      observacion,
      tipo_personal: tipoPersonal,
      activo: true
    })
    .select()
    .single();

  if (errorExterno) {
    console.error("Error creando externo:", errorExterno);
    alert("No se pudo crear el externo.");
    return;
  }

  const { error: errorCronograma } = await supabase
    .from("cocina_cronograma_personal")
    .insert({
      externo_id: externo.id,
      nombre_visible: externo.nombre,
      documento: externo.documento,
      cargo: "Externo",
      tipo_personal: tipoPersonal,
      area_cocina_id: areaId,
      area_cocina: area?.nombre || null,
      observacion_operativa: observacion,
      creado_por: obtenerUsuarioId(),
      activo: true
    });

  if (errorCronograma) {
    console.error("Error agregando externo al cronograma:", errorCronograma);
    alert("El externo fue creado, pero no se pudo agregar al cronograma.");
    return;
  }

  cerrarModal("modalExterno");
  limpiarFormularioExterno();
  await recargar();
}

// ======================================================
// EMPLEADOS A&B / COCINA
// ======================================================
async function abrirModalEmpleados() {
  if (!puedeAdministrarCocina()) {
    alert("No tienes permisos para agregar empleados al cronograma.");
    return;
  }

  pintarSelectAreas();
  abrirModal("modalEmpleado");

  if (!empleadosCache.length) {
    await cargarEmpleadosBase();
  }

  renderListaEmpleados(filtrarEmpleadosModal());
}

async function cargarEmpleadosBase() {
  const tbody = document.getElementById("listaEmpleados");

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="text-center text-muted">
        Cargando empleados...
      </td>
    </tr>
  `;

  /*
    Se conserva la consulta general para no depender de nombres de columnas
    adicionales en Supabase. La restricción obligatoria se realiza en cliente
    mediante perteneceEmpleadoBaseAybCocina().
  */
  const { data, error } = await supabase
    .from("empleados")
    .select("*");

  if (error) {
    console.error("Error cargando empleados:", error);
    empleadosCache = [];
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-danger">
          No se pudieron cargar los empleados.
        </td>
      </tr>
    `;
    return;
  }

  empleadosCache = (data || []).filter(perteneceEmpleadoBaseAybCocina);
}

function filtrarEmpleadosModal() {
  const filtro = normalizarTexto(document.getElementById("buscarEmpleado").value);

  return empleadosCache
    .filter((emp) => {
      /*
        Validación defensiva adicional: aunque el caché ya está limitado,
        solo se ofrece personal cuyo origen real pertenece a A&B/Cocina.
        El punto operativo destino (por ejemplo, Tenis o Piscina) no se usa
        para incluir empleados.
      */
      if (!perteneceEmpleadoBaseAybCocina(emp)) return false;

      const textoBusqueda = normalizarTexto([
        obtenerNombreEmpleado(emp),
        obtenerDocumentoEmpleado(emp),
        emp.cargo,
        emp.centro_costos,
        emp.centro_costo,
        emp.area
      ].filter(Boolean).join(" "));

      return !filtro || textoBusqueda.includes(filtro);
    })
    .sort((a, b) => obtenerNombreEmpleado(a).localeCompare(obtenerNombreEmpleado(b), "es"));
}

function renderListaEmpleados(empleados) {
  const tbody = document.getElementById("listaEmpleados");
  tbody.innerHTML = "";

  if (!empleados.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted">
          No se encontraron empleados de A&B / Cocina.
        </td>
      </tr>
    `;
    return;
  }

  empleados.forEach((emp) => {
    const nombre = obtenerNombreEmpleado(emp);
    const documento = obtenerDocumentoEmpleado(emp);
    const centro = emp.centro_costos || emp.centro_costo || emp.area || "";
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td><div class="fw-semibold">${escaparHtmlCocina(nombre)}</div></td>
      <td>${escaparHtmlCocina(documento)}</td>
      <td>${escaparHtmlCocina(emp.cargo || "")}</td>
      <td>${escaparHtmlCocina(centro)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-success">Agregar</button>
      </td>
    `;

    tr.querySelector("button").onclick = async () => {
      await agregarEmpleadoCronograma(emp);
    };

    tbody.appendChild(tr);
  });
}

function obtenerNombreEmpleado(emp) {
  const nombres = String(emp.nombres || "").trim();
  const apellidos = String(emp.apellidos || "").trim();

  if (nombres || apellidos) {
    return `${nombres} ${apellidos}`.trim();
  }

  return (
    emp.nombre ||
    emp.nombre_completo ||
    emp.empleado ||
    emp.full_name ||
    ""
  );
}

function obtenerDocumentoEmpleado(emp) {
  return String(
    emp.cedula ||
    emp.documento ||
    emp.identificacion ||
    emp.numero_documento ||
    ""
  );
}

async function agregarEmpleadoCronograma(emp) {
  const empleadoId = emp.id;
  const nombre = obtenerNombreEmpleado(emp);
  const documento = obtenerDocumentoEmpleado(emp);
  const areaSeleccionadaManual = document.getElementById("empleadoAreaAgregar").value;
  const tipoPersonal = document.getElementById("empleadoTipoAgregar").value;

  if (!empleadoId || !nombre) {
    alert("El empleado no tiene datos suficientes para agregarse.");
    return;
  }

  const areaSugerida = sugerirAreaOperativaEmpleado(emp);
  const areaId = areaSeleccionadaManual || areaSugerida?.id || "";

  if (!areaId) {
    alert("No fue posible detectar el área. Selecciona manualmente el área operativa antes de agregar el empleado.");
    return;
  }

  const area = obtenerAreaPorId(areaId);

  const { data: existente, error: errorConsulta } = await supabase
    .from("cocina_cronograma_personal")
    .select("id")
    .eq("empleado_id", empleadoId)
    .eq("activo", true)
    .maybeSingle();

  if (errorConsulta) {
    console.error("Error validando empleado existente:", errorConsulta);
    alert("No se pudo validar si el empleado ya existe en el cronograma.");
    return;
  }

  if (existente) {
    alert("Este empleado ya está agregado al cronograma.");
    return;
  }

  const { error } = await supabase
    .from("cocina_cronograma_personal")
    .insert({
      empleado_id: empleadoId,
      nombre_visible: nombre,
      documento,
      cargo: emp.cargo || "",
      tipo_personal: tipoPersonal,
      area_cocina_id: areaId,
      area_cocina: area?.nombre || null,
      observacion_operativa: null,
      creado_por: obtenerUsuarioId(),
      activo: true
    });

  if (error) {
    console.error("Error agregando empleado:", error);
    alert("No se pudo agregar el empleado al cronograma.");
    return;
  }

  await recargar();
  renderListaEmpleados(filtrarEmpleadosModal());
}

// ======================================================
// CÓDIGOS DE TURNO
// ======================================================
async function abrirModalCodigos() {
  if (!puedeAdministrarCocina()) {
    alert("No tienes permisos para gestionar códigos.");
    return;
  }

  limpiarFormularioCodigo();
  await cargarCodigos();
  renderCodigos();
  abrirModal("modalCodigos");
}

function limpiarFormularioCodigo() {
  document.getElementById("codigoNuevo").value = "";
  document.getElementById("codigoDescripcion").value = "";
  document.getElementById("codigoInicio").value = "";
  document.getElementById("codigoFin").value = "";
  document.getElementById("codigoColor").value = "#0d6efd";
}

async function guardarCodigo() {
  const codigo = document.getElementById("codigoNuevo").value.trim().toUpperCase();
  const descripcion = document.getElementById("codigoDescripcion").value.trim();
  const horaInicio = document.getElementById("codigoInicio").value || null;
  const horaFin = document.getElementById("codigoFin").value || null;
  const color = document.getElementById("codigoColor").value || "#0d6efd";

  if (!codigo) {
    alert("El código es obligatorio.");
    return;
  }

  const { error } = await supabase
    .from("cocina_codigos_turno")
    .upsert({
      codigo,
      descripcion,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      color,
      activo: true
    }, {
      onConflict: "codigo"
    });

  if (error) {
    console.error("Error guardando código:", error);
    alert("No se pudo guardar el código.");
    return;
  }

  limpiarFormularioCodigo();
  await cargarCodigos();
  renderCodigos();
  renderTabla();
}

function renderCodigos() {
  const tbody = document.getElementById("listaCodigos");
  tbody.innerHTML = "";

  if (!codigos.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted">
          No hay códigos registrados.
        </td>
      </tr>
    `;
    return;
  }

  codigos.forEach((codigo) => {
    const tr = document.createElement("tr");

    const horario =
      codigo.hora_inicio && codigo.hora_fin
        ? `${String(codigo.hora_inicio).substring(0, 5)} - ${String(codigo.hora_fin).substring(0, 5)}`
        : "Sin horario";

    tr.innerHTML = `
      <td>
        <span class="badge" style="background:${codigo.color || "#0d6efd"}">
          ${codigo.codigo}
        </span>
      </td>
      <td>${codigo.descripcion || ""}</td>
      <td>${horario}</td>
      <td>${codigo.activo ? "Activo" : "Inactivo"}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ======================================================
// UTILIDADES
// ======================================================
function abrirModal(idModal) {
  const modalElement = document.getElementById(idModal);
  const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
  modal.show();
}

function cerrarModal(idModal) {
  const modalElement = document.getElementById(idModal);

  if (document.activeElement) {
    document.activeElement.blur();
  }

  const modal = bootstrap.Modal.getInstance(modalElement);

  if (modal) {
    modal.hide();
  }
}

function pintarErrorInicial(error) {
  const body = document.getElementById("bodyTabla");

  if (!body) return;

  body.innerHTML = `
    <tr>
      <td colspan="10" class="text-center text-danger p-4">
        No se pudo cargar Cocina Chef.<br>
        <small>${error.message || error}</small>
      </td>
    </tr>
  `;
}

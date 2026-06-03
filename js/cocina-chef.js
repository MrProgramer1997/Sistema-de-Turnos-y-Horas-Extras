// ======================================================
// COCINA CHEF - JS COMPLETO
// Integrado al cliente Supabase central del proyecto
// Filtro estricto A&B + botón quitar + tabla operativa
// ======================================================

import { supabase } from "../supabase/supabaseClient.js";

let fechaBase = new Date();
let semana = [];
let personal = [];
let codigos = [];
let programacion = [];
let areas = [];
let empleadosCache = [];
let selectedCelda = null;
let sesionActual = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    sesionActual = obtenerSesion();

    document.getElementById("fechaBase").valueAsDate = fechaBase;

    configurarEventos();

    generarSemana();

    await cargarAreas();
    await cargarCodigos();
    await cargarPersonal();
    await cargarProgramacion();

    pintarSelectAreas();
    renderTabla();
    renderKPIs();
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

  pintarSelectAreas();
  renderTabla();
  renderKPIs();
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
// SELECTS ÁREA
// ======================================================
function pintarSelectAreas() {
  llenarSelectArea("filtroArea", "Todas las áreas");
  llenarSelectArea("extArea", "Seleccione área");
  llenarSelectArea("empleadoAreaAgregar", "Autodetectar área");
  llenarSelectArea("turnoArea", "Usar área del colaborador");
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
// RENDER TABLA
// ======================================================
function renderTabla() {
  const header = document.getElementById("headerDias");
  const body = document.getElementById("bodyTabla");
  const personalFiltrado = obtenerPersonalFiltrado();

  header.innerHTML = `
    <th class="sticky-col area-col">Área</th>
    <th class="sticky-col colaborador-col">Colaborador</th>
    <th class="acciones-col">Acción</th>
  `;

  body.innerHTML = "";

  semana.forEach((d) => {
    const th = document.createElement("th");
    th.innerHTML = `
      <div>${nombreDia(d)}</div>
      <div>${d.getDate()}</div>
    `;
    header.appendChild(th);
  });

  if (!personalFiltrado.length) {
    body.innerHTML = `
      <tr>
        <td colspan="10" class="text-center text-muted p-4">
          No hay personal para los filtros seleccionados.
        </td>
      </tr>
    `;
    return;
  }

  personalFiltrado.forEach((persona) => {
    const tr = document.createElement("tr");

    const tdArea = document.createElement("td");
    tdArea.className = "area-cell";
    tdArea.innerText = obtenerNombreAreaPersona(persona);
    tr.appendChild(tdArea);

    const tdNombre = document.createElement("td");
    tdNombre.className = "colaborador-cell";
    tdNombre.innerHTML = `
      <div class="fw-semibold">${persona.nombre_visible || ""}</div>
      <small class="text-muted">${persona.cargo || persona.tipo_personal || ""}</small>
    `;
    tr.appendChild(tdNombre);

    const tdAccion = document.createElement("td");
    tdAccion.className = "acciones-cell";
    tdAccion.innerHTML = `
      <button class="btn btn-sm btn-outline-danger btn-quitar-persona" title="Quitar del cronograma">
        Quitar
      </button>
    `;

    tdAccion.querySelector("button").onclick = async (event) => {
      event.stopPropagation();
      await quitarColaboradorCronograma(persona);
    };

    tr.appendChild(tdAccion);

    semana.forEach((d) => {
      const fecha = formatearFechaISO(d);
      const td = document.createElement("td");
      td.className = "turno-vacio";

      const registro = programacion.find(
        (r) => r.cronograma_personal_id === persona.id && r.fecha === fecha
      );

      if (registro) {
        const codigo = codigos.find((c) => c.codigo === registro.codigo_turno);
        const areaTurno = obtenerAreaPorId(registro.area_cocina_id);

        td.innerHTML = `
          <div class="turno-codigo">${registro.codigo_turno}</div>
          ${registro.evento ? `<small class="turno-evento">${registro.evento}</small>` : ""}
        `;

        td.classList.remove("turno-vacio");
        td.classList.add("turno-cell");

        if (codigo?.color) {
          td.style.backgroundColor = codigo.color;
        }

        td.title = [
          codigo?.descripcion || registro.codigo_turno,
          codigo?.hora_inicio && codigo?.hora_fin
            ? `${String(codigo.hora_inicio).substring(0, 5)} - ${String(codigo.hora_fin).substring(0, 5)}`
            : "",
          areaTurno?.nombre ? `Área: ${areaTurno.nombre}` : "",
          registro.evento ? `Evento: ${registro.evento}` : "",
          registro.observacion ? `Obs: ${registro.observacion}` : ""
        ].filter(Boolean).join(" | ");
      } else {
        td.innerText = "+";
        td.title = "Asignar turno";
      }

      td.onclick = () => abrirModalTurno(persona, fecha, registro);
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

  const select = document.getElementById("selectTurno");
  const obs = document.getElementById("obsTurno");
  const btnEliminar = document.getElementById("eliminarTurno");
  const turnoArea = document.getElementById("turnoArea");
  const turnoEvento = document.getElementById("turnoEvento");
  const info = document.getElementById("infoTurnoSeleccionado");

  select.innerHTML = "";

  if (!codigos.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No hay códigos activos";
    select.appendChild(opt);
  }

  codigos.forEach((codigo) => {
    const opt = document.createElement("option");
    opt.value = codigo.codigo;

    const hora =
      codigo.hora_inicio && codigo.hora_fin
        ? ` (${String(codigo.hora_inicio).substring(0, 5)} - ${String(codigo.hora_fin).substring(0, 5)})`
        : "";

    opt.textContent = `${codigo.codigo} - ${codigo.descripcion || ""}${hora}`;
    select.appendChild(opt);
  });

  pintarSelectAreas();

  info.innerHTML = `
    <strong>${persona.nombre_visible}</strong><br>
    <span>${formatearFechaCorta(new Date(fecha + "T00:00:00"))}</span><br>
    <small>Área base: ${obtenerNombreAreaPersona(persona)}</small>
  `;

  if (registro) {
    select.value = registro.codigo_turno;
    obs.value = registro.observacion || "";
    turnoEvento.value = registro.evento || "";
    turnoArea.value = registro.area_cocina_id || "";
    btnEliminar.style.display = "inline-block";
  } else {
    obs.value = "";
    turnoEvento.value = "";
    turnoArea.value = "";
    btnEliminar.style.display = "none";
  }

  abrirModal("modalTurno");
}

// ======================================================
// GUARDAR TURNO
// ======================================================
async function guardarTurno() {
  if (!selectedCelda) return;

  const codigo = document.getElementById("selectTurno").value;
  const observacion = document.getElementById("obsTurno").value.trim();
  const evento = document.getElementById("turnoEvento").value.trim();
  const areaIdSeleccionada = document.getElementById("turnoArea").value;

  if (!codigo) {
    alert("Selecciona un código de turno.");
    return;
  }

  const areaFinalId = areaIdSeleccionada || selectedCelda.persona.area_cocina_id || null;
  const areaFinal = obtenerAreaPorId(areaFinalId);

  const payload = {
    cronograma_personal_id: selectedCelda.personaId,
    fecha: selectedCelda.fecha,
    codigo_turno: codigo,
    observacion,
    evento,
    area_cocina_id: areaFinalId,
    area_cocina: areaFinal?.nombre || selectedCelda.persona.area_cocina || null,
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
    alert("No se pudo guardar el turno.");
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

  empleadosCache = data || [];
}

function filtrarEmpleadosModal() {
  const filtro = document.getElementById("buscarEmpleado").value.trim().toLowerCase();

  const palabrasPermitidas = [
    "alimentos",
    "bebidas",
    "ayb",
    "a&b",
    "cocina",
    "chef",
    "cocinero",
    "cocinera",
    "mesero",
    "mesera",
    "barista",
    "steward",
    "cajero",
    "cajera",
    "auxiliar cocina",
    "auxiliar de cocina",
    "auxiliar punto",
    "auxiliar punto de venta",
    "restaurante",
    "rialto",
    "hoyo 19",
    "hoyo19",
    "piscina",
    "tenis",
    "porcionamiento",
    "eventos"
  ];

  const palabrasBloqueadas = [
    "infraestructura",
    "mantenimiento",
    "bienestar",
    "administracion",
    "administrativa",
    "contabilidad",
    "compras",
    "cartera",
    "seguridad",
    "sistemas",
    "oficios varios",
    "servicios generales",
    "operaciones locativo",
    "auxiliar mantenimiento",
    "jardinero",
    "jardineria",
    "aseo general"
  ];

  return empleadosCache
    .filter((emp) => {
      const nombre = obtenerNombreEmpleado(emp).toLowerCase();
      const documento = obtenerDocumentoEmpleado(emp).toLowerCase();
      const cargo = String(emp.cargo || "").toLowerCase();
      const centroCostos = String(emp.centro_costos || emp.centro_costo || "").toLowerCase();
      const area = String(emp.area || "").toLowerCase();
      const subarea = String(emp.subarea || "").toLowerCase();

      const textoCompleto = `
        ${nombre}
        ${documento}
        ${cargo}
        ${centroCostos}
        ${area}
        ${subarea}
      `.toLowerCase();

      const permitido = palabrasPermitidas.some((p) => textoCompleto.includes(p));
      const bloqueado = palabrasBloqueadas.some((p) => textoCompleto.includes(p));
      const coincideFiltro = !filtro || textoCompleto.includes(filtro);

      return permitido && !bloqueado && coincideFiltro;
    })
    .sort((a, b) => obtenerNombreEmpleado(a).localeCompare(obtenerNombreEmpleado(b)));
}

function renderListaEmpleados(empleados) {
  const tbody = document.getElementById("listaEmpleados");
  tbody.innerHTML = "";

  if (!empleados.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted">
          No se encontraron empleados operativos A&B.
        </td>
      </tr>
    `;
    return;
  }

  empleados.forEach((emp) => {
    const nombre = obtenerNombreEmpleado(emp);
    const documento = obtenerDocumentoEmpleado(emp);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <div class="fw-semibold">${nombre}</div>
      </td>
      <td>${documento || ""}</td>
      <td>${emp.cargo || ""}</td>
      <td>${emp.centro_costos || emp.centro_costo || emp.area || ""}</td>
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

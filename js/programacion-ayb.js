import { supabase } from "../supabase/supabaseClient.js";

const AREA_AYB = "ALIMENTOS Y BEBIDAS";

const SUBAREAS_AYB = {
  "Rialto": { codigo: "R", horario: "Viernes, sábado, domingo y festivos 11:00am a 5:00pm" },
  "Hoyo 19": { codigo: "H", horario: "Martes a sábado 6:00am a 8:00pm | Domingos y festivos 6:00am a 7:00pm" },
  "Bar Deportivo": { codigo: "BD", horario: "Miércoles y jueves 1:00pm a 9:00pm | Viernes 12:00m a 11:00pm | Sábado 11:00am a 11:00pm | Domingo 11:00am a 7:00pm" },
  "Tenis": { codigo: "T", horario: "Martes a sábado 6:00am a 8:00pm | Domingo y festivos 6:00am a 6:00pm" },
  "Samanes": { codigo: "S", horario: "Martes y miércoles 12:00m a 4:00pm | Jueves, viernes y sábado 12:00m a 9:00pm | Domingo y festivos 12:00m a 4:00pm" },
  "Piscina": { codigo: "P", horario: "Sábado, domingo y festivos 10:00am a 7:00pm" },
  "Café": { codigo: "C", horario: "Martes a domingo y festivos 7:00am a 7:00pm" },
  "Carro Bar": { codigo: "CB", horario: "Horario variable según operación" },
  "Heladería": { codigo: "HEL", horario: "Horario variable según operación" },
  "Mesa y Bar": { codigo: "MB", horario: "Servicio de meseros martes a viernes 11:00am a 7:00pm" },
  "Eventos": { codigo: "EV", horario: "Sujeto a operación y eventos" },
  "Cocina": { codigo: "COC", horario: "Horario sujeto a operación" }
};

const TURNOS_CATALOGO = {
  "1": { label: "1 · 5:30am - 1:30pm", inicio: "05:30", fin: "13:30" },
  "2": { label: "2 · 6:00am - 2:00pm", inicio: "06:00", fin: "14:00" },
  "3": { label: "3 · 7:00am - 3:00pm", inicio: "07:00", fin: "15:00" },
  "4": { label: "4 · 8:00am - 4:00pm", inicio: "08:00", fin: "16:00" },
  "5": { label: "5 · 9:00am - 5:00pm", inicio: "09:00", fin: "17:00" },
  "6": { label: "6 · 10:00am - 6:00pm", inicio: "10:00", fin: "18:00" },
  "7": { label: "7 · 11:00am - 7:00pm", inicio: "11:00", fin: "19:00" },
  "8": { label: "8 · 12:00pm - 8:00pm", inicio: "12:00", fin: "20:00" },
  "9": { label: "9 · 1:00pm - 9:00pm", inicio: "13:00", fin: "21:00" },
  "10": { label: "10 · 2:00pm - 10:00pm", inicio: "14:00", fin: "22:00" },
  "11": { label: "11 · 3:00pm - 11:00pm", inicio: "15:00", fin: "23:00" }
};

const NOVEDADES_LABELS = {
  VAC: "Vacaciones",
  INC: "Incapacidad",
  F: "Día de la familia",
  LR: "Licencia no remunerada",
  NC: "No compensatorio",
  SP: "Suspensión",
  CITA: "Cita",
  COMP: "Compensatorio",
  ELECCION: "Elección",
  PASA: "Pasa a otro punto"
};

const HORA_INICIO_NOCTURNO = 19 * 60;
const HORA_FIN_NOCTURNO = 6 * 60;
const DESCANSO_ESTANDAR_HORAS = 0.5;

let semanaActual = [];
let fechaInicioSemana = null;
let sesionActual = null;
let modalAsignacionAyb = null;
let modalDetalleRegistroAyb = null;
let empleadosAyb = [];
let modoEdicion = false;
let turnoCopiadoAyb = null;
let registrosSemanaAyb = [];
let festivosSemana = [];
let filtrosMatrizAyb = { busqueda: "", cargo: "", subarea: "", estado: "todos" };

document.addEventListener("DOMContentLoaded", async () => {
  sesionActual = JSON.parse(localStorage.getItem("ccp_sesion") || "null");
  if (!sesionActual) {
    window.location.href = "login.html";
    return;
  }

  protegerModulo(sesionActual);
  aplicarPermisosNavegacion(sesionActual);
  configurarCerrarSesion();
  cargarEncabezadoUsuario(sesionActual);

  fechaInicioSemana = obtenerInicioSemanaOperativa(new Date());
  semanaActual = construirSemana(fechaInicioSemana);

  renderEncabezadosSemana();
  renderTextosSemana();
  renderOpcionesTurnos();
  inicializarModales();
  configurarBotones();
  configurarFormulario();
  configurarTurnoPartido();
  configurarTipoRegistro();
  configurarTurnosAutollenado();
  configurarInfoSubarea();
  configurarFiltrosMatrizAyb();
  cargarTurnoCopiadoDesdeMemoria();
  configurarAccionesGlobales();

  await cargarEmpleadosParaBusqueda();
  await cargarProgramacionAyb();
});

function inicializarModales() {
  const asignacion = document.getElementById("modalAsignacionAyb");
  const detalle = document.getElementById("modalDetalleRegistroAyb");
  if (asignacion) modalAsignacionAyb = new bootstrap.Modal(asignacion);
  if (detalle) modalDetalleRegistroAyb = new bootstrap.Modal(detalle);
}

function protegerModulo(sesion) {
  const moduloActual = "programacion-ayb";
  if (sesion.puede_ver_todo === true) return;
  if (!Array.isArray(sesion.modulos_permitidos) || !sesion.modulos_permitidos.includes(moduloActual)) {
    alert("No tienes permisos para acceder a Programación A&B.");
    window.location.href = "dashboard.html";
  }
}

function aplicarPermisosNavegacion(sesion) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.includes("login.html") || sesion.puede_ver_todo === true) return;
    if (!tieneAccesoModulo(sesion, obtenerClaveModulo(href))) link.style.display = "none";
  });
}

function tieneAccesoModulo(sesion, modulo) {
  if (sesion.puede_ver_todo === true) return true;
  return Array.isArray(sesion.modulos_permitidos) && sesion.modulos_permitidos.includes(modulo);
}

function obtenerClaveModulo(href) {
  if (href.includes("dashboard")) return "dashboard";
  if (href.includes("empleados")) return "empleados";
  if (href.includes("programacion-ayb")) return "programacion-ayb";
  if (href.includes("programacion-administrativo")) return "programacion-administrativo";
  if (href.includes("programacion-operaciones")) return "programacion-operaciones";
  if (href.includes("mis-turnos-ayb")) return "mis-turnos-ayb";
  if (href.includes("mis-turnos-administrativo")) return "mis-turnos-administrativo";
  if (href.includes("mis-turnos-operaciones")) return "mis-turnos-operaciones";
  if (href.includes("usuarios")) return "usuarios";
  if (href.includes("reportes")) return "reportes";
  if (href.includes("configuracion")) return "configuracion";
  return href;
}

function configurarCerrarSesion() {
  document.querySelectorAll('.nav-link[href="login.html"]').forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("ccp_sesion");
      window.location.href = "login.html";
    });
  });
}

function cargarEncabezadoUsuario(sesion) {
  const subtitulo = document.getElementById("subtituloAyb");
  if (!subtitulo) return;
  const nombre = sesion.nombre_completo || "Usuario";
  const cargo = sesion.cargo || "Sin cargo";
  subtitulo.textContent = `Matriz semanal por empleado | Usuario: ${nombre} | Cargo: ${cargo} | Rol: ${traducirRol(sesion.rol)}`;
}

function traducirRol(rol) {
  const mapa = {
    admin: "Administrador", gerencia: "Gerencia", bienestar: "Bienestar Institucional",
    direccion_financiera: "Dirección Administrativa y Financiera", ayb: "Alimentos y Bebidas",
    servicios_generales: "Servicios Generales", empleado: "Empleado"
  };
  return mapa[texto(rol).toLowerCase()] || rol || "Sin rol";
}

function obtenerInicioSemanaOperativa(fechaBase) {
  const fecha = new Date(fechaBase);
  const diasDesdeMartes = (fecha.getDay() + 5) % 7;
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() - diasDesdeMartes);
  return fecha;
}

function construirSemana(inicio) {
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date(inicio);
    fecha.setDate(inicio.getDate() + i);
    return { fecha: formatearFechaISO(fecha), nombre: obtenerNombreDia(fecha), etiqueta: `${obtenerNombreDia(fecha)} ${fecha.getDate()}` };
  });
}

function formatearFechaISO(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function obtenerNombreDia(fecha) {
  return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][fecha.getDay()];
}

function obtenerNombreMes(index) {
  return ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][index];
}

function renderEncabezadosSemana() {
  semanaActual.forEach((dia, index) => {
    const th = document.getElementById(`thDia${index + 1}`);
    if (th) th.textContent = dia.etiqueta;
  });
}

function renderTextosSemana() {
  if (!semanaActual.length) return;
  const primera = new Date(`${semanaActual[0].fecha}T00:00:00`);
  const ultima = new Date(`${semanaActual[6].fecha}T00:00:00`);
  const semana = document.getElementById("textoSemanaAyb");
  const mes = document.getElementById("textoMesAnioAyb");
  if (semana) semana.textContent = `${primera.getDate()} al ${ultima.getDate()} de ${obtenerNombreMes(ultima.getMonth())} de ${ultima.getFullYear()}`;
  if (mes) mes.textContent = `${obtenerNombreMes(ultima.getMonth())} ${ultima.getFullYear()}`;
}

function renderOpcionesTurnos() {
  const opciones = `<option value="">Seleccione</option>` + Object.entries(TURNOS_CATALOGO)
    .map(([codigo, data]) => `<option value="${codigo}">${escaparHtml(data.label)}</option>`).join("");
  const select1 = document.getElementById("turnoAyb");
  const select2 = document.getElementById("turno2Ayb");
  if (select1) select1.innerHTML = opciones;
  if (select2) select2.innerHTML = opciones;
}

function configurarBotones() {
  document.getElementById("btnSemanaAnterior")?.addEventListener("click", async () => {
    fechaInicioSemana.setDate(fechaInicioSemana.getDate() - 7);
    await cambiarSemanaVisible();
  });
  document.getElementById("btnSemanaActual")?.addEventListener("click", async () => {
    fechaInicioSemana = obtenerInicioSemanaOperativa(new Date());
    await cambiarSemanaVisible();
  });
  document.getElementById("btnSemanaSiguiente")?.addEventListener("click", async () => {
    fechaInicioSemana.setDate(fechaInicioSemana.getDate() + 7);
    await cambiarSemanaVisible();
  });
  document.getElementById("btnNuevaAsignacion")?.addEventListener("click", () => abrirModalNuevaAsignacion());
  document.getElementById("btnPdfGeneral")?.addEventListener("click", generarPdfGeneralAyb);
  document.getElementById("btnPdfEmpleado")?.addEventListener("click", generarPdfEmpleadoAyb);
  document.getElementById("btnLimpiarTurnoCopiadoAyb")?.addEventListener("click", limpiarTurnoCopiadoAyb);
}

async function cambiarSemanaVisible() {
  semanaActual = construirSemana(fechaInicioSemana);
  renderEncabezadosSemana();
  renderTextosSemana();
  await cargarProgramacionAyb();
}

function configurarFormulario() {
  document.getElementById("formAsignacionAyb")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await guardarAsignacionAyb();
  });
  ["input", "change", "blur"].forEach((evento) => {
    document.getElementById("busquedaEmpleadoAyb")?.addEventListener(evento, seleccionarEmpleadoDesdeBusqueda);
  });
  ["input", "change"].forEach((evento) => {
    document.getElementById("cedulaEmpleadoAyb")?.addEventListener(evento, validarNovedadEmpleadoAyb);
    document.getElementById("fechaAyb")?.addEventListener(evento, validarNovedadEmpleadoAyb);
  });
}

function configurarTurnoPartido() {
  const check = document.getElementById("checkTurnoPartido");
  const bloque = document.getElementById("bloqueTurnoPartido");
  if (!check || !bloque) return;
  check.addEventListener("change", () => {
    bloque.classList.toggle("d-none", !check.checked);
    if (!check.checked) {
      ["subarea2Ayb", "turno2Ayb", "horaInicio2Ayb", "horaFin2Ayb"].forEach((id) => {
        document.getElementById(id).value = "";
      });
    }
  });
}

function configurarTipoRegistro() {
  const tipo = document.getElementById("tipoRegistroAyb");
  if (!tipo) return;
  tipo.addEventListener("change", actualizarVistaTipoRegistro);
  actualizarVistaTipoRegistro();
}

function actualizarVistaTipoRegistro() {
  const esNovedad = document.getElementById("tipoRegistroAyb")?.value === "novedad";
  const subarea = document.getElementById("subareaAyb");
  document.getElementById("bloqueTurnoNormal")?.classList.toggle("d-none", esNovedad);
  document.getElementById("bloqueNovedad")?.classList.toggle("d-none", !esNovedad);
  document.getElementById("bloqueSubareaAyb")?.classList.toggle("d-none", esNovedad);
  document.getElementById("bloqueInfoSubareaAyb")?.classList.toggle("d-none", esNovedad);
  if (subarea) subarea.required = !esNovedad;
  if (esNovedad) {
    if (subarea) subarea.value = "";
    ["turnoAyb", "horaInicioAyb", "horaFinAyb", "subarea2Ayb", "turno2Ayb", "horaInicio2Ayb", "horaFin2Ayb"].forEach((id) => {
      const campo = document.getElementById(id);
      if (campo) campo.value = "";
    });
    const partido = document.getElementById("checkTurnoPartido");
    if (partido) partido.checked = false;
    document.getElementById("bloqueTurnoPartido")?.classList.add("d-none");
  }
  actualizarInfoSubarea();
}

function configurarTurnosAutollenado() {
  document.getElementById("turnoAyb")?.addEventListener("change", (e) => aplicarHorarioTurno(e.target.value, "horaInicioAyb", "horaFinAyb"));
  document.getElementById("turno2Ayb")?.addEventListener("change", (e) => aplicarHorarioTurno(e.target.value, "horaInicio2Ayb", "horaFin2Ayb"));
}

function aplicarHorarioTurno(codigo, idInicio, idFin) {
  const turno = TURNOS_CATALOGO[codigo];
  const inicio = document.getElementById(idInicio);
  const fin = document.getElementById(idFin);
  if (!inicio || !fin) return;
  inicio.value = turno?.inicio || "";
  fin.value = turno?.fin || "";
}

function configurarInfoSubarea() {
  document.getElementById("subareaAyb")?.addEventListener("change", actualizarInfoSubarea);
  actualizarInfoSubarea();
}

function actualizarInfoSubarea() {
  const info = document.getElementById("infoHorarioSubarea");
  const subarea = document.getElementById("subareaAyb")?.value || "";
  if (!info) return;
  info.textContent = !subarea || !SUBAREAS_AYB[subarea]
    ? "Selecciona una subárea para ver el horario guía."
    : `${SUBAREAS_AYB[subarea].codigo} · ${subarea} | Horario guía: ${SUBAREAS_AYB[subarea].horario}`;
}

function configurarFiltrosMatrizAyb() {
  const actualizar = () => {
    filtrosMatrizAyb = {
      busqueda: texto(document.getElementById("inputFiltroEmpleadoMatrizAyb")?.value).toLowerCase(),
      cargo: texto(document.getElementById("selectFiltroCargoMatrizAyb")?.value),
      subarea: texto(document.getElementById("selectFiltroSubareaMatrizAyb")?.value),
      estado: texto(document.getElementById("selectFiltroEstadoMatrizAyb")?.value) || "todos"
    };
    renderTablaProgramacionAyb(registrosSemanaAyb);
  };
  document.getElementById("inputFiltroEmpleadoMatrizAyb")?.addEventListener("input", actualizar);
  document.getElementById("selectFiltroCargoMatrizAyb")?.addEventListener("change", actualizar);
  document.getElementById("selectFiltroSubareaMatrizAyb")?.addEventListener("change", actualizar);
  document.getElementById("selectFiltroEstadoMatrizAyb")?.addEventListener("change", actualizar);
  document.getElementById("btnLimpiarFiltrosMatrizAyb")?.addEventListener("click", () => {
    document.getElementById("inputFiltroEmpleadoMatrizAyb").value = "";
    document.getElementById("selectFiltroCargoMatrizAyb").value = "";
    document.getElementById("selectFiltroSubareaMatrizAyb").value = "";
    document.getElementById("selectFiltroEstadoMatrizAyb").value = "todos";
    actualizar();
  });
}

async function cargarEmpleadosParaBusqueda() {
  try {
    /*
      La consulta se limita por área/centro de costos. No se filtra por cargo,
      porque cargos como AUXILIAR, LÍDER o SERVICIO existen en otras áreas.
    */
    let respuesta = await supabase.from("empleados").select("*")
      .or("centro_costos.ilike.%ALIMENTOS%,centro_costos.ilike.%BEBIDAS%,centro_costos.ilike.%A&B%,centro_costos.ilike.%AYB%,centro_costos.ilike.%COCINA%,area.ilike.%ALIMENTOS%,area.ilike.%BEBIDAS%,area.ilike.%A&B%,area.ilike.%AYB%,area.ilike.%COCINA%");
    if (respuesta.error) respuesta = await supabase.from("empleados").select("*");
    if (respuesta.error) throw respuesta.error;
    empleadosAyb = (respuesta.data || []).filter(esEmpleadoAybValido).map(normalizarEmpleado)
      .filter((emp) => emp.cedula && emp.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  } catch (error) {
    console.error("Error cargando empleados A&B:", error);
    empleadosAyb = [];
  }
  renderListaEmpleados();
  renderSelectEmpleadoPdf();
  renderSelectCargoFiltro();
}

function normalizarEmpleado(emp) {
  const nombre = texto(emp.nombre_completo) || `${texto(emp.nombres)} ${texto(emp.apellidos)}`.trim();
  return { cedula: texto(emp.cedula), nombre, cargo: texto(emp.cargo), area: texto(emp.area || emp.centro_costos), raw: emp };
}

function esEmpleadoAybValido(emp) {
  const area = normalizarTextoFiltroAyb(emp.area);
  const centro = normalizarTextoFiltroAyb(emp.centro_costos);
  const dependencia = `${area} ${centro}`;

  /*
    Regla de seguridad funcional:
    el empleado solo entra a Programación A&B cuando su área o centro de costos
    identifica A&B. El cargo no habilita acceso, porque se repite en otras áreas.
  */
  const clavesAyb = [
    "ALIMENTOS",
    "BEBIDAS",
    "ALIMENTOS Y BEBIDAS",
    "ALIMENTOS & BEBIDAS",
    "A&B",
    "AYB",
    "COCINA"
  ];

  return clavesAyb.some((clave) => dependencia.includes(clave));
}

function normalizarTextoFiltroAyb(valor) {
  return texto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function renderListaEmpleados() {
  const lista = document.getElementById("listaEmpleadosAyb");
  if (!lista) return;
  lista.innerHTML = empleadosAyb.map((emp) => `<option value="${escaparHtml(`${emp.cedula} - ${emp.nombre}${emp.cargo ? ` - ${emp.cargo}` : ""}`)}"></option>`).join("");
}

function renderSelectEmpleadoPdf() {
  const select = document.getElementById("selectEmpleadoPdfAyb");
  if (!select) return;
  select.innerHTML = `<option value="">Seleccione</option>` + empleadosAyb.map((emp) =>
    `<option value="${escaparHtml(emp.cedula)}">${escaparHtml(emp.nombre)}${emp.cargo ? ` - ${escaparHtml(emp.cargo)}` : ""}</option>`
  ).join("");
}

function renderSelectCargoFiltro() {
  const select = document.getElementById("selectFiltroCargoMatrizAyb");
  if (!select) return;
  const valor = select.value;
  const cargos = [...new Set(empleadosAyb.map((e) => e.cargo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  select.innerHTML = `<option value="">Todos los cargos</option>` + cargos.map((cargo) => `<option value="${escaparHtml(cargo)}">${escaparHtml(cargo)}</option>`).join("");
  if (cargos.includes(valor)) select.value = valor;
}

function seleccionarEmpleadoDesdeBusqueda() {
  const valor = texto(document.getElementById("busquedaEmpleadoAyb")?.value).toLowerCase();
  if (!valor) return;
  const encontrado = empleadosAyb.find((emp) => `${emp.cedula} - ${emp.nombre} - ${emp.cargo}`.toLowerCase().includes(valor) || emp.cedula.toLowerCase() === valor);
  if (encontrado) precargarEmpleadoFormulario(encontrado, document.getElementById("fechaAyb")?.value || "");
}

function precargarEmpleadoFormulario(empleado, fecha) {
  document.getElementById("cedulaEmpleadoAyb").value = empleado.cedula || "";
  document.getElementById("nombreEmpleadoAyb").value = empleado.nombre || "";
  document.getElementById("cargoEmpleadoAyb").value = empleado.cargo || "";
  document.getElementById("busquedaEmpleadoAyb").value = `${empleado.cedula || ""} - ${empleado.nombre || ""}${empleado.cargo ? ` - ${empleado.cargo}` : ""}`;
  if (fecha) document.getElementById("fechaAyb").value = fecha;
  validarNovedadEmpleadoAyb();
}

function abrirModalNuevaAsignacion(fecha = "", empleado = null, esNovedad = false) {
  modoEdicion = false;
  limpiarMensajesFormulario();
  limpiarFormularioAyb();
  document.getElementById("tituloModalAyb").textContent = esNovedad ? "Nueva novedad A&B" : "Nueva asignación A&B";
  document.getElementById("btnSubmitAsignacionAyb").textContent = "Guardar asignación";
  document.getElementById("tipoRegistroAyb").value = esNovedad ? "novedad" : "turno";
  document.getElementById("fechaAyb").value = fecha || semanaActual[0]?.fecha || "";
  actualizarVistaTipoRegistro();
  if (empleado) precargarEmpleadoFormulario(empleado, fecha);
  ocultarAlertaNovedadEmpleadoAyb();
  validarNovedadEmpleadoAyb();
  modalAsignacionAyb?.show();
}

function abrirModalEdicion(registro) {
  modoEdicion = true;
  limpiarMensajesFormulario();
  limpiarFormularioAyb();
  document.getElementById("tituloModalAyb").textContent = "Editar asignación A&B";
  document.getElementById("btnSubmitAsignacionAyb").textContent = "Guardar cambios";
  document.getElementById("registroIdAyb").value = registro.id || "";
  precargarEmpleadoFormulario({ cedula: registro.cedula, nombre: registro.nombre, cargo: registro.cargo }, registro.fecha);
  document.getElementById("observacionAyb").value = registro.observacion || "";
  document.getElementById("tipoRegistroAyb").value = registro.tipo_registro || "turno";

  if (registro.tipo_registro === "novedad") {
    document.getElementById("novedadCodigoAyb").value = registro.novedad_codigo || "";
    document.getElementById("novedadDescripcionAyb").value = registro.novedad_descripcion || "";
  } else {
    document.getElementById("subareaAyb").value = registro.subarea || "";
    document.getElementById("turnoAyb").value = registro.turno || "";
    document.getElementById("horaInicioAyb").value = registro.hora_inicio || "";
    document.getElementById("horaFinAyb").value = registro.hora_fin || "";
    document.getElementById("subarea2Ayb").value = registro.subarea_2 || "";
    document.getElementById("turno2Ayb").value = registro.turno_2 || "";
    document.getElementById("horaInicio2Ayb").value = registro.hora_inicio_2 || "";
    document.getElementById("horaFin2Ayb").value = registro.hora_fin_2 || "";
    const partido = Boolean(registro.subarea_2 || registro.turno_2 || registro.hora_inicio_2 || registro.hora_fin_2);
    document.getElementById("checkTurnoPartido").checked = partido;
    document.getElementById("bloqueTurnoPartido").classList.toggle("d-none", !partido);
  }
  actualizarVistaTipoRegistro();
  actualizarInfoSubarea();
  validarNovedadEmpleadoAyb();
  modalAsignacionAyb?.show();
}

function limpiarFormularioAyb() {
  document.getElementById("formAsignacionAyb")?.reset();
  document.getElementById("registroIdAyb").value = "";
  document.getElementById("cargoEmpleadoAyb").value = "";
  document.getElementById("checkTurnoPartido").checked = false;
  document.getElementById("bloqueTurnoPartido").classList.add("d-none");
  actualizarVistaTipoRegistro();
  actualizarInfoSubarea();
  ocultarAlertaNovedadEmpleadoAyb();
}

function ocultarAlertaNovedadEmpleadoAyb() {
  document.getElementById("alertaNovedadEmpleadoAyb")?.classList.add("d-none");
  const contenido = document.getElementById("textoNovedadEmpleadoAyb");
  if (contenido) contenido.textContent = "Este empleado tiene una novedad registrada para la fecha seleccionada.";
}

function formatearTipoNovedadBienestar(tipo) {
  return ({ incapacidad: "Incapacidad", calamidad: "Calamidad", permiso_no_remunerado: "Permiso no remunerado", dia_familia: "Día de la familia", dia_grado: "Día de grado", cumpleanos: "Cumpleaños", matrimonio: "Matrimonio", luto: "Luto", graduacion: "Graduación" })[tipo] || tipo || "Novedad";
}

function formatearFechaNovedad(fechaISO) {
  if (!fechaISO) return "";
  const fecha = new Date(`${fechaISO}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? fechaISO : fecha.toLocaleDateString("es-CO");
}

async function consultarNovedadesProgramacionAyb(cedula, fecha) {
  const { data, error } = await supabase.from("novedades_programacion").select("*")
    .eq("cedula", cedula).eq("estado", "activa").lte("fecha_inicio", fecha).gte("fecha_fin", fecha);
  if (error) { console.warn("No se pudo consultar novedades_programacion:", error.message); return []; }
  return (data || []).map((item) => ({ solicitud_id: item.solicitud_id || null, tipo: item.tipo_novedad, fecha_inicio: item.fecha_inicio, fecha_fin: item.fecha_fin, dias: item.dias }));
}

async function consultarSolicitudesBienestarAprobadasAyb(cedula, fecha) {
  const { data, error } = await supabase.from("solicitudes_empleado").select("*")
    .eq("cedula", cedula).in("estado", ["aprobada", "aplicada_programacion", "cerrada"]).lte("fecha_inicio", fecha).gte("fecha_fin", fecha);
  if (error) { console.warn("No se pudo consultar solicitudes_empleado aprobadas:", error.message); return []; }
  return (data || []).map((item) => ({ solicitud_id: item.id || null, tipo: item.tipo_solicitud, fecha_inicio: item.fecha_inicio, fecha_fin: item.fecha_fin, dias: item.dias_solicitados }));
}

async function validarNovedadEmpleadoAyb() {
  const cedula = texto(document.getElementById("cedulaEmpleadoAyb")?.value);
  const fecha = texto(document.getElementById("fechaAyb")?.value);
  const alerta = document.getElementById("alertaNovedadEmpleadoAyb");
  const contenido = document.getElementById("textoNovedadEmpleadoAyb");
  if (!alerta || !contenido || !cedula || !fecha) { ocultarAlertaNovedadEmpleadoAyb(); return; }

  try {
    const registros = await consultarNovedadesProgramacionAyb(cedula, fecha);
    const ids = new Set(registros.map((r) => texto(r.solicitud_id)).filter(Boolean));
    const solicitudes = (await consultarSolicitudesBienestarAprobadasAyb(cedula, fecha)).filter((r) => !r.solicitud_id || !ids.has(texto(r.solicitud_id)));
    const novedades = [...registros, ...solicitudes];
    if (!novedades.length) { ocultarAlertaNovedadEmpleadoAyb(); return; }
    contenido.textContent = `Revise antes de guardar: ${novedades.map((item) => `${formatearTipoNovedadBienestar(item.tipo)} (${formatearFechaNovedad(item.fecha_inicio)} a ${formatearFechaNovedad(item.fecha_fin)}${item.dias ? ` · ${item.dias} día(s)` : ""})`).join("; ")}.`;
    alerta.classList.remove("d-none");
  } catch (error) {
    console.error("Error validando novedad del empleado:", error);
    ocultarAlertaNovedadEmpleadoAyb();
  }
}

async function guardarAsignacionAyb() {
  limpiarMensajesFormulario();
  const boton = document.getElementById("btnSubmitAsignacionAyb");
  if (boton) { boton.disabled = true; boton.textContent = modoEdicion ? "Guardando cambios..." : "Guardando..."; }

  try {
    const id = texto(document.getElementById("registroIdAyb").value);
    const tipo = texto(document.getElementById("tipoRegistroAyb").value);
    const cedula = texto(document.getElementById("cedulaEmpleadoAyb").value);
    const nombre = texto(document.getElementById("nombreEmpleadoAyb").value);
    const cargo = texto(document.getElementById("cargoEmpleadoAyb").value);
    const fecha = document.getElementById("fechaAyb").value;
    const observacion = texto(document.getElementById("observacionAyb").value);

    if (!cedula || !nombre || !fecha) { mostrarErrorFormulario("Debe completar empleado y fecha."); return; }
    if (!empleadosAyb.find((emp) => String(emp.cedula) === String(cedula))) { mostrarErrorFormulario("Solo puedes asignar personal perteneciente a A&B."); return; }

    const payload = {
      cedula, nombre, cargo, area: AREA_AYB, fecha,
      dia: obtenerNombreDia(new Date(`${fecha}T00:00:00`)), observacion,
      tipo_registro: tipo, subarea: null, subarea_2: null, turno: null,
      hora_inicio: null, hora_fin: null, turno_2: null, hora_inicio_2: null,
      hora_fin_2: null, novedad_codigo: null, novedad_descripcion: null
    };

    if (tipo === "novedad") {
      const codigo = texto(document.getElementById("novedadCodigoAyb").value);
      if (!codigo) { mostrarErrorFormulario("Debe seleccionar una novedad."); return; }
      payload.novedad_codigo = codigo;
      payload.novedad_descripcion = texto(document.getElementById("novedadDescripcionAyb").value) || NOVEDADES_LABELS[codigo] || codigo;
      payload.turno = codigo;
    } else {
      const subarea = texto(document.getElementById("subareaAyb").value);
      const turno = texto(document.getElementById("turnoAyb").value);
      const inicio = document.getElementById("horaInicioAyb").value;
      const fin = document.getElementById("horaFinAyb").value;
      const partido = document.getElementById("checkTurnoPartido").checked;
      const subarea2 = texto(document.getElementById("subarea2Ayb").value);
      const turno2 = texto(document.getElementById("turno2Ayb").value);
      const inicio2 = document.getElementById("horaInicio2Ayb").value;
      const fin2 = document.getElementById("horaFin2Ayb").value;
      if (!subarea) { mostrarErrorFormulario("Debe seleccionar restaurante / subárea."); return; }
      if (!turno || !inicio || !fin) { mostrarErrorFormulario("Debe completar el turno y horario del bloque 1."); return; }
      if (partido && (!subarea2 || !turno2 || !inicio2 || !fin2)) { mostrarErrorFormulario("Si marca turno partido, debe completar subárea, turno y horario del bloque 2."); return; }
      Object.assign(payload, { subarea, turno, hora_inicio: inicio, hora_fin: fin, subarea_2: partido ? subarea2 : null, turno_2: partido ? turno2 : null, hora_inicio_2: partido ? inicio2 : null, hora_fin_2: partido ? fin2 : null });
    }

    const response = modoEdicion && id
      ? await supabase.from("programacion_turnos").update(payload).eq("id", id)
      : await supabase.from("programacion_turnos").insert([payload]);

    if (response.error) { mostrarErrorFormulario(response.error.message || "No se pudo guardar la asignación en Supabase."); return; }

    mostrarOkFormulario(modoEdicion ? "Asignación actualizada correctamente." : "Asignación guardada correctamente.");
    setTimeout(async () => {
      modalAsignacionAyb?.hide();
      limpiarFormularioAyb();
      await cargarProgramacionAyb();
    }, 600);
  } catch (error) {
    console.error("Error guardando asignación A&B:", error);
    mostrarErrorFormulario(error.message || "No se pudo guardar la asignación.");
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = modoEdicion ? "Guardar cambios" : "Guardar asignación"; }
  }
}

async function eliminarAsignacionAyb(id) {
  if (!confirm("¿Seguro que deseas eliminar esta asignación?")) return;
  const { error } = await supabase.from("programacion_turnos").delete().eq("id", id);
  if (error) { alert("No se pudo eliminar la asignación."); return; }
  await cargarProgramacionAyb();
}

function limpiarMensajesFormulario() {
  ["alertaErrorAyb", "alertaOkAyb"].forEach((id) => {
    const alerta = document.getElementById(id);
    if (alerta) { alerta.classList.add("d-none"); alerta.textContent = ""; }
  });
}

function mostrarErrorFormulario(mensaje) {
  const alerta = document.getElementById("alertaErrorAyb");
  if (alerta) { alerta.textContent = mensaje; alerta.classList.remove("d-none"); }
}

function mostrarOkFormulario(mensaje) {
  const alerta = document.getElementById("alertaOkAyb");
  if (alerta) { alerta.textContent = mensaje; alerta.classList.remove("d-none"); }
}

async function cargarFestivosSemana() {
  const { data, error } = await supabase.from("festivos").select("fecha,nombre,activo").eq("activo", true)
    .gte("fecha", semanaActual[0]?.fecha).lte("fecha", semanaActual[6]?.fecha);
  festivosSemana = error ? [] : (data || []);
}

async function cargarProgramacionAyb() {
  try {
    await cargarFestivosSemana();
    const { data, error } = await supabase.from("programacion_turnos").select("*").eq("area", AREA_AYB)
      .gte("fecha", semanaActual[0]?.fecha).lte("fecha", semanaActual[6]?.fecha).order("fecha", { ascending: true });
    if (error) throw error;
    registrosSemanaAyb = (data || []).map(enriquecerRegistroAyb);
    renderTablaProgramacionAyb(registrosSemanaAyb);
    renderResumenHorasAyb(registrosSemanaAyb);
  } catch (error) {
    console.error("Error cargando programación A&B:", error);
    document.getElementById("tbodyProgramacionAYB").innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">No se pudo cargar la programación.</td></tr>`;
  }
}

function enriquecerRegistroAyb(registro) {
  return { ...registro, ...calcularMetricasRegistro(registro) };
}

function calcularMetricasRegistro(registro) {
  if (String(registro.tipo_registro) === "novedad") {
    return { horas_bloque_1: 0, horas_bloque_2: 0, horas_totales: 0, horas_programadas: 0, descuento_almuerzo: 0, horas_diurnas: 0, horas_nocturnas: 0, horas_netas: 0, jornada_esperada: 0, horas_extra_estimadas: 0, extra_diurna: 0, extra_nocturna: 0, tipo_jornada: "Novedad" };
  }
  const b1 = calcularHorasTurnoProtegiendoNocturnas(registro.hora_inicio, registro.hora_fin);
  const b2 = calcularHorasTurnoProtegiendoNocturnas(registro.hora_inicio_2, registro.hora_fin_2);
  const horasTotales = redondearHoras(b1.total + b2.total);
  const horasDiurnas = redondearHoras(b1.diurnas + b2.diurnas);
  const horasNocturnas = redondearHoras(b1.nocturnas + b2.nocturnas);
  const horasNetas = redondearHoras(horasDiurnas + horasNocturnas);
  const jornadaInfo = obtenerJornadaEsperadaPorFecha(registro.fecha);
  const extra = redondearHoras(Math.max(0, horasNetas - jornadaInfo.horas));
  const extraDiurna = extra > 0 ? redondearHoras(Math.max(0, horasDiurnas - Math.min(horasDiurnas, jornadaInfo.horas))) : 0;
  const extraNocturna = redondearHoras(Math.max(0, extra - extraDiurna));
  return { horas_bloque_1: redondearHoras(b1.netas), horas_bloque_2: redondearHoras(b2.netas), horas_totales: horasTotales, horas_programadas: horasTotales, descuento_almuerzo: horasTotales > 0 ? DESCANSO_ESTANDAR_HORAS : 0, horas_diurnas: horasDiurnas, horas_nocturnas: horasNocturnas, horas_netas: horasNetas, jornada_esperada: jornadaInfo.horas, horas_extra_estimadas: extra, extra_diurna: extraDiurna, extra_nocturna: extraNocturna, tipo_jornada: jornadaInfo.tipo };
}

function calcularHorasTurnoProtegiendoNocturnas(inicio, fin) {
  if (!inicio || !fin) return { total: 0, diurnas: 0, nocturnas: 0, netas: 0 };
  const inicioMin = horaTextoAMinutos(inicio);
  let finMin = horaTextoAMinutos(fin);
  if (inicioMin === null || finMin === null) return { total: 0, diurnas: 0, nocturnas: 0, netas: 0 };
  if (finMin < inicioMin) finMin += 24 * 60;
  let diurnas = 0, nocturnas = 0;
  for (let m = inicioMin; m < finMin; m++) {
    const minuto = m % (24 * 60);
    if (minuto >= HORA_INICIO_NOCTURNO || minuto < HORA_FIN_NOCTURNO) nocturnas++; else diurnas++;
  }
  const total = diurnas + nocturnas;
  let descuento = DESCANSO_ESTANDAR_HORAS * 60;
  if (diurnas >= descuento) diurnas -= descuento;
  else { descuento -= diurnas; diurnas = 0; nocturnas = Math.max(0, nocturnas - descuento); }
  return { total: redondearHoras(total / 60), diurnas: redondearHoras(diurnas / 60), nocturnas: redondearHoras(nocturnas / 60), netas: redondearHoras((diurnas + nocturnas) / 60) };
}

function horaTextoAMinutos(hora) {
  const partes = String(hora || "").split(":").map(Number);
  return partes.length >= 2 && !partes.some(Number.isNaN) ? partes[0] * 60 + partes[1] : null;
}

function obtenerJornadaEsperadaPorFecha(fechaISO) {
  if (festivosSemana.some((f) => String(f.fecha) === String(fechaISO))) return { horas: 8.5, tipo: "Festivo" };
  const dia = new Date(`${fechaISO}T00:00:00`).getDay();
  return dia === 0 || dia === 6 ? { horas: 8.5, tipo: "Sábado/Domingo" } : { horas: 7.5, tipo: "Martes a viernes / día hábil" };
}

function redondearHoras(valor) { return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100; }

function renderTablaProgramacionAyb(registros) {
  const tbody = document.getElementById("tbodyProgramacionAYB");
  const contador = document.getElementById("textoResultadoMatrizAyb");
  const mapa = new Map();

  empleadosAyb.forEach((emp) => mapa.set(emp.cedula, { ...emp, dias: {} }));
  registros.forEach((registro) => {
    const cedula = texto(registro.cedula) || `registro-${registro.id}`;
    if (!mapa.has(cedula)) mapa.set(cedula, { cedula: registro.cedula || "", nombre: registro.nombre || "Empleado", cargo: registro.cargo || "", dias: {} });
    if (!mapa.get(cedula).dias[registro.fecha]) mapa.get(cedula).dias[registro.fecha] = [];
    mapa.get(cedula).dias[registro.fecha].push(registro);
  });

  const empleados = [...mapa.values()].filter(cumpleFiltrosMatriz).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (contador) contador.textContent = `${empleados.length} empleado(s) visible(s) · ${registros.length} registro(s)`;

  if (!empleados.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-5">No hay empleados que coincidan con los filtros seleccionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = empleados.map((empleado) => {
    const resumen = obtenerResumenEmpleado(empleado);
    return `<tr>
      <td class="empleado-sticky align-top">
        <div class="empleado-matriz-nombre">${escaparHtml(empleado.nombre)}</div>
        <div class="empleado-matriz-cargo">${escaparHtml(empleado.cargo || "Sin cargo")}</div>
        <div class="empleado-matriz-cedula">${escaparHtml(empleado.cedula || "")}</div>
        <div class="empleado-matriz-resumen"><span>${resumen.turnos} turno(s)</span>${resumen.extra > 0 ? `<span class="chip-extra">+${formatoHoras(resumen.extra)} h</span>` : ""}</div>
      </td>
      ${semanaActual.map((dia) => construirCeldaEmpleado(empleado, dia)).join("")}
    </tr>`;
  }).join("");
}

function cumpleFiltrosMatriz(empleado) {
  const registros = Object.values(empleado.dias).flat();
  const turnos = registros.filter((r) => String(r.tipo_registro) !== "novedad");
  const novedades = registros.filter((r) => String(r.tipo_registro) === "novedad");
  const identificacion = `${empleado.nombre} ${empleado.cedula} ${empleado.cargo}`.toLowerCase();
  if (filtrosMatrizAyb.busqueda && !identificacion.includes(filtrosMatrizAyb.busqueda)) return false;
  if (filtrosMatrizAyb.cargo && empleado.cargo !== filtrosMatrizAyb.cargo) return false;
  if (filtrosMatrizAyb.subarea && !turnos.some((r) => r.subarea === filtrosMatrizAyb.subarea || r.subarea_2 === filtrosMatrizAyb.subarea)) return false;
  if (filtrosMatrizAyb.estado === "con-registros" && registros.length === 0) return false;
  if (filtrosMatrizAyb.estado === "sin-registros" && registros.length > 0) return false;
  if (filtrosMatrizAyb.estado === "con-extra" && !turnos.some((r) => Number(r.horas_extra_estimadas || 0) > 0)) return false;
  if (filtrosMatrizAyb.estado === "con-novedad" && novedades.length === 0) return false;
  return true;
}

function obtenerResumenEmpleado(empleado) {
  const turnos = Object.values(empleado.dias).flat().filter((r) => String(r.tipo_registro) !== "novedad");
  return { turnos: turnos.length, extra: redondearHoras(turnos.reduce((acc, r) => acc + Number(r.horas_extra_estimadas || 0), 0)) };
}

function construirCeldaEmpleado(empleado, dia) {
  const items = empleado.dias[dia.fecha] || [];
  return `<td class="celda-dia-empleado align-top">
    <div class="acciones-celda-matriz">
      <button class="btn-celda-ayb btn-agregar-ayb" type="button" title="Agregar turno" onclick="window.nuevaAsignacionMatriz('${escaparAtributo(dia.fecha)}','${escaparAtributo(empleado.cedula)}')">+</button>
      <button class="btn-celda-ayb btn-novedad-ayb" type="button" title="Agregar novedad" onclick="window.nuevaNovedadMatriz('${escaparAtributo(dia.fecha)}','${escaparAtributo(empleado.cedula)}')">N</button>
      ${turnoCopiadoAyb ? `<button class="btn-celda-ayb btn-pegar-ayb" type="button" title="Pegar turno" onclick="window.pegarTurnoMatriz('${escaparAtributo(dia.fecha)}','${escaparAtributo(empleado.cedula)}')">P</button>` : ""}
    </div>
    ${items.length ? items.map((item) => item.tipo_registro === "novedad" ? construirCardNovedadCompacta(item) : construirCardTurnoCompacta(item)).join("") : `<div class="celda-libre">Libre</div>`}
  </td>`;
}

function construirCardTurnoCompacta(item) {
  const subarea = SUBAREAS_AYB[item.subarea]?.codigo || item.subarea || "S/A";
  const subarea2 = item.subarea_2 ? (SUBAREAS_AYB[item.subarea_2]?.codigo || item.subarea_2) : "";
  const horario = item.hora_inicio && item.hora_fin ? `${item.hora_inicio}-${item.hora_fin}` : "Sin horario";
  const horario2 = item.hora_inicio_2 && item.hora_fin_2 ? `${item.hora_inicio_2}-${item.hora_fin_2}` : "";
  const extra = Number(item.horas_extra_estimadas || 0);
  return `<div class="turno-matriz-card ${extra > 0 ? "tiene-extra" : ""}">
    <div class="turno-matriz-superior">
      <span class="chip-subarea">${escaparHtml(subarea)}</span>
      <span class="chip-turno">T${escaparHtml(item.turno || "-")}</span>
      ${extra > 0 ? `<span class="chip-extra">+${formatoHoras(extra)}h</span>` : ""}
    </div>
    <div class="turno-matriz-horario">${escaparHtml(horario)}</div>
    ${subarea2 || horario2 ? `<div class="turno-matriz-segundo">${escaparHtml(subarea2)} · ${escaparHtml(horario2)}</div>` : ""}
    <div class="acciones-registro-matriz">
      <button type="button" onclick="window.verDetalleRegistroAyb('${escaparAtributo(item.id)}')">Ver</button>
      <button type="button" onclick="window.editarAsignacionAyb('${escaparAtributo(item.id)}')">Editar</button>
      <button type="button" onclick="window.copiarTurnoAybDesdeTabla('${escaparAtributo(item.id)}')">Copiar</button>
      <button type="button" class="accion-eliminar" onclick="window.eliminarAsignacionAybDesdeTabla('${escaparAtributo(item.id)}')">×</button>
    </div>
  </div>`;
}

function construirCardNovedadCompacta(item) {
  const titulo = NOVEDADES_LABELS[item.novedad_codigo] || item.novedad_codigo || "Novedad";
  return `<div class="novedad-matriz-card ${obtenerClaseNovedad(item.novedad_codigo)}">
    <span class="chip-novedad">${escaparHtml(item.novedad_codigo || "N")}</span>
    <div class="novedad-matriz-titulo">${escaparHtml(titulo)}</div>
    <div class="acciones-registro-matriz">
      <button type="button" onclick="window.verDetalleRegistroAyb('${escaparAtributo(item.id)}')">Ver</button>
      <button type="button" onclick="window.editarAsignacionAyb('${escaparAtributo(item.id)}')">Editar</button>
      <button type="button" class="accion-eliminar" onclick="window.eliminarAsignacionAybDesdeTabla('${escaparAtributo(item.id)}')">×</button>
    </div>
  </div>`;
}

function obtenerClaseNovedad(codigo) {
  const c = texto(codigo).toUpperCase();
  if (c === "INC") return "novedad-inc";
  if (c === "VAC") return "novedad-vac";
  if (c === "LR") return "novedad-lr";
  return "novedad-default";
}

function renderResumenHorasAyb(registros) {
  const turnos = registros.filter((r) => String(r.tipo_registro) !== "novedad");
  const netas = redondearHoras(turnos.reduce((acc, r) => acc + Number(r.horas_netas || 0), 0));
  const extras = redondearHoras(turnos.reduce((acc, r) => acc + Number(r.horas_extra_estimadas || 0), 0));
  document.getElementById("kpiHorasNetasAyb").textContent = formatoHoras(netas);
  document.getElementById("kpiHorasExtraAyb").textContent = formatoHoras(extras);
  document.getElementById("kpiRegistrosAyb").textContent = String(registros.length);
  const ranking = construirRankingEmpleados(turnos);
  const top = ranking[0];
  document.getElementById("kpiTopEmpleadoHorasAyb").textContent = top ? limitarTexto(top.nombre, 12) : "-";
  document.getElementById("kpiTopEmpleadoDetalleAyb").textContent = top ? `${formatoHoras(top.extra)} h extra estimadas` : "Sin datos";
  renderTablaResumenSemanal(ranking);
}

function construirRankingEmpleados(turnos) {
  const mapa = new Map();
  turnos.forEach((r) => {
    const llave = `${r.cedula}||${r.nombre}`;
    if (!mapa.has(llave)) mapa.set(llave, { cedula: r.cedula, nombre: r.nombre, cargo: r.cargo || "", extra: 0, netas: 0, diurnas: 0, nocturnas: 0, extraDiurna: 0, extraNocturna: 0, registros: 0 });
    const item = mapa.get(llave);
    item.extra = redondearHoras(item.extra + Number(r.horas_extra_estimadas || 0));
    item.netas = redondearHoras(item.netas + Number(r.horas_netas || 0));
    item.diurnas = redondearHoras(item.diurnas + Number(r.horas_diurnas || 0));
    item.nocturnas = redondearHoras(item.nocturnas + Number(r.horas_nocturnas || 0));
    item.extraDiurna = redondearHoras(item.extraDiurna + Number(r.extra_diurna || 0));
    item.extraNocturna = redondearHoras(item.extraNocturna + Number(r.extra_nocturna || 0));
    item.registros++;
  });
  return [...mapa.values()].sort((a, b) => b.extra - a.extra || b.netas - a.netas);
}

function renderTablaResumenSemanal(ranking) {
  const contenedor = document.getElementById("resumenSemanalAyb");
  if (!ranking.length) { contenedor.innerHTML = `<div class="text-muted">No hay turnos programados en la semana visible.</div>`; return; }
  contenedor.innerHTML = `<div class="mb-3"><div class="fw-semibold">Top empleados con mayor sobreprogramación teórica</div><div class="small text-muted">El descanso se descuenta del total sin afectar primero la franja nocturna.</div></div>
  <div class="table-responsive"><table class="table table-sm table-striped table-ranking"><thead><tr><th>#</th><th>Empleado</th><th>D</th><th>N</th><th>Netas</th><th>ED</th><th>EN</th><th>Extra</th><th>Registros</th></tr></thead><tbody>
  ${ranking.slice(0, 5).map((item, i) => `<tr><td>${i + 1}</td><td><div class="fw-semibold">${escaparHtml(item.nombre)}</div><div class="small text-muted">${escaparHtml(item.cargo)}</div></td><td>${formatoHoras(item.diurnas)} h</td><td>${formatoHoras(item.nocturnas)} h</td><td>${formatoHoras(item.netas)} h</td><td>${formatoHoras(item.extraDiurna)} h</td><td>${formatoHoras(item.extraNocturna)} h</td><td>${formatoHoras(item.extra)} h</td><td>${item.registros}</td></tr>`).join("")}
  </tbody></table></div>`;
}

function cargarTurnoCopiadoDesdeMemoria() {
  try { turnoCopiadoAyb = JSON.parse(localStorage.getItem("ccp_turno_copiado_ayb") || "null"); } catch { turnoCopiadoAyb = null; }
  renderBannerTurnoCopiado();
}

function renderBannerTurnoCopiado() {
  const banner = document.getElementById("bannerTurnoCopiadoAyb");
  const textoBanner = document.getElementById("textoTurnoCopiadoAyb");
  if (!banner || !textoBanner) return;
  if (!turnoCopiadoAyb) { banner.classList.add("d-none"); textoBanner.textContent = "No hay turno copiado"; return; }
  banner.classList.remove("d-none");
  textoBanner.textContent = `${turnoCopiadoAyb.nombre} · Turno ${turnoCopiadoAyb.turno || ""} · ${turnoCopiadoAyb.subarea || ""}`;
}

function copiarTurnoAyb(registro) {
  if (!registro || String(registro.tipo_registro) === "novedad") return;
  turnoCopiadoAyb = {
    subarea: registro.subarea || "", turno: registro.turno || "", hora_inicio: registro.hora_inicio || null, hora_fin: registro.hora_fin || null,
    subarea_2: registro.subarea_2 || null, turno_2: registro.turno_2 || null, hora_inicio_2: registro.hora_inicio_2 || null, hora_fin_2: registro.hora_fin_2 || null,
    observacion: registro.observacion || null, nombre: registro.nombre || "", copiado_en: new Date().toISOString()
  };
  localStorage.setItem("ccp_turno_copiado_ayb", JSON.stringify(turnoCopiadoAyb));
  renderBannerTurnoCopiado();
  renderTablaProgramacionAyb(registrosSemanaAyb);
}

function limpiarTurnoCopiadoAyb() {
  turnoCopiadoAyb = null;
  localStorage.removeItem("ccp_turno_copiado_ayb");
  renderBannerTurnoCopiado();
  renderTablaProgramacionAyb(registrosSemanaAyb);
}

async function pegarTurnoAybEnEmpleado(fecha, cedula) {
  if (!turnoCopiadoAyb) { alert("Primero copia un turno."); return; }
  const empleado = empleadosAyb.find((emp) => String(emp.cedula) === String(cedula));
  if (!empleado) { alert("No se encontró el empleado destino."); return; }

  const { data: existentes, error: errorValidacion } = await supabase.from("programacion_turnos").select("id")
    .eq("area", AREA_AYB).eq("cedula", cedula).eq("fecha", fecha).limit(1);
  if (errorValidacion) { alert("No se pudo validar si el empleado ya tiene asignación ese día."); return; }
  if (existentes?.length) { alert("El empleado destino ya tiene una asignación en esa fecha."); return; }

  const payload = {
    area: AREA_AYB, tipo_registro: "turno", cedula: empleado.cedula, nombre: empleado.nombre, cargo: empleado.cargo,
    subarea: turnoCopiadoAyb.subarea || null, fecha, dia: obtenerNombreDia(new Date(`${fecha}T00:00:00`)),
    turno: turnoCopiadoAyb.turno || null, hora_inicio: turnoCopiadoAyb.hora_inicio || null, hora_fin: turnoCopiadoAyb.hora_fin || null,
    subarea_2: turnoCopiadoAyb.subarea_2 || null, turno_2: turnoCopiadoAyb.turno_2 || null,
    hora_inicio_2: turnoCopiadoAyb.hora_inicio_2 || null, hora_fin_2: turnoCopiadoAyb.hora_fin_2 || null,
    observacion: turnoCopiadoAyb.observacion || null, novedad_codigo: null, novedad_descripcion: null
  };

  const { error } = await supabase.from("programacion_turnos").insert([payload]);
  if (error) { alert("No se pudo pegar el turno en la fecha seleccionada."); return; }
  await cargarProgramacionAyb();
}

async function buscarRegistroPorId(id) {
  const { data, error } = await supabase.from("programacion_turnos").select("*").eq("id", id).single();
  if (error) throw error;
  return enriquecerRegistroAyb(data);
}

function abrirDetalleRegistro(registro) {
  const titulo = document.getElementById("detalleNombreRegistroAyb");
  const subtitulo = document.getElementById("detalleSubtituloRegistroAyb");
  const contenido = document.getElementById("detalleContenidoRegistroAyb");
  titulo.textContent = registro.nombre || "Detalle del registro";
  subtitulo.textContent = registro.tipo_registro === "novedad"
    ? `${registro.fecha || ""} · ${NOVEDADES_LABELS[registro.novedad_codigo] || registro.novedad_codigo || "Novedad"}`
    : `${registro.fecha || ""} · ${registro.subarea || "Sin subárea"} · Turno ${registro.turno || ""}`;

  if (registro.tipo_registro === "novedad") {
    contenido.innerHTML = `<div class="row g-3 detalle-grid">
      ${detalleItem("Empleado", registro.nombre)}${detalleItem("Cargo", registro.cargo || "Sin cargo")}
      ${detalleItem("Fecha", registro.fecha)}${detalleItem("Novedad", NOVEDADES_LABELS[registro.novedad_codigo] || registro.novedad_codigo)}
      <div class="col-12">${detalleCaja("Descripción", registro.novedad_descripcion || "Sin descripción")}</div>
      <div class="col-12">${detalleCaja("Observación", registro.observacion || "Sin observación")}</div>
    </div>`;
  } else {
    const horario1 = registro.hora_inicio && registro.hora_fin ? `${registro.hora_inicio} - ${registro.hora_fin}` : "Sin horario";
    const horario2 = registro.hora_inicio_2 && registro.hora_fin_2 ? `${registro.hora_inicio_2} - ${registro.hora_fin_2}` : "No aplica";
    contenido.innerHTML = `<div class="row g-3 detalle-grid">
      ${detalleItem("Empleado", registro.nombre)}${detalleItem("Cargo", registro.cargo || "Sin cargo")}
      ${detalleItem("Fecha", registro.fecha, "col-md-4")}${detalleItem("Subárea", registro.subarea || "Sin subárea", "col-md-4")}${detalleItem("Turno bloque 1", registro.turno, "col-md-4")}
      ${detalleItem("Horario bloque 1", horario1)}${detalleItem("Bloque 2", registro.subarea_2 ? `${registro.subarea_2} · ${registro.turno_2 || ""} · ${horario2}` : "No aplica")}
      ${detalleItem("Horas totales", `${formatoHoras(registro.horas_totales)} h`, "col-md-3")}${detalleItem("Diurnas", `${formatoHoras(registro.horas_diurnas)} h`, "col-md-3")}${detalleItem("Nocturnas", `${formatoHoras(registro.horas_nocturnas)} h`, "col-md-3")}${detalleItem("Almuerzo", `${formatoHoras(registro.descuento_almuerzo)} h`, "col-md-3")}
      ${detalleItem("Netas", `${formatoHoras(registro.horas_netas)} h`, "col-md-3")}${detalleItem("Extra diurna", `${formatoHoras(registro.extra_diurna)} h`, "col-md-3")}${detalleItem("Extra nocturna", `${formatoHoras(registro.extra_nocturna)} h`, "col-md-3")}${detalleItem("Extra total", `${formatoHoras(registro.horas_extra_estimadas)} h`, "col-md-3")}
      ${detalleItem("Jornada esperada", `${formatoHoras(registro.jornada_esperada)} h`)}${detalleItem("Tipo de jornada", registro.tipo_jornada)}
      <div class="col-12">${detalleCaja("Observación", registro.observacion || "Sin observación")}</div>
    </div>`;
  }
  modalDetalleRegistroAyb?.show();
}

function detalleItem(etiqueta, valor, clase = "col-md-6") {
  return `<div class="${clase}">${detalleCaja(etiqueta, valor)}</div>`;
}

function detalleCaja(etiqueta, valor) {
  return `<div class="item"><div class="label">${escaparHtml(etiqueta)}</div><div class="value">${escaparHtml(valor || "")}</div></div>`;
}

function configurarAccionesGlobales() {
  window.nuevaAsignacionMatriz = (fecha, cedula) => abrirModalNuevaAsignacion(fecha, empleadosAyb.find((emp) => emp.cedula === cedula), false);
  window.nuevaNovedadMatriz = (fecha, cedula) => abrirModalNuevaAsignacion(fecha, empleadosAyb.find((emp) => emp.cedula === cedula), true);
  window.pegarTurnoMatriz = async (fecha, cedula) => pegarTurnoAybEnEmpleado(fecha, cedula);
  window.editarAsignacionAyb = async (id) => { try { abrirModalEdicion(await buscarRegistroPorId(id)); } catch { alert("No se pudo cargar el registro."); } };
  window.verDetalleRegistroAyb = async (id) => { try { abrirDetalleRegistro(await buscarRegistroPorId(id)); } catch { alert("No se pudo cargar el detalle."); } };
  window.eliminarAsignacionAybDesdeTabla = async (id) => eliminarAsignacionAyb(id);
  window.copiarTurnoAybDesdeTabla = async (id) => { try { copiarTurnoAyb(await buscarRegistroPorId(id)); } catch { alert("No se pudo copiar el turno."); } };
}

function generarPdfGeneralAyb() {
  if (!window.jspdf?.jsPDF) { alert("La librería de PDF no está disponible."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = 12; const x = 10; const maxY = 190;
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Programación general A&B", x, y);
  y += 7; doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(`Semana: ${document.getElementById("textoSemanaAyb")?.textContent || ""}`, x, y); y += 8;
  agruparTurnosPorSubarea(registrosSemanaAyb).forEach(([subarea, items]) => {
    if (y > maxY) { doc.addPage(); y = 12; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(subarea, x, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (!items.length) { doc.text("Sin registros", x + 4, y); y += 6; return; }
    items.forEach((item) => {
      if (y > maxY) { doc.addPage(); y = 12; }
      const linea = [item.fecha || "", item.nombre || "", item.turno || (NOVEDADES_LABELS[item.novedad_codigo] || ""), item.subarea || "Novedad", `D ${formatoHoras(item.horas_diurnas)}h`, `N ${formatoHoras(item.horas_nocturnas)}h`, `ED ${formatoHoras(item.extra_diurna)}h`, `EN ${formatoHoras(item.extra_nocturna)}h`].join(" | ");
      doc.text(limitarTexto(linea, 145), x + 3, y); y += 5;
    });
    y += 3;
  });
  doc.save(`programacion_general_ayb_${semanaActual[0]?.fecha || "semana"}.pdf`);
}

function generarPdfEmpleadoAyb() {
  if (!window.jspdf?.jsPDF) { alert("La librería de PDF no está disponible."); return; }
  const cedula = document.getElementById("selectEmpleadoPdfAyb")?.value || "";
  if (!cedula) { alert("Selecciona un empleado para generar el PDF."); return; }
  const empleado = empleadosAyb.find((e) => e.cedula === cedula);
  if (!empleado) { alert("No se encontró el empleado seleccionado."); return; }
  const registros = registrosSemanaAyb.filter((r) => String(r.cedula) === String(cedula));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 15; const x = 12; const maxY = 275;
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Programación semanal por empleado - A&B", x, y);
  y += 8; doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  [`Semana: ${document.getElementById("textoSemanaAyb")?.textContent || ""}`, `Empleado: ${empleado.nombre}`, `Cédula: ${empleado.cedula}`, `Cargo: ${empleado.cargo || "Sin cargo"}`].forEach((linea) => { doc.text(linea, x, y); y += 6; });
  y += 2;
  if (!registros.length) doc.text("No hay registros programados para este empleado en la semana visible.", x, y);
  registros.forEach((item) => {
    if (y > maxY) { doc.addPage(); y = 15; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(`${item.fecha} - ${item.tipo_registro === "novedad" ? "Novedad" : "Turno"}`, x, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const lineas = item.tipo_registro === "novedad"
      ? [`Novedad: ${item.novedad_descripcion || NOVEDADES_LABELS[item.novedad_codigo] || item.novedad_codigo || ""}`]
      : [`Subárea: ${item.subarea || ""}`, `Turno: ${item.turno || ""}`, `Horario: ${item.hora_inicio || ""} - ${item.hora_fin || ""}`, `Horas diurnas: ${formatoHoras(item.horas_diurnas)} h`, `Horas nocturnas: ${formatoHoras(item.horas_nocturnas)} h`, `Horas netas: ${formatoHoras(item.horas_netas)} h`, `Extra total: ${formatoHoras(item.horas_extra_estimadas)} h`];
    lineas.forEach((linea) => { doc.text(limitarTexto(linea, 95), x + 3, y); y += 5; });
    y += 3;
  });
  doc.save(`programacion_${empleado.cedula}_${semanaActual[0]?.fecha || "semana"}.pdf`);
}

function agruparTurnosPorSubarea(registros) {
  const resultado = Object.keys(SUBAREAS_AYB).map((subarea) => [subarea, registros.filter((r) => r.tipo_registro !== "novedad" && r.subarea === subarea)]);
  resultado.push(["Novedades", registros.filter((r) => r.tipo_registro === "novedad")]);
  return resultado;
}

function texto(valor) { return String(valor ?? "").trim(); }
function formatoHoras(valor) { return Number(valor || 0).toFixed(2); }
function limitarTexto(valor, maximo) { const txt = String(valor || ""); return txt.length > maximo ? `${txt.slice(0, maximo - 3)}...` : txt; }
function escaparHtml(valor) { return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function escaparAtributo(valor) { return String(valor ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'"); }

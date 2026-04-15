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

const HORA_INICIO_NOCTURNO = 19 * 60; // 7:00 pm
const HORA_FIN_NOCTURNO = 6 * 60; // 6:00 am
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
  cargarTurnoCopiadoDesdeMemoria();
  configurarAccionesGlobales();

  await cargarEmpleadosParaBusqueda();
  await cargarProgramacionAyb();
});

function inicializarModales() {
  const modalAsignacionElement = document.getElementById("modalAsignacionAyb");
  const modalDetalleElement = document.getElementById("modalDetalleRegistroAyb");

  if (modalAsignacionElement) {
    modalAsignacionAyb = new bootstrap.Modal(modalAsignacionElement);
  }

  if (modalDetalleElement) {
    modalDetalleRegistroAyb = new bootstrap.Modal(modalDetalleElement);
  }
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

function tieneAccesoModulo(sesion, modulo) {
  if (sesion.puede_ver_todo === true) return true;
  if (!Array.isArray(sesion.modulos_permitidos)) return false;
  return sesion.modulos_permitidos.includes(modulo);
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
  const linksCerrar = document.querySelectorAll('.nav-link[href="login.html"]');
  linksCerrar.forEach((link) => {
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
  const rol = traducirRol(sesion.rol);

  subtitulo.textContent = `Calendario semanal por restaurante | Usuario: ${nombre} | Cargo: ${cargo} | Rol: ${rol}`;
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
    dias.push({
      fecha: formatearFechaISO(fecha),
      nombre: obtenerNombreDia(fecha),
      etiqueta: `${obtenerNombreDia(fecha)} ${fecha.getDate()}`
    });
  }
  return dias;
}

function formatearFechaISO(fecha) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, "0");
  const day = String(fecha.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function obtenerNombreDia(fecha) {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return dias[fecha.getDay()];
}

function obtenerNombreMes(index) {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return meses[index];
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

  const textoSemana = document.getElementById("textoSemanaAyb");
  const textoMes = document.getElementById("textoMesAnioAyb");

  if (textoSemana) {
    textoSemana.textContent = `${primera.getDate()} al ${ultima.getDate()} de ${obtenerNombreMes(ultima.getMonth())} de ${ultima.getFullYear()}`;
  }

  if (textoMes) {
    textoMes.textContent = `${obtenerNombreMes(ultima.getMonth())} ${ultima.getFullYear()}`;
  }
}

function renderOpcionesTurnos() {
  const select1 = document.getElementById("turnoAyb");
  const select2 = document.getElementById("turno2Ayb");

  const opciones = [`<option value="">Seleccione</option>`]
    .concat(
      Object.entries(TURNOS_CATALOGO).map(([codigo, data]) => `<option value="${codigo}">${escaparHtml(data.label)}</option>`)
    )
    .join("");

  if (select1) select1.innerHTML = opciones;
  if (select2) select2.innerHTML = opciones;
}

function configurarBotones() {
  const btnSemanaAnterior = document.getElementById("btnSemanaAnterior");
  const btnSemanaSiguiente = document.getElementById("btnSemanaSiguiente");
  const btnNuevaAsignacion = document.getElementById("btnNuevaAsignacion");
  const btnPdfGeneral = document.getElementById("btnPdfGeneral");
  const btnPdfEmpleado = document.getElementById("btnPdfEmpleado");

  if (btnSemanaAnterior) {
    btnSemanaAnterior.addEventListener("click", async () => {
      fechaInicioSemana.setDate(fechaInicioSemana.getDate() - 7);
      semanaActual = construirSemana(fechaInicioSemana);
      renderEncabezadosSemana();
      renderTextosSemana();
      await cargarProgramacionAyb();
    });
  }

  if (btnSemanaSiguiente) {
    btnSemanaSiguiente.addEventListener("click", async () => {
      fechaInicioSemana.setDate(fechaInicioSemana.getDate() + 7);
      semanaActual = construirSemana(fechaInicioSemana);
      renderEncabezadosSemana();
      renderTextosSemana();
      await cargarProgramacionAyb();
    });
  }

  if (btnNuevaAsignacion) {
    btnNuevaAsignacion.addEventListener("click", abrirModalNuevaAsignacion);
  }

  if (btnPdfGeneral) {
    btnPdfGeneral.addEventListener("click", generarPdfGeneralAyb);
  }

  if (btnPdfEmpleado) {
    btnPdfEmpleado.addEventListener("click", generarPdfEmpleadoAyb);
  }
}

function configurarFormulario() {
  const form = document.getElementById("formAsignacionAyb");
  const inputBusqueda = document.getElementById("busquedaEmpleadoAyb");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await guardarAsignacionAyb();
    });
  }

  if (inputBusqueda) {
    inputBusqueda.addEventListener("input", seleccionarEmpleadoDesdeBusqueda);
    inputBusqueda.addEventListener("change", seleccionarEmpleadoDesdeBusqueda);
    inputBusqueda.addEventListener("blur", seleccionarEmpleadoDesdeBusqueda);
  }
}

function configurarTurnoPartido() {
  const check = document.getElementById("checkTurnoPartido");
  const bloque = document.getElementById("bloqueTurnoPartido");

  if (!check || !bloque) return;

  check.addEventListener("change", () => {
    bloque.classList.toggle("d-none", !check.checked);

    if (!check.checked) {
      document.getElementById("subarea2Ayb").value = "";
      document.getElementById("turno2Ayb").value = "";
      document.getElementById("horaInicio2Ayb").value = "";
      document.getElementById("horaFin2Ayb").value = "";
    }
  });
}

function configurarTipoRegistro() {
  const tipoRegistro = document.getElementById("tipoRegistroAyb");
  if (!tipoRegistro) return;

  tipoRegistro.addEventListener("change", actualizarVistaTipoRegistro);
  actualizarVistaTipoRegistro();
}

function actualizarVistaTipoRegistro() {
  const tipo = document.getElementById("tipoRegistroAyb").value;
  const esNovedad = tipo === "novedad";

  const bloqueTurno = document.getElementById("bloqueTurnoNormal");
  const bloqueNovedad = document.getElementById("bloqueNovedad");
  const bloqueSubarea = document.getElementById("bloqueSubareaAyb");
  const bloqueInfoSubarea = document.getElementById("bloqueInfoSubareaAyb");
  const selectSubarea = document.getElementById("subareaAyb");
  const checkTurnoPartido = document.getElementById("checkTurnoPartido");
  const bloqueTurnoPartido = document.getElementById("bloqueTurnoPartido");

  if (bloqueTurno) bloqueTurno.classList.toggle("d-none", esNovedad);
  if (bloqueNovedad) bloqueNovedad.classList.toggle("d-none", !esNovedad);
  if (bloqueSubarea) bloqueSubarea.classList.toggle("d-none", esNovedad);
  if (bloqueInfoSubarea) bloqueInfoSubarea.classList.toggle("d-none", esNovedad);

  if (selectSubarea) {
    selectSubarea.required = !esNovedad;
  }

  if (esNovedad) {
    if (selectSubarea) selectSubarea.value = "";
    document.getElementById("turnoAyb").value = "";
    document.getElementById("horaInicioAyb").value = "";
    document.getElementById("horaFinAyb").value = "";
    if (checkTurnoPartido) checkTurnoPartido.checked = false;
    if (bloqueTurnoPartido) bloqueTurnoPartido.classList.add("d-none");
    document.getElementById("subarea2Ayb").value = "";
    document.getElementById("turno2Ayb").value = "";
    document.getElementById("horaInicio2Ayb").value = "";
    document.getElementById("horaFin2Ayb").value = "";
  }

  actualizarInfoSubarea();
}

function configurarTurnosAutollenado() {
  const turno1 = document.getElementById("turnoAyb");
  const turno2 = document.getElementById("turno2Ayb");

  if (turno1) {
    turno1.addEventListener("change", () => aplicarHorarioTurno(turno1.value, "horaInicioAyb", "horaFinAyb"));
  }

  if (turno2) {
    turno2.addEventListener("change", () => aplicarHorarioTurno(turno2.value, "horaInicio2Ayb", "horaFin2Ayb"));
  }
}

function aplicarHorarioTurno(codigo, idInicio, idFin) {
  const turno = TURNOS_CATALOGO[codigo];
  const inputInicio = document.getElementById(idInicio);
  const inputFin = document.getElementById(idFin);

  if (!inputInicio || !inputFin) return;

  if (!turno) {
    inputInicio.value = "";
    inputFin.value = "";
    return;
  }

  inputInicio.value = turno.inicio || "";
  inputFin.value = turno.fin || "";
}

function configurarInfoSubarea() {
  const selectSubarea = document.getElementById("subareaAyb");
  if (!selectSubarea) return;
  selectSubarea.addEventListener("change", actualizarInfoSubarea);
  actualizarInfoSubarea();
}

function actualizarInfoSubarea() {
  const info = document.getElementById("infoHorarioSubarea");
  const subarea = document.getElementById("subareaAyb")?.value || "";

  if (!info) return;

  if (!subarea || !SUBAREAS_AYB[subarea]) {
    info.textContent = "Selecciona una subárea para ver el horario guía.";
    return;
  }

  const item = SUBAREAS_AYB[subarea];
  info.textContent = `${item.codigo} · ${subarea} | Horario guía: ${item.horario}`;
}

async function cargarEmpleadosParaBusqueda() {
  try {
    let data = [];
    let error = null;

    const intentoPrincipal = await supabase
      .from("empleados")
      .select("*")
      .or("centro_costos.ilike.%ALIMENTOS%,centro_costos.ilike.%BEBIDAS%,area.ilike.%ALIMENTOS%,area.ilike.%BEBIDAS%,cargo.ilike.%MESERO%,cargo.ilike.%MESERA%,cargo.ilike.%BARISTA%,cargo.ilike.%BARTENDER%,cargo.ilike.%PATINADOR%,cargo.ilike.%PATINADORA%,cargo.ilike.%AUXILIAR%,cargo.ilike.%LIDER%,cargo.ilike.%CAPITAN%,cargo.ilike.%COCINA%,cargo.ilike.%SERVICIO%");

    data = intentoPrincipal.data || [];
    error = intentoPrincipal.error;

    if (error) {
      const intentoFallback = await supabase.from("empleados").select("*");
      data = intentoFallback.data || [];
      error = intentoFallback.error;
      if (error) throw error;
    }

    empleadosAyb = (data || [])
      .filter(esEmpleadoAybValido)
      .map(normalizarEmpleado)
      .filter((emp) => emp.cedula && emp.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    renderListaEmpleados();
    renderSelectEmpleadoPdf();
  } catch (error) {
    console.error("Error cargando empleados A&B:", error);
    empleadosAyb = [];
    renderListaEmpleados();
    renderSelectEmpleadoPdf();
  }
}

function normalizarEmpleado(emp) {
  const nombres = texto(emp.nombres);
  const apellidos = texto(emp.apellidos);
  const nombreCompleto = texto(emp.nombre_completo);
  const nombre = nombreCompleto || `${nombres} ${apellidos}`.trim();

  return {
    cedula: texto(emp.cedula),
    nombre,
    cargo: texto(emp.cargo),
    area: texto(emp.area || emp.centro_costos),
    raw: emp
  };
}

function esEmpleadoAybValido(emp) {
  const area = texto(emp.area).toUpperCase();
  const centro = texto(emp.centro_costos).toUpperCase();
  const cargo = texto(emp.cargo).toUpperCase();

  const clavesArea = ["ALIMENTOS", "BEBIDAS", "A&B", "AYB", "COCINA"];
  const clavesCargo = [
    "MESERO", "MESERA", "BARISTA", "BARTENDER", "PATINADOR", "PATINADORA",
    "AUXILIAR", "LIDER", "CAPITAN", "COCINA", "SERVICIO"
  ];

  return (
    clavesArea.some((txt) => area.includes(txt)) ||
    clavesArea.some((txt) => centro.includes(txt)) ||
    clavesCargo.some((txt) => cargo.includes(txt))
  );
}

function renderListaEmpleados() {
  const datalist = document.getElementById("listaEmpleadosAyb");
  if (!datalist) return;

  datalist.innerHTML = empleadosAyb.map((emp) => {
    const value = `${emp.cedula} - ${emp.nombre}${emp.cargo ? ` - ${emp.cargo}` : ""}`;
    return `<option value="${escaparHtml(value)}"></option>`;
  }).join("");
}

function renderSelectEmpleadoPdf() {
  const select = document.getElementById("selectEmpleadoPdfAyb");
  if (!select) return;

  select.innerHTML = `<option value="">Seleccione</option>` + empleadosAyb.map((emp) => {
    return `<option value="${escaparHtml(emp.cedula)}">${escaparHtml(emp.nombre)}${emp.cargo ? ` - ${escaparHtml(emp.cargo)}` : ""}</option>`;
  }).join("");
}

function seleccionarEmpleadoDesdeBusqueda() {
  const input = document.getElementById("busquedaEmpleadoAyb");
  if (!input) return;

  const valor = texto(input.value).toLowerCase();
  if (!valor) return;

  const encontrado = empleadosAyb.find((emp) => {
    const cedula = texto(emp.cedula).toLowerCase();
    const nombre = texto(emp.nombre).toLowerCase();
    const cargo = texto(emp.cargo).toLowerCase();
    const compuesto = `${cedula} - ${nombre} - ${cargo}`;
    return cedula === valor || nombre.includes(valor) || compuesto.includes(valor);
  });

  if (!encontrado) return;

  document.getElementById("cedulaEmpleadoAyb").value = encontrado.cedula || "";
  document.getElementById("nombreEmpleadoAyb").value = encontrado.nombre || "";
  document.getElementById("cargoEmpleadoAyb").value = encontrado.cargo || "";
}

function abrirModalNuevaAsignacion(fecha = "", subarea = "") {
  modoEdicion = false;
  limpiarMensajesFormulario();
  limpiarFormularioAyb();

  document.getElementById("tituloModalAyb").textContent = "Nueva asignación A&B";
  document.getElementById("btnSubmitAsignacionAyb").textContent = "Guardar asignación";
  document.getElementById("tipoRegistroAyb").value = "turno";

  if (fecha) {
    document.getElementById("fechaAyb").value = fecha;
  } else {
    precargarFechaFormulario();
  }

  if (subarea) {
    document.getElementById("subareaAyb").value = subarea;
  }

  actualizarVistaTipoRegistro();
  actualizarInfoSubarea();

  if (modalAsignacionAyb) modalAsignacionAyb.show();
}

function abrirModalNuevaNovedad(fecha = "") {
  abrirModalNuevaAsignacion(fecha, "");
  document.getElementById("tipoRegistroAyb").value = "novedad";
  actualizarVistaTipoRegistro();
}

function abrirModalEdicion(registro) {
  modoEdicion = true;
  limpiarMensajesFormulario();
  limpiarFormularioAyb();

  document.getElementById("tituloModalAyb").textContent = "Editar asignación A&B";
  document.getElementById("btnSubmitAsignacionAyb").textContent = "Guardar cambios";

  document.getElementById("registroIdAyb").value = registro.id || "";
  document.getElementById("cedulaEmpleadoAyb").value = registro.cedula || "";
  document.getElementById("nombreEmpleadoAyb").value = registro.nombre || "";
  document.getElementById("cargoEmpleadoAyb").value = registro.cargo || "";
  document.getElementById("busquedaEmpleadoAyb").value = `${registro.cedula || ""} - ${registro.nombre || ""}${registro.cargo ? ` - ${registro.cargo}` : ""}`;
  document.getElementById("fechaAyb").value = registro.fecha || "";
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

    const tieneBloque2 = Boolean(registro.subarea_2 || registro.turno_2 || registro.hora_inicio_2 || registro.hora_fin_2);
    document.getElementById("checkTurnoPartido").checked = tieneBloque2;
    document.getElementById("bloqueTurnoPartido").classList.toggle("d-none", !tieneBloque2);
  }

  actualizarVistaTipoRegistro();
  actualizarInfoSubarea();

  if (modalAsignacionAyb) modalAsignacionAyb.show();
}

function limpiarFormularioAyb() {
  document.getElementById("formAsignacionAyb").reset();
  document.getElementById("registroIdAyb").value = "";
  document.getElementById("cargoEmpleadoAyb").value = "";
  document.getElementById("checkTurnoPartido").checked = false;
  document.getElementById("bloqueTurnoPartido").classList.add("d-none");
  actualizarVistaTipoRegistro();
  actualizarInfoSubarea();
}

function precargarFechaFormulario() {
  const inputFecha = document.getElementById("fechaAyb");
  if (inputFecha && semanaActual[0]?.fecha) {
    inputFecha.value = semanaActual[0].fecha;
  }
}

async function guardarAsignacionAyb() {
  limpiarMensajesFormulario();

  const btnSubmit = document.getElementById("btnSubmitAsignacionAyb");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = modoEdicion ? "Guardando cambios..." : "Guardando...";
  }

  try {
    const id = texto(document.getElementById("registroIdAyb").value);
    const tipoRegistro = texto(document.getElementById("tipoRegistroAyb").value);
    const cedula = texto(document.getElementById("cedulaEmpleadoAyb").value);
    const nombre = texto(document.getElementById("nombreEmpleadoAyb").value);
    const cargo = texto(document.getElementById("cargoEmpleadoAyb").value);
    const subarea = texto(document.getElementById("subareaAyb").value);
    const fecha = document.getElementById("fechaAyb").value;
    const observacion = texto(document.getElementById("observacionAyb").value);

    if (!cedula || !nombre || !fecha) {
      mostrarErrorFormulario("Debe completar empleado y fecha.");
      return;
    }

    const empleadoPermitido = empleadosAyb.find((emp) => String(emp.cedula) === String(cedula));
    if (!empleadoPermitido) {
      mostrarErrorFormulario("Solo puedes asignar personal perteneciente a A&B.");
      return;
    }

    const payload = {
      cedula,
      nombre,
      cargo,
      area: AREA_AYB,
      subarea: null,
      fecha,
      dia: obtenerNombreDia(new Date(`${fecha}T00:00:00`)),
      observacion,
      tipo_registro: tipoRegistro,
      subarea_2: null,
      turno: null,
      hora_inicio: null,
      hora_fin: null,
      turno_2: null,
      hora_inicio_2: null,
      hora_fin_2: null,
      novedad_codigo: null,
      novedad_descripcion: null
    };

    if (tipoRegistro === "novedad") {
      const novedadCodigo = texto(document.getElementById("novedadCodigoAyb").value);
      const novedadDescripcion = texto(document.getElementById("novedadDescripcionAyb").value);

      if (!novedadCodigo) {
        mostrarErrorFormulario("Debe seleccionar una novedad.");
        return;
      }

      payload.novedad_codigo = novedadCodigo;
      payload.novedad_descripcion = novedadDescripcion || (NOVEDADES_LABELS[novedadCodigo] || novedadCodigo);
      payload.turno = novedadCodigo;
    } else {
      if (!subarea) {
        mostrarErrorFormulario("Debe seleccionar restaurante / subárea.");
        return;
      }

      const turno = texto(document.getElementById("turnoAyb").value);
      const horaInicio = document.getElementById("horaInicioAyb").value;
      const horaFin = document.getElementById("horaFinAyb").value;
      const checkTurnoPartido = document.getElementById("checkTurnoPartido").checked;
      const subarea2 = texto(document.getElementById("subarea2Ayb").value);
      const turno2 = texto(document.getElementById("turno2Ayb").value);
      const horaInicio2 = document.getElementById("horaInicio2Ayb").value;
      const horaFin2 = document.getElementById("horaFin2Ayb").value;

      if (!turno || !horaInicio || !horaFin) {
        mostrarErrorFormulario("Debe completar el turno y horario del bloque 1.");
        return;
      }

      if (checkTurnoPartido && (!subarea2 || !turno2 || !horaInicio2 || !horaFin2)) {
        mostrarErrorFormulario("Si marca turno partido, debe completar subárea, turno y horario del bloque 2.");
        return;
      }

      payload.subarea = subarea;
      payload.turno = turno;
      payload.hora_inicio = horaInicio;
      payload.hora_fin = horaFin;
      payload.subarea_2 = checkTurnoPartido ? subarea2 : null;
      payload.turno_2 = checkTurnoPartido ? turno2 : null;
      payload.hora_inicio_2 = checkTurnoPartido ? horaInicio2 : null;
      payload.hora_fin_2 = checkTurnoPartido ? horaFin2 : null;
    }

    let error = null;

    if (modoEdicion && id) {
      const response = await supabase
        .from("programacion_turnos")
        .update(payload)
        .eq("id", id);

      error = response.error;
    } else {
      const response = await supabase
        .from("programacion_turnos")
        .insert([payload]);

      error = response.error;
    }

    if (error) {
      mostrarErrorFormulario(error.message || "No se pudo guardar la asignación en Supabase.");
      return;
    }

    mostrarOkFormulario(modoEdicion ? "Asignación actualizada correctamente." : "Asignación guardada correctamente.");

    setTimeout(async () => {
      if (modalAsignacionAyb) modalAsignacionAyb.hide();
      limpiarFormularioAyb();
      await cargarProgramacionAyb();
    }, 700);
  } catch (error) {
    console.error("Error guardando asignación A&B:", error);
    mostrarErrorFormulario(error.message || "No se pudo guardar la asignación.");
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = modoEdicion ? "Guardar cambios" : "Guardar asignación";
    }
  }
}

async function eliminarAsignacionAyb(id) {
  const confirmar = confirm("¿Seguro que deseas eliminar esta asignación?");
  if (!confirmar) return;

  const { error } = await supabase
    .from("programacion_turnos")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error eliminando asignación:", error);
    alert("No se pudo eliminar la asignación.");
    return;
  }

  await cargarProgramacionAyb();
}

function limpiarMensajesFormulario() {
  const alertaError = document.getElementById("alertaErrorAyb");
  const alertaOk = document.getElementById("alertaOkAyb");

  if (alertaError) {
    alertaError.classList.add("d-none");
    alertaError.textContent = "";
  }

  if (alertaOk) {
    alertaOk.classList.add("d-none");
    alertaOk.textContent = "";
  }
}

function mostrarErrorFormulario(mensaje) {
  const alertaError = document.getElementById("alertaErrorAyb");
  if (!alertaError) return;
  alertaError.textContent = mensaje;
  alertaError.classList.remove("d-none");
}

function mostrarOkFormulario(mensaje) {
  const alertaOk = document.getElementById("alertaOkAyb");
  if (!alertaOk) return;
  alertaOk.textContent = mensaje;
  alertaOk.classList.remove("d-none");
}

async function cargarFestivosSemana() {
  try {
    const fechaInicio = semanaActual[0]?.fecha;
    const fechaFin = semanaActual[6]?.fecha;

    const { data, error } = await supabase
      .from("festivos")
      .select("fecha,nombre,activo")
      .eq("activo", true)
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin);

    if (error) {
      console.error("No se pudieron cargar festivos:", error);
      festivosSemana = [];
      return;
    }

    festivosSemana = data || [];
  } catch (error) {
    console.error("Error cargando festivos:", error);
    festivosSemana = [];
  }
}

async function cargarProgramacionAyb() {
  try {
    await cargarFestivosSemana();

    const fechaInicio = semanaActual[0]?.fecha;
    const fechaFin = semanaActual[6]?.fecha;

    const { data, error } = await supabase
      .from("programacion_turnos")
      .select("*")
      .eq("area", AREA_AYB)
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin)
      .order("fecha", { ascending: true });

    if (error) throw error;

    registrosSemanaAyb = (data || []).map(enriquecerRegistroAyb);

    renderTablaProgramacionAyb(registrosSemanaAyb);
    renderResumenHorasAyb(registrosSemanaAyb);
  } catch (error) {
    console.error("Error cargando programación A&B:", error);
    const tbody = document.getElementById("tbodyProgramacionAYB");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-danger py-4">No se pudo cargar la programación.</td>
        </tr>
      `;
    }
  }
}

function enriquecerRegistroAyb(registro) {
  const calculo = calcularMetricasRegistro(registro);
  return {
    ...registro,
    ...calculo
  };
}

function calcularMetricasRegistro(registro) {
  if (String(registro.tipo_registro) === "novedad") {
    return {
      horas_bloque_1: 0,
      horas_bloque_2: 0,
      horas_totales: 0,
      horas_programadas: 0,
      descuento_almuerzo: 0,
      horas_diurnas: 0,
      horas_nocturnas: 0,
      horas_netas: 0,
      jornada_esperada: 0,
      horas_extra_estimadas: 0,
      extra_diurna: 0,
      extra_nocturna: 0,
      tipo_jornada: "Novedad"
    };
  }

  const b1 = calcularHorasTurnoProtegiendoNocturnas(registro.hora_inicio, registro.hora_fin);
  const b2 = calcularHorasTurnoProtegiendoNocturnas(registro.hora_inicio_2, registro.hora_fin_2);

  const horasTotales = redondearHoras(b1.total + b2.total);
  const horasDiurnas = redondearHoras(b1.diurnas + b2.diurnas);
  const horasNocturnas = redondearHoras(b1.nocturnas + b2.nocturnas);
  const horasNetas = redondearHoras(horasDiurnas + horasNocturnas);
  const descuentoAlmuerzo = horasTotales > 0 ? DESCANSO_ESTANDAR_HORAS : 0;

  const jornadaInfo = obtenerJornadaEsperadaPorFecha(registro.fecha);
  const jornada = jornadaInfo.horas;

  const horasExtraEstimadas = redondearHoras(Math.max(0, horasNetas - jornada));

  let extraDiurna = 0;
  let extraNocturna = 0;

  if (horasExtraEstimadas > 0) {
    const ordinariasDiurnas = Math.min(horasDiurnas, jornada);
    extraDiurna = redondearHoras(Math.max(0, horasDiurnas - ordinariasDiurnas));
    extraNocturna = redondearHoras(Math.max(0, horasExtraEstimadas - extraDiurna));
  }

  return {
    horas_bloque_1: redondearHoras(b1.netas),
    horas_bloque_2: redondearHoras(b2.netas),
    horas_totales: horasTotales,
    horas_programadas: horasTotales,
    descuento_almuerzo: descuentoAlmuerzo,
    horas_diurnas: horasDiurnas,
    horas_nocturnas: horasNocturnas,
    horas_netas: horasNetas,
    jornada_esperada: jornada,
    horas_extra_estimadas: horasExtraEstimadas,
    extra_diurna: extraDiurna,
    extra_nocturna: extraNocturna,
    tipo_jornada: jornadaInfo.tipo
  };
}

function calcularHorasTurnoProtegiendoNocturnas(inicio, fin) {
  if (!inicio || !fin) {
    return {
      total: 0,
      diurnas: 0,
      nocturnas: 0,
      netas: 0
    };
  }

  const inicioMin = horaTextoAMinutos(inicio);
  let finMin = horaTextoAMinutos(fin);

  if (inicioMin === null || finMin === null) {
    return {
      total: 0,
      diurnas: 0,
      nocturnas: 0,
      netas: 0
    };
  }

  if (finMin < inicioMin) {
    finMin += 24 * 60;
  }

  let minutosDiurnos = 0;
  let minutosNocturnos = 0;

  for (let m = inicioMin; m < finMin; m++) {
    const minutoDelDia = m % (24 * 60);

    if (esMinutoNocturno(minutoDelDia)) {
      minutosNocturnos += 1;
    } else {
      minutosDiurnos += 1;
    }
  }

  const minutosTotales = minutosDiurnos + minutosNocturnos;

  if (minutosTotales === 0) {
    return {
      total: 0,
      diurnas: 0,
      nocturnas: 0,
      netas: 0
    };
  }

  let descuentoMinutos = DESCANSO_ESTANDAR_HORAS * 60;

  if (minutosDiurnos >= descuentoMinutos) {
    minutosDiurnos -= descuentoMinutos;
  } else {
    const restante = descuentoMinutos - minutosDiurnos;
    minutosDiurnos = 0;
    minutosNocturnos = Math.max(0, minutosNocturnos - restante);
  }

  return {
    total: redondearHoras(minutosTotales / 60),
    diurnas: redondearHoras(minutosDiurnos / 60),
    nocturnas: redondearHoras(minutosNocturnos / 60),
    netas: redondearHoras((minutosDiurnos + minutosNocturnos) / 60)
  };
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

function obtenerJornadaEsperadaPorFecha(fechaISO) {
  if (!fechaISO) {
    return { horas: 7.5, tipo: "Martes a viernes / día hábil" };
  }

  if (esFestivo(fechaISO)) {
    return { horas: 8.5, tipo: "Festivo" };
  }

  const fecha = new Date(`${fechaISO}T00:00:00`);
  const dia = fecha.getDay();

  if (dia === 6 || dia === 0) {
    return { horas: 8.5, tipo: "Sábado/Domingo" };
  }

  return { horas: 7.5, tipo: "Martes a viernes / día hábil" };
}

function esFestivo(fechaISO) {
  return festivosSemana.some((f) => String(f.fecha) === String(fechaISO));
}

function redondearHoras(valor) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;
}

function renderTablaProgramacionAyb(registros) {
  const tbody = document.getElementById("tbodyProgramacionAYB");
  if (!tbody) return;

  const registrosPorSubarea = {};
  Object.keys(SUBAREAS_AYB).forEach((subarea) => {
    registrosPorSubarea[subarea] = {};
    semanaActual.forEach((dia) => {
      registrosPorSubarea[subarea][dia.fecha] = [];
    });
  });

  const novedades = {};
  semanaActual.forEach((dia) => {
    novedades[dia.fecha] = [];
  });

  registros.forEach((item) => {
    if (String(item.tipo_registro) === "novedad") {
      if (!novedades[item.fecha]) novedades[item.fecha] = [];
      novedades[item.fecha].push(item);
      return;
    }

    const subarea = item.subarea || "Sin subárea";
    if (!registrosPorSubarea[subarea]) {
      registrosPorSubarea[subarea] = {};
      semanaActual.forEach((dia) => {
        registrosPorSubarea[subarea][dia.fecha] = [];
      });
    }

    if (!registrosPorSubarea[subarea][item.fecha]) {
      registrosPorSubarea[subarea][item.fecha] = [];
    }

    registrosPorSubarea[subarea][item.fecha].push(item);
  });

  let html = "";

  Object.entries(SUBAREAS_AYB).forEach(([subarea, meta]) => {
    html += `
      <tr>
        <td>
          <div class="subarea-label">${escaparHtml(subarea)}</div>
          <div class="subarea-meta">${escaparHtml(meta.codigo)} · ${escaparHtml(meta.horario)}</div>
        </td>
    `;

    semanaActual.forEach((dia) => {
      const items = registrosPorSubarea[subarea]?.[dia.fecha] || [];

      html += `<td class="align-top">`;
      html += `
        <div class="acciones-celda">
          <button class="btn btn-sm btn-outline-primary" onclick="window.abrirModalNuevaAsignacionDesdeTabla('${escaparAtributo(dia.fecha)}','${escaparAtributo(subarea)}')">+ Agregar</button>
          ${turnoCopiadoAyb ? `<button class="btn btn-sm btn-outline-success" onclick="window.pegarTurnoAybEnCelda('${escaparAtributo(subarea)}','${escaparAtributo(dia.fecha)}')">Pegar</button>` : ""}
        </div>
      `;

      if (!items.length) {
        html += `<div class="text-muted small">Sin registros</div>`;
      } else {
        html += items.map((item) => construirCardTurnoCompacta(item)).join("");
      }

      html += `</td>`;
    });

    html += `</tr>`;
  });

  html += `
    <tr>
      <td>
        <div class="subarea-label">Novedades</div>
        <div class="subarea-meta">Incapacidades, vacaciones, licencias y otros</div>
      </td>
  `;

  semanaActual.forEach((dia) => {
    const items = novedades[dia.fecha] || [];

    html += `<td class="align-top">`;
    html += `
      <div class="acciones-celda">
        <button class="btn btn-sm btn-outline-primary" onclick="window.abrirModalNuevaNovedadDesdeTabla('${escaparAtributo(dia.fecha)}')">+ Novedad</button>
      </div>
    `;

    if (!items.length) {
      html += `<div class="text-muted small">Sin novedades</div>`;
    } else {
      html += items.map((item) => construirCardNovedadCompacta(item)).join("");
    }

    html += `</td>`;
  });

  html += `</tr>`;

  tbody.innerHTML = html;
}

function construirCardTurnoCompacta(item) {
  const horario1 = item.hora_inicio && item.hora_fin ? `${item.hora_inicio} - ${item.hora_fin}` : "";
  const extraClase = item.horas_extra_estimadas > 0 ? "extra-positive" : "extra-zero";

  return `
    <div class="turno-card-compact">
      <div class="compact-nombre">${escaparHtml(item.nombre || "")}</div>
      <div class="compact-cargo">${escaparHtml(item.cargo || "")}</div>
      <div class="compact-line mt-1"><strong>T:</strong> ${escaparHtml(item.turno || "")}</div>
      <div class="compact-line">${escaparHtml(horario1 || "Sin horario")}</div>
      <div class="compact-line"><strong>D:</strong> ${formatoHoras(item.horas_diurnas)} h · <strong>N:</strong> ${formatoHoras(item.horas_nocturnas)} h</div>
      <div class="compact-line"><strong>ED:</strong> ${formatoHoras(item.extra_diurna)} h · <strong>EN:</strong> ${formatoHoras(item.extra_nocturna)} h</div>
      <div class="mt-2">
        <span class="extra-badge ${extraClase}">Extra total: ${formatoHoras(item.horas_extra_estimadas)} h</span>
      </div>
      <div class="d-flex gap-1 flex-wrap mt-2">
        <button class="btn btn-sm btn-outline-dark" onclick="window.verDetalleRegistroAyb('${escaparAtributo(item.id)}')">Ver</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="window.editarAsignacionAyb('${escaparAtributo(item.id)}')">Editar</button>
        <button class="btn btn-sm btn-outline-danger" onclick="window.eliminarAsignacionAybDesdeTabla('${escaparAtributo(item.id)}')">Eliminar</button>
        <button class="btn btn-sm btn-outline-primary" onclick="window.copiarTurnoAybDesdeTabla('${escaparAtributo(item.id)}')">Copiar</button>
      </div>
    </div>
  `;
}

function construirCardNovedadCompacta(item) {
  const claseNovedad = obtenerClaseNovedad(item.novedad_codigo);
  const titulo = NOVEDADES_LABELS[item.novedad_codigo] || item.novedad_codigo || "Novedad";

  return `
    <div class="novedad-card-compact ${claseNovedad}">
      <div class="compact-nombre">${escaparHtml(item.nombre || "")}</div>
      <div class="compact-cargo">${escaparHtml(item.cargo || "")}</div>
      <div class="compact-line mt-1"><strong>${escaparHtml(titulo)}</strong></div>
      <div class="d-flex gap-1 flex-wrap mt-2">
        <button class="btn btn-sm btn-outline-dark" onclick="window.verDetalleRegistroAyb('${escaparAtributo(item.id)}')">Ver</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="window.editarAsignacionAyb('${escaparAtributo(item.id)}')">Editar</button>
        <button class="btn btn-sm btn-outline-danger" onclick="window.eliminarAsignacionAybDesdeTabla('${escaparAtributo(item.id)}')">Eliminar</button>
      </div>
    </div>
  `;
}

function obtenerClaseNovedad(codigo) {
  const c = texto(codigo).toUpperCase();
  if (c === "INC") return "novedad-inc";
  if (c === "VAC") return "novedad-vac";
  if (c === "LR") return "novedad-lr";
  return "novedad-default";
}

function renderResumenHorasAyb(registros) {
  const soloTurnos = registros.filter((r) => String(r.tipo_registro) !== "novedad");

  const totalHorasNetas = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.horas_netas || 0), 0));
  const totalHorasExtra = redondearHoras(soloTurnos.reduce((acc, r) => acc + Number(r.horas_extra_estimadas || 0), 0));

  document.getElementById("kpiHorasNetasAyb").textContent = formatoHoras(totalHorasNetas);
  document.getElementById("kpiHorasExtraAyb").textContent = formatoHoras(totalHorasExtra);
  document.getElementById("kpiRegistrosAyb").textContent = String(registros.length);

  const ranking = construirRankingEmpleados(soloTurnos);
  const top = ranking[0];

  document.getElementById("kpiTopEmpleadoHorasAyb").textContent = top ? limitarTexto(top.nombre, 12) : "-";
  document.getElementById("kpiTopEmpleadoDetalleAyb").textContent = top
    ? `${formatoHoras(top.extra)} h extra estimadas`
    : "Sin datos";

  renderTablaResumenSemanal(ranking);
}

function construirRankingEmpleados(registrosTurno) {
  const mapa = new Map();

  registrosTurno.forEach((r) => {
    const key = `${r.cedula}||${r.nombre}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        cedula: r.cedula,
        nombre: r.nombre,
        cargo: r.cargo || "",
        extra: 0,
        netas: 0,
        diurnas: 0,
        nocturnas: 0,
        extraDiurna: 0,
        extraNocturna: 0,
        registros: 0
      });
    }

    const item = mapa.get(key);
    item.extra = redondearHoras(item.extra + Number(r.horas_extra_estimadas || 0));
    item.netas = redondearHoras(item.netas + Number(r.horas_netas || 0));
    item.diurnas = redondearHoras(item.diurnas + Number(r.horas_diurnas || 0));
    item.nocturnas = redondearHoras(item.nocturnas + Number(r.horas_nocturnas || 0));
    item.extraDiurna = redondearHoras(item.extraDiurna + Number(r.extra_diurna || 0));
    item.extraNocturna = redondearHoras(item.extraNocturna + Number(r.extra_nocturna || 0));
    item.registros += 1;
  });

  return Array.from(mapa.values()).sort((a, b) => {
    if (b.extra !== a.extra) return b.extra - a.extra;
    return b.netas - a.netas;
  });
}

function renderTablaResumenSemanal(ranking) {
  const contenedor = document.getElementById("resumenSemanalAyb");
  if (!contenedor) return;

  if (!ranking.length) {
    contenedor.innerHTML = `<div class="text-muted">No hay turnos programados en la semana visible.</div>`;
    return;
  }

  const top5 = ranking.slice(0, 5);

  contenedor.innerHTML = `
    <div class="mb-3">
      <div class="fw-semibold">Top empleados con mayor sobreprogramación teórica</div>
      <div class="small text-muted">
        El descanso se descuenta del total sin afectar primero la franja nocturna.
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-sm table-striped table-ranking">
        <thead>
          <tr>
            <th>#</th>
            <th>Empleado</th>
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
          ${top5.map((item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>
                <div class="fw-semibold">${escaparHtml(item.nombre)}</div>
                <div class="small text-muted">${escaparHtml(item.cargo || "")}</div>
              </td>
              <td>${formatoHoras(item.diurnas)} h</td>
              <td>${formatoHoras(item.nocturnas)} h</td>
              <td>${formatoHoras(item.netas)} h</td>
              <td>${formatoHoras(item.extraDiurna)} h</td>
              <td>${formatoHoras(item.extraNocturna)} h</td>
              <td>${formatoHoras(item.extra)} h</td>
              <td>${item.registros}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function cargarTurnoCopiadoDesdeMemoria() {
  try {
    turnoCopiadoAyb = JSON.parse(localStorage.getItem("ccp_turno_copiado_ayb") || "null");
  } catch {
    turnoCopiadoAyb = null;
  }

  renderBannerTurnoCopiado();
}

function renderBannerTurnoCopiado() {
  const banner = document.getElementById("bannerTurnoCopiadoAyb");
  const textoBanner = document.getElementById("textoTurnoCopiadoAyb");

  if (!banner || !textoBanner) return;

  if (!turnoCopiadoAyb) {
    banner.classList.add("d-none");
    textoBanner.textContent = "No hay turno copiado";
    return;
  }

  banner.classList.remove("d-none");
  textoBanner.textContent = `${turnoCopiadoAyb.nombre} · Turno ${turnoCopiadoAyb.turno || ""} · ${turnoCopiadoAyb.subarea || ""}`;
}

function copiarTurnoAyb(registro) {
  if (!registro || String(registro.tipo_registro) === "novedad") return;

  turnoCopiadoAyb = {
    cedula: registro.cedula || "",
    nombre: registro.nombre || "",
    cargo: registro.cargo || "",
    subarea: registro.subarea || "",
    turno: registro.turno || "",
    hora_inicio: registro.hora_inicio || null,
    hora_fin: registro.hora_fin || null,
    subarea_2: registro.subarea_2 || null,
    turno_2: registro.turno_2 || null,
    hora_inicio_2: registro.hora_inicio_2 || null,
    hora_fin_2: registro.hora_fin_2 || null,
    observacion: registro.observacion || null,
    area: AREA_AYB,
    copiado_en: new Date().toISOString()
  };

  localStorage.setItem("ccp_turno_copiado_ayb", JSON.stringify(turnoCopiadoAyb));
  renderBannerTurnoCopiado();
  cargarProgramacionAyb();
}

function limpiarTurnoCopiadoAyb() {
  turnoCopiadoAyb = null;
  localStorage.removeItem("ccp_turno_copiado_ayb");
  renderBannerTurnoCopiado();
  cargarProgramacionAyb();
}

async function pegarTurnoAybEnCelda(subareaDestino, fechaDestino) {
  if (!turnoCopiadoAyb) {
    alert("Primero copia un turno.");
    return;
  }

  const cedula = texto(turnoCopiadoAyb.cedula);
  if (!cedula || !fechaDestino) {
    alert("La copia del turno está incompleta.");
    return;
  }

  const { data: existentes, error: errorValidacion } = await supabase
    .from("programacion_turnos")
    .select("id")
    .eq("area", AREA_AYB)
    .eq("cedula", cedula)
    .eq("fecha", fechaDestino)
    .limit(1);

  if (errorValidacion) {
    console.error("Error validando pegado de turno:", errorValidacion);
    alert("No se pudo validar si el empleado ya tiene turno ese día.");
    return;
  }

  if (Array.isArray(existentes) && existentes.length) {
    alert("Ese empleado ya tiene una asignación en esa fecha.");
    return;
  }

  const payload = {
    area: AREA_AYB,
    tipo_registro: "turno",
    cedula: turnoCopiadoAyb.cedula,
    nombre: turnoCopiadoAyb.nombre,
    cargo: turnoCopiadoAyb.cargo,
    subarea: subareaDestino || turnoCopiadoAyb.subarea || null,
    fecha: fechaDestino,
    dia: obtenerNombreDia(new Date(`${fechaDestino}T00:00:00`)),
    turno: turnoCopiadoAyb.turno || null,
    hora_inicio: turnoCopiadoAyb.hora_inicio || null,
    hora_fin: turnoCopiadoAyb.hora_fin || null,
    subarea_2: turnoCopiadoAyb.subarea_2 || null,
    turno_2: turnoCopiadoAyb.turno_2 || null,
    hora_inicio_2: turnoCopiadoAyb.hora_inicio_2 || null,
    hora_fin_2: turnoCopiadoAyb.hora_fin_2 || null,
    observacion: turnoCopiadoAyb.observacion || null,
    novedad_codigo: null,
    novedad_descripcion: null
  };

  const { error } = await supabase.from("programacion_turnos").insert([payload]);

  if (error) {
    console.error("Error pegando turno A&B:", error);
    alert("No se pudo pegar el turno en la fecha seleccionada.");
    return;
  }

  await cargarProgramacionAyb();
}

async function buscarRegistroPorId(id) {
  const { data, error } = await supabase
    .from("programacion_turnos")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return enriquecerRegistroAyb(data);
}

function abrirDetalleRegistro(registro) {
  const titulo = document.getElementById("detalleNombreRegistroAyb");
  const subtitulo = document.getElementById("detalleSubtituloRegistroAyb");
  const contenido = document.getElementById("detalleContenidoRegistroAyb");

  if (!titulo || !subtitulo || !contenido) return;

  titulo.textContent = registro.nombre || "Detalle del registro";

  subtitulo.textContent = registro.tipo_registro === "novedad"
    ? `${registro.fecha || ""} · ${NOVEDADES_LABELS[registro.novedad_codigo] || registro.novedad_codigo || "Novedad"}`
    : `${registro.fecha || ""} · ${registro.subarea || "Sin subárea"} · Turno ${registro.turno || ""}`;

  if (registro.tipo_registro === "novedad") {
    contenido.innerHTML = `
      <div class="row g-3 detalle-grid">
        <div class="col-md-6"><div class="item"><div class="label">Empleado</div><div class="value">${escaparHtml(registro.nombre || "")}</div></div></div>
        <div class="col-md-6"><div class="item"><div class="label">Cargo</div><div class="value">${escaparHtml(registro.cargo || "Sin cargo")}</div></div></div>
        <div class="col-md-6"><div class="item"><div class="label">Fecha</div><div class="value">${escaparHtml(registro.fecha || "")}</div></div></div>
        <div class="col-md-6"><div class="item"><div class="label">Novedad</div><div class="value">${escaparHtml(NOVEDADES_LABELS[registro.novedad_codigo] || registro.novedad_codigo || "")}</div></div></div>
        <div class="col-12"><div class="item"><div class="label">Descripción</div><div class="value">${escaparHtml(registro.novedad_descripcion || "Sin descripción")}</div></div></div>
        <div class="col-12"><div class="item"><div class="label">Observación</div><div class="value">${escaparHtml(registro.observacion || "Sin observación")}</div></div></div>
      </div>
    `;
  } else {
    const horario1 = registro.hora_inicio && registro.hora_fin ? `${registro.hora_inicio} - ${registro.hora_fin}` : "Sin horario";
    const horario2 = registro.hora_inicio_2 && registro.hora_fin_2 ? `${registro.hora_inicio_2} - ${registro.hora_fin_2}` : "Sin horario";

    contenido.innerHTML = `
      <div class="row g-3 detalle-grid">
        <div class="col-md-6"><div class="item"><div class="label">Empleado</div><div class="value">${escaparHtml(registro.nombre || "")}</div></div></div>
        <div class="col-md-6"><div class="item"><div class="label">Cargo</div><div class="value">${escaparHtml(registro.cargo || "Sin cargo")}</div></div></div>

        <div class="col-md-4"><div class="item"><div class="label">Fecha</div><div class="value">${escaparHtml(registro.fecha || "")}</div></div></div>
        <div class="col-md-4"><div class="item"><div class="label">Subárea</div><div class="value">${escaparHtml(registro.subarea || "Sin subárea")}</div></div></div>
        <div class="col-md-4"><div class="item"><div class="label">Turno bloque 1</div><div class="value">${escaparHtml(registro.turno || "")}</div></div></div>

        <div class="col-md-6"><div class="item"><div class="label">Horario bloque 1</div><div class="value">${escaparHtml(horario1)}</div></div></div>
        <div class="col-md-6"><div class="item"><div class="label">Bloque 2</div><div class="value">${escaparHtml(registro.subarea_2 || "No aplica")} ${registro.turno_2 ? `· ${escaparHtml(registro.turno_2)}` : ""} ${registro.subarea_2 || registro.turno_2 || registro.hora_inicio_2 || registro.hora_fin_2 ? `· ${escaparHtml(horario2)}` : ""}</div></div></div>

        <div class="col-md-3"><div class="item"><div class="label">Horas totales</div><div class="value">${formatoHoras(registro.horas_totales)} h</div></div></div>
        <div class="col-md-3"><div class="item"><div class="label">Diurnas</div><div class="value">${formatoHoras(registro.horas_diurnas)} h</div></div></div>
        <div class="col-md-3"><div class="item"><div class="label">Nocturnas</div><div class="value">${formatoHoras(registro.horas_nocturnas)} h</div></div></div>
        <div class="col-md-3"><div class="item"><div class="label">Almuerzo</div><div class="value">${formatoHoras(registro.descuento_almuerzo)} h</div></div></div>

        <div class="col-md-3"><div class="item"><div class="label">Netas</div><div class="value">${formatoHoras(registro.horas_netas)} h</div></div></div>
        <div class="col-md-3"><div class="item"><div class="label">Extra diurna</div><div class="value">${formatoHoras(registro.extra_diurna)} h</div></div></div>
        <div class="col-md-3"><div class="item"><div class="label">Extra nocturna</div><div class="value">${formatoHoras(registro.extra_nocturna)} h</div></div></div>
        <div class="col-md-3"><div class="item"><div class="label">Extra total</div><div class="value">${formatoHoras(registro.horas_extra_estimadas)} h</div></div></div>

        <div class="col-md-6"><div class="item"><div class="label">Jornada esperada</div><div class="value">${formatoHoras(registro.jornada_esperada)} h</div></div></div>
        <div class="col-md-6"><div class="item"><div class="label">Tipo de jornada</div><div class="value">${escaparHtml(registro.tipo_jornada || "")}</div></div></div>

        <div class="col-12"><div class="item"><div class="label">Observación</div><div class="value">${escaparHtml(registro.observacion || "Sin observación")}</div></div></div>
      </div>
    `;
  }

  if (modalDetalleRegistroAyb) {
    modalDetalleRegistroAyb.show();
  }
}

function configurarAccionesGlobales() {
  const btnLimpiar = document.getElementById("btnLimpiarTurnoCopiadoAyb");
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", limpiarTurnoCopiadoAyb);
  }

  window.abrirModalNuevaAsignacionDesdeTabla = (fecha, subarea) => abrirModalNuevaAsignacion(fecha, subarea);
  window.abrirModalNuevaNovedadDesdeTabla = (fecha) => abrirModalNuevaNovedad(fecha);

  window.editarAsignacionAyb = async (id) => {
    try {
      const registro = await buscarRegistroPorId(id);
      abrirModalEdicion(registro);
    } catch (error) {
      console.error("Error cargando registro:", error);
      alert("No se pudo cargar el registro.");
    }
  };

  window.verDetalleRegistroAyb = async (id) => {
    try {
      const registro = await buscarRegistroPorId(id);
      abrirDetalleRegistro(registro);
    } catch (error) {
      console.error("Error cargando detalle del registro:", error);
      alert("No se pudo cargar el detalle.");
    }
  };

  window.eliminarAsignacionAybDesdeTabla = async (id) => {
    await eliminarAsignacionAyb(id);
  };

  window.copiarTurnoAybDesdeTabla = async (id) => {
    try {
      const registro = await buscarRegistroPorId(id);
      copiarTurnoAyb(registro);
    } catch (error) {
      console.error("Error copiando turno:", error);
      alert("No se pudo copiar el turno.");
    }
  };

  window.pegarTurnoAybEnCelda = async (subarea, fecha) => {
    await pegarTurnoAybEnCelda(subarea, fecha);
  };
}

function generarPdfGeneralAyb() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librería de PDF no está disponible.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  let y = 12;
  const margenX = 10;
  const maxY = 190;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Programación general A&B", margenX, y);

  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Semana: ${document.getElementById("textoSemanaAyb")?.textContent || ""}`, margenX, y);

  y += 8;

  const porSubarea = agruparTurnosPorSubarea(registrosSemanaAyb);

  Object.entries(porSubarea).forEach(([subarea, items]) => {
    if (y > maxY) {
      doc.addPage();
      y = 12;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(subarea, margenX, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    if (!items.length) {
      doc.text("Sin registros", margenX + 4, y);
      y += 6;
      return;
    }

    items.forEach((item) => {
      if (y > maxY) {
        doc.addPage();
        y = 12;
      }

      const linea = [
        item.fecha || "",
        item.nombre || "",
        item.turno || (NOVEDADES_LABELS[item.novedad_codigo] || item.novedad_codigo || ""),
        item.subarea || "Novedad",
        `D ${formatoHoras(item.horas_diurnas)}h`,
        `N ${formatoHoras(item.horas_nocturnas)}h`,
        `ED ${formatoHoras(item.extra_diurna)}h`,
        `EN ${formatoHoras(item.extra_nocturna)}h`
      ].join(" | ");

      doc.text(limitarTexto(linea, 145), margenX + 3, y);
      y += 5;
    });

    y += 3;
  });

  doc.save(`programacion_general_ayb_${semanaActual[0]?.fecha || "semana"}.pdf`);
}

function generarPdfEmpleadoAyb() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librería de PDF no está disponible.");
    return;
  }

  const select = document.getElementById("selectEmpleadoPdfAyb");
  const cedula = select?.value || "";

  if (!cedula) {
    alert("Selecciona un empleado para generar el PDF.");
    return;
  }

  const empleado = empleadosAyb.find((e) => String(e.cedula) === String(cedula));
  const registrosEmpleado = registrosSemanaAyb.filter((r) => String(r.cedula) === String(cedula));

  if (!empleado) {
    alert("No se encontró el empleado seleccionado.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = 15;
  const margenX = 12;
  const maxY = 275;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Programación semanal por empleado - A&B", margenX, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Semana: ${document.getElementById("textoSemanaAyb")?.textContent || ""}`, margenX, y);
  y += 6;
  doc.text(`Empleado: ${empleado.nombre}`, margenX, y);
  y += 6;
  doc.text(`Cédula: ${empleado.cedula}`, margenX, y);
  y += 6;
  doc.text(`Cargo: ${empleado.cargo || "Sin cargo"}`, margenX, y);

  y += 8;

  if (!registrosEmpleado.length) {
    doc.text("No hay registros programados para este empleado en la semana visible.", margenX, y);
    doc.save(`programacion_${empleado.cedula}_${semanaActual[0]?.fecha || "semana"}.pdf`);
    return;
  }

  registrosEmpleado.forEach((item) => {
    if (y > maxY) {
      doc.addPage();
      y = 15;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${item.fecha} - ${item.tipo_registro === "novedad" ? "Novedad" : "Turno"}`, margenX, y);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    if (item.tipo_registro === "novedad") {
      doc.text(`Novedad: ${item.novedad_descripcion || NOVEDADES_LABELS[item.novedad_codigo] || item.novedad_codigo || ""}`, margenX + 3, y);
      y += 5;
    } else {
      const horario1 = item.hora_inicio && item.hora_fin ? `${item.hora_inicio} - ${item.hora_fin}` : "";
      const horario2 = item.hora_inicio_2 && item.hora_fin_2 ? `${item.hora_inicio_2} - ${item.hora_fin_2}` : "";

      doc.text(`Subárea: ${item.subarea || ""}`, margenX + 3, y);
      y += 5;
      doc.text(`Turno: ${item.turno || ""}`, margenX + 3, y);
      y += 5;
      doc.text(`Horario: ${horario1}`, margenX + 3, y);
      y += 5;

      if (item.subarea_2 || item.turno_2 || horario2) {
        doc.text(`Bloque 2: ${item.subarea_2 || ""} ${item.turno_2 || ""} ${horario2}`, margenX + 3, y);
        y += 5;
      }

      doc.text(`Horas diurnas: ${formatoHoras(item.horas_diurnas)} h`, margenX + 3, y);
      y += 5;
      doc.text(`Horas nocturnas: ${formatoHoras(item.horas_nocturnas)} h`, margenX + 3, y);
      y += 5;
      doc.text(`Horas netas: ${formatoHoras(item.horas_netas)} h`, margenX + 3, y);
      y += 5;
      doc.text(`Extra diurna: ${formatoHoras(item.extra_diurna)} h`, margenX + 3, y);
      y += 5;
      doc.text(`Extra nocturna: ${formatoHoras(item.extra_nocturna)} h`, margenX + 3, y);
      y += 5;
      doc.text(`Extra total: ${formatoHoras(item.horas_extra_estimadas)} h`, margenX + 3, y);
      y += 5;
    }

    if (item.observacion) {
      doc.text(`Observación: ${limitarTexto(item.observacion, 75)}`, margenX + 3, y);
      y += 5;
    }

    y += 3;
  });

  doc.save(`programacion_${empleado.cedula}_${semanaActual[0]?.fecha || "semana"}.pdf`);
}

function agruparTurnosPorSubarea(registros) {
  const resultado = {};

  Object.keys(SUBAREAS_AYB).forEach((sub) => {
    resultado[sub] = [];
  });

  resultado["Novedades"] = [];

  registros.forEach((item) => {
    if (String(item.tipo_registro) === "novedad") {
      resultado["Novedades"].push(item);
      return;
    }

    const sub = item.subarea || "Sin subárea";
    if (!resultado[sub]) resultado[sub] = [];
    resultado[sub].push(item);
  });

  return resultado;
}

function texto(valor) {
  return String(valor ?? "").trim();
}

function formatoHoras(valor) {
  return Number(valor || 0).toFixed(2);
}

function limitarTexto(textoEntrada, maximo) {
  const valor = String(textoEntrada || "");
  return valor.length > maximo ? `${valor.slice(0, maximo - 3)}...` : valor;
}

function escaparHtml(textoEntrada) {
  return String(textoEntrada ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escaparAtributo(textoEntrada) {
  return String(textoEntrada ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}
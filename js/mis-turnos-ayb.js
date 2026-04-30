import { supabase } from "../supabase/supabaseClient.js";

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

let sesionActual = null;
let fechaInicioSemana = null;
let semanaActual = [];
let modalCatalogoTurnos = null;

document.addEventListener("DOMContentLoaded", async () => {
  sesionActual = JSON.parse(localStorage.getItem("ccp_sesion") || "null");

  if (!sesionActual) {
    window.location.href = "login.html";
    return;
  }

  if (!sesionActual.cedula) {
    alert("No se encontró la identificación del empleado en la sesión.");
    window.location.href = "login.html";
    return;
  }

  fechaInicioSemana = obtenerInicioSemanaOperativa(new Date());
  semanaActual = construirSemana(fechaInicioSemana);

  inicializarModal();
  configurarBotones();
  mostrarBotonVolverSiEsAdmin();
  cargarDatosEncabezado();
  await cargarMisTurnosAyb();
});

function inicializarModal() {
  const modalElement = document.getElementById("modalCatalogoTurnos");
  if (modalElement) {
    modalCatalogoTurnos = new bootstrap.Modal(modalElement);
  }
}

function configurarBotones() {
  const btnSemanaAnterior = document.getElementById("btnSemanaAnteriorEmpleado");
  const btnSemanaSiguiente = document.getElementById("btnSemanaSiguienteEmpleado");
  const btnVerTurnosCatalogo = document.getElementById("btnVerTurnosCatalogo");
  const btnCerrarSesionEmpleado = document.getElementById("btnCerrarSesionEmpleado");

  if (btnSemanaAnterior) {
    btnSemanaAnterior.addEventListener("click", async () => {
      fechaInicioSemana.setDate(fechaInicioSemana.getDate() - 7);
      semanaActual = construirSemana(fechaInicioSemana);
      cargarDatosEncabezado();
      await cargarMisTurnosAyb();
      desplazarArriba();
    });
  }

  if (btnSemanaSiguiente) {
    btnSemanaSiguiente.addEventListener("click", async () => {
      fechaInicioSemana.setDate(fechaInicioSemana.getDate() + 7);
      semanaActual = construirSemana(fechaInicioSemana);
      cargarDatosEncabezado();
      await cargarMisTurnosAyb();
      desplazarArriba();
    });
  }

  if (btnVerTurnosCatalogo) {
    btnVerTurnosCatalogo.addEventListener("click", () => {
      if (modalCatalogoTurnos) modalCatalogoTurnos.show();
    });
  }

  if (btnCerrarSesionEmpleado) {
    btnCerrarSesionEmpleado.addEventListener("click", () => {
      sessionStorage.removeItem("origen_mis_turnos");
      localStorage.removeItem("ccp_sesion");
      window.location.href = "login.html";
    });
  }
}

function mostrarBotonVolverSiEsAdmin() {
  const btnVolver = document.getElementById("btnVolverModuloAnterior");
  if (!btnVolver || !sesionActual) return;

  const origen = String(sessionStorage.getItem("origen_mis_turnos") || "").trim().toLowerCase();

  const posiblesValores = [
    sesionActual.rol,
    sesionActual.role,
    sesionActual.tipo_usuario,
    sesionActual.tipo,
    sesionActual.perfil,
    sesionActual.cargo,
    sesionActual.nombre_completo,
    sesionActual.nombre
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());

  const textoSesion = posiblesValores.join(" | ");

  const esPerfilAdministrativo =
    textoSesion.includes("admin") ||
    textoSesion.includes("administrador") ||
    textoSesion.includes("jefe") ||
    textoSesion.includes("gerencia") ||
    textoSesion.includes("administrativo") ||
    textoSesion.includes("coordinador") ||
    textoSesion.includes("director") ||
    textoSesion.includes("ayb") ||
    textoSesion.includes("bienestar");

  const vieneDesdeModuloAdmin = origen === "admin";

  if (!(esPerfilAdministrativo && vieneDesdeModuloAdmin)) return;

  btnVolver.classList.remove("d-none");
  btnVolver.addEventListener("click", () => {
    sessionStorage.removeItem("origen_mis_turnos");
    window.location.href = "programacion-ayb.html";
  });
}

function cargarDatosEncabezado() {
  const nombre = sesionActual.nombre_completo || "Empleado";
  const cargo = sesionActual.cargo || "Sin cargo";

  const nombreEmpleado = document.getElementById("nombreEmpleadoAybVista");
  const cargoEmpleado = document.getElementById("cargoEmpleadoAybVista");
  const subtitulo = document.getElementById("subtituloMisTurnosAyb");
  const mesAnio = document.getElementById("mesAnioEmpleadoAyb");
  const rangoSemana = document.getElementById("rangoSemanaEmpleadoAyb");

  if (nombreEmpleado) nombreEmpleado.textContent = nombre;
  if (cargoEmpleado) cargoEmpleado.textContent = cargo;
  if (subtitulo) subtitulo.textContent = `Hola ${nombre}. Aquí puedes ver tus turnos y radicar solicitudes de Bienestar sin buscar en otras pantallas.`;

  if (mesAnio) {
    const primera = new Date(`${semanaActual[0].fecha}T00:00:00`);
    mesAnio.textContent = `${obtenerNombreMes(primera.getMonth())} ${primera.getFullYear()}`;
  }

  if (rangoSemana) {
    const primera = new Date(`${semanaActual[0].fecha}T00:00:00`);
    const ultima = new Date(`${semanaActual[6].fecha}T00:00:00`);
    rangoSemana.textContent = `${primera.getDate()} al ${ultima.getDate()} de ${obtenerNombreMes(ultima.getMonth())}`;
  }
}

async function cargarMisTurnosAyb() {
  const contenedor = document.getElementById("contenedorSemanaEmpleado");
  if (!contenedor) return;

  contenedor.innerHTML = `
    <div class="col-12">
      <div class="estado-vacio-ux">
        <span class="estado-vacio-icon" aria-hidden="true">⏳</span>
        <div>
          <div class="estado-vacio-title">Cargando tu programación</div>
          <p class="estado-vacio-text">Estamos consultando tus turnos de la semana.</p>
        </div>
      </div>
    </div>
  `;

  const cedulaSesion = normalizarCedula(sesionActual.cedula);
  const fechasSemana = new Set(semanaActual.map((dia) => dia.fecha));

  const { data, error } = await supabase
    .from("programacion_turnos")
    .select("*")
    .eq("cedula", cedulaSesion)
    .order("fecha", { ascending: true });

  if (error) {
    console.error("Error cargando programación:", error);
    contenedor.innerHTML = `
      <div class="col-12">
        <div class="estado-vacio-ux">
          <span class="estado-vacio-icon" aria-hidden="true">⚠️</span>
          <div>
            <div class="estado-vacio-title">No se pudo cargar la programación</div>
            <p class="estado-vacio-text">Intenta recargar la página. Si continúa el error, reporta el caso a Sistemas o Bienestar.</p>
          </div>
        </div>
      </div>
    `;
    actualizarResumen([], [], new Set());
    return;
  }

  const registrosSemana = (data || []).filter((item) => {
    const fechaRegistro = String(item.fecha || "").trim();
    return fechasSemana.has(fechaRegistro);
  });

  if (registrosSemana.length === 0) {
    if ((data || []).length > 0) {
      contenedor.innerHTML = `
        <div class="col-12">
          <div class="estado-vacio-ux">
            <span class="estado-vacio-icon" aria-hidden="true">📆</span>
            <div>
              <div class="estado-vacio-title">No hay turnos en esta semana</div>
              <p class="estado-vacio-text">Sí existen registros para este empleado, pero no dentro de la semana visible. Usa <strong>Semana anterior</strong> o <strong>Semana siguiente</strong>.</p>
            </div>
          </div>
        </div>
      `;
    } else {
      contenedor.innerHTML = `
        <div class="col-12">
          <div class="estado-vacio-ux">
            <span class="estado-vacio-icon" aria-hidden="true">ℹ️</span>
            <div>
              <div class="estado-vacio-title">Aún no tienes programación registrada</div>
              <p class="estado-vacio-text">Cuando A&amp;B publique tu turno, aparecerá en esta pantalla.</p>
            </div>
          </div>
        </div>
      `;
    }

    actualizarResumen([], [], new Set());
    return;
  }

  renderSemanaEmpleado(registrosSemana);
}

function renderSemanaEmpleado(registros) {
  const contenedor = document.getElementById("contenedorSemanaEmpleado");
  if (!contenedor) return;

  const mapaPorFecha = {};
  registros.forEach((item) => {
    if (!mapaPorFecha[item.fecha]) {
      mapaPorFecha[item.fecha] = [];
    }
    mapaPorFecha[item.fecha].push(item);
  });

  const novedades = [];
  const turnos = [];
  const subareas = new Set();

  const crearDetalle = (label, valor) => `
    <div class="turno-detail">
      <span class="turno-detail-label">${escaparHtml(label)}</span>
      <span class="turno-detail-value">${escaparHtml(valor || "-")}</span>
    </div>
  `;

  const crearBloqueTurno = (item, numeroBloque = 1) => {
    const esBloque2 = numeroBloque === 2;
    const subarea = esBloque2 ? item.subarea_2 : item.subarea;
    const turno = esBloque2 ? item.turno_2 : item.turno;
    const horaInicio = esBloque2 ? item.hora_inicio_2 : item.hora_inicio;
    const horaFin = esBloque2 ? item.hora_fin_2 : item.hora_fin;
    const horario = horaInicio && horaFin ? `${horaInicio} - ${horaFin}` : "-";

    return `
      <div class="${esBloque2 ? "turno-bloque-secundario" : "turno-primary"}">
        ${esBloque2 ? `<div class="turno-bloque-title">↳ Bloque 2 del día</div>` : ""}
        <div class="turno-time-box">
          <span class="turno-time-icon" aria-hidden="true">🕒</span>
          <span>
            <span class="turno-time-label">${esBloque2 ? "Segundo horario" : "Horario principal"}</span>
            <span class="turno-time-value">${escaparHtml(horario)}</span>
          </span>
        </div>
        <div class="turno-detail-grid">
          ${crearDetalle("Subárea", subarea)}
          ${crearDetalle("Turno", turno)}
        </div>
      </div>
    `;
  };

  const html = semanaActual.map((dia) => {
    const itemsDia = mapaPorFecha[dia.fecha] || [];
    const esHoy = dia.fecha === formatearFechaISO(new Date());
    const tieneNovedad = itemsDia.some((item) => item.tipo_registro === "novedad");

    let claseDia = "";
    let badgeTexto = "";
    let badgeClase = "";

    if (esHoy) {
      claseDia = "today";
      badgeTexto = "Hoy";
      badgeClase = "badge-hoy";
    } else if (itemsDia.length === 0) {
      claseDia = "descanso";
      badgeTexto = "Sin turno";
      badgeClase = "badge-descanso";
    } else if (tieneNovedad) {
      claseDia = "novedad";
      badgeTexto = "Novedad";
      badgeClase = "badge-novedad";
    }

    if (itemsDia.length === 0) {
      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="dia-card ${claseDia}">
            <div class="dia-head">
              <div class="dia-head-left">
                <div class="dia-nombre">${dia.nombre}</div>
                <div class="dia-fecha">${formatearFechaBonita(dia.fecha)}</div>
              </div>
              <div class="dia-badge ${badgeClase}">${badgeTexto}</div>
            </div>

            <div class="dia-body">
              <div class="dia-empty">No tienes turno registrado este día.</div>
            </div>
          </div>
        </div>
      `;
    }

    const contenido = itemsDia.map((item) => {
      if (item.subarea) subareas.add(item.subarea);
      if (item.subarea_2) subareas.add(item.subarea_2);

      if (item.tipo_registro === "novedad") {
        novedades.push(item);

        const nombreNovedad = obtenerNombreNovedad(item.novedad_codigo, item.novedad_descripcion);

        return `
          <div class="novedad-card">
            <div class="novedad-primary">
              <span class="novedad-time-icon" aria-hidden="true">⚠️</span>
              <div>
                <span class="novedad-label">Novedad del día</span>
                <div class="novedad-title">${escaparHtml(nombreNovedad)}</div>
                <div class="novedad-meta"><strong>Subárea:</strong> ${escaparHtml(item.subarea || "-")}</div>
              </div>
            </div>
            ${
              item.observacion
                ? `<div class="novedad-observacion">${escaparHtml(item.observacion)}</div>`
                : ""
            }
          </div>
        `;
      }

      turnos.push(item);

      const tieneBloque2 = item.turno_2 || item.hora_inicio_2 || item.hora_fin_2 || item.subarea_2;

      return `
        <div class="turno-card">
          ${crearBloqueTurno(item, 1)}
          ${tieneBloque2 ? crearBloqueTurno(item, 2) : ""}
          ${
            item.observacion
              ? `<div class="turno-observacion">${escaparHtml(item.observacion)}</div>`
              : ""
          }
        </div>
      `;
    }).join("");

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="dia-card ${claseDia}">
          <div class="dia-head">
            <div class="dia-head-left">
              <div class="dia-nombre">${dia.nombre}</div>
              <div class="dia-fecha">${formatearFechaBonita(dia.fecha)}</div>
            </div>
            ${badgeTexto ? `<div class="dia-badge ${badgeClase}">${badgeTexto}</div>` : ""}
          </div>

          <div class="dia-body">
            ${contenido}
          </div>
        </div>
      </div>
    `;
  }).join("");

  contenedor.innerHTML = html;
  actualizarResumen(turnos, novedades, subareas);
}

function actualizarResumen(turnos, novedades, subareas = new Set()) {
  const resumenTurnos = document.getElementById("resumenTurnosEmpleado");
  const resumenNovedades = document.getElementById("resumenNovedadesEmpleado");
  const resumenPuntos = document.getElementById("resumenPuntosEmpleado");

  if (resumenTurnos) resumenTurnos.textContent = turnos.length;
  if (resumenNovedades) resumenNovedades.textContent = novedades.length;
  if (resumenPuntos) resumenPuntos.textContent = subareas.size;
}

function desplazarArriba() {
  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function normalizarCedula(valor) {
  return String(valor ?? "").replace(/\D/g, "").trim();
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
      nombre: obtenerNombreDia(fecha)
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

function formatearFechaBonita(fechaISO) {
  const [year, month, day] = String(fechaISO).split("-");
  return `${day}/${month}/${year}`;
}

function obtenerNombreDia(fecha) {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return dias[fecha.getDay()];
}

function obtenerNombreMes(index) {
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return meses[index];
}

function obtenerNombreNovedad(codigo, descripcion) {
  const c = String(codigo || "").toUpperCase();
  return NOVEDADES_LABELS[c] || descripcion || c || "Novedad";
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
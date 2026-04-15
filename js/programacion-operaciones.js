const estructuraProgramacionOperaciones = {
  empleado_id: null,
  subarea: "",
  tipo_actividad: "",
  hora_inicio: "",
  hora_fin: "",
  descripcion_actividad: "",
  responsable_area: "",
  requiere_evidencia: false,
  observacion: "",
  fecha: "",
  estado: "activo"
};

const estructuraEvento = {
  tipo_evento: "",
  ubicacion_evento: "",
  cantidad_apoyos: 0,
  montaje: false,
  desmontaje: false
};

document.addEventListener("DOMContentLoaded", () => {
  const sesion = JSON.parse(localStorage.getItem("ccp_sesion") || "null");

  if (!sesion) {
    window.location.href = "login.html";
    return;
  }

  protegerModulo(sesion);
  aplicarPermisosNavegacion(sesion);
  configurarCerrarSesion();
  cargarEncabezadoUsuario(sesion);
  configurarBotones();
  cargarIndicadoresBase(sesion);

  console.log("Módulo de Programación de Operaciones cargado correctamente.");
});

function protegerModulo(sesion) {
  const moduloActual = "programacion-operaciones";

  if (sesion.puede_ver_todo === true) {
    return;
  }

  if (!Array.isArray(sesion.modulos_permitidos) || !sesion.modulos_permitidos.includes(moduloActual)) {
    alert("No tienes permisos para acceder a Programación Operaciones.");
    window.location.href = "dashboard.html";
  }
}

function aplicarPermisosNavegacion(sesion) {
  const links = document.querySelectorAll(".nav-link");

  links.forEach((link) => {
    const href = link.getAttribute("href") || "";

    if (href.includes("login.html")) {
      return;
    }

    if (sesion.puede_ver_todo === true) {
      return;
    }

    const modulo = obtenerClaveModulo(href);

    if (!tieneAccesoModulo(sesion, modulo)) {
      link.style.display = "none";
    }
  });
}

function tieneAccesoModulo(sesion, modulo) {
  if (sesion.puede_ver_todo === true) {
    return true;
  }

  if (!Array.isArray(sesion.modulos_permitidos)) {
    return false;
  }

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

function cargarEncabezadoUsuario(sesion) {
  const subtitulo = document.getElementById("subtituloProgramacionOperaciones");

  if (!subtitulo) {
    return;
  }

  const nombre = sesion.nombre_completo || "Usuario";
  const cargo = sesion.cargo || "Sin cargo";
  const rol = traducirRol(sesion.rol);

  subtitulo.textContent = `Cronograma semanal del personal de aseo, apoyo y eventos | Usuario: ${nombre} | Cargo: ${cargo} | Rol: ${rol}`;
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

function configurarBotones() {
  const btnSemanaAnterior = document.getElementById("btnSemanaAnteriorOperaciones");
  const btnSemanaSiguiente = document.getElementById("btnSemanaSiguienteOperaciones");
  const btnNuevaProgramacion = document.getElementById("btnNuevaProgramacionOperaciones");
  const btnGuardar = document.getElementById("btnGuardarProgramacionOperaciones");

  if (btnSemanaAnterior) {
    btnSemanaAnterior.addEventListener("click", () => {
      alert("Siguiente paso: cargar semana anterior de operaciones.");
    });
  }

  if (btnSemanaSiguiente) {
    btnSemanaSiguiente.addEventListener("click", () => {
      alert("Siguiente paso: cargar semana siguiente de operaciones.");
    });
  }

  if (btnNuevaProgramacion) {
    btnNuevaProgramacion.addEventListener("click", () => {
      console.log("Estructura base programación operaciones:", estructuraProgramacionOperaciones);
      console.log("Estructura base evento:", estructuraEvento);
      alert("Siguiente paso: abrir formulario real para nueva programación de operaciones.");
    });
  }

  if (btnGuardar) {
    btnGuardar.addEventListener("click", () => {
      alert("Siguiente paso: guardar programación de operaciones en Supabase.");
    });
  }
}

function cargarIndicadoresBase(sesion) {
  const kpiPersonal = document.getElementById("kpiOperacionesPersonal");
  const kpiSubareas = document.getElementById("kpiOperacionesSubareas");
  const kpiNovedades = document.getElementById("kpiOperacionesNovedades");
  const kpiEspeciales = document.getElementById("kpiOperacionesEspeciales");

  if (kpiPersonal) kpiPersonal.textContent = "--";
  if (kpiSubareas) kpiSubareas.textContent = Array.isArray(sesion.areas_permitidas) ? sesion.areas_permitidas.length : 0;
  if (kpiNovedades) kpiNovedades.textContent = "--";
  if (kpiEspeciales) kpiEspeciales.textContent = "--";
}
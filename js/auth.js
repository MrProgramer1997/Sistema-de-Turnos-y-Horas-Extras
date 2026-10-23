import { loginEmpleadoSeguro } from "./portal-acceso-empleado.js?v=750";
import { destinoPermitido } from "./permisos-core.js?v=720";
import { crearIngresoAdmin761, mensajeErrorIngreso761, ErrorIngreso761 } from "./login-admin-resiliente.js?v=761";
import { supabase } from "../supabase/supabaseClient.js";

function normalizarTexto(valor) {
  return String(valor || "").trim().toLowerCase();
}

function obtenerPermisosPorRol(rol) {
  const r = normalizarTexto(rol);

  const mapa = {
    admin: {
      puede_ver_todo: true,
      areas_permitidas: ["*"],
      modulos_permitidos: [
        "dashboard",
        "solicitudes-bienestar",
        "programacion-ayb",
        "cocina-chef",
        "programacion-administrativo",
        "programacion-operaciones",
        "mis-turnos-ayb",
        "mis-turnos-administrativo",
        "empleados",
        "usuarios-admin",
        "horas-extras"
      ]
    },

    gerencia: {
      puede_ver_todo: true,
      areas_permitidas: ["*"],
      modulos_permitidos: [
        "dashboard",
        "solicitudes-bienestar",
        "programacion-ayb",
        "cocina-chef",
        "programacion-administrativo",
        "programacion-operaciones",
        "mis-turnos-ayb",
        "mis-turnos-administrativo",
        "empleados",
        "usuarios-admin"
      ]
    },

    bienestar: {
      puede_ver_todo: true,
      areas_permitidas: ["*"],
      modulos_permitidos: [
        "dashboard",
        "solicitudes-bienestar",
        "mis-turnos-administrativo"
      ]
    },

    ayb: {
      puede_ver_todo: false,
      areas_permitidas: [
        "Alimentos y Bebidas"
      ],
      modulos_permitidos: [
        "dashboard",
        "dashboard-ayb",
        "solicitudes-bienestar",
        "programacion-ayb",
        "cocina-chef",
        "mis-turnos-ayb",
        "horas-extras"
      ]
    },

    servicios_generales: {
      puede_ver_todo: false,
      areas_permitidas: [
        "SERVICIOS GENERALES",
        "OPERACIONES"
      ],
      modulos_permitidos: [
        "dashboard",
        "programacion-operaciones",
        "mis-turnos-administrativo"
      ]
    },

    direccion_financiera: {
      puede_ver_todo: false,
      areas_permitidas: [
        "DIRECCION ADMINISTRATIVA",
        "DIRECCIÓN ADMINISTRATIVA",
        "DIRECCION FINANCIERA",
        "DIRECCIÓN FINANCIERA",
        "CONTABILIDAD",
        "CARTERA",
        "COMPRAS",
        "SISTEMAS",
        "AUDITORIA",
        "AUDITORÍA"
      ],
      modulos_permitidos: [
        "dashboard",
        "programacion-administrativo",
        "mis-turnos-administrativo",
        "empleados",
        "usuarios-admin"
      ]
    }
  };

  // Equivalencias de la autenticación nueva con los permisos ya confirmados.
  mapa.administrador = mapa.admin;
  mapa.nomina = mapa.admin;
  mapa.aprobador = {
    puede_ver_todo: false,
    areas_permitidas: [],
    modulos_permitidos: ["horas-extras"]
  };
  mapa.auditor = {
    puede_ver_todo: true,
    areas_permitidas: ["*"],
    modulos_permitidos: ["dashboard", "dashboard-ayb", "horas-extras"]
  };
  mapa.gerencia = {
    puede_ver_todo: true,
    areas_permitidas: ["*"],
    modulos_permitidos: ["dashboard", "dashboard-ayb", "horas-extras", "programacion-ayb", "cocina-chef", "programacion-administrativo", "programacion-operaciones", "mis-turnos-ayb", "mis-turnos-administrativo", "empleados"]
  };

  return mapa[r] || {
    puede_ver_todo: false,
    areas_permitidas: [],
    modulos_permitidos: []
  };
}

const parametrosRecuperacion = new URLSearchParams(window.location.search);
const retornoSolicitado = parametrosRecuperacion.get('volver');
const retornoSeguro = ['dashboard.html','horas-extras.html'].includes(retornoSolicitado) ? retornoSolicitado : null;

const ingresoAdmin761 = crearIngresoAdmin761({
  client: supabase,
  clearApplicationSession: () => localStorage.removeItem("ccp_sesion"),
  onStatus: texto => window.mostrarEstadoIngresoAdmin?.(texto),
  onVerified: ({ user: authUser, empleado, acceso, usuario, correo }) => {
    const metadata = authUser.app_metadata || {};
    const rolAuth = normalizarTexto(metadata.rol);
    const perfilAcceso = normalizarTexto(metadata.perfil_acceso || (rolAuth === "administrador" ? "admin" : rolAuth));
    const permisos = obtenerPermisosPorRol(perfilAcceso);
    const sesion = {
      id: authUser.id, auth_user_id: authUser.id, usuario_admin_id: null,
      empleado_id: empleado.id, codigo: empleado.codigo || "", cedula: String(empleado.cedula || ""), usuario,
      nombre_completo: `${empleado.nombres || ""} ${empleado.apellidos || ""}`.trim(),
      nombres: empleado.nombres || "", apellidos: empleado.apellidos || "", cargo: empleado.cargo || "",
      centro_costos: empleado.centro_costos || "", area: empleado.area || "", correo, telefono: empleado.telefono || "",
      rol: perfilAcceso, rol_auth: rolAuth, puede_ver_todo: permisos.puede_ver_todo,
      areas_permitidas: acceso.areas_permitidas, modulos_permitidos: acceso.modulos_permitidos,
      puede_administrar: acceso.puede_administrar, activo: true, tipo_ingreso: "admin_auth"
    };
    const destino = destinoPermitido(sesion, retornoSeguro || "");
    if (!destino) throw new ErrorIngreso761("Tu cuenta esta activa, pero no tiene modulos asignados. Contacta a Sistemas.", "LOGIN_NO_MODULES");
    localStorage.setItem("ccp_sesion", JSON.stringify(sesion));
    window.mostrarEstadoIngresoAdmin?.("Acceso verificado. Abriendo el panel...");
    window.location.href = destino;
  }
});
window.ingresoAdminEnCurso = () => ingresoAdmin761.ocupado();
window.ingresoAdminRequiereRecarga = () => ingresoAdmin761.requiereRecarga();
window.cancelarIngresoAdmin = () => ingresoAdmin761.cancelar();
window.addEventListener("pagehide", () => ingresoAdmin761.cancelar());
window.loginAdmin = async function () {
  const selector = document.getElementById("usuario");
  const valor = String(selector?.value || "").trim().toLowerCase();
  const identidad = typeof window.obtenerIdentidadAdminLogin === "function"
    ? window.obtenerIdentidadAdminLogin()
    : { correo: valor, usuario: valor.split("@")[0], error: valor === "__otra_cuenta__" ? "Selecciona una cuenta valida." : "" };
  if (identidad.error) { window.mostrarMensaje?.("error", identidad.error); return false; }
  try {
    return await ingresoAdmin761.ingresar({
      email: identidad.correo, usuario: identidad.usuario,
      password: document.getElementById("password")?.value || ""
    });
  } catch (error) {
    window.mostrarMensaje?.("error", mensajeErrorIngreso761(error, ingresoAdmin761.requiereRecarga()));
    // No tokens, passwords, profile data or response bodies in browser logs.
    console.warn("Ingreso administrativo:", error?.code || "LOGIN_ERROR", error?.status || "");
    return false;
  }
};

// Employee identity is verified by Auth; never by an anonymous empleados query.
window.consultarTurnos = loginEmpleadoSeguro;

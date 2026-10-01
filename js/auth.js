import { loginEmpleadoSeguro } from "./portal-acceso-empleado.js?v=747";
import { destinoPermitido } from "./permisos-core.js?v=720";
import { supabase } from "../supabase/supabaseClient.js";

window.mostrarAdmin = function () {
  document.getElementById("clavePersonal").style.display="none";
  document.getElementById("adminLogin").style.display = "flex";
  document.getElementById("empleadoLogin").style.display = "none";

  const tabAdmin = document.getElementById("tabAdmin");
  const tabEmpleado = document.getElementById("tabEmpleado");

  if (tabAdmin) tabAdmin.classList.add("active");
  if (tabEmpleado) tabEmpleado.classList.remove("active");

  if (typeof limpiarMensaje === "function") limpiarMensaje();
  if (typeof limpiarErrores === "function") limpiarErrores();
  if (typeof ocultarLoader === "function") ocultarLoader();
};

window.mostrarEmpleado = function () {
  document.getElementById("clavePersonal").style.display="none";
  document.getElementById("adminLogin").style.display = "none";
  document.getElementById("empleadoLogin").style.display = "flex";

  const tabAdmin = document.getElementById("tabAdmin");
  const tabEmpleado = document.getElementById("tabEmpleado");

  if (tabEmpleado) tabEmpleado.classList.add("active");
  if (tabAdmin) tabAdmin.classList.remove("active");

  if (typeof limpiarMensaje === "function") limpiarMensaje();
  if (typeof limpiarErrores === "function") limpiarErrores();
  if (typeof ocultarLoader === "function") ocultarLoader();
};

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
const requiereAuthVerificada = parametrosRecuperacion.get('sesion') === 'verificada';
const retornoSolicitado = parametrosRecuperacion.get('volver');
const retornoSeguro = ['dashboard.html','horas-extras.html'].includes(retornoSolicitado) ? retornoSolicitado : null;

window.loginAdmin = async function () {
  const selectorUsuario = document.getElementById("usuario");
  const opcionSeleccionada = selectorUsuario?.selectedOptions?.[0];
  const valorSelector = selectorUsuario?.value.trim().toLowerCase() || "";
  const identidad = typeof window.obtenerIdentidadAdminLogin === "function"
    ? window.obtenerIdentidadAdminLogin()
    : {
        correo: valorSelector,
        usuario: opcionSeleccionada?.dataset?.usuarioLegacy || valorSelector.split("@")[0],
        soloAuth: opcionSeleccionada?.dataset?.authOnly === "true",
        error: valorSelector === "__otra_cuenta__" ? "Actualice la página de inicio y vuelva a intentar." : ""
      };
  if (identidad.error) {
    if (typeof ocultarLoader === "function") ocultarLoader();
    if (typeof mostrarMensaje === "function") mostrarMensaje("error", identidad.error);
    return false;
  }
  const correoAuth = identidad.correo;
  const usuario = identidad.usuario;
  const password = document.getElementById("password")?.value.trim() || "";

  if (!correoAuth || !password) {
    if (typeof ocultarLoader === "function") ocultarLoader();
    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Complete usuario y contraseña.");
    }
    return false;
  }

  try {
    // Primer intento: autenticación segura con Supabase Auth.
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: correoAuth,
      password
    });

    if (!authError && authData?.user && authData?.session?.access_token) {
      const authUser = authData.user;
      const metadata = authUser.app_metadata || {};
      const empleadoId = metadata.empleado_id || null;
      const rolAuth = normalizarTexto(metadata.rol);
      const perfilAcceso = normalizarTexto(metadata.perfil_acceso || (rolAuth === "administrador" ? "admin" : rolAuth));

      if (!empleadoId || !["administrador", "gerencia", "nomina", "aprobador", "auditor"].includes(rolAuth)) {
        await supabase.auth.signOut({ scope: "local" });
        if (typeof ocultarLoader === "function") ocultarLoader();
        if (typeof mostrarMensaje === "function") {
          mostrarMensaje("error", "La cuenta está autenticada, pero no tiene un perfil autorizado.");
        }
        return false;
      }

      const { data: empleado, error: errorEmpleadoAuth } = await supabase
        .from("empleados")
        .select("*")
        .eq("id", empleadoId)
        .maybeSingle();

      if (errorEmpleadoAuth || !empleado) {
        console.error("Error consultando empleado Auth:", errorEmpleadoAuth);
        await supabase.auth.signOut({ scope: "local" });
        if (typeof ocultarLoader === "function") ocultarLoader();
        if (typeof mostrarMensaje === "function") {
          mostrarMensaje("error", "La cuenta no tiene un empleado válido vinculado.");
        }
        return false;
      }

      const {data:acceso,error:errorAcceso}=await supabase.rpc("consultar_mis_modulos_v720");
      if(errorAcceso||!acceso?.activo||acceso.user_id!==authUser.id){
        await supabase.auth.signOut({scope:"local"});
        if(typeof ocultarLoader==="function")ocultarLoader();
        if(typeof mostrarMensaje==="function")mostrarMensaje("error","No se pudieron verificar los permisos. Contacta a Sistemas.");
        return false;
      }
      const permisos = obtenerPermisosPorRol(perfilAcceso);
      const rolCompatible = perfilAcceso;

      const sesion = {
        id: authUser.id,
        auth_user_id: authUser.id,
        usuario_admin_id: null,
        empleado_id: empleado.id,
        codigo: empleado.codigo || "",
        cedula: String(empleado.cedula || ""),
        usuario,
        nombre_completo: `${empleado.nombres || ""} ${empleado.apellidos || ""}`.trim(),
        nombres: empleado.nombres || "",
        apellidos: empleado.apellidos || "",
        cargo: empleado.cargo || "",
        centro_costos: empleado.centro_costos || "",
        area: empleado.area || "",
        correo: correoAuth,
        telefono: empleado.telefono || "",
        rol: rolCompatible,
        rol_auth: rolAuth,
        puede_ver_todo: permisos.puede_ver_todo,
        areas_permitidas: acceso.areas_permitidas,
        modulos_permitidos: acceso.modulos_permitidos,
        puede_administrar: acceso.puede_administrar,
        activo: true,
        tipo_ingreso: "admin_auth"
      };

      localStorage.setItem("ccp_sesion", JSON.stringify(sesion));

      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("success", `Ingreso correcto como ${rolAuth}. Redirigiendo...`);
      }

      const destino=destinoPermitido(sesion,retornoSeguro||"");
      if(!destino){
        if(typeof ocultarLoader==="function")ocultarLoader();
        if(typeof mostrarMensaje==="function")mostrarMensaje("info","Tu cuenta está activa, pero no tiene módulos asignados. Solicita el acceso a Sistemas.");
        return false;
      }
      window.location.href=destino;
      return true;
    }

    if (authError || requiereAuthVerificada) {
      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") mostrarMensaje("error", "No se pudo iniciar la sesion segura. Usa la contrasena de tu cuenta Supabase Auth. El acceso anterior no habilita Centro de Control ni Nomina; no se cambio tu contrasena.");
      return false;
    }

    // Las cuentas nuevas y Carolina solo usan Auth; no se les habilita acceso heredado.
    if (identidad.soloAuth) {
      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") mostrarMensaje("error", "No fue posible iniciar sesión con esa cuenta. Revise el usuario y la contraseña asignados. Si persiste, solicite a Sistemas que revise el acceso.");
      return false;
    }

    // Respaldo temporal: conserva el acceso anterior mientras se crean y prueban
    // las cuentas nuevas. Se retirará después de validar la migración.
    const { data: usuarioAdmin, error: errorUsuario } = await supabase
      .from("usuarios_admin")
      .select("*")
      .or(`usuario.eq.${usuario},cedula.eq.${usuario}`)
      .eq("password_hash", password)
      .eq("activo", true)
      .maybeSingle();

    if (errorUsuario) {
      console.error("Error consultando usuarios_admin:", errorUsuario);

      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "Error consultando el usuario administrativo.");
      }

      return false;
    }

    if (!usuarioAdmin) {
      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "La contraseña no coincide con la cuenta nueva ni con el acceso anterior. Escríbala sin comillas ni espacios adicionales.");
      }

      return false;
    }

    const { data: empleado, error: errorEmpleado } = await supabase
      .from("empleados")
      .select("*")
      .eq("id", usuarioAdmin.empleado_id)
      .maybeSingle();

    if (errorEmpleado) {
      console.error("Error consultando empleado vinculado:", errorEmpleado);

      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "Error consultando el empleado vinculado.");
      }

      return false;
    }

    if (!empleado) {
      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "El usuario existe, pero no tiene empleado vinculado.");
      }

      return false;
    }

    const {error: errorSalidaAnterior} = await supabase.auth.signOut({scope:'local'});
    if(errorSalidaAnterior) throw new Error('No se pudo cerrar la sesion anterior. Reintenta el ingreso.');

    const permisos = obtenerPermisosPorRol(usuarioAdmin.rol);

    const sesion = {
      id: usuarioAdmin.id || null,
      usuario_admin_id: usuarioAdmin.id || null,
      empleado_id: empleado.id || null,
      codigo: empleado.codigo || "",
      cedula: String(empleado.cedula || usuarioAdmin.cedula || ""),
      usuario: usuarioAdmin.usuario || "",
      nombre_completo: `${empleado.nombres || ""} ${empleado.apellidos || ""}`.trim(),
      nombres: empleado.nombres || "",
      apellidos: empleado.apellidos || "",
      cargo: empleado.cargo || "",
      centro_costos: empleado.centro_costos || "",
      area: empleado.area || "",
      correo: empleado.correo || "",
      telefono: empleado.telefono || "",
      rol: usuarioAdmin.rol || "",
      puede_ver_todo: permisos.puede_ver_todo,
      areas_permitidas: permisos.areas_permitidas,
      modulos_permitidos: permisos.modulos_permitidos,
      tipo_ingreso: "admin"
    };

    localStorage.setItem("ccp_sesion", JSON.stringify(sesion));

    await supabase
      .from("usuarios_admin")
      .update({
        ultimo_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", usuarioAdmin.id);

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("success", `Ingreso correcto como ${usuarioAdmin.rol}. Redirigiendo...`);
    }

    window.location.href = "dashboard.html";
    return true;
  } catch (err) {
    console.error("Excepción login admin:", err);

    if (typeof ocultarLoader === "function") ocultarLoader();

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Ocurrió un error al iniciar sesión.");
    }

    return false;
  }
};

// Employee identity is verified by Auth; never by an anonymous empleados query.
window.consultarTurnos = loginEmpleadoSeguro;

import { supabase } from "../supabase/supabaseClient.js";

let sesionActiva = null;
let empleadoSeleccionado = null;
let usuariosAdmin = [];
let empleadosIndex = {};
let modalEditar = null;

const ROLES = {
  admin: "Administrador",
  administrador: "Administrador",
  gerencia: "Gerencia",
  nomina: "Nómina",
  aprobador: "Aprobador por área",
  auditor: "Auditoría",
  bienestar: "Bienestar Institucional",
  direccion_financiera: "Dirección Administrativa y Financiera",
  ayb: "Administrador/a de AyB",
  servicios_generales: "Servicios Generales"
};

document.addEventListener("DOMContentLoaded", async () => {
  sesionActiva = obtenerSesion();

  if (!sesionActiva) {
    window.location.href = "login.html";
    return;
  }

  if (!["admin", "administrador"].includes(String(sesionActiva.rol || sesionActiva.rol_auth || "").toLowerCase())) {
    alert("No tienes permisos para administrar usuarios.");
    window.location.href = "dashboard.html";
    return;
  }

  const modalEl = document.getElementById("modalEditarUsuario");
  if (modalEl && window.bootstrap) {
    modalEditar = new bootstrap.Modal(modalEl);
  }

  enlazarEventos();
  limpiarFormularioCreacion(false);
  await cargarUsuariosAdmin();
});

function obtenerSesion() {
  try {
    return JSON.parse(localStorage.getItem("ccp_sesion") || "null");
  } catch (error) {
    return null;
  }
}

function enlazarEventos() {
  document.getElementById("btnBuscarEmpleado")?.addEventListener("click", buscarEmpleado);
  document.getElementById("btnGenerarPassword")?.addEventListener("click", generarPasswordCreacion);
  document.getElementById("formCrearUsuarioAdmin")?.addEventListener("submit", crearUsuarioAdmin);
  document.getElementById("btnRecargarUsuarios")?.addEventListener("click", cargarUsuariosAdmin);
  document.getElementById("inputFiltroUsuarios")?.addEventListener("input", renderUsuariosAdmin);
  document.getElementById("btnGenerarPasswordEdit")?.addEventListener("click", generarPasswordEdicion);
  document.getElementById("btnGuardarEdicionUsuario")?.addEventListener("click", guardarEdicionUsuario);
  document.getElementById("btnImportarUsuarios")?.addEventListener("click", () => document.getElementById("inputImportarUsuarios")?.click());
  document.getElementById("inputImportarUsuarios")?.addEventListener("change", importarUsuariosExcel);

  document.getElementById("inputCedulaBuscar")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      buscarEmpleado();
    }
  });
}

async function invocarGestion(payload) {
  const { data: sesion, error: sesionError } = await supabase.auth.getSession();
  if (sesionError || !sesion?.session) throw new Error("La sesión de Supabase Auth venció. Cierre sesión e ingrese nuevamente.");
  const { data, error } = await supabase.functions.invoke("gestionar-usuarios-auth", { body: payload });
  if (error) throw new Error(error.message || "No fue posible administrar el usuario.");
  if (data?.error) throw new Error(data.error);
  return data;
}

function permisosPorRol(rol, area) {
  const r = texto(rol).toLowerCase();
  if (["admin", "administrador", "gerencia", "nomina", "auditor"].includes(r)) {
    return { areas: ["*"], modulos: ["dashboard", "dashboard-ayb", "horas-extras", "programacion-ayb", "cocina-chef", "programacion-administrativo", "programacion-operaciones", "mis-turnos-ayb", "mis-turnos-administrativo", "empleados", ...(r === "admin" || r === "administrador" ? ["usuarios-admin"] : [])] };
  }
  const areas = texto(area).split("/").map((x) => x.trim()).filter(Boolean);
  return { areas, modulos: ["dashboard", "dashboard-ayb", "horas-extras", "programacion-ayb", "cocina-chef"] };
}

function rolAuth(rol) {
  const r = texto(rol).toLowerCase();
  return r === "admin" ? "administrador" : (["gerencia", "nomina", "aprobador", "auditor", "administrador"].includes(r) ? r : "aprobador");
}

async function importarUsuariosExcel(event) {
  const archivo = event.target.files?.[0];
  event.target.value = "";
  if (!archivo) return;
  if (!window.XLSX) return mostrarAlerta("danger", "No se cargó el componente para leer Excel.");

  try {
    const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
    const hoja = libro.Sheets.Credenciales || libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { range: 3, defval: "" });
    const validas = filas.filter((f) => texto(f["Correo interno Auth"]) && texto(f["Contraseña temporal"]));
    if (!validas.length) throw new Error("El archivo no contiene la hoja Credenciales con las columnas esperadas.");

    const confirmar = window.confirm(`Se sincronizarán ${validas.length} filas con Supabase Auth. Las cuentas existentes conservarán su identidad y recibirán la contraseña indicada en el Excel. ¿Continuar?`);
    if (!confirmar) return;

    const { data: sesionActual } = await supabase.auth.getSession();
    const correoAdministradorActual = String(sesionActual?.session?.user?.email || "").toLowerCase();

    const { data: empleados, error } = await supabase.from("empleados").select("*").limit(2000);
    if (error) throw error;
    const indiceNombre = new Map((empleados || []).map((e) => [normalizarBusqueda(nombreEmpleado(e)), e]));
    const indiceCedula = new Map((empleados || []).map((e) => [String(e.cedula || ""), e]));
    const resultados = [];

    for (let i = 0; i < validas.length; i += 1) {
      const fila = validas[i];
      const correo = texto(fila["Correo interno Auth"]).toLowerCase();
      if (correo === correoAdministradorActual) {
        resultados.push({ correo, estado: "omitido", detalle: "Cuenta administradora actual protegida" });
        continue;
      }
      if (correo === "bodega@turnos.club") {
        resultados.push({ correo, estado: "omitido", detalle: "Bodega deshabilitado" });
        continue;
      }

      const nombre = texto(fila["Empleado vinculado"] || fila["Nombre para seleccionar"]);
      let empleado = indiceNombre.get(normalizarBusqueda(nombre));
      if (correo === "yvalencia@turnos.club") empleado = indiceCedula.get("1088314157") || empleado;
      if (!empleado) {
        resultados.push({ correo, estado: "error", detalle: "Empleado no encontrado" });
        continue;
      }

      let area = texto(fila["Área autorizada"]);
      if (correo === "jfrico@turnos.club") area = "CAMPO";
      if (correo === "yvalencia@turnos.club") area = "DEPORTES / GOLF";
      const rol = rolAuth(fila["Rol propuesto"]);
      const perfilAcceso = texto(fila["Rol propuesto"]).toLowerCase();
      const permisos = permisosPorRol(rol, area);
      try {
        const r = await invocarGestion({
          accion: "guardar",
          empleado_id: empleado.id,
          correo,
          password: texto(fila["Contraseña temporal"]),
          rol,
          perfil_acceso: perfilAcceso,
          nombre_completo: nombreEmpleado(empleado),
          areas_permitidas: permisos.areas,
          modulos_permitidos: permisos.modulos
        });
        resultados.push({ correo, estado: r.resultado, detalle: "Correcto" });
      } catch (errorFila) {
        resultados.push({ correo, estado: "error", detalle: errorFila.message });
      }
      mostrarAlerta("info", `Procesando ${i + 1} de ${validas.length}: ${escaparHtml(correo)}`);
    }

    const errores = resultados.filter((r) => r.estado === "error");
    const correctos = resultados.filter((r) => ["creado", "actualizado"].includes(r.estado));
    mostrarAlerta(errores.length ? "warning" : "success", `Sincronización finalizada: <strong>${correctos.length} correctos</strong>, ${errores.length} con error y ${resultados.length - correctos.length - errores.length} omitidos.${errores.length ? `<br>${errores.map((e) => `${escaparHtml(e.correo)}: ${escaparHtml(e.detalle)}`).join("<br>")}` : ""}`);
    await cargarUsuariosAdmin();
  } catch (error) {
    console.error(error);
    mostrarAlerta("danger", `No fue posible importar el Excel: ${escaparHtml(error.message || String(error))}`);
  }
}

function mostrarAlerta(tipo, mensaje) {
  const contenedor = document.getElementById("alertaUsuariosAdmin");
  if (!contenedor) {
    alert(String(mensaje).replace(/<[^>]*>/g, ""));
    return;
  }

  const clase = tipo === "success"
    ? "alert-success"
    : tipo === "warning"
      ? "alert-warning"
      : tipo === "info"
        ? "alert-info"
        : "alert-danger";

  contenedor.innerHTML = `
    <div class="alert ${clase} alert-dismissible fade show" role="alert">
      ${mensaje}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>
    </div>
  `;
}

function limpiarAlerta() {
  const contenedor = document.getElementById("alertaUsuariosAdmin");
  if (contenedor) contenedor.innerHTML = "";
}

function setText(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

function texto(valor) {
  return String(valor || "").trim();
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizarDocumento(valor) {
  return String(valor || "").replace(/[^0-9A-Za-z]/g, "").trim();
}

function normalizarBusqueda(valor) {
  return String(valor || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function nombreEmpleado(empleado) {
  return `${empleado?.nombres || ""} ${empleado?.apellidos || ""}`.replace(/\s+/g, " ").trim() || "Sin nombre";
}

function textoBusquedaEmpleado(empleado) {
  return normalizarBusqueda([
    empleado?.cedula,
    empleado?.codigo,
    empleado?.nombres,
    empleado?.apellidos,
    nombreEmpleado(empleado),
    empleado?.cargo,
    empleado?.centro_costos,
    empleado?.area
  ].join(" "));
}

function generarUsuarioSugerido(empleado) {
  const nombres = String(empleado?.nombres || "").trim().split(/\s+/);
  const apellidos = String(empleado?.apellidos || "").trim().split(/\s+/);

  const inicial = nombres[0] ? nombres[0][0] : "";
  const apellido = apellidos[0] || "";

  const base = `${inicial}${apellido}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

  return base || normalizarDocumento(empleado?.cedula || "");
}

function generarPasswordTemporal() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";

  for (let i = 0; i < 4; i++) {
    codigo += caracteres[Math.floor(Math.random() * caracteres.length)];
  }

  const numero = Math.floor(100 + Math.random() * 900);
  return `CCP2026@${codigo}${numero}`;
}

function generarPasswordCreacion() {
  const password = generarPasswordTemporal();
  const input = document.getElementById("inputPasswordTemporal");
  const box = document.getElementById("boxPasswordGenerada");

  if (input) input.value = password;
  setText("textoPasswordGenerada", password);
  if (box) box.classList.remove("d-none");
}

function generarPasswordEdicion() {
  const password = generarPasswordTemporal();
  const input = document.getElementById("editPassword");

  if (input) input.value = password;
}

async function buscarEmpleado() {
  limpiarAlerta();

  const termino = texto(document.getElementById("inputCedulaBuscar")?.value);
  const terminoNormalizado = normalizarBusqueda(termino);
  const documento = normalizarDocumento(termino);

  if (!terminoNormalizado) {
    empleadoSeleccionado = null;
    ocultarEmpleadoEncontrado();
    ocultarResultadosEmpleados();
    mostrarAlerta("warning", "Ingrese cédula, nombre, apellido, cargo o centro de costos.");
    return;
  }

  try {
    let resultados = [];
    const soloDocumento = /^[0-9]+$/.test(documento) && documento.length >= 5;

    if (soloDocumento) {
      const { data: empleado, error } = await supabase
        .from("empleados")
        .select("*")
        .eq("cedula", documento)
        .maybeSingle();

      if (error) {
        console.error("Error buscando empleado por cédula:", error);
        mostrarAlerta("danger", `Error consultando empleado: ${escaparHtml(error.message || "sin detalle")}`);
        return;
      }

      if (empleado) resultados = [empleado];
    }

    if (!resultados.length) {
      const { data: empleados, error } = await supabase
        .from("empleados")
        .select("*")
        .limit(1000);

      if (error) {
        console.error("Error cargando empleados:", error);
        mostrarAlerta("danger", `Error consultando empleados: ${escaparHtml(error.message || "sin detalle")}`);
        return;
      }

      resultados = (empleados || [])
        .filter((empleado) => textoBusquedaEmpleado(empleado).includes(terminoNormalizado))
        .slice(0, 25);
    }

    if (!resultados.length) {
      empleadoSeleccionado = null;
      ocultarEmpleadoEncontrado();
      ocultarResultadosEmpleados();
      mostrarAlerta("warning", `No se encontraron empleados con: <strong>${escaparHtml(termino)}</strong>.`);
      return;
    }

    if (resultados.length === 1) {
      await seleccionarEmpleado(resultados[0]);
      return;
    }

    empleadoSeleccionado = null;
    ocultarEmpleadoEncontrado();
    mostrarResultadosEmpleados(resultados);
    mostrarAlerta("info", `Se encontraron ${resultados.length} coincidencias. Seleccione el empleado correcto.`);
  } catch (error) {
    console.error("Error general buscando empleado:", error);
    mostrarAlerta("danger", `Error general buscando empleado: ${escaparHtml(error.message || String(error))}`);
  }
}

function mostrarResultadosEmpleados(resultados) {
  const box = document.getElementById("boxResultadosEmpleados");
  const tbody = document.getElementById("tbodyResultadosEmpleados");

  if (!box || !tbody) return;

  box.classList.remove("d-none");

  tbody.innerHTML = resultados.map((empleado, index) => `
    <tr>
      <td>
        <div class="fw-bold">${escaparHtml(nombreEmpleado(empleado))}</div>
        <div class="small text-muted">${escaparHtml(empleado.cedula || "-")}</div>
      </td>
      <td>
        <div>${escaparHtml(empleado.cargo || "-")}</div>
        <div class="small text-muted">${escaparHtml(empleado.centro_costos || empleado.area || "-")}</div>
      </td>
      <td class="text-end">
        <button type="button" class="btn btn-sm btn-primary" data-seleccionar-empleado="${index}">
          Seleccionar
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-seleccionar-empleado]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.dataset.seleccionarEmpleado);
      await seleccionarEmpleado(resultados[index]);
    });
  });
}

function ocultarResultadosEmpleados() {
  const box = document.getElementById("boxResultadosEmpleados");
  const tbody = document.getElementById("tbodyResultadosEmpleados");

  if (box) box.classList.add("d-none");
  if (tbody) tbody.innerHTML = "";
}

async function seleccionarEmpleado(empleado) {
  ocultarResultadosEmpleados();

  empleadoSeleccionado = empleado;
  mostrarEmpleadoEncontrado(empleado);

  const usuarioInput = document.getElementById("inputUsuarioAdmin");
  if (usuarioInput) {
    usuarioInput.value = generarUsuarioSugerido(empleado);
  }

  if (!document.getElementById("inputPasswordTemporal")?.value) {
    generarPasswordCreacion();
  }

  mostrarAlerta("success", "Empleado seleccionado. Si ya tiene cuenta Auth, se actualizará sin duplicarla.");
}

function mostrarEmpleadoEncontrado(empleado) {
  const box = document.getElementById("boxEmpleadoEncontrado");
  if (box) box.classList.remove("d-none");

  setText("empleadoNombre", nombreEmpleado(empleado));
  setText("empleadoCedula", empleado.cedula || "-");
  setText("empleadoCargo", empleado.cargo || "-");
  setText("empleadoCentroCostos", empleado.centro_costos || "-");
  setText("empleadoArea", empleado.area || "-");
}

function ocultarEmpleadoEncontrado() {
  const box = document.getElementById("boxEmpleadoEncontrado");
  if (box) box.classList.add("d-none");

  setText("empleadoNombre", "-");
  setText("empleadoCedula", "-");
  setText("empleadoCargo", "-");
  setText("empleadoCentroCostos", "-");
  setText("empleadoArea", "-");
}

async function crearUsuarioAdmin(event) {
  event.preventDefault();
  limpiarAlerta();

  if (!empleadoSeleccionado) {
    mostrarAlerta("warning", "Primero busque y seleccione un empleado.");
    return;
  }

  const usuario = texto(document.getElementById("inputUsuarioAdmin")?.value).toLowerCase();
  const password = texto(document.getElementById("inputPasswordTemporal")?.value);
  const rol = texto(document.getElementById("selectRolAdmin")?.value);

  if (!usuario || !password || !rol) {
    mostrarAlerta("warning", "Complete usuario, contraseña temporal y rol.");
    return;
  }

  try {
    const permisos = permisosPorRol(rol, empleadoSeleccionado.centro_costos || empleadoSeleccionado.area);
    const resultado = await invocarGestion({
      accion: "guardar",
      empleado_id: empleadoSeleccionado.id,
      correo: `${usuario}@turnos.club`,
      password,
      rol: rolAuth(rol),
      perfil_acceso: rol,
      nombre_completo: nombreEmpleado(empleadoSeleccionado),
      areas_permitidas: permisos.areas,
      modulos_permitidos: permisos.modulos
    });

    mostrarAlerta(
      "success",
      `Usuario ${escaparHtml(resultado.resultado)} correctamente en Supabase Auth. Usuario: <strong>${escaparHtml(usuario)}</strong> · Contraseña: <strong>${escaparHtml(password)}</strong>`
    );

    limpiarFormularioCreacion();
    await cargarUsuariosAdmin();
  } catch (error) {
    console.error("Error general creando usuario administrativo:", error);
    mostrarAlerta("danger", `Error general creando usuario administrativo: ${escaparHtml(error.message || String(error))}`);
  }
}

function limpiarFormularioCreacion(limpiarAlertaActiva = true) {
  empleadoSeleccionado = null;

  const form = document.getElementById("formCrearUsuarioAdmin");
  if (form) form.reset();

  const inputCedula = document.getElementById("inputCedulaBuscar");
  if (inputCedula) inputCedula.value = "";

  const passwordInput = document.getElementById("inputPasswordTemporal");
  if (passwordInput) passwordInput.value = "";

  const boxPass = document.getElementById("boxPasswordGenerada");
  if (boxPass) boxPass.classList.add("d-none");

  setText("textoPasswordGenerada", "-");
  ocultarEmpleadoEncontrado();
  ocultarResultadosEmpleados();

  if (limpiarAlertaActiva) limpiarAlerta();
}

async function cargarUsuariosAdmin() {
  try {
    const resultado = await invocarGestion({ accion: "listar" });
    usuariosAdmin = Array.isArray(resultado.usuarios) ? resultado.usuarios : [];
    empleadosIndex = {};
    usuariosAdmin.forEach((u) => { if (u.empleado) empleadosIndex[u.empleado_id] = u.empleado; });

    actualizarKPIs();
    renderUsuariosAdmin();
  } catch (error) {
    console.error("Error general cargando usuarios:", error);
    mostrarAlerta("danger", `Error general cargando usuarios: ${escaparHtml(error.message || String(error))}`);
  }
}

function actualizarKPIs() {
  const activos = usuariosAdmin.filter((u) => u.activo === true && !u.bloqueado).length;
  const inactivos = usuariosAdmin.filter((u) => u.activo !== true).length;
  const roles = new Set(usuariosAdmin.map((u) => u.rol).filter(Boolean)).size;

  const ultimo = usuariosAdmin
    .filter((u) => u.ultimo_login)
    .sort((a, b) => String(b.ultimo_login).localeCompare(String(a.ultimo_login)))[0];

  setText("kpiUsuariosActivos", activos);
  setText("kpiUsuariosInactivos", inactivos);
  setText("kpiRolesConfigurados", roles);
  setText("kpiUltimoLogin", ultimo ? formatearFechaHora(ultimo.ultimo_login) : "Sin registro");
}

function renderUsuariosAdmin() {
  const tbody = document.getElementById("tbodyUsuariosAdmin");
  if (!tbody) return;

  const filtro = normalizarBusqueda(document.getElementById("inputFiltroUsuarios")?.value);

  const lista = usuariosAdmin.filter((usuario) => {
    const empleado = empleadosIndex[usuario.empleado_id] || {};
    const busqueda = normalizarBusqueda([
      usuario.correo,
      usuario.cedula,
      usuario.perfil_acceso || usuario.rol,
      nombreEmpleado(empleado),
      empleado.cargo,
      empleado.centro_costos
    ].join(" "));

    return !filtro || busqueda.includes(filtro);
  });

  if (!lista.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted py-4">
          No hay usuarios administrativos para mostrar.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lista.map((usuario) => {
    const empleado = empleadosIndex[usuario.empleado_id] || {};
    const estado = usuario.activo === true && !usuario.bloqueado
      ? `<span class="badge-activo">Activo</span>`
      : `<span class="badge-inactivo">Inactivo</span>`;

    const estaActivo = usuario.activo === true && !usuario.bloqueado;
    const textoAccionEstado = estaActivo ? "Deshabilitar" : "Rehabilitar";
    const claseAccionEstado = estaActivo ? "btn-outline-danger" : "btn-outline-success";

    return `
      <tr>
        <td>
          <div class="fw-bold">${escaparHtml(nombreEmpleado(empleado))}</div>
          <div class="small text-muted">${escaparHtml(usuario.cedula || "-")} · ${escaparHtml(empleado.cargo || "-")}</div>
        </td>
        <td>${escaparHtml(usuario.correo || "-")}</td>
        <td><span class="badge-rol">${escaparHtml(ROLES[usuario.perfil_acceso] || usuario.perfil_acceso || ROLES[usuario.rol] || usuario.rol || "-")}</span></td>
        <td>${estado}</td>
        <td>${escaparHtml(formatearFechaHora(usuario.ultimo_login) || "Sin registro")}</td>
        <td>
          <div class="acciones-tabla">
            <button class="btn btn-sm btn-outline-primary" data-editar="${usuario.user_id}">Editar</button>
            <button class="btn btn-sm ${claseAccionEstado}" data-estado="${usuario.user_id}">
              ${textoAccionEstado}
            </button>
            <button class="btn btn-sm btn-danger" data-eliminar="${usuario.user_id}">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-editar]").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalEdicion(btn.dataset.editar));
  });

  tbody.querySelectorAll("[data-estado]").forEach((btn) => {
    btn.addEventListener("click", () => alternarEstadoUsuario(btn.dataset.estado));
  });
  tbody.querySelectorAll("[data-eliminar]").forEach((btn) => {
    btn.addEventListener("click", () => eliminarUsuarioAuth(btn.dataset.eliminar));
  });
}

function abrirModalEdicion(id) {
  const usuario = usuariosAdmin.find((u) => String(u.user_id) === String(id));
  if (!usuario) return;

  document.getElementById("editUsuarioId").value = usuario.user_id;
  document.getElementById("editUsuario").value = usuario.correo || "";
  document.getElementById("editRol").value = usuario.perfil_acceso || usuario.rol || "";
  document.getElementById("editPassword").value = "";

  if (modalEditar) modalEditar.show();
}

async function guardarEdicionUsuario() {
  limpiarAlerta();

  const id = texto(document.getElementById("editUsuarioId")?.value);
  const rol = texto(document.getElementById("editRol")?.value);
  const password = texto(document.getElementById("editPassword")?.value);

  if (!id || !rol) {
    mostrarAlerta("warning", "No se encontró el usuario o el rol seleccionado.");
    return;
  }

  if (password && password.length < 6) {
    mostrarAlerta("warning", "La nueva contraseña debe tener mínimo 6 caracteres.");
    return;
  }

  try {
    const usuarioActual = usuariosAdmin.find((u) => String(u.user_id) === id);
    if (!usuarioActual) throw new Error("No se encontró la cuenta Auth.");

    const { data: sesionActual } = await supabase.auth.getSession();
    const esCuentaActual = sesionActual?.session?.user?.id === id;
    if (password && esCuentaActual) {
      const continuar = window.confirm("Está cambiando la contraseña de su propia cuenta. Supabase cerrará esta sesión y deberá ingresar con la nueva contraseña. ¿Desea continuar?");
      if (!continuar) return;
    }

    const botonGuardar = document.getElementById("btnGuardarEdicionUsuario");
    if (botonGuardar) {
      botonGuardar.disabled = true;
      botonGuardar.textContent = "Guardando...";
    }
    const empleado = usuarioActual.empleado || empleadosIndex[usuarioActual.empleado_id] || {};
    const perfilAnterior = texto(usuarioActual.perfil_acceso || usuarioActual.rol).toLowerCase();
    const permisosNuevos = perfilAnterior === rol
      ? { areas: usuarioActual.areas_permitidas || [], modulos: usuarioActual.modulos_permitidos || [] }
      : permisosPorRol(rol, empleado.centro_costos || empleado.area);
    await invocarGestion({
      accion: "guardar",
      user_id: id,
      empleado_id: usuarioActual.empleado_id,
      correo: usuarioActual.correo,
      password,
      rol: rolAuth(rol),
      perfil_acceso: rol,
      nombre_completo: nombreEmpleado(empleado),
      areas_permitidas: permisosNuevos.areas,
      modulos_permitidos: permisosNuevos.modulos
    });

    if (modalEditar) modalEditar.hide();

    const mensajePassword = password
      ? ` Nueva contraseña temporal: <strong>${escaparHtml(password)}</strong>`
      : "";

    mostrarAlerta("success", `Usuario actualizado correctamente.${mensajePassword}`);
    if (esCuentaActual && password) {
      await supabase.auth.signOut({ scope: "local" });
      localStorage.removeItem("ccp_sesion");
      window.location.href = "login.html?password_actualizada=1";
      return;
    }
    await cargarUsuariosAdmin();
  } catch (error) {
    console.error("Error general actualizando usuario:", error);
    mostrarAlerta("danger", `Error general actualizando usuario: ${escaparHtml(error.message || String(error))}`);
  } finally {
    const botonGuardar = document.getElementById("btnGuardarEdicionUsuario");
    if (botonGuardar) {
      botonGuardar.disabled = false;
      botonGuardar.textContent = "Guardar cambios";
    }
  }
}

async function eliminarUsuarioAuth(id) {
  const usuario = usuariosAdmin.find((u) => String(u.user_id) === String(id));
  if (!usuario) return;
  const confirmar = window.confirm(`¿Eliminar definitivamente el acceso ${usuario.correo}?\n\nSe eliminará la cuenta de autenticación y su perfil. El empleado y su historial laboral se conservarán.`);
  if (!confirmar) return;
  try {
    await invocarGestion({ accion: "eliminar", user_id: id });
    mostrarAlerta("success", `Acceso ${escaparHtml(usuario.correo)} eliminado correctamente.`);
    await cargarUsuariosAdmin();
  } catch (error) {
    mostrarAlerta("danger", `No fue posible eliminar el acceso: ${escaparHtml(error.message || String(error))}`);
  }
}

async function alternarEstadoUsuario(id) {
  const usuario = usuariosAdmin.find((u) => String(u.user_id) === String(id));
  if (!usuario) return;

  const nuevoEstado = !(usuario.activo === true && !usuario.bloqueado);
  const accion = nuevoEstado ? "rehabilitar" : "deshabilitar";

  const confirmar = window.confirm(`¿Seguro que desea ${accion} el usuario ${usuario.correo}?`);
  if (!confirmar) return;

  try {
    await invocarGestion({ accion: "estado", user_id: id, activo: nuevoEstado });

    mostrarAlerta("success", `Usuario ${nuevoEstado ? "rehabilitado" : "deshabilitado"} correctamente.`);
    await cargarUsuariosAdmin();
  } catch (error) {
    console.error("Error general actualizando estado:", error);
    mostrarAlerta("danger", `Error general actualizando estado: ${escaparHtml(error.message || String(error))}`);
  }
}

function formatearFechaHora(valor) {
  if (!valor) return "";

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return String(valor);

  return fecha.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

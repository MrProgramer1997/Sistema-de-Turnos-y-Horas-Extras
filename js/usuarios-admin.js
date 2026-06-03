import { supabase } from "../supabase/supabaseClient.js";

let sesionActiva = null;
let empleadoSeleccionado = null;
let usuariosAdmin = [];
let empleadosIndex = {};
let modalEditar = null;

const ROLES = {
  admin: "Administrador",
  gerencia: "Gerencia",
  bienestar: "Bienestar Institucional",
  direccion_financiera: "Dirección Administrativa y Financiera",
  ayb: "Alimentos y Bebidas",
  servicios_generales: "Servicios Generales"
};

document.addEventListener("DOMContentLoaded", async () => {
  sesionActiva = obtenerSesion();

  if (!sesionActiva) {
    window.location.href = "login.html";
    return;
  }

  if (String(sesionActiva.rol || "").toLowerCase() !== "admin") {
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

  document.getElementById("inputCedulaBuscar")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      buscarEmpleado();
    }
  });
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

  const cedulaEmpleado = String(empleado.cedula || "");

  const { data: existente, error: errorExistente } = await supabase
    .from("usuarios_admin")
    .select("id,usuario,rol,activo")
    .eq("cedula", cedulaEmpleado)
    .maybeSingle();

  if (errorExistente) {
    console.error("Error validando usuario existente:", errorExistente);
    mostrarAlerta("danger", `Error validando usuario existente: ${escaparHtml(errorExistente.message || "sin detalle")}`);
    return;
  }

  empleadoSeleccionado = empleado;
  mostrarEmpleadoEncontrado(empleado);

  const usuarioInput = document.getElementById("inputUsuarioAdmin");
  if (usuarioInput) {
    usuarioInput.value = generarUsuarioSugerido(empleado);
  }

  if (!document.getElementById("inputPasswordTemporal")?.value) {
    generarPasswordCreacion();
  }

  if (existente) {
    mostrarAlerta(
      "warning",
      `Empleado seleccionado, pero ya tiene usuario administrativo: <strong>${escaparHtml(existente.usuario)}</strong> (${escaparHtml(ROLES[existente.rol] || existente.rol)}). No se puede crear otro.`
    );
    return;
  }

  mostrarAlerta("success", "Empleado seleccionado. Puede crear el usuario administrativo.");
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
    const cedulaEmpleado = String(empleadoSeleccionado.cedula || "");

    const { data: duplicados, error: errorDuplicados } = await supabase
      .from("usuarios_admin")
      .select("id,usuario,cedula")
      .or(`usuario.eq.${usuario},cedula.eq.${cedulaEmpleado}`);

    if (errorDuplicados) {
      console.error("Error validando duplicados:", errorDuplicados);
      mostrarAlerta("danger", `Error validando duplicados: ${escaparHtml(errorDuplicados.message || "sin detalle")}`);
      return;
    }

    if (Array.isArray(duplicados) && duplicados.length) {
      mostrarAlerta("warning", "Ya existe un usuario administrativo con ese usuario o cédula.");
      return;
    }

    const payload = {
      empleado_id: empleadoSeleccionado.id,
      cedula: cedulaEmpleado,
      usuario,
      password_hash: password,
      rol,
      activo: true,
      password_temporal: true,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("usuarios_admin")
      .insert([payload]);

    if (error) {
      console.error("Error insertando usuario:", error);
      mostrarAlerta("danger", `No fue posible crear el usuario: ${escaparHtml(error.message || "sin detalle")}`);
      return;
    }

    mostrarAlerta(
      "success",
      `Usuario creado correctamente. Usuario: <strong>${escaparHtml(usuario)}</strong> · Contraseña temporal: <strong>${escaparHtml(password)}</strong>`
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
    const { data: usuarios, error } = await supabase
      .from("usuarios_admin")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando usuarios_admin:", error);
      mostrarAlerta("danger", `Error cargando usuarios administrativos: ${escaparHtml(error.message || "sin detalle")}`);
      return;
    }

    usuariosAdmin = Array.isArray(usuarios) ? usuarios : [];
    empleadosIndex = {};

    const ids = [...new Set(usuariosAdmin.map((u) => u.empleado_id).filter(Boolean))];

    if (ids.length) {
      const { data: empleados, error: errorEmpleados } = await supabase
        .from("empleados")
        .select("*")
        .in("id", ids);

      if (errorEmpleados) {
        console.warn("No se pudo cargar empleados vinculados:", errorEmpleados);
      } else {
        (empleados || []).forEach((empleado) => {
          empleadosIndex[empleado.id] = empleado;
        });
      }
    }

    actualizarKPIs();
    renderUsuariosAdmin();
  } catch (error) {
    console.error("Error general cargando usuarios:", error);
    mostrarAlerta("danger", `Error general cargando usuarios: ${escaparHtml(error.message || String(error))}`);
  }
}

function actualizarKPIs() {
  const activos = usuariosAdmin.filter((u) => u.activo === true).length;
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
      usuario.usuario,
      usuario.cedula,
      usuario.rol,
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
    const estado = usuario.activo === true
      ? `<span class="badge-activo">Activo</span>`
      : `<span class="badge-inactivo">Inactivo</span>`;

    const textoAccionEstado = usuario.activo === true ? "Deshabilitar" : "Rehabilitar";
    const claseAccionEstado = usuario.activo === true ? "btn-outline-danger" : "btn-outline-success";

    return `
      <tr>
        <td>
          <div class="fw-bold">${escaparHtml(nombreEmpleado(empleado))}</div>
          <div class="small text-muted">${escaparHtml(usuario.cedula || "-")} · ${escaparHtml(empleado.cargo || "-")}</div>
        </td>
        <td>${escaparHtml(usuario.usuario || "-")}</td>
        <td><span class="badge-rol">${escaparHtml(ROLES[usuario.rol] || usuario.rol || "-")}</span></td>
        <td>${estado}</td>
        <td>${escaparHtml(formatearFechaHora(usuario.ultimo_login) || "Sin registro")}</td>
        <td>
          <div class="acciones-tabla">
            <button class="btn btn-sm btn-outline-primary" data-editar="${usuario.id}">Editar</button>
            <button class="btn btn-sm ${claseAccionEstado}" data-estado="${usuario.id}">
              ${textoAccionEstado}
            </button>
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
}

function abrirModalEdicion(id) {
  const usuario = usuariosAdmin.find((u) => String(u.id) === String(id));
  if (!usuario) return;

  document.getElementById("editUsuarioId").value = usuario.id;
  document.getElementById("editUsuario").value = usuario.usuario || "";
  document.getElementById("editRol").value = usuario.rol || "";
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

  const payload = {
    rol,
    updated_at: new Date().toISOString()
  };

  if (password) {
    payload.password_hash = password;
    payload.password_temporal = true;
  }

  try {
    const { error } = await supabase
      .from("usuarios_admin")
      .update(payload)
      .eq("id", id);

    if (error) {
      console.error("Error actualizando usuario:", error);
      mostrarAlerta("danger", `No fue posible actualizar el usuario: ${escaparHtml(error.message || "sin detalle")}`);
      return;
    }

    if (modalEditar) modalEditar.hide();

    const mensajePassword = password
      ? ` Nueva contraseña temporal: <strong>${escaparHtml(password)}</strong>`
      : "";

    mostrarAlerta("success", `Usuario actualizado correctamente.${mensajePassword}`);
    await cargarUsuariosAdmin();
  } catch (error) {
    console.error("Error general actualizando usuario:", error);
    mostrarAlerta("danger", `Error general actualizando usuario: ${escaparHtml(error.message || String(error))}`);
  }
}

async function alternarEstadoUsuario(id) {
  const usuario = usuariosAdmin.find((u) => String(u.id) === String(id));
  if (!usuario) return;

  const nuevoEstado = usuario.activo !== true;
  const accion = nuevoEstado ? "rehabilitar" : "deshabilitar";

  const confirmar = window.confirm(`¿Seguro que desea ${accion} el usuario ${usuario.usuario}?`);
  if (!confirmar) return;

  try {
    const { error } = await supabase
      .from("usuarios_admin")
      .update({
        activo: nuevoEstado,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      console.error("Error actualizando estado:", error);
      mostrarAlerta("danger", `No fue posible actualizar el estado del usuario: ${escaparHtml(error.message || "sin detalle")}`);
      return;
    }

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

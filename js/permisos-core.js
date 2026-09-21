// Permisos de navegacion: el rol/cargo/nombre no agrega modulos.
export const MODULOS_ADMIN = Object.freeze([
 ['horas-extras','Horas extras y n\u00f3mina'],['dashboard-ayb','Dashboard A&B'],['dashboard','Centro de Control'],
 ['programacion-ayb','Programaci\u00f3n A&B'],['cocina-chef','Programaci\u00f3n Chef'],
 ['programacion-administrativo','Programaci\u00f3n Administrativo'],['programacion-operaciones','Programaci\u00f3n Operaciones'],
 ['solicitudes-bienestar','Solicitudes Bienestar'],['empleados','Empleados'],['mis-turnos','Mis turnos'],['asistencia','Asistencia']
]);
const PERSONALES=['mis-turnos','mis-turnos-ayb','mis-turnos-administrativo'];
export function listaModulos(value){return Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string').map(v=>v.trim().toLowerCase()).filter(Boolean))]:[];}
export function moduloDeRuta(path){const name=String(path||'').split(/[?#]/)[0].split('/').pop().replace(/\.html$/i,'').toLowerCase();return PERSONALES.includes(name)?'mis-turnos':name;}
export function tieneModulo(session,module){
 if(!session||session.activo===false)return false;
 if(module==='login')return true;
 if(session.tipo_ingreso==='empleado'||session.rol==='empleado')return PERSONALES.includes(module);
 if(module==='usuarios-admin')return session.puede_administrar===true;
 const modules=listaModulos(session.modulos_permitidos);
 return PERSONALES.includes(module)?PERSONALES.some(m=>modules.includes(m)):modules.includes(module);
}
export function modulosFormulario(selected,previous=[],role=''){
 const checked=listaModulos(selected),known=new Set([...MODULOS_ADMIN.map(x=>x[0]),...PERSONALES]);
 const result=[...new Set([...listaModulos(previous).filter(x=>!known.has(x)),...checked])];
 return ['admin','administrador'].includes(role)?result:result.filter(x=>x!=='usuarios-admin');
}
export function destinoPermitido(session,requested=''){
 const req=moduloDeRuta(requested);if(requested&&tieneModulo(session,req))return `${req}.html`;
 const module=['usuarios-admin','horas-extras','dashboard-ayb','dashboard',...MODULOS_ADMIN.map(x=>x[0])].find(m=>tieneModulo(session,m));
 return module?`${module}.html`:null;
}

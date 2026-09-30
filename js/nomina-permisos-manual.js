// UI eligibility only. Every read and decision is authorized AGAIN in Supabase
// against the active account and its current modules/areas, not local storage.
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
export function puedeManualNomina746(sesion,fila=null){
 if(sesion?.activo!==true||sesion.tipo_ingreso!=='admin_auth'||!Array.isArray(sesion.modulos_permitidos)||!sesion.modulos_permitidos.includes('horas-extras'))return false;
 const role=text(sesion.rol_auth||sesion.rol).toLowerCase();
 if(!['administrador','admin','nomina','aprobador'].includes(role))return false;
 if(!fila)return true;
 if(['administrador','admin'].includes(role))return true;
 const permitted=Array.isArray(sesion.areas_permitidas)?sesion.areas_permitidas.filter(a=>text(a)):[];
 if(permitted.includes('*'))return true;
 const fields=['area','centro_costos','proceso_codigo','proceso_nombre','grupo_codigo','grupo_nombre'];
 const tags=new Set([fila,fila.jornada_actual].filter(Boolean).flatMap(x=>fields.map(k=>norm(x[k]))).filter(Boolean));
 return permitted.some(a=>tags.has(norm(a)));
}

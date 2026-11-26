/* Lectura PostgREST fiable por limit/offset y orden estable.
 * Deliberadamente sin claves expuestas ni estado persistente.
 * Evita el bug del header Range que repetia la misma pagina al consultar.
 */
/** @param {{baseUrl:string,serviceKey:string,table:string,select:string,filters?:Array<[string,string,string]>,max?:number,pageSize?:number,fetchFn?:typeof fetch}} args */
export async function consultarPaginado({baseUrl,serviceKey,table,select,filters=[],max=12000,pageSize=500,fetchFn=fetch}){
 if(!baseUrl||!serviceKey)throw new Error('Conexión interna a Supabase no disponible');
 if(!/^[a-z][a-z0-9_]*$/.test(table)||!Number.isSafeInteger(max)||max<1||
    !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000)
   throw new Error('Parámetros de paginación inválidos');
 const rows=[],seenIds=new Set();
 const order=table==='biotime_marcaciones'?'biotime_id.asc':'id.asc';
 for(let offset=0;offset<max;){
   const limit=Math.min(pageSize,max-offset);
   const qp=new URLSearchParams({select,order,limit:String(limit),offset:String(offset)});
   // Varios filtros de la misma columna (gte y lt) deben coexistir; set() borraba el primero.
   for(const [name,op,value] of filters)qp.append(name,op?op+'.'+value:value);
   const res=await fetchFn(baseUrl+'/rest/v1/'+table+'?'+qp.toString(),{
      headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey,Accept:'application/json'}
   });
   if(!res.ok)throw new Error('No fue posible leer '+table+' (HTTP '+res.status+')');
   const batch=await res.json();
   if(!Array.isArray(batch)||batch.length>limit)
     throw new Error('Página inválida al consultar '+table);
   for(const row of batch){
     const k=String(table==='biotime_marcaciones'?row.biotime_id:row.id);
     if(k==='undefined'||seenIds.has(k))throw new Error('Página duplicada o sin identificador en '+table);
     seenIds.add(k);rows.push(row);
   }
   offset+=batch.length;
   if(batch.length<limit)return rows;
 }
 throw new Error('Límite de protección alcanzado al consultar '+table+'; no enviar parcial');
}
/* Todos los documentos se obtienen de jornadas AYB y Chef fijo asignadas
 * en el día. Excluye programaciones de otras areas y personal externo.
 */
export function documentosProgramados(legacy=[],chef=[],chefPeople=[],employees=[]){
 const normalize=v=>String(v??'').trim().replace(/[ .-]/g,'');
 const byId=new Map(employees.map(e=>[String(e.id),e]));
 const byChefId=new Map(chefPeople.map(p=>[String(p.id),p]));
 const codes=new Set();
 for(const r of legacy){
   const area=String(r.area||'').trim().toUpperCase();
   if(!/^(ALIMENTOS Y BEBIDAS|AYB|A&B)(\b|$)/.test(area))continue;
   if(normalize(r.cedula))codes.add(normalize(r.cedula));
 }
 for(const r of chef){
   if(/cancel|rechaz|borrador/i.test(String(r.estado||'')))continue;
   const p=byChefId.get(String(r.cronograma_personal_id));
   if(!p||p.externo_id||/extern|extra|eventual/i.test(String(p.tipo_personal||'')))continue;
   const c=normalize(byId.get(String(p.empleado_id))?.cedula||p.documento);
   if(c)codes.add(c);
 }
 return [...codes].sort();
}

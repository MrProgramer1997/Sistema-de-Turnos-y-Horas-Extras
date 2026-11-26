/* Envío de informes mediante Microsoft Graph con credenciales de aplicación.
 * El permiso Microsoft Mail.Send debe estar RESTRINGIDO en Exchange Online
 * al buzón reportes@campestrepereira.com (RBAC for Applications).
 * Nunca exponer MS365_CLIENT_SECRET en frontend, GitHub o respuestas HTTP.
 */
export const GRAPH_SENDER='reportes@campestrepereira.com';
const isGuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const email=v=>typeof v==='string'&&/^[^\s@]+@campestrepereira\.com$/i.test(v);

export function prepararCorreoGraph({to,subject,html}){
 if(!Array.isArray(to)||to.length===0||to.length>5||to.some(x=>!email(x))||
     new Set(to.map(x=>x.toLowerCase())).size!==to.length){
   throw new Error('Destinatarios corporativos inválidos');
 }
 if(typeof subject!=='string'||!subject.trim()||subject.length>240||typeof html!=='string'||!html.trim()){
   throw new Error('Asunto o contenido de reporte no válido');
 }
 return {
   message:{
     subject,
     body:{contentType:'HTML',content:html},
     toRecipients:to.map(address=>({emailAddress:{address}}))
   },
   saveToSentItems:true
 };
}
export class GraphDeliveryError extends Error {
 constructor(stage,status=0){
   super('Fallo en '+stage+' del proveedor Microsoft Graph');
   this.name='GraphDeliveryError';this.stage=stage;this.status=status;
 }
}
/** Por defecto solo se ejecuta en Supabase; tests inyectan env y fetch.
 * Un HTTP 202 significa ACEPTADO, no entrega confirmada al destinatario.
 */
export async function enviarCorreoGraph(correo,options={}){
 const readEnv=options.env||((key)=>Deno.env.get(key)?.trim()||'');
 const request=options.fetch||fetch;
 const tenant=readEnv('MS365_TENANT_ID');
 const client=readEnv('MS365_CLIENT_ID');
 const secret=readEnv('MS365_CLIENT_SECRET');
 if(!isGuid(tenant)||!isGuid(client)||!secret||secret.length<12)
   throw new GraphDeliveryError('configuración',0);
 const message=prepararCorreoGraph(correo);
 const body=new URLSearchParams({
   client_id:client,client_secret:secret,
   grant_type:'client_credentials',
   scope:'https://graph.microsoft.com/.default'
 });
 const oauth=await request(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString()
 });
 if(!oauth.ok)throw new GraphDeliveryError('autenticación',oauth.status);
 let auth;
 try{auth=await oauth.json();}catch{throw new GraphDeliveryError('autenticación',oauth.status)}
 if(typeof auth.access_token!=='string'||!auth.access_token)
   throw new GraphDeliveryError('autenticación',oauth.status);
 const result=await request(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(GRAPH_SENDER)}/sendMail`,{
   method:'POST',
   headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},
   body:JSON.stringify(message)
 });
 if(result.status!==202)throw new GraphDeliveryError('envío',result.status);
 return {accepted:true,http_status:202,from:GRAPH_SENDER,to:correo.to.length};
}

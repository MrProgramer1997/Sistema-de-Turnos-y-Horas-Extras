// Lista cerrada autorizada para el informe diario de puntualidad.
// No contiene claves ni credenciales, solamente destinos institucionales.
export const DESTINATARIO_PRUEBA='analistainnovacion@campestrepereira.com';
export const DESTINATARIOS_DIARIOS=Object.freeze([
  'analistainnovacion@campestrepereira.com',
  'sistemas@campestrepereira.com',
  'directorayb@campestrepereira.com',
  'maitre@campestrepereira.com',
  'dirbienestar@campestrepereira.com'
]);
export function destinatariosPara(modo){
  if(modo==='test')return [DESTINATARIO_PRUEBA];
  if(modo==='send')return [...DESTINATARIOS_DIARIOS];
  throw new Error('Modo de envío no permitido');
}

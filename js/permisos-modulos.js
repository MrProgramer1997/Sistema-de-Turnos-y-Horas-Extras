// Compatibility entry point: v720, v735 and v762 share a single verifier.
export { consultarPermisos, invalidarPermisos, exigirModulo, filtrarEnlaces,
  tieneModulo, moduloDeRuta, destinoPermitido } from './permisos-navegacion.js?v=762';

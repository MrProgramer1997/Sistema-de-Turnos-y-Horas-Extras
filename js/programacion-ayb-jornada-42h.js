import { obtenerReglaJornadaAyb } from "./ayb-jornada-42h-core.js?v=20261010-1";

const REGLA_HABIL = obtenerReglaJornadaAyb("2026-10-09", false);
const REGLA_FIN_SEMANA = obtenerReglaJornadaAyb("2026-10-10", false);
const TEXTO_REGLA = `Regla A&B: lunes a viernes ${formato(REGLA_HABIL.horasNetas)} h netas `
  + `(${formato(REGLA_HABIL.horasBrutas)} h programadas, incluidas ${formato(REGLA_HABIL.descanso)} h de receso); `
  + `sábados, domingos y festivos ${formato(REGLA_FIN_SEMANA.horasNetas)} h netas `
  + `(${formato(REGLA_FIN_SEMANA.horasBrutas)} h programadas, incluidas ${formato(REGLA_FIN_SEMANA.descanso)} h de receso). `
  + "La referencia semanal es de 42 h.";

function formato(valor) {
  return Number(valor).toLocaleString("es-CO", { maximumFractionDigits: 1 });
}

function actualizarTextoPrincipal() {
  const bloque = document.querySelector(".periodo-operativo-ayb .small.text-muted");
  if (bloque) bloque.textContent = TEXTO_REGLA;
}

function corregirEtiquetaGenerada(nodo) {
  if (!nodo) return;
  if (nodo.nodeType === Node.TEXT_NODE) {
    if (nodo.nodeValue?.includes("Martes a viernes / 6,5h netas")) {
      nodo.nodeValue = nodo.nodeValue.replaceAll(
        "Martes a viernes / 6,5h netas",
        "Lunes a viernes / 6,5h netas"
      );
    }
    return;
  }
  if (nodo.nodeType !== Node.ELEMENT_NODE && nodo.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (nodo instanceof Element && ["SCRIPT", "STYLE"].includes(nodo.tagName)) return;

  const walker = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
  let textoActual = walker.nextNode();
  while (textoActual) {
    corregirEtiquetaGenerada(textoActual);
    textoActual = walker.nextNode();
  }
}

function iniciarCorreccionVisualAyb() {
  actualizarTextoPrincipal();
  corregirEtiquetaGenerada(document.body);

  const observer = new MutationObserver((cambios) => {
    for (const cambio of cambios) {
      if (cambio.type === "characterData") corregirEtiquetaGenerada(cambio.target);
      cambio.addedNodes.forEach(corregirEtiquetaGenerada);
    }
    actualizarTextoPrincipal();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciarCorreccionVisualAyb, { once: true });
} else {
  iniciarCorreccionVisualAyb();
}

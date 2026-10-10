const TURNOS_DIA_HABIL = Object.freeze({
  "1": Object.freeze({ inicio: "05:30", fin: "12:30" }),
  "2": Object.freeze({ inicio: "06:00", fin: "13:00" }),
  "3": Object.freeze({ inicio: "07:00", fin: "14:00" }),
  "4": Object.freeze({ inicio: "08:00", fin: "15:00" }),
  "5": Object.freeze({ inicio: "09:00", fin: "16:00" }),
  "6": Object.freeze({ inicio: "10:00", fin: "17:00" }),
  "7": Object.freeze({ inicio: "11:00", fin: "18:00" }),
  "8": Object.freeze({ inicio: "12:00", fin: "19:00" }),
  "9": Object.freeze({ inicio: "13:00", fin: "20:00" }),
  "10": Object.freeze({ inicio: "14:00", fin: "21:00" }),
  "11": Object.freeze({ inicio: "15:00", fin: "22:00" })
});

const TURNOS_FIN_SEMANA_FESTIVO = Object.freeze({
  "1": Object.freeze({ inicio: "05:30", fin: "14:00" }),
  "2": Object.freeze({ inicio: "06:00", fin: "14:30" }),
  "3": Object.freeze({ inicio: "07:00", fin: "15:30" }),
  "4": Object.freeze({ inicio: "08:00", fin: "16:30" }),
  "5": Object.freeze({ inicio: "09:00", fin: "17:30" }),
  "6": Object.freeze({ inicio: "10:00", fin: "18:30" }),
  "7": Object.freeze({ inicio: "11:00", fin: "19:30" }),
  "8": Object.freeze({ inicio: "12:00", fin: "20:30" }),
  "9": Object.freeze({ inicio: "13:00", fin: "21:30" }),
  "10": Object.freeze({ inicio: "14:00", fin: "22:30" }),
  "11": Object.freeze({ inicio: "15:00", fin: "23:30" })
});

const MINUTOS_BRUTOS_DIA_HABIL = 7 * 60;
const MINUTOS_BRUTOS_FIN_SEMANA = 8.5 * 60;
const MARGEN_MINUTOS = 1;

export function esFinDeSemanaAyb(fechaISO) {
  const fecha = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return false;
  return fecha.getDay() === 0 || fecha.getDay() === 6;
}

export function obtenerReglaJornadaAyb(fechaISO, esFestivo = false) {
  const larga = Boolean(esFestivo) || esFinDeSemanaAyb(fechaISO);
  return {
    tipo: larga ? "fin-semana-festivo" : "dia-habil",
    horasBrutas: larga ? 8.5 : 7,
    descanso: 0.5,
    horasNetas: larga ? 8 : 6.5,
    catalogo: larga ? TURNOS_FIN_SEMANA_FESTIVO : TURNOS_DIA_HABIL
  };
}

export function calcularDuracionBrutaMinutosAyb(inicio, fin) {
  const inicioMinutos = horaAMinutos(inicio);
  const finMinutos = horaAMinutos(fin);
  if (inicioMinutos === null || finMinutos === null) return 0;
  return finMinutos >= inicioMinutos
    ? finMinutos - inicioMinutos
    : (24 * 60 - inicioMinutos) + finMinutos;
}

export function normalizarTurnoCopiadoAyb(turnoCopiado, fechaDestinoISO, esFestivo = false) {
  if (!turnoCopiado || turnoCopiado.tipo_registro !== "turno") {
    return turnoCopiado ? { ...turnoCopiado } : turnoCopiado;
  }

  const normalizado = { ...turnoCopiado };
  const regla = obtenerReglaJornadaAyb(fechaDestinoISO, esFestivo);
  const codigoTurno = String(normalizado.turno || "");
  const horarioEstandar = regla.catalogo[codigoTurno];
  const tieneSegundoBloque = Boolean(normalizado.hora_inicio_2 && normalizado.hora_fin_2);

  if (!tieneSegundoBloque && horarioEstandar) {
    normalizado.hora_inicio = horarioEstandar.inicio;
    normalizado.hora_fin = horarioEstandar.fin;
    return normalizado;
  }

  if (!tieneSegundoBloque) return normalizado;

  const totalActual = calcularDuracionBrutaMinutosAyb(normalizado.hora_inicio, normalizado.hora_fin)
    + calcularDuracionBrutaMinutosAyb(normalizado.hora_inicio_2, normalizado.hora_fin_2);
  const esDuracionEstandar = cerca(totalActual, MINUTOS_BRUTOS_DIA_HABIL)
    || cerca(totalActual, MINUTOS_BRUTOS_FIN_SEMANA);

  if (!esDuracionEstandar) return normalizado;

  const objetivo = regla.horasBrutas * 60;
  const diferencia = objetivo - totalActual;
  if (Math.abs(diferencia) <= MARGEN_MINUTOS) return normalizado;

  const finAjustado = sumarMinutosAHora(normalizado.hora_fin_2, diferencia);
  if (finAjustado) normalizado.hora_fin_2 = finAjustado;
  return normalizado;
}

function cerca(valor, objetivo) {
  return Math.abs(valor - objetivo) <= MARGEN_MINUTOS;
}

function horaAMinutos(hora) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hora || ""));
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return horas * 60 + minutos;
}

function sumarMinutosAHora(hora, diferencia) {
  const base = horaAMinutos(hora);
  if (base === null || !Number.isFinite(diferencia)) return null;
  const total = ((base + Math.round(diferencia)) % (24 * 60) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

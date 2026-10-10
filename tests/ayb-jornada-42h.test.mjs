import test from "node:test";
import assert from "node:assert/strict";
import {
  calcularDuracionBrutaMinutosAyb,
  normalizarTurnoCopiadoAyb,
  obtenerReglaJornadaAyb
} from "../js/ayb-jornada-42h-core.js";

const turno8DiaHabil = {
  tipo_registro: "turno",
  turno: "8",
  hora_inicio: "12:00",
  hora_fin: "19:00",
  hora_inicio_2: null,
  hora_fin_2: null
};

test("lunes a viernes aplica 7 horas brutas y 6,5 netas", () => {
  const regla = obtenerReglaJornadaAyb("2026-10-09", false);
  assert.equal(regla.horasBrutas, 7);
  assert.equal(regla.descanso, 0.5);
  assert.equal(regla.horasNetas, 6.5);
});

test("sábado y domingo aplican 8,5 horas brutas y 8 netas", () => {
  const sabado = obtenerReglaJornadaAyb("2026-10-10", false);
  const domingo = obtenerReglaJornadaAyb("2026-10-11", false);
  assert.equal(sabado.horasBrutas, 8.5);
  assert.equal(sabado.horasNetas, 8);
  assert.equal(domingo.horasBrutas, 8.5);
});

test("festivo entre semana usa jornada larga", () => {
  const regla = obtenerReglaJornadaAyb("2026-10-12", true);
  assert.equal(regla.horasBrutas, 8.5);
  assert.equal(regla.horasNetas, 8);
});

test("al pegar turno estándar en sábado ajusta el horario", () => {
  const resultado = normalizarTurnoCopiadoAyb(turno8DiaHabil, "2026-10-10", false);
  assert.equal(resultado.hora_inicio, "12:00");
  assert.equal(resultado.hora_fin, "20:30");
  assert.equal(calcularDuracionBrutaMinutosAyb(resultado.hora_inicio, resultado.hora_fin), 510);
});

test("al pegar turno estándar en festivo ajusta el horario", () => {
  const resultado = normalizarTurnoCopiadoAyb(turno8DiaHabil, "2026-10-12", true);
  assert.equal(resultado.hora_fin, "20:30");
});

test("al pegar turno de fin de semana en día hábil vuelve a 7 horas brutas", () => {
  const resultado = normalizarTurnoCopiadoAyb({ ...turno8DiaHabil, hora_fin: "20:30" }, "2026-10-13", false);
  assert.equal(resultado.hora_fin, "19:00");
});

test("turno partido estándar ajusta solamente el final del segundo bloque", () => {
  const resultado = normalizarTurnoCopiadoAyb({
    tipo_registro: "turno",
    turno: "3",
    hora_inicio: "07:00",
    hora_fin: "12:00",
    turno_2: "8",
    hora_inicio_2: "12:00",
    hora_fin_2: "14:00"
  }, "2026-10-10", false);
  assert.equal(resultado.hora_fin_2, "15:30");
});

test("turno particular conserva sus horas", () => {
  const particular = {
    tipo_registro: "turno",
    turno: "EV1",
    hora_inicio: "18:00",
    hora_fin: "23:00"
  };
  assert.deepEqual(normalizarTurnoCopiadoAyb(particular, "2026-10-10", false), particular);
});

test("horario manual con código estándar no se sobrescribe", () => {
  const manual = {
    tipo_registro: "turno",
    turno: "8",
    hora_inicio: "12:00",
    hora_fin: "19:30"
  };
  assert.deepEqual(normalizarTurnoCopiadoAyb(manual, "2026-10-10", false), manual);
});

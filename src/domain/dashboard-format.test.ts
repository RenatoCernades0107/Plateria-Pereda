import { describe, expect, it } from "vitest";

import {
  computeDelta,
  deltaText,
  deltaTone,
  formatAxisCompact,
  formatCount,
  formatDays,
  formatPercent,
  formatSolesCompact,
  formatSolesWhole,
} from "./dashboard-format";

describe("soles", () => {
  it("enteros con separador de miles", () => {
    expect(formatSolesWhole(12345.6)).toBe("S/ 12,346");
    expect(formatSolesWhole(0)).toBe("S/ 0");
  });
  it("compacto: mil y millones", () => {
    expect(formatSolesCompact(850)).toBe("S/ 850");
    expect(formatSolesCompact(12_400)).toBe("S/ 12.4 mil");
    expect(formatSolesCompact(1_230_000)).toBe("S/ 1.2 M");
    expect(formatSolesCompact(-2_500)).toBe("−S/ 2.5 mil");
  });
  it("ejes", () => {
    expect(formatAxisCompact(0)).toBe("0");
    expect(formatAxisCompact(500)).toBe("500");
    expect(formatAxisCompact(1_500)).toBe("1.5 mil");
  });
});

describe("días, porcentajes y conteos", () => {
  it("días con singular y sin dato", () => {
    expect(formatDays(1)).toBe("1 día");
    expect(formatDays(4.5)).toBe("4.5 días");
    expect(formatDays(0)).toBe("0 días");
    expect(formatDays(null)).toBe("—");
  });
  it("porcentaje con un decimal", () => {
    expect(formatPercent(33.333)).toBe("33.3 %");
    expect(formatPercent(100)).toBe("100.0 %");
    expect(formatPercent(33.6, 0)).toBe("34 %");
    expect(formatPercent(null)).toBe("—");
  });
  it("conteos", () => {
    expect(formatCount(1234)).toBe("1,234");
  });
});

describe("computeDelta", () => {
  it("sube y baja con su porcentaje", () => {
    expect(computeDelta(150, 100)).toEqual({ kind: "up", pct: 50 });
    expect(computeDelta(75, 100)).toEqual({ kind: "down", pct: -25 });
  });
  it("sin base: nuevo; sin datos en ambos: nada", () => {
    expect(computeDelta(10, 0)).toEqual({ kind: "new", pct: null });
    expect(computeDelta(0, 0)).toEqual({ kind: "none", pct: null });
    expect(computeDelta(null, 5)).toEqual({ kind: "none", pct: null });
  });
  it("cambios mínimos son «igual»", () => {
    expect(computeDelta(100.01, 100).kind).toBe("flat");
  });
  it("de algo a cero es una baja del 100 %", () => {
    expect(computeDelta(0, 80)).toEqual({ kind: "down", pct: -100 });
  });
});

describe("deltaText y deltaTone", () => {
  it("textos", () => {
    expect(deltaText(computeDelta(150, 100))).toBe("+50.0 %");
    expect(deltaText(computeDelta(75, 100))).toBe("−25.0 %");
    expect(deltaText(computeDelta(5, 0))).toBe("Nuevo");
    expect(deltaText(computeDelta(100, 100))).toBe("Igual");
    expect(deltaText(computeDelta(0, 0))).toBe("");
  });
  it("subir es bueno salvo que se diga lo contrario (p. ej. días de cumplimiento)", () => {
    expect(deltaTone(computeDelta(150, 100))).toBe("good");
    expect(deltaTone(computeDelta(50, 100))).toBe("bad");
    expect(deltaTone(computeDelta(150, 100), false)).toBe("bad");
    expect(deltaTone(computeDelta(50, 100), false)).toBe("good");
    expect(deltaTone(computeDelta(100, 100))).toBe("neutral");
  });
});

import { describe, expect, it } from "vitest";

import {
  ALERT_KINDS,
  ALERT_PREVIEW,
  DEFAULT_ALERT_TEMPLATES,
  formatAlertPieces,
  renderAlert,
  toAlertCounts,
  unknownAlertPlaceholders,
  type AlertInput,
} from "./alerts";

const base: AlertInput = {
  kind: "aprobacion_parcial",
  restorationCode: "RES-00012",
  clientName: "Ana Díaz",
  actorName: "Vera Ventas",
  counts: { live: 4, approved: 2, waiting: 0 },
  pieces: [
    { code: "RES-00012-1", description: "Fuente" },
    { code: "RES-00012-2", description: "Jarra" },
  ],
};

describe("alertas", () => {
  it("los mensajes por defecto solo usan variables conocidas", () => {
    for (const kind of ALERT_KINDS) {
      expect(unknownAlertPlaceholders(DEFAULT_ALERT_TEMPLATES[kind])).toEqual(
        [],
      );
    }
  });

  it("detecta variables mal escritas", () => {
    expect(unknownAlertPlaceholders("{guai} {guia} {guai}")).toEqual(["guai"]);
  });

  it("arma la alerta de aprobación parcial con el avance", () => {
    expect(renderAlert(base, null)).toEqual({
      title: "RES-00012 · Guía parcialmente aprobada",
      body: "Vera Ventas aprobó RES-00012-1 (Fuente) y RES-00012-2 (Jarra). Van 2 de 4 piezas aprobadas; faltan 2 por decidir.",
    });
  });

  it("arma la alerta de guía aprobada", () => {
    const alert = renderAlert(
      {
        ...base,
        kind: "aprobacion_total",
        counts: { live: 4, approved: 4, waiting: 0 },
        pieces: [{ code: "RES-00012-4", description: "Copa" }],
      },
      "",
    );
    expect(alert.title).toBe("RES-00012 · Guía aprobada");
    expect(alert.body).toBe(
      "Vera Ventas aprobó RES-00012-4 (Copa). Guía completa: 4 de 4 piezas aprobadas, listas para ir al taller.",
    );
  });

  it("arma las alertas de espera con el cliente", () => {
    const waiting = { ...base, counts: { live: 3, approved: 0, waiting: 3 } };
    expect(
      renderAlert({ ...waiting, kind: "pieza_en_espera" }, null).body,
    ).toBe(
      "Vera Ventas pasó RES-00012-1 (Fuente) y RES-00012-2 (Jarra) a esperar la respuesta de Ana Díaz. En espera: 3 de 3 piezas de la guía.",
    );
    expect(renderAlert({ ...waiting, kind: "guia_en_espera" }, null).body).toBe(
      "Todas las piezas de la guía (3) esperan la respuesta de Ana Díaz. Es buen momento para hacerle seguimiento.",
    );
  });

  it("usa el mensaje propio y rellena lo que falta", () => {
    const alert = renderAlert(
      { ...base, clientName: null, actorName: null, pieces: [] },
      "{usuario}: {cantidad} de {cliente} en {guia}  {otra}",
    );
    expect(alert.body).toBe("Alguien: 0 de el cliente en RES-00012 {otra}");
  });

  it("lista las piezas abreviando las largas y las que sobran", () => {
    expect(formatAlertPieces([])).toBe("");
    expect(formatAlertPieces([{ code: "A-1", description: " " }])).toBe("A-1");
    expect(
      formatAlertPieces([
        { code: "A-1", description: "x".repeat(60) },
        { code: "A-2", description: "Jarra" },
        { code: "A-3", description: "Copa" },
        { code: "A-4", description: "Vaso" },
        { code: "A-5", description: "Plato" },
      ]),
    ).toBe(`A-1 (${"x".repeat(39)}…), A-2 (Jarra), A-3 (Copa) y 2 más`);
  });

  it("lee los contadores de la BD aunque falten", () => {
    expect(toAlertCounts({ live: 3, approved: "2" })).toEqual({
      live: 3,
      approved: 2,
      waiting: 0,
    });
    expect(toAlertCounts(null)).toEqual({ live: 0, approved: 0, waiting: 0 });
  });

  it("la vista previa tiene un ejemplo por alerta", () => {
    for (const kind of ALERT_KINDS) {
      expect(renderAlert({ kind, ...ALERT_PREVIEW[kind] }, null).body).not.toBe(
        "",
      );
    }
  });
});

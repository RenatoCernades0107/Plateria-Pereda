import { describe, expect, it } from "vitest";

import type { AppRole } from "@/lib/roles";

import {
  applyTransition,
  availableTransitions,
  canMarkArrived,
  findTransition,
  markArrived,
  PIECE_STATUS_LABELS,
  PIECE_STATUSES,
  PIECE_TRANSITIONS,
  TRANSITION_ERROR_MESSAGES,
  type PieceSnapshot,
  type PieceStatus,
} from "./piece-state-machine";

// Tabla esperada (§7.1 + P41 + P42), escrita aparte del código: si alguien cambia
// una transición o sus roles, este test lo detecta.
// Roles: A = admin, V = ventas, L = logística. N = nota obligatoria, T = taller obligatorio.
const ESPERADO: Record<string, { roles: string; requires?: "N" | "T" }> = {
  "registrada→en_consulta": { roles: "AV", requires: "N" },
  "registrada→aprobada": { roles: "AV" },
  "en_consulta→en_espera": { roles: "AV" },
  "en_espera→aprobada": { roles: "AV" },
  "aprobada→recibida": { roles: "AVL" },
  "recibida→enviada_taller": { roles: "AL", requires: "T" },
  "enviada_taller→devuelta_taller": { roles: "AL" },
  "devuelta_taller→entregada": { roles: "AVL" },
  "devuelta_taller→observada": { roles: "AVL", requires: "N" },
  "observada→enviada_taller": { roles: "AL", requires: "T" },
  "entregada→observada": { roles: "AVL", requires: "N" },
  "registrada→anulada": { roles: "AV", requires: "N" },
  "en_consulta→anulada": { roles: "AV", requires: "N" },
  "en_espera→anulada": { roles: "AV", requires: "N" },
  "aprobada→anulada": { roles: "AV", requires: "N" },
  "recibida→anulada": { roles: "AV", requires: "N" },
  "enviada_taller→anulada": { roles: "A", requires: "N" },
  "devuelta_taller→anulada": { roles: "AV", requires: "N" },
  "observada→anulada": { roles: "AV", requires: "N" },
};

const ROLE_CODE: Record<AppRole, string> = {
  admin: "A",
  ventas: "V",
  logistica: "L",
};
const ROLES: AppRole[] = ["admin", "ventas", "logistica"];

const NOW = new Date("2026-10-04T15:00:00Z");
const BEFORE = new Date("2026-10-01T15:00:00Z");

const piece = (
  status: PieceStatus,
  overrides: Partial<PieceSnapshot> = {},
): PieceSnapshot => ({
  status,
  arrivedAt: null,
  workshopId: null,
  firstSentAt: null,
  ...overrides,
});

describe("tabla de transiciones", () => {
  it("tiene exactamente las transiciones esperadas", () => {
    const keys = PIECE_TRANSITIONS.map((t) => `${t.from}→${t.to}`);
    expect([...keys].sort()).toEqual(Object.keys(ESPERADO).sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(PIECE_TRANSITIONS.map((t) => [`${t.from}→${t.to}`, t] as const))(
    "%s tiene los roles y requisitos acordados",
    (key, t) => {
      const esperado = ESPERADO[key]!;
      expect(t.roles.map((r) => ROLE_CODE[r]).join("")).toBe(esperado.roles);
      expect(t.requiresNote).toBe(esperado.requires === "N");
      expect(t.requiresWorkshop).toBe(esperado.requires === "T");
    },
  );

  it("todos los estados tienen etiqueta", () => {
    expect(Object.keys(PIECE_STATUS_LABELS).sort()).toEqual(
      [...PIECE_STATUSES].sort(),
    );
  });
});

describe("todas las combinaciones origen × destino × rol", () => {
  const casos = PIECE_STATUSES.flatMap((from) =>
    PIECE_STATUSES.flatMap((to) =>
      ROLES.map((role) => {
        const esperado = ESPERADO[`${from}→${to}`];
        const permitido = !!esperado?.roles.includes(ROLE_CODE[role]);
        return [from, to, role, esperado ? permitido : null] as const;
      }),
    ),
  );

  it.each(casos)("%s → %s por %s", (from, to, role, permitido) => {
    const result = applyTransition(piece(from), {
      to,
      role,
      note: "Motivo",
      workshopId: "taller-a",
      now: NOW,
    });
    if (permitido === null) {
      expect(result).toEqual({ ok: false, error: "transicion_invalida" });
    } else if (!permitido) {
      expect(result).toEqual({ ok: false, error: "rol_no_permitido" });
    } else {
      expect(result.ok).toBe(true);
    }
  });
});

describe("availableTransitions", () => {
  it("solo ofrece las transiciones del estado y del rol", () => {
    const destinos = (status: PieceStatus, role: AppRole) =>
      availableTransitions(piece(status), role).map((t) => t.to);

    expect(destinos("registrada", "ventas")).toEqual([
      "en_consulta",
      "aprobada",
      "anulada",
    ]);
    expect(destinos("registrada", "logistica")).toEqual([]);
    expect(destinos("recibida", "logistica")).toEqual(["enviada_taller"]);
    expect(destinos("recibida", "ventas")).toEqual(["anulada"]);
    expect(destinos("enviada_taller", "admin")).toEqual([
      "devuelta_taller",
      "anulada",
    ]);
    expect(destinos("enviada_taller", "ventas")).toEqual([]);
    expect(destinos("devuelta_taller", "logistica")).toEqual([
      "entregada",
      "observada",
    ]);
  });

  it("Aprobada → Recibida se hace con 'Marcar llegada', no como transición", () => {
    for (const role of ROLES) {
      expect(availableTransitions(piece("aprobada"), role)).not.toContainEqual(
        expect.objectContaining({ to: "recibida" }),
      );
    }
  });

  it("logística no consulta, aprueba ni anula", () => {
    for (const status of PIECE_STATUSES) {
      const destinos = availableTransitions(piece(status), "logistica").map(
        (t) => t.to,
      );
      expect(destinos).not.toContain("en_consulta");
      expect(destinos).not.toContain("en_espera");
      expect(destinos).not.toContain("aprobada");
      expect(destinos).not.toContain("anulada");
    }
  });
});

describe("applyTransition", () => {
  it("aprobar una pieza que ya llegó la deja en Recibida (dos pasos)", () => {
    const result = applyTransition(piece("registrada", { arrivedAt: BEFORE }), {
      to: "aprobada",
      role: "ventas",
      now: NOW,
    });
    expect(result).toEqual({
      ok: true,
      changes: { status: "recibida", approvedAt: NOW, receivedAt: NOW },
      steps: [
        { from: "registrada", to: "aprobada" },
        { from: "aprobada", to: "recibida" },
      ],
      note: null,
    });
  });

  it("aprobar una pieza que aún no llegó la deja en Aprobada", () => {
    const result = applyTransition(piece("en_espera"), {
      to: "aprobada",
      role: "admin",
      now: NOW,
    });
    expect(result).toEqual({
      ok: true,
      changes: { status: "aprobada", approvedAt: NOW },
      steps: [{ from: "en_espera", to: "aprobada" }],
      note: null,
    });
  });

  it.each([
    ["registrada", "en_consulta"],
    ["registrada", "anulada"],
    ["en_espera", "anulada"],
    ["devuelta_taller", "observada"],
    ["entregada", "observada"],
  ] as const)("%s → %s exige nota", (from, to) => {
    for (const note of [undefined, null, "", "   "]) {
      expect(
        applyTransition(piece(from), { to, role: "admin", note, now: NOW }),
      ).toEqual({ ok: false, error: "nota_requerida" });
    }
    const ok = applyTransition(piece(from), {
      to,
      role: "admin",
      note: "  Cliente pidió revisar el baño  ",
      now: NOW,
    });
    expect(ok).toMatchObject({
      ok: true,
      note: "Cliente pidió revisar el baño",
    });
  });

  it("la nota es opcional donde no se exige", () => {
    expect(
      applyTransition(piece("en_consulta"), {
        to: "en_espera",
        role: "ventas",
        now: NOW,
      }),
    ).toMatchObject({ ok: true, note: null });
    expect(
      applyTransition(piece("en_consulta"), {
        to: "en_espera",
        role: "ventas",
        note: "Propuesta: S/ 120",
        now: NOW,
      }),
    ).toMatchObject({ ok: true, note: "Propuesta: S/ 120" });
  });

  describe("envío al taller", () => {
    it("exige un taller", () => {
      expect(
        applyTransition(piece("recibida"), {
          to: "enviada_taller",
          role: "logistica",
          now: NOW,
        }),
      ).toEqual({ ok: false, error: "taller_requerido" });
    });

    it("usa el taller ya asignado a la pieza", () => {
      expect(
        applyTransition(piece("recibida", { workshopId: "taller-a" }), {
          to: "enviada_taller",
          role: "logistica",
          now: NOW,
        }),
      ).toEqual({
        ok: true,
        changes: { status: "enviada_taller", firstSentAt: NOW },
        steps: [{ from: "recibida", to: "enviada_taller" }],
        note: null,
      });
    });

    it("cambia el taller si se elige otro", () => {
      expect(
        applyTransition(piece("recibida", { workshopId: "taller-a" }), {
          to: "enviada_taller",
          role: "admin",
          workshopId: "taller-b",
          now: NOW,
        }),
      ).toMatchObject({
        ok: true,
        changes: { workshopId: "taller-b", firstSentAt: NOW },
      });
    });

    it("el reenvío tras una observación conserva la primera fecha de envío", () => {
      const result = applyTransition(
        piece("observada", { workshopId: "taller-a", firstSentAt: BEFORE }),
        { to: "enviada_taller", role: "logistica", now: NOW },
      );
      expect(result).toEqual({
        ok: true,
        changes: { status: "enviada_taller" },
        steps: [{ from: "observada", to: "enviada_taller" }],
        note: null,
      });
    });

    it("solo cambia el taller en las transiciones que lo piden", () => {
      const result = applyTransition(piece("enviada_taller"), {
        to: "devuelta_taller",
        role: "logistica",
        workshopId: "taller-b",
        now: NOW,
      });
      expect(result).toEqual({
        ok: true,
        changes: { status: "devuelta_taller", lastReturnedAt: NOW },
        steps: [{ from: "enviada_taller", to: "devuelta_taller" }],
        note: null,
      });
    });
  });

  it.each([
    ["devuelta_taller", "entregada", { deliveredAt: NOW }],
    ["registrada", "anulada", { cancelledAt: NOW }],
    ["entregada", "observada", {}],
    ["registrada", "en_consulta", {}],
  ] as const)("%s → %s fija sus fechas", (from, to, fechas) => {
    const result = applyTransition(piece(from), {
      to,
      role: "admin",
      note: "Motivo",
      now: NOW,
    });
    expect(result).toEqual({
      ok: true,
      changes: { status: to, ...fechas },
      steps: [{ from, to }],
      note: "Motivo",
    });
  });

  it("Anulada es un estado final", () => {
    for (const to of PIECE_STATUSES) {
      for (const role of ROLES) {
        expect(
          applyTransition(piece("anulada"), {
            to,
            role,
            note: "x",
            workshopId: "taller-a",
            now: NOW,
          }),
        ).toEqual({ ok: false, error: "transicion_invalida" });
      }
    }
    expect(findTransition("anulada", "registrada")).toBeUndefined();
  });

  it("una pieza entregada no se anula", () => {
    expect(
      applyTransition(piece("entregada"), {
        to: "anulada",
        role: "admin",
        note: "x",
        now: NOW,
      }),
    ).toEqual({ ok: false, error: "transicion_invalida" });
  });

  it("desde En consulta solo se pasa a En espera o se anula; desde En espera solo se aprueba o se anula", () => {
    const destinos = (from: PieceStatus) =>
      PIECE_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
    expect(destinos("en_consulta")).toEqual(["en_espera", "anulada"]);
    expect(destinos("en_espera")).toEqual(["aprobada", "anulada"]);
  });

  it("una pieza devuelta vuelve al taller solo pasando por Observada (P41 f)", () => {
    expect(findTransition("devuelta_taller", "enviada_taller")).toBeUndefined();
    expect(findTransition("observada", "enviada_taller")).toBeDefined();
  });

  it("solo una pieza que estuvo en el taller puede quedar Observada (P17 a)", () => {
    const origenes = PIECE_TRANSITIONS.filter((t) => t.to === "observada").map(
      (t) => t.from,
    );
    expect(origenes.sort()).toEqual(["devuelta_taller", "entregada"]);
  });

  it("los errores tienen un mensaje", () => {
    for (const message of Object.values(TRANSITION_ERROR_MESSAGES)) {
      expect(message).not.toBe("");
    }
  });
});

describe("marcar llegada a tienda", () => {
  it.each(["registrada", "en_consulta", "en_espera"] as const)(
    "en %s solo guarda la fecha de llegada",
    (status) => {
      expect(markArrived(piece(status), "logistica", NOW)).toEqual({
        ok: true,
        changes: { status, arrivedAt: NOW },
        steps: [],
        note: null,
      });
    },
  );

  it("una pieza Aprobada pasa a Recibida", () => {
    expect(markArrived(piece("aprobada"), "logistica", NOW)).toEqual({
      ok: true,
      changes: { status: "recibida", receivedAt: NOW, arrivedAt: NOW },
      steps: [{ from: "aprobada", to: "recibida" }],
      note: null,
    });
  });

  it("todos los roles pueden marcar la llegada (P42)", () => {
    for (const role of ROLES) {
      expect(canMarkArrived(piece("registrada"), role)).toBe(true);
    }
  });

  it("no se ofrece si la pieza ya llegó", () => {
    const llegada = piece("registrada", { arrivedAt: BEFORE });
    expect(canMarkArrived(llegada, "admin")).toBe(false);
    expect(markArrived(llegada, "admin", NOW)).toEqual({
      ok: false,
      error: "transicion_invalida",
    });
  });

  it.each([
    "recibida",
    "enviada_taller",
    "devuelta_taller",
    "observada",
    "entregada",
    "anulada",
  ] as const)("no se ofrece en %s", (status) => {
    expect(canMarkArrived(piece(status), "admin")).toBe(false);
  });

  it("al recibir una pieza siempre queda su fecha de llegada", () => {
    for (const status of PIECE_STATUSES) {
      for (const to of PIECE_STATUSES) {
        const result = applyTransition(piece(status), {
          to,
          role: "admin",
          note: "x",
          workshopId: "taller-a",
          now: NOW,
        });
        if (result.ok && result.changes.status === "recibida") {
          expect(result.changes.arrivedAt ?? null).not.toBeNull();
        }
      }
    }
  });
});

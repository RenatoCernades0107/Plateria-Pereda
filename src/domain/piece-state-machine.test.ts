import { describe, expect, it } from "vitest";

import type { AppRole } from "@/lib/roles";

import {
  applyTransition,
  availableTransitions,
  canMarkArrived,
  canReceiveFromWorkshop,
  canReturnToClient,
  CLOSED_STATUSES,
  findTransition,
  isClosedStatus,
  markArrived,
  PIECE_STATUS_LABELS,
  PIECE_STATUSES,
  PIECE_TRANSITIONS,
  receiveFromWorkshop,
  returnToClient,
  TRANSITION_ERROR_MESSAGES,
  type PieceSnapshot,
  type PieceStatus,
} from "./piece-state-machine";

// Tabla esperada (§7.1 + P41 + P42 + P47), escrita aparte del código: si alguien
// cambia una transición o sus roles, este test lo detecta.
// Roles: A = admin, V = ventas, L = logística. N = nota obligatoria, T = taller obligatorio.
const ESPERADO: Record<string, { roles: string; requires?: "N" | "T" }> = {
  "registrada→en_consulta": { roles: "AV", requires: "N" },
  "registrada→aprobada": { roles: "AV" },
  "en_consulta→en_espera": { roles: "AV" },
  "en_espera→aprobada": { roles: "AV" },
  "en_espera→rechazada": { roles: "AV", requires: "N" },
  "en_consulta→sin_arreglo": { roles: "AV", requires: "N" },
  "aprobada→enviada_taller": { roles: "AL", requires: "T" },
  "enviada_taller→sin_arreglo": { roles: "AVL", requires: "N" },
  "enviada_taller→entregada": { roles: "AVL" },
  "enviada_taller→observada": { roles: "AVL", requires: "N" },
  "entregada→observada": { roles: "AVL", requires: "N" },
  "observada→enviada_taller": { roles: "AL", requires: "T" },
  "observada→entregada": { roles: "AVL" },
  "registrada→anulada": { roles: "AV", requires: "N" },
  "en_consulta→anulada": { roles: "AV", requires: "N" },
  "en_espera→anulada": { roles: "AV", requires: "N" },
  "aprobada→anulada": { roles: "AV", requires: "N" },
  "enviada_taller→anulada": { roles: "A", requires: "N" },
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
  readyForDelivery: false,
  returnedAt: null,
  ...overrides,
});

/** Pieza en la tienda y, si está en Interno, ya de vuelta del taller. */
const enTienda = (
  status: PieceStatus,
  overrides: Partial<PieceSnapshot> = {},
) =>
  piece(status, {
    arrivedAt: BEFORE,
    readyForDelivery: status === "enviada_taller",
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

  it("usa los nombres de la Platería (P47)", () => {
    expect(PIECE_STATUS_LABELS.en_consulta).toBe("Consulta");
    expect(PIECE_STATUS_LABELS.en_espera).toBe("Espera respuesta cliente");
    expect(PIECE_STATUS_LABELS.enviada_taller).toBe("Interno");
    expect(PIECE_STATUS_LABELS.observada).toBe("Observación");
    expect(PIECE_STATUS_LABELS.rechazada).toBe("Rechazado (cliente)");
    expect(PIECE_STATUS_LABELS.sin_arreglo).toBe("No tiene arreglo");
    expect(PIECE_STATUS_LABELS.anulada).toBe("Anulado");
  });

  it("Rechazado, No tiene arreglo y Anulado son finales y no se cobran", () => {
    expect([...CLOSED_STATUSES].sort()).toEqual([
      "anulada",
      "rechazada",
      "sin_arreglo",
    ]);
    for (const status of CLOSED_STATUSES) {
      expect(isClosedStatus(status)).toBe(true);
      expect(PIECE_TRANSITIONS.filter((t) => t.from === status)).toEqual([]);
    }
    expect(isClosedStatus("entregada")).toBe(false);
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
    const result = applyTransition(enTienda(from), {
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
      availableTransitions(enTienda(status), role).map((t) => t.to);

    expect(destinos("registrada", "ventas")).toEqual([
      "en_consulta",
      "aprobada",
      "anulada",
    ]);
    expect(destinos("registrada", "logistica")).toEqual([]);
    expect(destinos("en_consulta", "ventas")).toEqual([
      "en_espera",
      "sin_arreglo",
      "anulada",
    ]);
    expect(destinos("aprobada", "logistica")).toEqual(["enviada_taller"]);
    expect(destinos("aprobada", "ventas")).toEqual(["anulada"]);
    expect(destinos("enviada_taller", "admin")).toEqual([
      "sin_arreglo",
      "entregada",
      "observada",
      "anulada",
    ]);
    expect(destinos("observada", "logistica")).toEqual([
      "enviada_taller",
      "entregada",
    ]);
  });

  it("no ofrece enviar al taller una pieza que no llegó a la tienda", () => {
    expect(
      availableTransitions(piece("aprobada"), "logistica").map((t) => t.to),
    ).toEqual([]);
  });

  it("mientras la pieza sigue en el taller no se entrega ni se observa", () => {
    expect(
      availableTransitions(
        piece("enviada_taller", { arrivedAt: BEFORE }),
        "logistica",
      ).map((t) => t.to),
    ).toEqual(["sin_arreglo"]);
  });

  it("logística no consulta, aprueba, rechaza ni anula", () => {
    for (const status of PIECE_STATUSES) {
      const destinos = availableTransitions(enTienda(status), "logistica").map(
        (t) => t.to,
      );
      expect(destinos).not.toContain("en_consulta");
      expect(destinos).not.toContain("en_espera");
      expect(destinos).not.toContain("aprobada");
      expect(destinos).not.toContain("rechazada");
      expect(destinos).not.toContain("anulada");
    }
  });
});

describe("applyTransition", () => {
  it("aprobar una pieza que ya llegó la deja Aprobada (ya no existe Recibida)", () => {
    expect(
      applyTransition(piece("registrada", { arrivedAt: BEFORE }), {
        to: "aprobada",
        role: "ventas",
        now: NOW,
      }),
    ).toEqual({
      ok: true,
      changes: { status: "aprobada", approvedAt: NOW },
      steps: [{ from: "registrada", to: "aprobada", event: "estado" }],
      note: null,
    });
  });

  it.each([
    ["registrada", "en_consulta"],
    ["registrada", "anulada"],
    ["en_espera", "rechazada"],
    ["en_consulta", "sin_arreglo"],
    ["enviada_taller", "sin_arreglo"],
    ["enviada_taller", "observada"],
    ["entregada", "observada"],
  ] as const)("%s → %s exige nota", (from, to) => {
    for (const note of [undefined, null, "", "   "]) {
      expect(
        applyTransition(enTienda(from), { to, role: "admin", note, now: NOW }),
      ).toEqual({ ok: false, error: "nota_requerida" });
    }
    expect(
      applyTransition(enTienda(from), {
        to,
        role: "admin",
        note: "  Cliente pidió revisar el baño  ",
        now: NOW,
      }),
    ).toMatchObject({ ok: true, note: "Cliente pidió revisar el baño" });
  });

  it("la nota es opcional donde no se exige", () => {
    expect(
      applyTransition(piece("en_consulta"), {
        to: "en_espera",
        role: "ventas",
        now: NOW,
      }),
    ).toMatchObject({ ok: true, note: null });
  });

  describe("envío al taller (Interno)", () => {
    it("exige que la pieza esté en la tienda", () => {
      expect(
        applyTransition(piece("aprobada", { workshopId: "taller-a" }), {
          to: "enviada_taller",
          role: "logistica",
          now: NOW,
        }),
      ).toEqual({ ok: false, error: "no_llego" });
    });

    it("exige un taller", () => {
      expect(
        applyTransition(enTienda("aprobada"), {
          to: "enviada_taller",
          role: "logistica",
          now: NOW,
        }),
      ).toEqual({ ok: false, error: "taller_requerido" });
    });

    it("usa el taller ya asignado y fija el primer y el último envío", () => {
      expect(
        applyTransition(enTienda("aprobada", { workshopId: "taller-a" }), {
          to: "enviada_taller",
          role: "logistica",
          now: NOW,
        }),
      ).toEqual({
        ok: true,
        changes: {
          status: "enviada_taller",
          firstSentAt: NOW,
          lastSentAt: NOW,
        },
        steps: [{ from: "aprobada", to: "enviada_taller", event: "estado" }],
        note: null,
      });
    });

    it("cambia el taller si se elige otro", () => {
      expect(
        applyTransition(enTienda("aprobada", { workshopId: "taller-a" }), {
          to: "enviada_taller",
          role: "admin",
          workshopId: "taller-b",
          now: NOW,
        }),
      ).toMatchObject({ ok: true, changes: { workshopId: "taller-b" } });
    });

    it("el reenvío tras una observación conserva la primera fecha de envío", () => {
      expect(
        applyTransition(
          enTienda("observada", {
            workshopId: "taller-a",
            firstSentAt: BEFORE,
          }),
          { to: "enviada_taller", role: "logistica", now: NOW },
        ),
      ).toMatchObject({
        ok: true,
        changes: { status: "enviada_taller", lastSentAt: NOW },
      });
    });
  });

  it("desde Interno solo se entrega u observa lo que volvió del taller", () => {
    const enTaller = piece("enviada_taller", { arrivedAt: BEFORE });
    for (const to of ["entregada", "observada"] as const) {
      expect(
        applyTransition(enTaller, { to, role: "admin", note: "x", now: NOW }),
      ).toEqual({ ok: false, error: "sigue_en_taller" });
    }
    expect(
      applyTransition(enTaller, {
        to: "sin_arreglo",
        role: "logistica",
        note: "El taller dice que no tiene arreglo",
        now: NOW,
      }),
    ).toMatchObject({
      ok: true,
      changes: { status: "sin_arreglo", cancelledAt: NOW },
    });
  });

  it.each([
    ["enviada_taller", "entregada", { deliveredAt: NOW }],
    ["observada", "entregada", { deliveredAt: NOW }],
    ["registrada", "anulada", { cancelledAt: NOW }],
    ["en_espera", "rechazada", { cancelledAt: NOW }],
    ["en_consulta", "sin_arreglo", { cancelledAt: NOW }],
    ["entregada", "observada", {}],
    ["registrada", "en_consulta", {}],
  ] as const)("%s → %s fija sus fechas", (from, to, fechas) => {
    expect(
      applyTransition(enTienda(from), {
        to,
        role: "admin",
        note: "Motivo",
        now: NOW,
      }),
    ).toEqual({
      ok: true,
      changes: { status: to, ...fechas },
      steps: [{ from, to, event: "estado" }],
      note: "Motivo",
    });
  });

  it("los estados finales no cambian", () => {
    for (const from of CLOSED_STATUSES) {
      for (const to of PIECE_STATUSES) {
        for (const role of ROLES) {
          expect(
            applyTransition(enTienda(from), {
              to,
              role,
              note: "x",
              workshopId: "taller-a",
              now: NOW,
            }),
          ).toEqual({ ok: false, error: "transicion_invalida" });
        }
      }
    }
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

  it("el cliente rechaza solo desde Espera respuesta cliente (P47, P50)", () => {
    const origenes = PIECE_TRANSITIONS.filter((t) => t.to === "rechazada").map(
      (t) => t.from,
    );
    expect(origenes).toEqual(["en_espera"]);
  });

  it("una pieza de vuelta del taller vuelve a ir solo pasando por Observación (P41 f)", () => {
    expect(findTransition("enviada_taller", "enviada_taller")).toBeUndefined();
    expect(findTransition("observada", "enviada_taller")).toBeDefined();
  });

  it("solo una pieza que estuvo en el taller puede quedar en Observación (P17 a)", () => {
    const origenes = PIECE_TRANSITIONS.filter((t) => t.to === "observada").map(
      (t) => t.from,
    );
    expect(origenes.sort()).toEqual(["entregada", "enviada_taller"]);
  });

  it("los errores tienen un mensaje", () => {
    for (const message of Object.values(TRANSITION_ERROR_MESSAGES)) {
      expect(message).not.toBe("");
    }
  });
});

describe("marcar llegada a tienda", () => {
  it.each(["registrada", "en_consulta", "en_espera", "aprobada"] as const)(
    "en %s solo guarda la fecha de llegada",
    (status) => {
      expect(markArrived(piece(status), "logistica", NOW)).toEqual({
        ok: true,
        changes: { status, arrivedAt: NOW },
        steps: [{ from: status, to: status, event: "llegada" }],
        note: null,
      });
    },
  );

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
    "enviada_taller",
    "observada",
    "entregada",
    "rechazada",
    "sin_arreglo",
    "anulada",
  ] as const)("no se ofrece en %s", (status) => {
    expect(canMarkArrived(piece(status), "admin")).toBe(false);
  });
});

describe("recibir del taller", () => {
  const enTaller = piece("enviada_taller", { arrivedAt: BEFORE });

  it("lo hacen logística y admin; la pieza sigue en Interno", () => {
    expect(canReceiveFromWorkshop(enTaller, "logistica")).toBe(true);
    expect(canReceiveFromWorkshop(enTaller, "admin")).toBe(true);
    expect(canReceiveFromWorkshop(enTaller, "ventas")).toBe(false);
    expect(receiveFromWorkshop(enTaller, "logistica", NOW)).toEqual({
      ok: true,
      changes: { status: "enviada_taller", lastReturnedAt: NOW },
      steps: [
        {
          from: "enviada_taller",
          to: "enviada_taller",
          event: "vuelta_taller",
        },
      ],
      note: null,
    });
    expect(receiveFromWorkshop(enTaller, "ventas", NOW)).toEqual({
      ok: false,
      error: "rol_no_permitido",
    });
  });

  it("no se recibe dos veces ni fuera de Interno", () => {
    const deVuelta = piece("enviada_taller", { readyForDelivery: true });
    expect(canReceiveFromWorkshop(deVuelta, "admin")).toBe(false);
    expect(receiveFromWorkshop(deVuelta, "admin", NOW)).toEqual({
      ok: false,
      error: "transicion_invalida",
    });
    expect(canReceiveFromWorkshop(piece("observada"), "admin")).toBe(false);
  });
});

describe("devolver al cliente", () => {
  it.each(["rechazada", "sin_arreglo"] as const)(
    "una pieza %s que está en la tienda se devuelve (todos los roles)",
    (status) => {
      const p = piece(status, { arrivedAt: BEFORE });
      for (const role of ROLES) expect(canReturnToClient(p, role)).toBe(true);
      expect(returnToClient(p, "logistica", NOW)).toEqual({
        ok: true,
        changes: { status, returnedAt: NOW },
        steps: [{ from: status, to: status, event: "devolucion_cliente" }],
        note: null,
      });
    },
  );

  it("no se devuelve lo que no llegó, lo ya devuelto ni otros estados", () => {
    expect(canReturnToClient(piece("rechazada"), "admin")).toBe(false);
    expect(
      canReturnToClient(
        piece("rechazada", { arrivedAt: BEFORE, returnedAt: NOW }),
        "admin",
      ),
    ).toBe(false);
    expect(
      canReturnToClient(piece("anulada", { arrivedAt: BEFORE }), "admin"),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import type { AppRole } from "@/lib/roles";

import {
  applyTransition,
  availableTransitions,
  canMarkArrived,
  canReceiveFromReview,
  canReceiveFromWorkshop,
  canReturnToClient,
  canSendForReview,
  canUndoStatus,
  CLOSED_STATUSES,
  findTransition,
  isClosedStatus,
  isInReview,
  markArrived,
  PIECE_STATUS_LABELS,
  PIECE_STATUSES,
  PIECE_TRANSITIONS,
  receiveFromReview,
  receiveFromWorkshop,
  returnToClient,
  sendForReview,
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

/** Pieza en la tienda y, si está en En restauración, ya de vuelta del taller. */
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
    expect(PIECE_STATUS_LABELS.enviada_taller).toBe("En restauración");
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

  describe("envío al taller (En restauración)", () => {
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

  it("desde En restauración solo se entrega u observa lo que volvió del taller", () => {
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

  it("lo hacen logística y admin; la pieza sigue en En restauración", () => {
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

  it("no se recibe dos veces ni fuera de En restauración", () => {
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

describe("revisión en taller", () => {
  const SENT = new Date("2026-10-02T15:00:00Z");
  /** En la tienda, en Consulta o Espera, sin revisión abierta. */
  const enConsulta = (overrides: Partial<PieceSnapshot> = {}) =>
    piece("en_consulta", { arrivedAt: BEFORE, ...overrides });
  /** Llevada a revisar al taller w1 y aún sin volver. */
  const enRevision = (
    status: PieceStatus = "en_consulta",
    overrides: Partial<PieceSnapshot> = {},
  ) =>
    piece(status, {
      arrivedAt: BEFORE,
      workshopId: "w1",
      reviewSentAt: SENT,
      ...overrides,
    });

  it("la revisión está abierta hasta que vuelve (una vuelta anterior no cuenta)", () => {
    expect(isInReview({})).toBe(false);
    expect(isInReview({ reviewSentAt: SENT })).toBe(true);
    expect(isInReview({ reviewSentAt: SENT, reviewReturnedAt: NOW })).toBe(
      false,
    );
    expect(isInReview({ reviewSentAt: SENT, reviewReturnedAt: SENT })).toBe(
      false,
    );
    expect(isInReview({ reviewSentAt: NOW, reviewReturnedAt: SENT })).toBe(
      true,
    );
  });

  it("admin y logística llevan a revisar una pieza en Consulta o Espera que ya llegó", () => {
    for (const status of ["en_consulta", "en_espera"] as const) {
      const p = piece(status, { arrivedAt: BEFORE });
      expect(canSendForReview(p, "admin")).toBe(true);
      expect(canSendForReview(p, "logistica")).toBe(true);
      expect(canSendForReview(p, "ventas")).toBe(false);
    }
    expect(canSendForReview(piece("en_consulta"), "admin")).toBe(false);
    expect(canSendForReview(enTienda("aprobada"), "admin")).toBe(false);
    expect(canSendForReview(enTienda("registrada"), "admin")).toBe(false);
    expect(canSendForReview(enRevision(), "admin")).toBe(false);
    expect(
      canSendForReview(
        enConsulta({ reviewSentAt: SENT, reviewReturnedAt: NOW }),
        "admin",
      ),
    ).toBe(true);
  });

  it("llevar a revisar guarda el taller y la fecha; el estado no cambia", () => {
    expect(sendForReview(enConsulta(), "logistica", "w1", NOW)).toEqual({
      ok: true,
      changes: { status: "en_consulta", workshopId: "w1", reviewSentAt: NOW },
      steps: [
        { from: "en_consulta", to: "en_consulta", event: "envio_revision" },
      ],
      note: null,
    });
    expect(sendForReview(enConsulta(), "logistica", null, NOW)).toEqual({
      ok: false,
      error: "taller_requerido",
    });
    expect(sendForReview(enConsulta(), "ventas", "w1", NOW)).toEqual({
      ok: false,
      error: "rol_no_permitido",
    });
    expect(sendForReview(enRevision(), "admin", "w1", NOW)).toEqual({
      ok: false,
      error: "transicion_invalida",
    });
  });

  it("«Volvió de revisión»: admin y logística, solo con la revisión abierta", () => {
    expect(canReceiveFromReview(enRevision(), "admin")).toBe(true);
    expect(canReceiveFromReview(enRevision(), "logistica")).toBe(true);
    expect(canReceiveFromReview(enRevision(), "ventas")).toBe(false);
    expect(canReceiveFromReview(enConsulta(), "admin")).toBe(false);
    expect(
      receiveFromReview(enRevision("en_espera"), "logistica", NOW),
    ).toEqual({
      ok: true,
      changes: { status: "en_espera", reviewReturnedAt: NOW },
      steps: [{ from: "en_espera", to: "en_espera", event: "vuelta_revision" }],
      note: null,
    });
    expect(receiveFromReview(enConsulta(), "admin", NOW)).toEqual({
      ok: false,
      error: "transicion_invalida",
    });
  });

  it("en revisión no se cierra la pieza hasta marcar que volvió", () => {
    expect(
      applyTransition(enRevision(), {
        to: "sin_arreglo",
        role: "admin",
        note: "x",
        now: NOW,
      }),
    ).toEqual({ ok: false, error: "en_revision" });
    expect(
      applyTransition(enRevision("en_espera"), {
        to: "rechazada",
        role: "ventas",
        note: "x",
        now: NOW,
      }),
    ).toEqual({ ok: false, error: "en_revision" });
    expect(
      availableTransitions(enRevision("en_espera"), "admin").map((t) => t.to),
    ).toEqual(["aprobada"]);
    expect(TRANSITION_ERROR_MESSAGES.en_revision).toMatch(
      /marca primero que volvió/,
    );
    // De vuelta, sí.
    expect(
      applyTransition(enRevision("en_consulta", { reviewReturnedAt: NOW }), {
        to: "sin_arreglo",
        role: "admin",
        note: "x",
        now: NOW,
      }).ok,
    ).toBe(true);
  });

  it("aprobada en revisión pasa a En restauración en el mismo taller y cierra la revisión", () => {
    expect(
      applyTransition(enRevision("aprobada"), {
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
        reviewReturnedAt: NOW,
      },
      steps: [{ from: "aprobada", to: "enviada_taller", event: "estado" }],
      note: null,
    });
    expect(
      applyTransition(enRevision("aprobada"), {
        to: "enviada_taller",
        role: "logistica",
        workshopId: "w2",
        now: NOW,
      }),
    ).toEqual({ ok: false, error: "revision_otro_taller" });
  });
});

describe("canUndoStatus (retroceder estado)", () => {
  const piece = (status: PieceStatus, returnedAt: Date | null = null) => ({
    status,
    returnedAt,
  });

  it("no hay a dónde volver sin estado anterior", () => {
    expect(canUndoStatus(piece("registrada"), null, "admin")).toBe(false);
  });

  it("lo deshace quien podía hacer el avance", () => {
    // registrada → aprobada: admin y ventas; logística no.
    expect(canUndoStatus(piece("aprobada"), "registrada", "ventas")).toBe(true);
    expect(canUndoStatus(piece("aprobada"), "registrada", "admin")).toBe(true);
    expect(canUndoStatus(piece("aprobada"), "registrada", "logistica")).toBe(
      false,
    );
    // aprobada → enviada_taller: admin y logística; ventas no.
    expect(
      canUndoStatus(piece("enviada_taller"), "aprobada", "logistica"),
    ).toBe(true);
    expect(canUndoStatus(piece("enviada_taller"), "aprobada", "ventas")).toBe(
      false,
    );
  });

  it("anular una pieza que estaba en el taller solo lo deshace el admin (P41 d)", () => {
    expect(canUndoStatus(piece("anulada"), "enviada_taller", "admin")).toBe(
      true,
    );
    expect(canUndoStatus(piece("anulada"), "enviada_taller", "ventas")).toBe(
      false,
    );
  });

  it("sin esa transición en la tabla, solo el admin", () => {
    expect(canUndoStatus(piece("entregada"), "registrada", "admin")).toBe(true);
    expect(canUndoStatus(piece("entregada"), "registrada", "ventas")).toBe(
      false,
    );
  });

  it("una pieza cerrada y devuelta al cliente no se reactiva", () => {
    const returned = new Date("2026-10-06T10:00:00Z");
    expect(
      canUndoStatus(piece("rechazada", returned), "en_espera", "admin"),
    ).toBe(false);
    expect(canUndoStatus(piece("rechazada"), "en_espera", "ventas")).toBe(true);
  });
});

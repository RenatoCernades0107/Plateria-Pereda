import { describe, expect, it } from "vitest";

import { PIECE_TRANSITIONS } from "@/domain/piece-state-machine";
import {
  advanceRestorationStatus,
  deriveRestorationStatus,
  isReadyForShopifyOrder,
  RESTORATION_STATUSES,
} from "@/domain/restoration-status";
import { deriveWhatsappQuoteStatus } from "@/domain/whatsapp-quotes";
import { createAdminClient } from "@/lib/supabase/admin";
import fixture from "../../../tests/fixtures/restorations/derivations.json";

/**
 * La máquina de estados y los derivados existen en TypeScript (interfaz) y en la BD
 * (lo que se guarda): deben dar siempre lo mismo.
 */
describe("consistencia entre TypeScript y la BD", () => {
  it("piece_status_transitions es idéntica a PIECE_TRANSITIONS", async () => {
    const { data, error } = await createAdminClient()
      .from("piece_status_transitions")
      .select("*");
    expect(error).toBeNull();
    const key = (t: { from: string; to: string }) => `${t.from}→${t.to}`;
    const db = data!
      .map((t) => ({
        from: t.from_status,
        to: t.to_status,
        roles: [...t.roles].sort(),
        requiresNote: t.requires_note,
        requiresWorkshop: t.requires_workshop,
      }))
      .sort((a, b) => key(a).localeCompare(key(b)));
    const ts = PIECE_TRANSITIONS.map((t) => ({
      from: t.from,
      to: t.to,
      roles: [...t.roles].sort(),
      requiresNote: t.requiresNote,
      requiresWorkshop: t.requiresWorkshop,
    })).sort((a, b) => key(a).localeCompare(key(b)));
    expect(db).toEqual(ts);
  });

  it.each(fixture.restorationStatus)(
    "estado general: $name",
    async ({ pieces, expected, readyForOrder }) => {
      const admin = createAdminClient();
      const [status, ready] = await Promise.all([
        admin.rpc("derive_restoration_status", { p_pieces: pieces }),
        admin.rpc("is_ready_for_shopify_order", { p_pieces: pieces }),
      ]);
      const parsed = pieces.map((p) => ({
        status: p.status as never,
        approvedAt: p.approvedAt ? new Date(p.approvedAt) : null,
        firstSentAt: p.firstSentAt ? new Date(p.firstSentAt) : null,
        readyForDelivery: p.readyForDelivery,
      }));
      expect(status.data).toBe(expected);
      expect(deriveRestorationStatus(parsed)).toBe(expected);
      expect(ready.data).toBe(readyForOrder);
      expect(isReadyForShopifyOrder(parsed)).toBe(readyForOrder);
    },
  );

  it.each(fixture.location)(
    "ubicación: $status con llegada $arrivedAt, vuelta $lastReturnedAt y devolución $returnedAt",
    async ({
      status,
      arrivedAt,
      lastSentAt,
      lastReturnedAt,
      returnedAt,
      expected,
    }) => {
      const { data } = await createAdminClient().rpc("derive_piece_location", {
        p_status: status as never,
        p_arrived_at: arrivedAt as string,
        p_last_sent_at: lastSentAt as string,
        p_last_returned_at: lastReturnedAt as string,
        p_returned_at: returnedAt as string,
      });
      expect(data).toBe(expected);
    },
  );

  it.each(fixture.daysInWorkshop)(
    "días en taller: $name",
    async ({ history, now, expected }) => {
      const { data } = await createAdminClient()
        .rpc("workshop_days", { p_history: history, p_now: now })
        .single();
      expect(data).toEqual(expected);
    },
  );

  it.each(fixture.fulfillmentDays)(
    "días de cumplimiento: $name",
    async ({ piece, now, expected }) => {
      const { data } = await createAdminClient()
        .rpc("fulfillment_days", {
          p_status: piece.status as never,
          p_registered_at: piece.registeredAt,
          p_delivered_at: piece.deliveredAt as string,
          p_now: now,
        })
        .maybeSingle();
      expect(data).toEqual(expected);
    },
  );

  it("el estado de la cotización de WhatsApp es igual en TypeScript y en la BD (P46)", async () => {
    const admin = createAdminClient();
    for (const items of [1, 2, 3]) {
      for (let ordered = 0; ordered <= items; ordered++) {
        const { data } = await admin.rpc("derive_whatsapp_quote_status", {
          p_items: items,
          p_ordered: ordered,
        });
        expect([items, ordered, data]).toEqual([
          items,
          ordered,
          deriveWhatsappQuoteStatus(items, ordered),
        ]);
      }
    }
  });

  it("el estado general solo avanza igual en TypeScript y en la BD (P19)", async () => {
    const admin = createAdminClient();
    for (const current of RESTORATION_STATUSES) {
      for (const derived of RESTORATION_STATUSES) {
        const { data } = await admin.rpc("advance_restoration_status", {
          p_current: current,
          p_derived: derived,
        });
        expect([current, derived, data]).toEqual([
          current,
          derived,
          advanceRestorationStatus(current, derived),
        ]);
      }
    }
  });
});

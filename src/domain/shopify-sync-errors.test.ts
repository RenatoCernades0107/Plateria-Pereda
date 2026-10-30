import { describe, expect, it } from "vitest";

import {
  openSyncErrors,
  syncErrorLink,
  type SyncJobRow,
} from "./shopify-sync-errors";

const job = (over: Partial<SyncJobRow>): SyncJobRow => ({
  id: 1,
  kind: "order.edit",
  entityTable: "restorations",
  entityId: "r1",
  status: "error",
  createdAt: "2026-10-29T10:00:00Z",
  ...over,
});

describe("openSyncErrors", () => {
  it("deja los errores sin un job completado después", () => {
    const jobs = [
      job({ id: 1 }),
      job({ id: 2, entityId: "r2" }),
      job({
        id: 3,
        entityId: "r2",
        status: "ok",
        createdAt: "2026-10-29T11:00:00Z",
      }),
    ];
    expect(openSyncErrors(jobs).map((j) => j.id)).toEqual([1]);
  });

  it("un ok anterior, de otro tipo o de otro registro no lo resuelve", () => {
    const jobs = [
      job({ id: 1 }),
      job({ id: 2, status: "ok", createdAt: "2026-10-29T09:00:00Z" }),
      job({
        id: 3,
        status: "ok",
        kind: "order.fulfill",
        createdAt: "2026-10-29T12:00:00Z",
      }),
      job({
        id: 4,
        status: "ok",
        entityId: "r9",
        createdAt: "2026-10-29T12:00:00Z",
      }),
    ];
    expect(openSyncErrors(jobs).map((j) => j.id)).toEqual([1]);
  });

  it("ignora los pendientes", () => {
    expect(openSyncErrors([job({ status: "pending" })])).toEqual([]);
  });
});

describe("syncErrorLink", () => {
  const names = new Map([
    ["r1", "RES-00001"],
    ["c1", "Ana Díaz"],
  ]);
  const clientOf = new Map([["k1", "c1"]]);

  it("enlaza a la restauración, al cliente o al cliente del contacto", () => {
    expect(syncErrorLink(job({}), names, clientOf)).toEqual({
      jobId: 1,
      label: "Editar orden: RES-00001",
      href: "/restauraciones/r1",
    });
    expect(
      syncErrorLink(
        job({
          kind: "customer.create",
          entityTable: "clients",
          entityId: "c1",
        }),
        names,
        clientOf,
      ),
    ).toMatchObject({ label: "Crear cliente: Ana Díaz", href: "/clientes/c1" });
    expect(
      syncErrorLink(
        job({
          kind: "contact.create",
          entityTable: "contacts",
          entityId: "k1",
        }),
        names,
        clientOf,
      ),
    ).toMatchObject({ label: "Crear contacto", href: "/clientes/c1" });
  });

  it("sin registro conocido no hay enlace", () => {
    expect(
      syncErrorLink(job({ kind: "x.y", entityTable: "otra" }), names, clientOf),
    ).toEqual({ jobId: 1, label: "x.y: RES-00001", href: null });
  });

  it("explica en español por qué falló", () => {
    const link = syncErrorLink(
      job({
        kind: "customer.update",
        entityTable: "clients",
        entityId: "c1",
        lastError: "Phone has already been taken",
      }),
      names,
      clientOf,
    );
    expect(link.problem).toMatch(/teléfono ya lo tiene otro cliente/);
  });
});

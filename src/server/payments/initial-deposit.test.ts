import { describe, expect, it, vi } from "vitest";

import { recordInitialDeposit } from "./initial-deposit";

/** Cliente falso: lee `expected_deposit` y guarda lo que se inserta en `payments`. */
function fakeSupabase({
  expectedDeposit = 100 as number | null,
  readError = null as unknown,
  insertError = null as unknown,
} = {}) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const eq = vi.fn(() => ({
    maybeSingle: async () => ({
      data: readError ? null : { expected_deposit: expectedDeposit },
      error: readError,
    }),
  }));
  const client = {
    from: vi.fn((table: string) =>
      table === "payments" ? { insert } : { select: () => ({ eq }) },
    ),
  };
  return { client: client as never, insert, eq };
}

describe("recordInitialDeposit", () => {
  it("registra el adelanto esperado como pago con el método y la sucursal elegidos", async () => {
    const { client, insert, eq } = fakeSupabase({ expectedDeposit: 100 });
    expect(await recordInitialDeposit(client, "r1", "m1", "b1")).toBe(true);
    expect(eq).toHaveBeenCalledWith("id", "r1");
    expect(insert).toHaveBeenCalledWith({
      restoration_id: "r1",
      amount: 100,
      payment_method_id: "m1",
      method_name: "-",
      branch_id: "b1",
    });
  });

  it("sin monto (total 0) no registra nada", async () => {
    const { client, insert } = fakeSupabase({ expectedDeposit: 0 });
    expect(await recordInitialDeposit(client, "r1", "m1", "b1")).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });

  it("avisa si no pudo leer la restauración o registrar el pago", async () => {
    expect(
      await recordInitialDeposit(
        fakeSupabase({ readError: { code: "x" } }).client,
        "r1",
        "m1",
        "b1",
      ),
    ).toBe(false);
    expect(
      await recordInitialDeposit(
        fakeSupabase({ insertError: { code: "23514" } }).client,
        "r1",
        "m1",
        "b1",
      ),
    ).toBe(false);
  });
});

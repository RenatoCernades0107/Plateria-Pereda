import { describe, expect, it } from "vitest";

import { explainSyncError } from "./shopify-sync-messages";

describe("explainSyncError", () => {
  it("explica en español el teléfono repetido en Shopify", () => {
    const e = explainSyncError("Phone has already been taken");
    expect(e.problem).toMatch(/teléfono ya lo tiene otro cliente en Shopify/);
    expect(e.fix).toMatch(/fusiona/);
    expect(e.original).toBe("Phone has already been taken");
  });

  it("explica el cliente duplicado que ya está vinculado en Shopify", () => {
    for (const message of [
      "Ya está registrado en el sistema como «ANA PÉREZ» (mismo teléfono en Shopify)",
      'Error de la base de datos (23505): duplicate key value violates unique constraint "clients_shopify_customer_id_key"',
    ]) {
      const e = explainSyncError(message);
      expect(e.problem).toMatch(/ya está en el sistema con otra ficha/);
      expect(e.fix).toMatch(/Fusionar duplicado/);
    }
  });

  it("explica el reembolso bloqueado por la clave de idempotencia", () => {
    const e = explainSyncError(
      "The previous refund attempt with this idempotency key failed. Retrying with the same key won't process the refund.",
    );
    expect(e.problem).toMatch(/reembolso/);
    expect(e.fix).toMatch(/a mano en Shopify/);
  });

  it("une varios errores sin repetir la misma explicación", () => {
    const e = explainSyncError(
      "Email is invalid; Phone is invalid; Email contains an invalid domain name",
    );
    expect(e.problem).toBe(
      "Shopify dice que el email no es válido. Shopify dice que el teléfono no es válido.",
    );
  });

  it("distingue la pieza ya entregada de la pieza que no está", () => {
    expect(
      explainSyncError("Line item gid://1 not found or already fulfilled")
        .problem,
    ).toMatch(/entregada/);
    expect(explainSyncError("Line item gid://1 not found").problem).toMatch(
      /ya no está en la orden/,
    );
  });

  it("los cortes de conexión son pasajeros", () => {
    for (const message of [
      "Shopify no responde",
      "Error de red con Shopify: fetch failed",
      "Shopify respondió 503",
      "Shopify limitó las peticiones (THROTTLED)",
    ]) {
      expect(explainSyncError(message).fix).toMatch(/Reintentar/);
    }
  });

  it("distingue la base de datos ocupada de Shopify caído", () => {
    const e = explainSyncError(
      "Error de la base de datos (57014): canceling statement due to statement timeout",
    );
    expect(e.problem).toMatch(/base de datos del sistema tardó/);
    expect(e.fix).toMatch(/Reintentar/);
    expect(
      explainSyncError("Error de la base de datos (42P01): relation x").problem,
    ).toMatch(/consulta a la base de datos/);
  });

  it("explica los errores viejos guardados como [object Object]", () => {
    expect(explainSyncError("[object Object]").problem).not.toMatch(/object/);
  });

  it("un mensaje desconocido se muestra tal cual con una indicación general", () => {
    const e = explainSyncError("Something odd");
    expect(e.problem).toBe(
      "Shopify rechazó el cambio con este mensaje: «Something odd».",
    );
    expect(e.fix).toMatch(/soporte/);
  });

  it("sin mensaje", () => {
    expect(explainSyncError(null)).toMatchObject({ original: null });
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseRestorationFilters } from "@/domain/restoration-filters";
import type { RestorationListItem } from "@/server/restorations/queries";

import { RestorationsList } from "./restorations-list";

const item: RestorationListItem = {
  id: "r1",
  code: "RES-00001",
  clientId: "c1",
  clientName: "Ana Pérez",
  documentNumber: null,
  contactName: null,
  status: "en_proceso",
  paymentStatus: "parcial",
  paymentType: "a_cuenta",
  piecesCount: 2,
  totalCents: 123450,
  paidCents: 61725,
  balanceCents: 61725,
  createdAt: "2026-10-01T15:00:00Z",
};

describe("RestorationsList", () => {
  it("muestra columnas con montos, enlaces y orden para admin y ventas", () => {
    render(
      <RestorationsList
        items={[item]}
        filters={parseRestorationFilters({ q: "Ana" })}
        showMoney
        emptyMessage="Vacío"
      />,
    );
    const row = screen.getByTestId("restauracion-RES-00001");
    expect(
      within(row).getByRole("link", { name: "RES-00001" }),
    ).toHaveAttribute("href", "/restauraciones/r1");
    expect(row).toHaveTextContent("En proceso");
    expect(row).toHaveTextContent("Pago parcial");
    expect(row).toHaveTextContent("S/ 1,234.50");
    expect(
      screen.getByRole("link", { name: "Ordenar por código" }),
    ).toHaveAttribute("href", "/restauraciones?q=Ana&orden=code&dir=asc");
    // Tarjeta para el celular con los mismos datos.
    expect(
      screen.getByTestId("restauracion-movil-RES-00001"),
    ).toHaveTextContent("2 piezas");
  });

  it("para logística no muestra montos ni estado de pago", () => {
    render(
      <RestorationsList
        items={[
          {
            ...item,
            paymentStatus: null,
            totalCents: null,
            paidCents: null,
            balanceCents: null,
          },
        ]}
        filters={parseRestorationFilters({})}
        showMoney={false}
        emptyMessage="Vacío"
      />,
    );
    expect(screen.queryByRole("columnheader", { name: /Total/ })).toBeNull();
    expect(screen.getByTestId("restauracion-RES-00001")).not.toHaveTextContent(
      "S/",
    );
  });

  it("sin resultados muestra el mensaje", () => {
    render(
      <RestorationsList
        items={[]}
        filters={parseRestorationFilters({})}
        showMoney
        emptyMessage="No hay restauraciones con esos filtros."
      />,
    );
    expect(
      screen.getByText("No hay restauraciones con esos filtros."),
    ).toBeInTheDocument();
  });
});

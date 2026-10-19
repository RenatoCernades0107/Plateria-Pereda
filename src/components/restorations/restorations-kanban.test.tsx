import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RestorationListItem } from "@/server/restorations/queries";

import { RestorationsKanban } from "./restorations-kanban";

const item: RestorationListItem = {
  id: "r1",
  code: "RES-00001",
  clientId: "c1",
  clientName: "Ana Pérez",
  documentNumber: null,
  contactName: null,
  status: "registrada",
  paymentStatus: null,
  paymentType: "contado",
  piecesCount: 3,
  observed: null,
  waitingCount: 0,
  totalCents: null,
  paidCents: null,
  balanceCents: null,
  createdAt: "2026-10-01T15:00:00Z",
  origin: "oficina",
};

describe("RestorationsKanban", () => {
  it("cada tarjeta muestra cuántas piezas esperan la respuesta del cliente, solo si hay", () => {
    render(
      <RestorationsKanban
        items={[
          { ...item, waitingCount: 2 },
          { ...item, id: "r2", code: "RES-00002" },
        ]}
        showMoney={false}
        showClient={false}
      />,
    );
    const badge = screen.getByTestId("en-espera-RES-00001");
    expect(badge).toHaveTextContent("2 en espera");
    // Color e icono de la pieza en Espera respuesta cliente.
    expect(badge).toHaveClass("bg-violet-50", "text-violet-900");
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(screen.queryByTestId("en-espera-RES-00002")).toBeNull();
    expect(
      within(screen.getByTestId("tarjeta-RES-00002")).queryByText(/en espera/),
    ).toBeNull();
  });
});

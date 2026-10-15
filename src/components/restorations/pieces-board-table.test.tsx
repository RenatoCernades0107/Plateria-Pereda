import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { BoardPiece } from "@/server/restorations/queries";

import { PiecesBoardTable } from "./pieces-board-table";

vi.mock("@/server/restorations/status-actions", () => ({
  changePieceStatus: vi.fn(),
  markPiecesArrived: vi.fn(),
  receiveFromWorkshop: vi.fn(),
  returnPiecesToClient: vi.fn(),
  assignWorkshop: vi.fn(),
}));
vi.mock("@/server/service-cost-actions", () => ({
  setPieceServiceCost: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/server/sale-price-actions", () => ({
  setPieceSalePrice: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/server/payments/actions", () => ({
  approveWithPayment: vi.fn(),
  deliverWithBalance: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const base: BoardPiece = {
  id: "p1",
  code: "RES-00001-1",
  restorationId: "r1",
  restorationCode: "RES-00001",
  clientName: "Ana Pérez",
  description: "Fuente",
  status: "aprobada",
  location: "en_tienda",
  urgent: false,
  readyForDelivery: false,
  returnedAt: null,
  workshopId: null,
  workshopName: null,
  arrivedAt: "2026-10-01T15:00:00Z",
  workshopDays: 0,
  workshopOngoing: false,
  lastObservation: null,
  serviceName: "Limpieza",
  materialName: "Plata",
  measure: "30 cm",
  weightGrams: 120,
  serviceCostCents: 4000,
  priceCents: null,
  hasOrder: false,
  photoUrl: "https://example.test/antes.jpg",
  statusDays: 2,
};

describe("PiecesBoardTable", () => {
  it("resalta las piezas con muchos días en el taller y muestra la última observación", () => {
    render(
      <PiecesBoardTable
        role="logistica"
        workshops={[]}
        pieces={[
          base,
          {
            ...base,
            id: "p2",
            code: "RES-00001-2",
            status: "enviada_taller",
            location: "en_taller",
            workshopName: "Taller Central",
            workshopDays: 9,
            workshopOngoing: true,
            urgent: true,
            lastObservation: "Falta pulir",
          },
        ]}
      />,
    );
    const slow = screen.getByTestId("pieza-RES-00001-2");
    expect(
      within(slow).getByLabelText("Muchos días en el taller"),
    ).toBeInTheDocument();
    expect(slow).toHaveTextContent("9 días (en curso)");
    expect(slow).toHaveTextContent("Última observación: Falta pulir");
    expect(slow).toHaveTextContent("Urgente");
    expect(
      within(screen.getByTestId("pieza-RES-00001-1")).queryByLabelText(
        "Muchos días en el taller",
      ),
    ).toBeNull();
    // La pieza lleva a su detalle y la guía a la restauración (P55).
    expect(screen.getByRole("link", { name: "RES-00001-1" })).toHaveAttribute(
      "href",
      "/piezas/p1",
    );
    expect(
      screen.getAllByRole("link", { name: "Ver guía RES-00001" })[0],
    ).toHaveAttribute("href", "/restauraciones/r1");
  });

  it("muestra primero la foto de antes y los datos de la pieza", () => {
    render(
      <PiecesBoardTable
        role="ventas"
        workshops={[]}
        pieces={[
          base,
          { ...base, id: "p2", code: "RES-00001-2", photoUrl: null },
        ]}
      />,
    );
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers.slice(1, 4)).toEqual([
      "Foto",
      "Pieza · guía · cliente",
      "Descripción",
    ]);
    expect(
      screen.getByRole("img", { name: "Foto de antes de RES-00001-1" }),
    ).toHaveAttribute("src", "https://example.test/antes.jpg");
    const row = screen.getByTestId("pieza-RES-00001-1");
    expect(row).toHaveTextContent("Limpieza");
    expect(row).toHaveTextContent("Plata · 30 cm · 120 g");
    expect(screen.getByTestId("pieza-RES-00001-2")).toHaveTextContent(
      "Sin foto de antes",
    );
  });

  it("logística ingresa con el lápiz el costo por definir y no ve el precio de venta", async () => {
    const { setPieceServiceCost } =
      await import("@/server/service-cost-actions");
    vi.mocked(setPieceServiceCost).mockClear();
    const user = userEvent.setup();
    render(
      <PiecesBoardTable
        role="logistica"
        workshops={[]}
        pieces={[
          base,
          {
            ...base,
            id: "p2",
            code: "RES-00001-2",
            serviceCostCents: null,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: "Costo servicio" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Precio venta" }),
    ).toBeNull();
    // Con costo: solo el monto como texto, sin lápiz (se cambia en el detalle).
    const row = screen.getByTestId("pieza-RES-00001-1");
    expect(row).toHaveTextContent("S/ 40.00");
    expect(within(row).queryByRole("textbox")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Editar costo de servicio de RES-00001-1",
      }),
    ).toBeNull();
    expect(screen.getByTestId("pieza-RES-00001-2")).toHaveTextContent(
      "Por definir",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Editar costo de servicio de RES-00001-2",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Costo de servicio de RES-00001-2",
    });
    const input = within(dialog).getByLabelText("Costo de servicio (S/)");
    expect(input).toHaveValue("");
    await user.type(input, "45");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar costo" }),
    );
    expect(setPieceServiceCost).toHaveBeenCalledWith("p2", "45");
  });

  it("no guarda un costo de servicio inválido", async () => {
    const { setPieceServiceCost } =
      await import("@/server/service-cost-actions");
    vi.mocked(setPieceServiceCost).mockClear();
    const user = userEvent.setup();
    render(
      <PiecesBoardTable
        role="admin"
        workshops={[]}
        pieces={[{ ...base, serviceCostCents: null }]}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Editar costo de servicio de RES-00001-1",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Costo de servicio (S/)");
    await user.type(input, "abc");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar costo" }),
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Ingresa un monto válido",
    );
    expect(setPieceServiceCost).not.toHaveBeenCalled();
  });

  it("el admin ingresa con el lápiz el precio de venta por definir", async () => {
    const { setPieceSalePrice } = await import("@/server/sale-price-actions");
    const user = userEvent.setup();
    render(<PiecesBoardTable role="admin" workshops={[]} pieces={[base]} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Editar precio de venta de RES-00001-1",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Precio de venta de RES-00001-1",
    });
    const price = within(dialog).getByLabelText("Precio de venta (S/)");
    expect(price).toHaveAttribute("placeholder", "Por definir");
    await user.type(price, "150");
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar precio" }),
    );
    expect(setPieceSalePrice).toHaveBeenCalledWith("p1", "150");
  });

  it("con precio asignado el admin solo ve el monto (se cambia en el detalle)", () => {
    render(
      <PiecesBoardTable
        role="admin"
        workshops={[]}
        pieces={[{ ...base, hasOrder: true, priceCents: 15000 }]}
      />,
    );
    const row = screen.getByTestId("pieza-RES-00001-1");
    expect(row).toHaveTextContent("S/ 150.00");
    expect(
      within(row).queryByRole("button", {
        name: "Editar precio de venta de RES-00001-1",
      }),
    ).toBeNull();
    expect(
      within(row).queryByRole("button", { name: "Cambiar precio" }),
    ).toBeNull();
  });

  it("logística asigna con el lápiz el taller solo a las piezas sin taller", async () => {
    const { assignWorkshop } =
      await import("@/server/restorations/status-actions");
    vi.mocked(assignWorkshop).mockClear();
    vi.mocked(assignWorkshop).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <PiecesBoardTable
        role="logistica"
        workshops={[{ id: "w1", name: "Taller Central" }]}
        pieces={[
          base,
          {
            ...base,
            id: "p2",
            code: "RES-00001-2",
            workshopId: "w1",
            workshopName: "Taller Central",
          },
          {
            ...base,
            id: "p3",
            code: "RES-00001-3",
            status: "enviada_taller",
          },
        ]}
      />,
    );
    // El taller es texto; no hay selectores a la vista.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("pieza-RES-00001-1")).toHaveTextContent(
      "Sin taller",
    );
    // Con taller ya asignado no hay lápiz: se cambia en el detalle de la pieza.
    expect(screen.getByTestId("pieza-RES-00001-2")).toHaveTextContent(
      "Taller Central",
    );
    expect(
      screen.queryByRole("button", { name: /taller de RES-00001-2/ }),
    ).toBeNull();
    // En el taller no se cambia.
    expect(
      screen.queryByRole("button", { name: /taller de RES-00001-3/ }),
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Asignar taller de RES-00001-1" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Taller de RES-00001-1",
    });
    const save = within(dialog).getByRole("button", { name: "Guardar taller" });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole("combobox", { name: "Taller" }));
    await user.click(
      await screen.findByRole("option", { name: "Taller Central" }),
    );
    await user.click(save);
    expect(assignWorkshop).toHaveBeenCalledWith(null, ["p1"], "w1");
  });

  it("muestra estado, ubicación, días en el estado, taller y días en taller en columnas separadas", () => {
    render(
      <PiecesBoardTable
        role="ventas"
        workshops={[]}
        pieces={[
          base,
          {
            ...base,
            id: "p2",
            code: "RES-00001-2",
            status: "enviada_taller",
            location: "en_taller",
            workshopName: "Taller Central",
            workshopDays: 3,
            workshopOngoing: true,
            statusDays: 0,
          },
        ]}
      />,
    );
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    // Estado y taller van antes que los montos, para verlos sin desplazarse.
    expect(headers.slice(4, 9)).toEqual([
      "Estado",
      "Ubicación",
      "En el estado",
      "Taller",
      "Días en taller",
    ]);
    const cells = within(screen.getByTestId("pieza-RES-00001-2"))
      .getAllByRole("cell")
      .slice(4, 9)
      .map((c) => c.textContent);
    expect(cells).toEqual([
      "En restauración",
      "En taller",
      "Hoy",
      "Taller Central",
      "3 días (en curso)",
    ]);
    // Sin pasar por el taller no se muestran "0 días".
    expect(
      within(screen.getByTestId("pieza-RES-00001-1")).getByTestId(
        "dias-en-taller",
      ),
    ).toHaveTextContent("—");
  });

  it("no hay botones de edición en bloque en la barra de la tabla", () => {
    for (const role of ["admin", "logistica", "ventas"] as const) {
      const { unmount } = render(
        <PiecesBoardTable role={role} workshops={[]} pieces={[base]} />,
      );
      for (const name of [
        "Editar precio de venta",
        "Editar costo de servicio",
        "Cambiar taller",
      ]) {
        expect(screen.queryByRole("button", { name })).toBeNull();
      }
      unmount();
    }
  });

  it("ventas no asigna taller", () => {
    render(<PiecesBoardTable role="ventas" workshops={[]} pieces={[base]} />);
    expect(
      screen.queryByRole("button", { name: /taller de RES-00001-1/ }),
    ).toBeNull();
  });

  it("la barra de la selección no ofrece asignar taller", async () => {
    const user = userEvent.setup();
    render(
      <PiecesBoardTable
        role="admin"
        workshops={[{ id: "w1", name: "Taller Central" }]}
        pieces={[base, { ...base, id: "p2", code: "RES-00001-2" }]}
      />,
    );
    await user.click(screen.getByLabelText("Elegir todas las de esta página"));
    const bar = screen.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    expect(
      within(bar).queryByRole("button", { name: "Asignar taller" }),
    ).toBeNull();
  });

  it("ventas ve el precio sin editarlo y no ve el costo", () => {
    render(
      <PiecesBoardTable
        role="ventas"
        workshops={[]}
        pieces={[{ ...base, serviceCostCents: null, priceCents: 15000 }]}
      />,
    );
    expect(
      screen.queryByRole("columnheader", { name: "Costo servicio" }),
    ).toBeNull();
    expect(screen.getByTestId("pieza-RES-00001-1")).toHaveTextContent(
      "S/ 150.00",
    );
    expect(
      screen.queryByLabelText("Precio de venta de RES-00001-1"),
    ).toBeNull();
  });

  it("elige todas las piezas de la página y ofrece las acciones comunes", async () => {
    const user = userEvent.setup();
    render(
      <PiecesBoardTable
        role="logistica"
        workshops={[]}
        pieces={[base, { ...base, id: "p2", code: "RES-00001-2" }]}
      />,
    );
    await user.click(screen.getByLabelText("Elegir todas las de esta página"));
    const bar = screen.getByRole("region", {
      name: "Acciones para las piezas elegidas",
    });
    expect(bar).toHaveTextContent("2 piezas elegidas");
    expect(
      within(bar).getByRole("button", { name: "Enviar al taller" }),
    ).toBeInTheDocument();
  });

  it("sin piezas muestra un mensaje", () => {
    render(<PiecesBoardTable role="logistica" workshops={[]} pieces={[]} />);
    expect(
      screen.getByText("No hay piezas con esos filtros."),
    ).toBeInTheDocument();
  });

  describe("cambiar el estado desde la fila", () => {
    it("muestra solo los cambios permitidos y aplica los directos", async () => {
      const { changePieceStatus } =
        await import("@/server/restorations/status-actions");
      vi.mocked(changePieceStatus).mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(
        <PiecesBoardTable
          role="admin"
          workshops={[]}
          pieces={[{ ...base, status: "registrada" }]}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Cambiar estado de RES-00001-1" }),
      );
      const items = screen
        .getAllByRole("menuitem")
        .map((item) => item.textContent);
      expect(items).toEqual(["Poner en consulta", "Aprobar", "Anular"]);
      await user.click(screen.getByRole("menuitem", { name: "Aprobar" }));
      expect(changePieceStatus).toHaveBeenCalledWith(
        "r1",
        ["p1"],
        "aprobada",
        null,
        null,
      );
    });

    it("lo que pide datos abre su diálogo (taller para enviar)", async () => {
      const { changePieceStatus } =
        await import("@/server/restorations/status-actions");
      vi.mocked(changePieceStatus).mockClear();
      const user = userEvent.setup();
      render(
        <PiecesBoardTable
          role="logistica"
          workshops={[{ id: "w1", name: "Taller Central" }]}
          pieces={[base]}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Cambiar estado de RES-00001-1" }),
      );
      await user.click(
        screen.getByRole("menuitem", { name: "Enviar al taller" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Enviar al taller: RES-00001-1",
      });
      expect(within(dialog).getByLabelText("Taller")).toBeInTheDocument();
      expect(changePieceStatus).not.toHaveBeenCalled();
    });

    it("sin acciones para el rol no muestra el menú", () => {
      render(
        <PiecesBoardTable
          role="logistica"
          workshops={[]}
          pieces={[{ ...base, status: "registrada" }]}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Cambiar estado de RES-00001-1" }),
      ).toBeNull();
    });

    it("con saldo pendiente, entregar pide confirmarlo", async () => {
      const { changePieceStatus } =
        await import("@/server/restorations/status-actions");
      vi.mocked(changePieceStatus).mockClear();
      const user = userEvent.setup();
      render(
        <PiecesBoardTable
          role="ventas"
          workshops={[]}
          balanceDue={["r1"]}
          pieces={[
            {
              ...base,
              status: "enviada_taller",
              location: "en_tienda",
              readyForDelivery: true,
            },
          ]}
        />,
      );
      expect(screen.getByTestId("pieza-RES-00001-1")).toHaveTextContent(
        "Falta cobrar el saldo",
      );
      await user.click(
        screen.getByRole("button", { name: "Cambiar estado de RES-00001-1" }),
      );
      await user.click(screen.getByRole("menuitem", { name: "Entregar" }));
      expect(
        await screen.findByRole("dialog", { name: "Falta cobrar el saldo" }),
      ).toBeInTheDocument();
      expect(changePieceStatus).not.toHaveBeenCalled();
    });
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncErrorsBanner } from "./sync-errors-banner";

describe("SyncErrorsBanner", () => {
  it("no muestra nada sin errores", () => {
    const { container } = render(<SyncErrorsBanner total={0} links={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("cuenta los errores y enlaza a cada registro", () => {
    render(
      <SyncErrorsBanner
        total={7}
        links={[
          {
            jobId: 1,
            label: "Crear orden: RES-00001",
            href: "/restauraciones/r1",
          },
          { jobId: 2, label: "Crear contacto", href: null },
        ]}
      />,
    );
    expect(
      screen.getByRole("region", {
        name: "7 sincronizaciones con Shopify quedaron en error",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Crear orden: RES-00001" }),
    ).toHaveAttribute("href", "/restauraciones/r1");
    expect(screen.getByText("Crear contacto")).toBeInTheDocument();
    expect(screen.getByText("y 5 más")).toBeInTheDocument();
  });

  it("en singular con un solo error", () => {
    render(
      <SyncErrorsBanner
        total={1}
        links={[{ jobId: 1, label: "Registrar pago", href: null }]}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "1 sincronización con Shopify quedó en error",
      }),
    ).toBeInTheDocument();
  });
});

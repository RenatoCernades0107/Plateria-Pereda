import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SyncErrorsIndicator, syncErrorsLabel } from "./sync-errors-indicator";

describe("SyncErrorsIndicator", () => {
  it("no muestra nada sin errores", () => {
    const { container } = render(<SyncErrorsIndicator total={0} links={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("cuenta los errores y al abrirlo enlaza a cada registro", async () => {
    render(
      <SyncErrorsIndicator
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
    await userEvent.click(
      screen.getByRole("button", {
        name: "7 sincronizaciones con Shopify en error",
      }),
    );
    expect(
      screen.getByRole("link", { name: "Crear orden: RES-00001" }),
    ).toHaveAttribute("href", "/restauraciones/r1");
    expect(screen.getByText("Crear contacto")).toBeInTheDocument();
    expect(screen.getByText("y 5 más")).toBeInTheDocument();
  });

  it("en singular con un solo error", () => {
    expect(syncErrorsLabel(1)).toBe("1 sincronización con Shopify en error");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { UrlTabs } from "./url-tabs";

function renderTabs(defaultValue = "piezas") {
  render(
    <UrlTabs initial="piezas" defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="piezas">Piezas</TabsTrigger>
        <TabsTrigger value="pagos">Pagos</TabsTrigger>
      </TabsList>
      <TabsContent value="piezas">Lista de piezas</TabsContent>
      <TabsContent value="pagos">Lista de pagos</TabsContent>
    </UrlTabs>,
  );
}

describe("UrlTabs", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("abre la pestaña indicada", () => {
    renderTabs("pagos");
    expect(screen.getByText("Lista de pagos")).toBeVisible();
  });

  it("guarda la pestaña elegida en la URL y la quita al volver a la primera", async () => {
    window.history.replaceState(null, "", "/restauraciones/1?vista=kanban");
    renderTabs();
    await userEvent.click(screen.getByRole("tab", { name: "Pagos" }));
    expect(window.location.search).toBe("?vista=kanban&pestana=pagos");
    await userEvent.click(screen.getByRole("tab", { name: "Piezas" }));
    expect(window.location.search).toBe("?vista=kanban");
  });
});

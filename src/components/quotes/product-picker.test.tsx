import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogProduct, QuoteLineDraft } from "@/domain/quote-line";

import { ProductPicker } from "./product-picker";
import { QuoteLinesEditor } from "./quote-lines-editor";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  product: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/quotes/catalog-actions", () => ({
  searchCatalog: (...a: unknown[]) => mocks.search(...a),
  getCatalogProduct: (...a: unknown[]) => mocks.product(...a),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

const anillo: CatalogProduct = {
  id: "gid://shopify/Product/1004",
  title: "Anillo de plata personalizable",
  imageUrl: null,
  variants: [
    {
      id: "gid://shopify/ProductVariant/2005",
      title: "Talla 6",
      price: "150.00",
      sku: "ANI-950-06",
      imageUrl: null,
    },
    {
      id: "gid://shopify/ProductVariant/2006",
      title: "Talla 8",
      price: "165.50",
      sku: "ANI-950-08",
      imageUrl: null,
    },
  ],
};

const summary = {
  id: anillo.id,
  title: anillo.title,
  imageUrl: null,
  minPrice: "150.00",
  maxPrice: "165.50",
};

async function searchFor(text: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Agregar producto" }));
  await user.type(screen.getByPlaceholderText("Título o SKU"), text);
  return user;
}

describe("ProductPicker", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.search.mockResolvedValue({ ok: true, products: [summary] });
    mocks.product.mockResolvedValue({ ok: true, product: anillo });
  });

  it("busca con espera y muestra el rango de precios", async () => {
    render(<ProductPicker onSelect={vi.fn()} />);
    await searchFor("anillo");
    const option = await screen.findByRole("option", {
      name: /Anillo de plata personalizable/,
    });
    expect(option).toHaveTextContent("S/ 150.00 – S/ 165.50");
    // Una sola búsqueda para todo el texto escrito.
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.search).toHaveBeenCalledWith("anillo");
  });

  it("no busca con menos de 2 caracteres", async () => {
    render(<ProductPicker onSelect={vi.fn()} />);
    await searchFor("a");
    expect(
      screen.getByText("Escribe al menos 2 caracteres para buscar en Shopify."),
    ).toBeInTheDocument();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("al elegir el producto pide la variante y crea la línea con su precio", async () => {
    const onSelect = vi.fn();
    render(<ProductPicker onSelect={onSelect} />);
    const user = await searchFor("anillo");
    await user.click(
      await screen.findByRole("option", { name: /Anillo de plata/ }),
    );
    expect(mocks.product).toHaveBeenCalledWith(anillo.id);
    const talla8 = await screen.findByRole("option", { name: /Talla 8/ });
    expect(talla8).toHaveTextContent("SKU ANI-950-08");
    expect(talla8).toHaveTextContent("S/ 165.50");
    await user.click(talla8);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        shopifyVariantId: "gid://shopify/ProductVariant/2006",
        title: "Anillo de plata personalizable",
        variantTitle: "Talla 8",
        unitPrice: "165.50",
        catalogPrice: "165.50",
        quantity: "1",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("option")).not.toBeInTheDocument(),
    );
  });

  it("un producto con una sola variante se agrega directo", async () => {
    mocks.product.mockResolvedValue({
      ok: true,
      product: { ...anillo, variants: [anillo.variants[0]!] },
    });
    const onSelect = vi.fn();
    render(<ProductPicker onSelect={onSelect} />);
    const user = await searchFor("anillo");
    await user.click(
      await screen.findByRole("option", { name: /Anillo de plata/ }),
    );
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ unitPrice: "150.00" }),
      ),
    );
  });

  it("ofrece una línea libre sin producto del catálogo", async () => {
    const onSelect = vi.fn();
    render(<ProductPicker onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Agregar producto" }));
    await user.click(screen.getByRole("option", { name: /Línea libre/ }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ shopifyProductId: null, unitPrice: "" }),
    );
  });

  it("avisa si Shopify no responde", async () => {
    mocks.search.mockResolvedValue({ error: "Shopify no respondió." });
    render(<ProductPicker onSelect={vi.fn()} />);
    await searchFor("anillo");
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("Shopify no respondió."),
    );
  });
});

describe("QuoteLinesEditor", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.search.mockResolvedValue({ ok: true, products: [summary] });
    mocks.product.mockResolvedValue({ ok: true, product: anillo });
  });

  function Harness() {
    const [lines, setLines] = useState<QuoteLineDraft[]>([]);
    return <QuoteLinesEditor lines={lines} onChange={setLines} />;
  }

  it("la variante elegida queda como línea editable con el precio del catálogo", async () => {
    render(<Harness />);
    const user = await searchFor("anillo");
    await user.click(
      await screen.findByRole("option", { name: /Anillo de plata/ }),
    );
    await user.click(await screen.findByRole("option", { name: /Talla 6/ }));

    const line = await screen.findByRole("group", {
      name: "Línea 1: Anillo de plata personalizable — Talla 6",
    });
    expect(line).toHaveTextContent("Talla 6 · SKU ANI-950-06");
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue("150.00");
    expect(screen.getByTestId("total-linea-1")).toHaveTextContent("S/ 150.00");

    await user.clear(screen.getByLabelText("Cantidad"));
    await user.type(screen.getByLabelText("Cantidad"), "3");
    await user.type(screen.getByLabelText("Personalización"), "Grabado: A&R");
    expect(screen.getByTestId("total-linea-1")).toHaveTextContent("S/ 450.00");

    // Si cambia el precio, se recuerda el del catálogo.
    await user.clear(screen.getByLabelText("Precio unitario (S/)"));
    await user.type(screen.getByLabelText("Precio unitario (S/)"), "140");
    expect(line).toHaveTextContent("Catálogo: S/ 150.00");
    expect(screen.getByTestId("total-linea-1")).toHaveTextContent("S/ 420.00");

    await user.click(screen.getByRole("button", { name: "Duplicar línea 1" }));
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByTestId("total-linea-2")).toHaveTextContent("S/ 420.00");
    await user.click(screen.getByRole("button", { name: "Quitar línea 1" }));
    expect(screen.getAllByRole("group")).toHaveLength(1);
  });
});

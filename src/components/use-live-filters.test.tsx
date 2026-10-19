import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LIVE_SEARCH_DELAY_MS, useLiveFilters } from "./use-live-filters";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

type F = { q: string; kind: string | null };
const href = (f: F) => {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.kind) p.set("tipo", f.kind);
  const query = p.toString();
  return query ? `/x?${query}` : "/x";
};

function Form({ filters }: { filters: F }) {
  const { state, update, reset, submit } = useLiveFilters(filters, href);
  return (
    <form onSubmit={submit}>
      <input
        aria-label="Buscar"
        value={state.q}
        onChange={(e) => update({ q: e.target.value }, { debounce: true })}
      />
      <button type="button" onClick={() => update({ kind: "empresa" })}>
        Empresas
      </button>
      <button type="button" onClick={() => reset({ q: "", kind: null })}>
        Limpiar
      </button>
    </form>
  );
}

describe("useLiveFilters", () => {
  beforeEach(() => {
    replace.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("busca al dejar de escribir, una sola vez y sin espacios al final", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Form filters={{ q: "", kind: null }} />);
    await user.type(screen.getByLabelText("Buscar"), "fuente ");
    expect(replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(LIVE_SEARCH_DELAY_MS));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/x?q=fuente", { scroll: false });
  });

  it("lo elegido se aplica al instante, con el texto escrito", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Form filters={{ q: "", kind: null }} />);
    await user.type(screen.getByLabelText("Buscar"), "ana");
    await user.click(screen.getByRole("button", { name: "Empresas" }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/x?q=ana&tipo=empresa", {
      scroll: false,
    });
    act(() => vi.advanceTimersByTime(LIVE_SEARCH_DELAY_MS));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("conserva lo escrito cuando llega su propia URL y toma la de otro lado", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { rerender } = render(<Form filters={{ q: "", kind: null }} />);
    const input = screen.getByLabelText("Buscar");
    await user.type(input, "anillo ");
    act(() => vi.advanceTimersByTime(LIVE_SEARCH_DELAY_MS));
    // Llega la URL aplicada ("anillo", sin el espacio): no pisa lo escrito.
    rerender(<Form filters={{ q: "anillo", kind: null }} />);
    expect(input).toHaveValue("anillo ");
    // Un chip o "Atrás" cambia la URL: el formulario la toma.
    rerender(<Form filters={{ q: "", kind: "persona" }} />);
    expect(input).toHaveValue("");
  });

  it("Limpiar vuelve a los filtros vacíos", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Form filters={{ q: "plata", kind: "empresa" }} />);
    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(replace).toHaveBeenLastCalledWith("/x", { scroll: false });
    expect(screen.getByLabelText("Buscar")).toHaveValue("");
  });

  describe("al llegar los resultados de una búsqueda", () => {
    // La página está más abajo del formulario (que quedó arriba, fuera de vista).
    const scrolledPast = (top: number) => {
      const form = screen.getByLabelText("Buscar").closest("form")!;
      form.getBoundingClientRect = () => ({ top }) as DOMRect;
      const scroll = vi.fn();
      form.scrollIntoView = scroll;
      return scroll;
    };

    it("si la página estaba más abajo, vuelve para mostrar el primero", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { rerender } = render(<Form filters={{ q: "", kind: null }} />);
      const scroll = scrolledPast(-500);
      await user.type(screen.getByLabelText("Buscar"), "fuente");
      act(() => vi.advanceTimersByTime(LIVE_SEARCH_DELAY_MS));
      // Aún no llegan los resultados: no se mueve.
      expect(scroll).not.toHaveBeenCalled();
      rerender(<Form filters={{ q: "fuente", kind: null }} />);
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll).toHaveBeenCalledWith(
        expect.objectContaining({ block: "start" }),
      );
    });

    it("con Enter también", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { rerender } = render(<Form filters={{ q: "", kind: null }} />);
      const scroll = scrolledPast(-500);
      await user.type(screen.getByLabelText("Buscar"), "fuente{Enter}");
      rerender(<Form filters={{ q: "fuente", kind: null }} />);
      expect(scroll).toHaveBeenCalledTimes(1);
    });

    it("no se mueve si el formulario ya se ve", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { rerender } = render(<Form filters={{ q: "", kind: null }} />);
      const scroll = scrolledPast(120);
      await user.type(screen.getByLabelText("Buscar"), "fuente");
      act(() => vi.advanceTimersByTime(LIVE_SEARCH_DELAY_MS));
      rerender(<Form filters={{ q: "fuente", kind: null }} />);
      expect(scroll).not.toHaveBeenCalled();
    });

    it("los demás filtros no mueven la página", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { rerender } = render(<Form filters={{ q: "", kind: null }} />);
      const scroll = scrolledPast(-500);
      await user.click(screen.getByRole("button", { name: "Empresas" }));
      rerender(<Form filters={{ q: "", kind: "empresa" }} />);
      expect(scroll).not.toHaveBeenCalled();
    });
  });
});

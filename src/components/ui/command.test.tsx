import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

const NAMES = Array.from({ length: 30 }, (_, i) => `Opción ${i + 1}`);

function Picker({ shouldFilter = true }: { shouldFilter?: boolean }) {
  const [search, setSearch] = useState("");
  return (
    <Command shouldFilter={shouldFilter}>
      <CommandInput
        aria-label="Buscar"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList label="Opciones">
        <CommandGroup>
          {NAMES.map((name) => (
            <CommandItem key={name} value={name}>
              {name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

describe("CommandList", () => {
  it("vuelve arriba al escribir, para que se vea el primer resultado", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const list = screen.getByRole("listbox", { name: "Opciones" });
    list.scrollTop = 200;
    await user.type(screen.getByLabelText("Buscar"), "1");
    expect(list.scrollTop).toBe(0);
    expect(screen.getByRole("option", { name: "Opción 1" })).toBeVisible();
  });

  it("también con búsqueda en el servidor (sin filtrar en la lista)", async () => {
    const user = userEvent.setup();
    render(<Picker shouldFilter={false} />);
    const list = screen.getByRole("listbox", { name: "Opciones" });
    list.scrollTop = 200;
    await user.type(screen.getByLabelText("Buscar"), "a");
    expect(list.scrollTop).toBe(0);
  });

  it("moverse con las flechas no vuelve arriba", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const list = screen.getByRole("listbox", { name: "Opciones" });
    await user.click(screen.getByLabelText("Buscar"));
    list.scrollTop = 200;
    await user.keyboard("{ArrowDown}");
    expect(list.scrollTop).toBe(200);
  });
});

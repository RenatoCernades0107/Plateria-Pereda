import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";

import { Form } from "@/components/ui/form";

import { PhoneField } from "./phone-field";

function Harness({ initial = "" }: { initial?: string }) {
  const form = useForm({ defaultValues: { phone: initial } });
  return (
    <Form {...form}>
      <PhoneField form={form} name="phone" />
      <output data-testid="valor">
        {useWatch({ control: form.control, name: "phone" })}
      </output>
    </Form>
  );
}

describe("PhoneField", () => {
  it("usa +51 por defecto y guarda el número con el código", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText("País del teléfono")).toHaveTextContent("+51");
    await user.type(screen.getByLabelText("Teléfono"), "999888777");
    expect(screen.getByTestId("valor")).toHaveTextContent("+51 999888777");
  });

  it("muestra el país de un número existente", () => {
    render(<Harness initial="+57 3001234567" />);
    expect(screen.getByLabelText("País del teléfono")).toHaveTextContent("+57");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("3001234567");
  });

  it("al pegar un número con +código cambia el país", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText("Teléfono"));
    await user.paste("+591 71234567");
    expect(screen.getByTestId("valor")).toHaveTextContent("+591 71234567");
  });
});

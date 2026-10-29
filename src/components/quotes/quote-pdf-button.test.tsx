import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { QuotePdfData } from "@/domain/quote-pdf";
import { whatsappUrl } from "@/domain/whatsapp-quote";

import { QuotePdfButton } from "./quote-pdf-button";
import { drawQuotePdf } from "./quote-pdf-draw";
import { canShareFiles } from "./web-share";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./quote-pdf-draw", () => ({ drawQuotePdf: vi.fn() }));
vi.mock("./web-share", () => ({ canShareFiles: vi.fn(() => false) }));
vi.mock("@/domain/whatsapp-quote", () => ({ whatsappUrl: vi.fn(() => null) }));

const fakePdf = {
  save: vi.fn(),
  output: vi.fn(() => new Blob(["%PDF"], { type: "application/pdf" })),
};

const data: QuotePdfData = {
  company: {
    name: "Platería Pereda",
    address: "Calle Coronel Inclán 928, Miraflores",
  },
  code: "COT-000001",
  issueDate: "2026-08-17",
  validityDays: 7,
  paymentCondition: "contado",
  deliveryDays: 30,
  clientName: "Lorena",
  contactName: "Lorena",
  lines: [
    {
      sku: "TNS01",
      description: "Escultura",
      quantity: 1,
      unitPrice: 1_000_00,
    },
  ],
  notes: "",
  terms: "",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("QuotePdfButton", () => {
  it("exporta el PDF con 'Exportar PDF'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sin red"))),
    );
    vi.mocked(drawQuotePdf).mockResolvedValue(
      fakePdf as unknown as Awaited<ReturnType<typeof drawQuotePdf>>,
    );
    const user = userEvent.setup();
    render(<QuotePdfButton data={data} phone="+51994000111" />);
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));
    expect(drawQuotePdf).toHaveBeenCalled();
    expect(fakePdf.save).toHaveBeenCalledWith("cotizacion-COT-000001.pdf");
    expect(toast.success).toHaveBeenCalledWith("Cotización exportada en PDF.");
  });

  it("con soporte de Web Share (celular), comparte el PDF por el menú nativo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sin red"))),
    );
    vi.mocked(drawQuotePdf).mockResolvedValue(
      fakePdf as unknown as Awaited<ReturnType<typeof drawQuotePdf>>,
    );
    vi.mocked(canShareFiles).mockReturnValue(true);
    const share = vi.fn<
      (data: { files: File[]; text: string }) => Promise<void>
    >(() => Promise.resolve());
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });
    const user = userEvent.setup();
    render(<QuotePdfButton data={data} phone="+51994000111" />);
    await user.click(
      screen.getByRole("button", { name: "Compartir por WhatsApp" }),
    );
    expect(share).toHaveBeenCalledTimes(1);
    const call = share.mock.calls[0]![0];
    expect(call.files[0]!.name).toBe("cotizacion-COT-000001.pdf");
    expect(call.text).toContain("COT-000001");
    expect(fakePdf.save).not.toHaveBeenCalled();
  });

  it("sin Web Share pero con teléfono (escritorio): descarga y abre WhatsApp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sin red"))),
    );
    vi.mocked(drawQuotePdf).mockResolvedValue(
      fakePdf as unknown as Awaited<ReturnType<typeof drawQuotePdf>>,
    );
    vi.mocked(canShareFiles).mockReturnValue(false);
    vi.mocked(whatsappUrl).mockReturnValue(
      "https://wa.me/51994000111?text=hola",
    );
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    render(<QuotePdfButton data={data} phone="+51994000111" />);
    await user.click(
      screen.getByRole("button", { name: "Compartir por WhatsApp" }),
    );
    expect(fakePdf.save).toHaveBeenCalledWith("cotizacion-COT-000001.pdf");
    expect(open).toHaveBeenCalledWith(
      "https://wa.me/51994000111?text=hola",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("sin Web Share ni teléfono válido: solo descarga y avisa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sin red"))),
    );
    vi.mocked(drawQuotePdf).mockResolvedValue(
      fakePdf as unknown as Awaited<ReturnType<typeof drawQuotePdf>>,
    );
    vi.mocked(canShareFiles).mockReturnValue(false);
    vi.mocked(whatsappUrl).mockReturnValue(null);
    const user = userEvent.setup();
    render(<QuotePdfButton data={data} phone={null} />);
    await user.click(
      screen.getByRole("button", { name: "Compartir por WhatsApp" }),
    );
    expect(fakePdf.save).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Cotización descargada. Sin un teléfono válido para abrir WhatsApp.",
    );
  });

  it("si se cancela el menú de compartir, no muestra error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sin red"))),
    );
    vi.mocked(drawQuotePdf).mockResolvedValue(
      fakePdf as unknown as Awaited<ReturnType<typeof drawQuotePdf>>,
    );
    vi.mocked(canShareFiles).mockReturnValue(true);
    const abort = Object.assign(new Error("cancelado"), {
      name: "AbortError",
    });
    const share = vi.fn(() => Promise.reject(abort));
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });
    const user = userEvent.setup();
    render(<QuotePdfButton data={data} phone="+51994000111" />);
    await user.click(
      screen.getByRole("button", { name: "Compartir por WhatsApp" }),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});

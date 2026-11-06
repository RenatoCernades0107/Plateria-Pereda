import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { QuotePdfData } from "@/domain/quote-pdf";
import { whatsappUrl } from "@/domain/whatsapp-quote";

import { QuotePdfButton } from "./quote-pdf-button";
import type { WorkshopQuote } from "@/domain/quote-workshop-pdf";

import { drawQuotePdf } from "./quote-pdf-draw";
import { exportWorkshopPdf } from "./quote-workshop-export";
import { canShareFiles } from "./web-share";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/clients/actions", () => ({ getClientForEdit: vi.fn() }));
vi.mock("./quote-pdf-draw", () => ({ drawQuotePdf: vi.fn() }));
vi.mock("./web-share", () => ({ canShareFiles: vi.fn(() => false) }));
vi.mock("./quote-workshop-export", () => ({
  exportWorkshopPdf: vi.fn(() => Promise.resolve()),
}));
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
  creditDays: null,
  issuer: {
    id: "55555555-5555-4555-8555-555555555555",
    name: "PEREDA SAC",
    legalName: "PEREDA SAC",
    documentType: "ruc",
    documentNumber: "20557169866",
    bankName: "Banco de Crédito (BCP)",
    accountLabel: "CTA CTE soles",
    accountNumber: "1942229780029",
    cci: "00219400222978002998",
    active: true,
  },
  deliveryDays: 30,
  clientName: "Lorena",
  contactName: "Lorena",
  clientDocument: null,
  phone: "+51987654321",
  applyIgv: true,
  lines: [
    {
      image: null,
      sku: "TNS01",
      description: "Escultura",
      quantity: 1,
      unitPrice: 1_000_00,
    },
  ],
  notes: "",
  terms: "",
};

const workshop: WorkshopQuote = {
  id: "88888888-8888-4888-8888-888888888888",
  code: "COT-000001",
  status: "aceptada",
  clientName: "Lorena",
  issueDate: "2026-08-17",
  deliveryDate: null,
  supplierDeliveryDate: null,
  notes: "Acabado mate",
  lines: [],
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

  it("sin teléfono avisa antes; si acepta, genera el PDF igual", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sin red"))),
    );
    vi.mocked(drawQuotePdf).mockResolvedValue(
      fakePdf as unknown as Awaited<ReturnType<typeof drawQuotePdf>>,
    );
    const user = userEvent.setup();
    render(
      <QuotePdfButton
        data={{ ...data, phone: null }}
        clientId="66666666-6666-4666-8666-666666666666"
        canEditClient
      />,
    );
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));
    expect(drawQuotePdf).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "El cliente no tiene teléfono" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Editar cliente" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Generar sin teléfono" }),
    );
    expect(drawQuotePdf).toHaveBeenCalled();
    expect(fakePdf.save).toHaveBeenCalledWith("cotizacion-COT-000001.pdf");
  });

  it("sin permiso para editar clientes, el aviso no ofrece editar", async () => {
    const user = userEvent.setup();
    render(
      <QuotePdfButton
        data={{ ...data, phone: null }}
        clientId="66666666-6666-4666-8666-666666666666"
        contactId="77777777-7777-4777-8777-777777777777"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));
    expect(
      screen.getByRole("dialog", { name: "El contacto no tiene teléfono" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Editar contacto" }),
    ).not.toBeInTheDocument();
  });

  it("sin sucursal, no genera el PDF y avisa (exportar y compartir)", async () => {
    const user = userEvent.setup();
    render(<QuotePdfButton data={{ ...data, issuer: null }} />);
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));
    await user.click(
      screen.getByRole("button", { name: /Compartir por WhatsApp/ }),
    );
    expect(drawQuotePdf).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith(
      "Elige la sucursal de la cotización antes de generar el PDF.",
    );
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

  it("con la versión para taller, el diálogo deja elegir 'Para taller'", async () => {
    const user = userEvent.setup();
    render(<QuotePdfButton data={data} workshop={workshop} />);
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));
    const dialog = screen.getByRole("dialog", {
      name: "Exportar cotización en PDF",
    });
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Para taller/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Exportar PDF" }),
    );
    expect(exportWorkshopPdf).toHaveBeenCalledWith([workshop]);
    expect(drawQuotePdf).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      "Orden para taller exportada en PDF.",
    );
  });

  it("sin marcar 'Para taller', exporta la cotización del cliente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("sin red"))),
    );
    vi.mocked(drawQuotePdf).mockResolvedValue(
      fakePdf as unknown as Awaited<ReturnType<typeof drawQuotePdf>>,
    );
    const user = userEvent.setup();
    render(<QuotePdfButton data={data} workshop={workshop} />);
    await user.click(screen.getByRole("button", { name: "Exportar PDF" }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Exportar PDF" }),
    );
    expect(exportWorkshopPdf).not.toHaveBeenCalled();
    expect(fakePdf.save).toHaveBeenCalledWith("cotizacion-COT-000001.pdf");
  });

  it("solo para taller (anulada): un botón que exporta la orden para taller", async () => {
    const user = userEvent.setup();
    render(<QuotePdfButton data={data} workshop={workshop} workshopOnly />);
    expect(
      screen.queryByRole("button", { name: /Compartir por WhatsApp/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "PDF para taller" }));
    expect(exportWorkshopPdf).toHaveBeenCalledWith([workshop]);
  });
});

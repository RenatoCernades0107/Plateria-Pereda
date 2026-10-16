import { describe, expect, it } from "vitest";

import { guidePdfModel, type GuidePdfData } from "@/domain/guide-pdf";

import { drawGuidePdf } from "./guide-pdf-draw";

const data: GuidePdfData = {
  company: { name: "Platería Pereda", phones: "", email: "" },
  code: "RES-00012",
  createdAt: "2026-10-01T15:00:00Z",
  status: "aprobada",
  paymentType: "contado",
  clientName: "Ana Torres",
  contactName: null,
  phone: null,
  shopifyOrderName: null,
  attendedBy: null,
  notes: "",
  pieces: [
    {
      id: "1",
      code: "RES-00012-1",
      description: "Fuente de plata",
      materialName: "",
      serviceName: "Limpieza",
      measure: "",
      weightGrams: null,
      status: "aprobada",
      notes: "",
      priceCents: null,
    },
  ],
  money: null,
};

describe("drawGuidePdf", () => {
  it("dibuja el membrete con los íconos de WhatsApp, Facebook y web", async () => {
    const pdf = await drawGuidePdf(guidePdfModel(data, new Set(["1"])));
    const raw = pdf.output();
    for (const text of [
      "OFICINA PRINCIPAL MIRAFLORES:",
      "995 711 235",
      "Pereda.Plateria.Joyeria",
      "www.plateriapereda.com",
    ])
      expect(raw).toContain(`(${text})`);
    // Un ícono por línea del membrete que lo lleva (sin logo ni fotos en este PDF).
    expect(raw.match(/\/Subtype \/Image/g)).toHaveLength(3);
  });
});

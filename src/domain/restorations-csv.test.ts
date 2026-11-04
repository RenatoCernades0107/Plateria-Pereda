import { describe, expect, it } from "vitest";

import { restorationsCsv, type CsvRestoration } from "./restorations-csv";

const base: CsvRestoration = {
  code: "RES-00001",
  createdAt: "2026-10-01T03:00:00Z",
  clientName: 'Joyería "Andina", S.A.C.',
  documentType: "ruc",
  documentNumber: "20100047218",
  clientPhone: "+51987654321",
  clientEmail: "compras@andina.pe",
  contactName: null,
  contactPhone: null,
  status: "parcialmente_lista",
  archived: false,
  finishedAt: null,
  kind: "normal",
  origin: "whatsapp",
  piecesCount: 3,
  waitingCount: 1,
  workshopNames: "Taller Huamán, Orfebrería Ríos",
  paymentType: "a_cuenta",
  paymentStatus: "parcial",
  totalCents: 123450,
  expectedDepositCents: 61725,
  depositPercent: 50,
  paidCents: 61725,
  refundedCents: 0,
  balanceCents: 61725,
  lastPaidOn: "2026-10-02",
  shopifyOrderName: "#1043",
  createdByName: "Vera Ventas",
  notes: "Pulir\ny lavar",
};

const rowsOf = (csv: string) => csv.slice(1).trimEnd().split("\r\n");

describe("restorationsCsv", () => {
  it("arma el CSV con BOM, todos los encabezados y montos en soles", () => {
    const csv = restorationsCsv([base]);
    expect(csv.startsWith("﻿Código,Fecha de registro,Cliente")).toBe(true);
    const [header] = rowsOf(csv);
    expect(header?.split(",")).toEqual([
      "Código",
      "Fecha de registro",
      "Cliente",
      "Tipo de documento",
      "Documento",
      "Teléfono",
      "Email",
      "Contacto",
      "Teléfono del contacto",
      "Estado",
      "Terminada",
      "Fecha de cierre",
      "Tipo de guía",
      "Origen",
      "Piezas",
      "Piezas en espera del cliente",
      "Talleres",
      "Tipo de pago",
      "Estado de pago",
      "Total",
      "Adelanto esperado",
      "% de adelanto",
      "Pagado",
      "Reembolsado",
      "Saldo",
      "Último pago",
      "Pedido de Shopify",
      "Registrada por",
      "Notas",
    ]);
    expect(csv).toContain(
      'RES-00001,2026-09-30 22:00,"Joyería ""Andina"", S.A.C.",RUC,20100047218,+51987654321,compras@andina.pe,,,Parcialmente lista,No,,Normal,WhatsApp,3,1,"Taller Huamán, Orfebrería Ríos",A cuenta,Pago parcial,1234.50,617.25,50,617.25,0.00,617.25,2026-10-02,#1043,Vera Ventas,"Pulir\ny lavar"',
    );
  });

  it("incluye las terminadas, con su fecha de cierre", () => {
    const csv = restorationsCsv([
      {
        ...base,
        code: "RES-00002",
        status: "completada",
        archived: true,
        finishedAt: "2026-10-20T15:00:00Z",
      },
    ]);
    expect(csv).toContain(",Completada,Sí,2026-10-20,Normal,");
  });

  it("sin montos ni datos de contacto deja las columnas vacías", () => {
    const csv = restorationsCsv([
      {
        ...base,
        code: "RES-00003",
        clientName: "Ana",
        documentType: null,
        documentNumber: null,
        clientPhone: null,
        clientEmail: null,
        contactName: "Luis",
        status: "registrada",
        paymentType: "contado",
        paymentStatus: null,
        totalCents: null,
        expectedDepositCents: null,
        depositPercent: null,
        paidCents: null,
        refundedCents: null,
        balanceCents: null,
        lastPaidOn: null,
        shopifyOrderName: null,
        workshopNames: null,
        waitingCount: 0,
        notes: "",
      },
    ]);
    expect(csv).toContain(
      "RES-00003,2026-09-30 22:00,Ana,,,,,Luis,,Registrada,No,,Normal,WhatsApp,3,0,,Al contado,,,,,,,,,,Vera Ventas,",
    );
  });
});

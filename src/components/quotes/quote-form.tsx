"use client";

import { useState } from "react";

import { formatCents } from "@/domain/money";
import { quoteTotals } from "@/domain/quote";
import { draftAmounts, type QuoteLineDraft } from "@/domain/quote-line";

import { QuoteLinesEditor } from "./quote-lines-editor";

/** Formulario de la cotización. */
export function QuoteForm() {
  const [lines, setLines] = useState<QuoteLineDraft[]>([]);
  const totals = quoteTotals(lines.map(draftAmounts));

  return (
    <div className="space-y-4">
      <section aria-labelledby="productos" className="space-y-3">
        <h2 id="productos" className="text-heading text-lg font-semibold">
          Productos
        </h2>
        <QuoteLinesEditor lines={lines} onChange={setLines} />
      </section>
      <p className="text-right text-lg tabular-nums">
        Total: <strong data-testid="total">{formatCents(totals.total)}</strong>
      </p>
    </div>
  );
}

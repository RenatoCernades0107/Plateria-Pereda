"use client";

import { Loader2, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ClientPicker } from "@/components/clients/client-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClientOption } from "@/domain/client-search";
import { IGV_CHOICE_LABELS, IGV_PERCENT } from "@/domain/igv";
import { formatCents } from "@/domain/money";
import {
  addDays,
  formatQuoteDate,
  limaDateOf,
  quoteTotals,
} from "@/domain/quote";
import { draftAmounts, type QuoteLineDraft } from "@/domain/quote-line";
import {
  quoteFormErrors,
  type QuoteFormErrors,
  type QuoteFormInput,
} from "@/lib/validation/quotes";
import { changeQuoteStatus, saveQuote } from "@/server/quotes/actions";

import { QuoteLinesEditor } from "./quote-lines-editor";

export type QuoteFormValues = {
  client: ClientOption | null;
  validityDays: string;
  /** "¿El precio incluye IGV?" (P13): "" hasta que se responda. */
  pricesIncludeIgv: "" | "si" | "no";
  notes: string;
  terms: string;
  lines: QuoteLineDraft[];
};

function toInput(values: QuoteFormValues): QuoteFormInput {
  const client = values.client;
  return {
    clientId: client?.source === "local" ? client.clientId : "",
    contactId:
      client?.source === "local" && client.kind === "contacto"
        ? client.contactId
        : null,
    validityDays: values.validityDays,
    pricesIncludeIgv: values.pricesIncludeIgv,
    notes: values.notes,
    terms: values.terms,
    lines: values.lines,
  };
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="space-y-3 rounded-lg border p-4 sm:p-5"
    >
      <h2 id={id} className="text-heading text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FormError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-destructive text-sm">
      {message}
    </p>
  ) : null;
}

function TotalRow({
  label,
  value,
  strong = false,
  testId,
}: {
  label: string;
  value: string;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>
        {label}
      </dt>
      <dd
        className={
          strong ? "text-lg font-semibold tabular-nums" : "tabular-nums"
        }
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

/** Cliente de una cotización emitida (datos copiados al emitir). */
function ClientSummary({ client }: { client: ClientOption }) {
  return (
    <div className="text-sm" data-testid="cliente-cotizacion">
      {client.source === "local" && client.kind === "contacto" ? (
        <>
          <p className="text-heading font-medium">{client.companyName}</p>
          <p>Atención: {client.name}</p>
        </>
      ) : (
        <p className="text-heading font-medium">{client.name}</p>
      )}
      {client.phone || client.email ? (
        <p className="text-muted-foreground">
          {[client.phone, client.email].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Formulario de la cotización: cliente (o contacto de una empresa), líneas con
 * totales en vivo, vigencia, notas y condiciones. Guarda el borrador y lo emite.
 * Si la cotización ya se emitió se muestra sin edición.
 */
export function QuoteForm({
  quoteId = null,
  initial,
  issueDate = null,
  readOnly = false,
  canCreateClient = false,
}: {
  quoteId?: string | null;
  initial: QuoteFormValues;
  /** Fecha de emisión (si ya se emitió). */
  issueDate?: string | null;
  readOnly?: boolean;
  canCreateClient?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<QuoteFormErrors | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"save" | "issue" | null>(null);

  const withoutIgv = values.pricesIncludeIgv === "no";
  const totals = quoteTotals(values.lines.map(draftAmounts), !withoutIgv);
  const days = Number(values.validityDays);
  const validDays = /^\d{1,3}$/.test(values.validityDays) && days >= 1;

  const set = (patch: Partial<QuoteFormValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    // Tras el primer intento se valida en vivo.
    if (submitted) setErrors(quoteFormErrors(toInput(next)));
  };

  const submit = (issue: boolean) => {
    setSubmitted(true);
    const input = toInput(values);
    const found = quoteFormErrors(input);
    setErrors(found);
    if (found) {
      toast.error("Revisa los datos marcados.");
      return;
    }
    setAction(issue ? "issue" : "save");
    startTransition(async () => {
      const saved = await saveQuote(quoteId, input);
      if ("error" in saved) {
        toast.error(saved.error);
        return;
      }
      if (issue) {
        const issued = await changeQuoteStatus(saved.id, "emitida");
        if ("error" in issued) {
          toast.error(issued.error);
          router.push(`/cotizaciones/${saved.id}`);
          return;
        }
        toast.success("Cotización emitida.");
      } else {
        toast.success("Borrador guardado.");
      }
      if (quoteId) router.refresh();
      else router.push(`/cotizaciones/${saved.id}`);
    });
  };

  const validUntil = issueDate
    ? addDays(issueDate, days)
    : validDays
      ? addDays(limaDateOf(new Date()), days)
      : null;

  return (
    <form
      aria-label="Cotización"
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
    >
      <Section id="seccion-cliente" title="Cliente">
        {readOnly && values.client ? (
          <ClientSummary client={values.client} />
        ) : (
          <div className="max-w-xl space-y-1.5">
            <Label htmlFor="cotizacion-cliente">
              Cliente o contacto de una empresa
            </Label>
            <ClientPicker
              id="cotizacion-cliente"
              value={values.client}
              canCreate={canCreateClient}
              onSelect={(client) => set({ client })}
            />
            {values.client?.source === "local" &&
            values.client.kind === "contacto" ? (
              <p className="text-muted-foreground text-xs">
                Se cotiza a {values.client.companyName} con atención a{" "}
                {values.client.name}.
              </p>
            ) : null}
            <FormError id="cliente-error" message={errors?.clientId} />
          </div>
        )}
      </Section>

      <Section id="seccion-productos" title="Productos">
        <QuoteLinesEditor
          lines={values.lines}
          onChange={(lines) => set({ lines })}
          errors={errors?.byLine}
          disabled={readOnly}
        />
        <FormError id="lineas-error" message={errors?.lines} />
      </Section>

      <Section id="seccion-totales" title="Totales">
        <div className="ml-auto max-w-sm space-y-1 text-sm">
          <dl className="space-y-1">
            <TotalRow
              label="Subtotal"
              value={formatCents(totals.subtotal)}
              testId="subtotal"
            />
            {totals.discount > 0 ? (
              <TotalRow
                label="Descuentos"
                value={`− ${formatCents(totals.discount)}`}
                testId="descuentos"
              />
            ) : null}
            {withoutIgv ? (
              <TotalRow
                label={`IGV (${IGV_PERCENT} %)`}
                value={`+ ${formatCents(totals.igv)}`}
                testId="igv"
              />
            ) : null}
            <TotalRow
              label="Total"
              value={formatCents(totals.total)}
              strong
              testId="total"
            />
          </dl>
          {values.pricesIncludeIgv === "si" ? (
            <p className="text-muted-foreground text-right text-xs">
              Precios con IGV incluido (IGV {formatCents(totals.igv)}).
            </p>
          ) : null}
        </div>
        <fieldset className="space-y-2" disabled={readOnly}>
          <legend className="text-sm font-medium">
            ¿El precio incluye IGV?
          </legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            {(["si", "no"] as const).map((value) => (
              <label
                key={value}
                className="flex items-center gap-2 text-sm has-[:disabled]:opacity-60"
              >
                <input
                  type="radio"
                  className="accent-primary size-4"
                  name="cotizacion-igv"
                  value={value}
                  checked={values.pricesIncludeIgv === value}
                  aria-describedby={
                    errors?.pricesIncludeIgv ? "igv-error" : undefined
                  }
                  onChange={() => set({ pricesIncludeIgv: value })}
                />
                {IGV_CHOICE_LABELS[value]}
              </label>
            ))}
          </div>
          <FormError id="igv-error" message={errors?.pricesIncludeIgv} />
        </fieldset>
      </Section>

      <Section id="seccion-condiciones" title="Vigencia y condiciones">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="cotizacion-vigencia">Vigencia (días)</Label>
            <Input
              id="cotizacion-vigencia"
              inputMode="numeric"
              value={values.validityDays}
              disabled={readOnly}
              aria-invalid={errors?.validityDays ? true : undefined}
              aria-describedby={
                errors?.validityDays ? "vigencia-error" : undefined
              }
              onChange={(e) => set({ validityDays: e.target.value })}
            />
          </div>
          <p className="text-muted-foreground pb-2 text-sm">
            {validUntil
              ? issueDate
                ? `Emitida el ${formatQuoteDate(issueDate)}; vigente hasta el ${formatQuoteDate(validUntil)}.`
                : `Si se emite hoy, vence el ${formatQuoteDate(validUntil)}.`
              : null}
          </p>
        </div>
        <FormError id="vigencia-error" message={errors?.validityDays} />
        <div className="space-y-1.5">
          <Label htmlFor="cotizacion-notas">Notas</Label>
          <Textarea
            id="cotizacion-notas"
            value={values.notes}
            maxLength={2000}
            disabled={readOnly}
            placeholder="Plazo de entrega, detalles para el cliente…"
            onChange={(e) => set({ notes: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cotizacion-condiciones">Condiciones</Label>
          <Textarea
            id="cotizacion-condiciones"
            value={values.terms}
            maxLength={5000}
            disabled={readOnly}
            onChange={(e) => set({ terms: e.target.value })}
          />
        </div>
      </Section>

      {readOnly ? null : (
        <div className="bg-background/95 sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending && action === "save" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            Guardar borrador
          </Button>
          <Button type="button" disabled={pending} onClick={() => submit(true)}>
            {pending && action === "issue" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            Emitir
          </Button>
        </div>
      )}
    </form>
  );
}

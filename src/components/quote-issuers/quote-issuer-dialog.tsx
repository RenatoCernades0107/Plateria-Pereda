"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  QUOTE_ISSUER_DOCUMENT_LABELS,
  QUOTE_ISSUER_DOCUMENT_TYPES,
  type QuoteIssuer,
  type QuoteIssuerDocumentType,
} from "@/domain/quote-issuers";
import {
  quoteIssuerFormErrors,
  type QuoteIssuerFormErrors,
  type QuoteIssuerFormField,
  type QuoteIssuerFormInput,
} from "@/lib/validation/quote-issuers";
import {
  createQuoteIssuer,
  updateQuoteIssuer,
} from "@/server/quote-issuers-actions";

function valuesOf(issuer?: QuoteIssuer): QuoteIssuerFormInput {
  return {
    name: issuer?.name ?? "",
    legalName: issuer?.legalName ?? "",
    documentType: issuer?.documentType ?? "ruc",
    documentNumber: issuer?.documentNumber ?? "",
    bankName: issuer?.bankName ?? "Banco de Crédito (BCP)",
    accountLabel: issuer?.accountLabel ?? "CTA CTE soles",
    accountNumber: issuer?.accountNumber ?? "",
    cci: issuer?.cci ?? "",
  };
}

function Field({
  id,
  label,
  error,
  description,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {description ? (
        <p className="text-muted-foreground text-xs">{description}</p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Crea una sucursal de cotización o, con `issuer`, la edita. Como son datos
 * bancarios y tributarios que salen en los PDF, al editar se pide confirmar antes de
 * guardar.
 */
export function QuoteIssuerDialog({
  issuer,
  trigger,
}: {
  issuer?: QuoteIssuer;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => valuesOf(issuer));
  const [errors, setErrors] = useState<QuoteIssuerFormErrors | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<QuoteIssuerFormInput>) => {
    const next = { ...values, ...patch };
    setValues(next);
    if (errors) setErrors(quoteIssuerFormErrors(next));
  };

  const input = (
    field: QuoteIssuerFormField,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <Input
      id={`sucursal-${field}`}
      autoComplete="off"
      value={values[field]}
      aria-invalid={errors?.[field] ? true : undefined}
      aria-describedby={errors?.[field] ? `sucursal-${field}-error` : undefined}
      onChange={(e) => set({ [field]: e.target.value })}
      {...props}
    />
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const result = issuer
        ? await updateQuoteIssuer(issuer.id, values)
        : await createQuoteIssuer(values);
      if ("error" in result) {
        setConfirming(false);
        setError(result.error);
        return;
      }
      toast.success(
        issuer ? "Cambios guardados." : `"${values.name.trim()}" agregada.`,
      );
      setOpen(false);
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = quoteIssuerFormErrors(values);
    setErrors(found);
    if (found) return;
    // Editar datos sensibles: primero el aviso.
    if (issuer) setConfirming(true);
    else save();
  }

  const isRuc = values.documentType === "ruc";

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        if (value) {
          setValues(valuesOf(issuer));
          setErrors(null);
          setConfirming(false);
        }
        setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {confirming && issuer ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TriangleAlert className="text-amber-500" aria-hidden />
                ¿Guardar los cambios de {issuer.name}?
              </DialogTitle>
              <DialogDescription>
                Estás cambiando datos bancarios y tributarios. Saldrán en todos
                los PDF de las cotizaciones de esta sucursal, también en las ya
                emitidas. Revisa que el RUC/DNI, la cuenta y el CCI sean
                correctos.
              </DialogDescription>
            </DialogHeader>
            {error ? <FormAlert>{error}</FormAlert> : null}
            <DialogFooter>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                Volver
              </Button>
              <Button disabled={pending} onClick={save}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                Sí, guardar cambios
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {issuer ? `Editar ${issuer.name}` : "Nueva sucursal"}
              </DialogTitle>
              <DialogDescription>
                Los datos salen en el PDF de la cotización, encima de
                «Atentamente,».
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={submit}
              className="space-y-4"
              noValidate
              aria-label="Sucursal de cotización"
            >
              {error ? <FormAlert>{error}</FormAlert> : null}
              <Field
                id="sucursal-name"
                label="Nombre"
                error={errors?.name}
                description="Con este nombre se elige en la cotización."
              >
                {input("name")}
              </Field>
              <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                <Field id="sucursal-documentType" label="Documento">
                  <Select
                    value={values.documentType}
                    onValueChange={(value) =>
                      set({ documentType: value as QuoteIssuerDocumentType })
                    }
                  >
                    <SelectTrigger
                      id="sucursal-documentType"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUOTE_ISSUER_DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {QUOTE_ISSUER_DOCUMENT_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  id="sucursal-documentNumber"
                  label={`Número de ${QUOTE_ISSUER_DOCUMENT_LABELS[values.documentType]}`}
                  error={errors?.documentNumber}
                >
                  {input("documentNumber", { inputMode: "numeric" })}
                </Field>
              </div>
              <Field
                id="sucursal-legalName"
                label={isRuc ? "Razón social" : "Titular"}
                error={errors?.legalName}
                description={
                  isRuc
                    ? "Sale en el PDF junto con el RUC."
                    : "Con DNI, en el PDF solo sale la cuenta bancaria."
                }
              >
                {input("legalName")}
              </Field>
              <Field
                id="sucursal-bankName"
                label="Banco"
                error={errors?.bankName}
              >
                {input("bankName")}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="sucursal-accountLabel"
                  label="Tipo de cuenta"
                  error={errors?.accountLabel}
                  description="P. ej. CTA CTE soles, CTA AHORRO soles."
                >
                  {input("accountLabel")}
                </Field>
                <Field
                  id="sucursal-accountNumber"
                  label="Número de cuenta"
                  error={errors?.accountNumber}
                >
                  {input("accountNumber", { inputMode: "numeric" })}
                </Field>
              </div>
              <Field id="sucursal-cci" label="CCI" error={errors?.cci}>
                {input("cci", { inputMode: "numeric" })}
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {issuer ? "Guardar" : "Agregar"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Copy, Package, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCents, parseMoney } from "@/domain/money";
import { lineGross, lineTotal } from "@/domain/quote";
import {
  copyLine,
  draftAmounts,
  type LineErrors,
  type LineField,
  type QuoteLineDraft,
} from "@/domain/quote-line";

import { ProductPicker } from "./product-picker";

const NO_DISCOUNT = "ninguno";

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-destructive text-xs">
      {message}
    </p>
  ) : null;
}

function LineEditor({
  line,
  index,
  errors = {},
  disabled,
  onChange,
  onRemove,
  onDuplicate,
}: {
  line: QuoteLineDraft;
  index: number;
  errors?: Partial<Record<LineField, string>>;
  disabled: boolean;
  onChange: (patch: Partial<QuoteLineDraft>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const id = (field: string) => `linea-${line.key}-${field}`;
  const amounts = draftAmounts(line);
  const fromCatalog = line.shopifyProductId !== null;
  const name = line.title
    ? `${line.title}${line.variantTitle ? ` — ${line.variantTitle}` : ""}`
    : "Línea libre";
  const catalogChanged =
    line.catalogPrice !== null &&
    parseMoney(line.unitPrice) !== parseMoney(line.catalogPrice);
  const invalid = (field: LineField) =>
    errors[field]
      ? { "aria-invalid": true, "aria-describedby": id(`${field}-error`) }
      : {};

  return (
    <li>
      <div
        role="group"
        aria-label={`Línea ${index + 1}: ${name}`}
        className="space-y-3 rounded-lg border p-3 sm:p-4"
      >
        <div className="flex items-start gap-3">
          {line.imageUrl ? (
            // Imagen del CDN de Shopify.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={line.imageUrl}
              alt=""
              className="size-12 shrink-0 rounded border object-cover"
            />
          ) : (
            <span className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded border">
              <Package className="size-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            {fromCatalog ? (
              <>
                <p className="text-heading font-medium break-words">
                  {line.title}
                </p>
                <p className="text-muted-foreground text-xs">
                  {[line.variantTitle, line.sku && `SKU ${line.sku}`]
                    .filter(Boolean)
                    .join(" · ") || "Producto de Shopify"}
                </p>
              </>
            ) : (
              <div className="space-y-1">
                <Label htmlFor={id("title")}>Producto</Label>
                <Input
                  id={id("title")}
                  value={line.title}
                  maxLength={200}
                  disabled={disabled}
                  placeholder="Descripción del producto"
                  onChange={(e) => onChange({ title: e.target.value })}
                  {...invalid("title")}
                />
                <FieldError id={id("title-error")} message={errors.title} />
              </div>
            )}
          </div>
          {disabled ? null : (
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Duplicar línea ${index + 1}`}
                onClick={onDuplicate}
              >
                <Copy aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar línea ${index + 1}`}
                onClick={onRemove}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor={id("customization")}>Personalización</Label>
          <Textarea
            id={id("customization")}
            value={line.customization}
            maxLength={2000}
            disabled={disabled}
            placeholder="Grabado, medidas, acabado…"
            onChange={(e) => onChange({ customization: e.target.value })}
            {...invalid("customization")}
          />
          <FieldError
            id={id("customization-error")}
            message={errors.customization}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor={id("quantity")}>Cantidad</Label>
            <Input
              id={id("quantity")}
              inputMode="numeric"
              value={line.quantity}
              disabled={disabled}
              onChange={(e) => onChange({ quantity: e.target.value })}
              {...invalid("quantity")}
            />
            <FieldError id={id("quantity-error")} message={errors.quantity} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("unitPrice")}>Precio unitario (S/)</Label>
            <Input
              id={id("unitPrice")}
              inputMode="decimal"
              value={line.unitPrice}
              disabled={disabled}
              onChange={(e) => onChange({ unitPrice: e.target.value })}
              {...invalid("unitPrice")}
            />
            {catalogChanged ? (
              <p className="text-muted-foreground text-xs">
                Catálogo: {formatCents(parseMoney(line.catalogPrice!) ?? 0)}
              </p>
            ) : null}
            <FieldError id={id("unitPrice-error")} message={errors.unitPrice} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("discountType")}>Descuento</Label>
            <Select
              value={line.discountType || NO_DISCOUNT}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({
                  discountType:
                    value === NO_DISCOUNT
                      ? ""
                      : (value as QuoteLineDraft["discountType"]),
                  ...(value === NO_DISCOUNT && { discountValue: "" }),
                })
              }
            >
              <SelectTrigger id={id("discountType")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DISCOUNT}>Sin descuento</SelectItem>
                <SelectItem value="monto">Monto (S/)</SelectItem>
                <SelectItem value="porcentaje">Porcentaje (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {line.discountType ? (
            <div className="space-y-1">
              <Label htmlFor={id("discountValue")}>
                {line.discountType === "monto"
                  ? "Descuento (S/)"
                  : "Descuento (%)"}
              </Label>
              <Input
                id={id("discountValue")}
                inputMode="decimal"
                value={line.discountValue}
                disabled={disabled}
                onChange={(e) => onChange({ discountValue: e.target.value })}
                {...invalid("discountValue")}
              />
              <FieldError
                id={id("discountValue-error")}
                message={errors.discountValue}
              />
            </div>
          ) : null}
        </div>

        <p className="flex flex-wrap justify-end gap-x-3 text-sm tabular-nums">
          {line.discountType ? (
            <span className="text-muted-foreground">
              Subtotal {formatCents(lineGross(amounts))}
            </span>
          ) : null}
          <span>
            Total de la línea:{" "}
            <strong data-testid={`total-linea-${index + 1}`}>
              {formatCents(lineTotal(amounts))}
            </strong>
          </span>
        </p>
      </div>
    </li>
  );
}

/**
 * Líneas de la cotización: se agregan desde el catálogo de Shopify o como línea libre,
 * y se editan la personalización, la cantidad, el precio y el descuento.
 */
export function QuoteLinesEditor({
  lines,
  onChange,
  errors,
  disabled = false,
}: {
  lines: QuoteLineDraft[];
  onChange: (lines: QuoteLineDraft[]) => void;
  errors?: LineErrors;
  disabled?: boolean;
}) {
  const update = (key: string, patch: Partial<QuoteLineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-3">
      {lines.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
          Aún no hay productos en la cotización.
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Líneas de la cotización">
          {lines.map((line, index) => (
            <LineEditor
              key={line.key}
              line={line}
              index={index}
              errors={errors?.[line.key]}
              disabled={disabled}
              onChange={(patch) => update(line.key, patch)}
              onRemove={() => onChange(lines.filter((l) => l.key !== line.key))}
              onDuplicate={() =>
                onChange([
                  ...lines.slice(0, index + 1),
                  copyLine(line),
                  ...lines.slice(index + 1),
                ])
              }
            />
          ))}
        </ol>
      )}
      {disabled ? null : (
        <ProductPicker onSelect={(line) => onChange([...lines, line])} />
      )}
    </div>
  );
}

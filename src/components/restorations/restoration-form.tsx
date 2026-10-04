"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type UseFormReturn,
} from "react-hook-form";

import { FormAlert } from "@/components/auth/form-alert";
import { ClientPicker } from "@/components/clients/client-picker";
import { TextField } from "@/components/clients/form-fields";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClientOption } from "@/domain/client-search";
import {
  expectedDeposit,
  formatCents,
  parseMoney,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPES,
  sumCents,
  type PaymentType,
} from "@/domain/money";
import { cn } from "@/lib/utils";
import {
  MAX_PIECES,
  restorationSchema,
  type PieceFormInput,
  type RestorationFormInput,
} from "@/lib/validation/restorations";
import {
  createRestoration,
  listClientContacts,
  type ContactChoice,
} from "@/server/restorations/actions";

export type CatalogOption = { id: string; name: string; price: number | null };

type FormValues = {
  clientId: string;
  contactId: string | null;
  paymentType: PaymentType;
  depositPercent: string;
  notes: string;
  pieces: PieceFormInput[];
};

const NONE = "ninguno";

export const EMPTY_PIECE: PieceFormInput = {
  workshopId: null,
  description: "",
  measure: "",
  material: { id: null, name: "" },
  service: { id: null, name: "" },
  weight: "",
  price: "",
  arrived: false,
  notes: "",
};

/** Total en vivo: suma los precios válidos (los vacíos o mal escritos cuentan 0). */
export function liveTotal(pieces: readonly { price?: string }[]) {
  return sumCents(pieces.map((p) => parseMoney(p.price ?? "") ?? 0));
}

/** Material o servicio: sugerencias del catálogo o texto libre (P22). */
function CatalogField({
  form,
  index,
  name,
  label,
  options,
  onPick,
}: {
  form: UseFormReturn<FormValues>;
  index: number;
  name: "material" | "service";
  label: string;
  options: CatalogOption[];
  onPick?: (option: CatalogOption) => void;
}) {
  const listId = `${name}-opciones`;
  return (
    <FormField
      control={form.control}
      name={`pieces.${index}.${name}.name`}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              list={listId}
              autoComplete="off"
              {...field}
              value={field.value ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const match = options.find(
                  (o) => o.name.toLowerCase() === value.trim().toLowerCase(),
                );
                field.onChange(value);
                form.setValue(`pieces.${index}.${name}.id`, match?.id ?? null);
                if (match) onPick?.(match);
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function PieceCard({
  form,
  index,
  total,
  workshops,
  materials,
  services,
  onDuplicate,
  onRemove,
}: {
  form: UseFormReturn<FormValues>;
  index: number;
  total: number;
  workshops: { id: string; name: string }[];
  materials: CatalogOption[];
  services: CatalogOption[];
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const piece = useWatch({ control: form.control, name: `pieces.${index}` });
  const errors = form.formState.errors.pieces?.[index];
  const price = parseMoney(piece?.price ?? "");
  const title = piece?.description?.trim() || "Nueva pieza";

  return (
    <li
      className={cn("rounded-lg border", errors && "border-destructive")}
      data-testid={`pieza-${index + 1}`}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform",
              !open && "-rotate-90",
            )}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="text-muted-foreground block text-xs">
              Pieza {index + 1}
            </span>
            <span className="text-heading block truncate font-medium">
              {title}
            </span>
          </span>
        </button>
        <span className="text-sm tabular-nums">
          {price === null ? "—" : formatCents(price)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Duplicar pieza ${index + 1}`}
          onClick={onDuplicate}
          disabled={total >= MAX_PIECES}
        >
          <Copy />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Quitar pieza ${index + 1}`}
          onClick={onRemove}
          disabled={total <= 1}
        >
          <Trash2 />
        </Button>
      </div>
      <div className={cn("space-y-4 border-t p-3", !open && "hidden")}>
        <TextField
          form={form}
          name={`pieces.${index}.description`}
          label="Descripción"
          multiline
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <CatalogField
            form={form}
            index={index}
            name="service"
            label="Servicio"
            options={services}
            onPick={(option) => {
              // El precio sugerido del servicio solo se propone si aún no hay precio.
              if (
                option.price !== null &&
                !form.getValues(`pieces.${index}.price`)
              ) {
                form.setValue(`pieces.${index}.price`, option.price.toFixed(2));
              }
            }}
          />
          <TextField
            form={form}
            name={`pieces.${index}.price`}
            label="Precio (S/)"
            inputMode="numeric"
          />
          <CatalogField
            form={form}
            index={index}
            name="material"
            label="Material"
            options={materials}
          />
          <TextField
            form={form}
            name={`pieces.${index}.measure`}
            label="Medida"
          />
          <TextField
            form={form}
            name={`pieces.${index}.weight`}
            label="Peso (g)"
            inputMode="numeric"
          />
          <FormField
            control={form.control}
            name={`pieces.${index}.workshopId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Taller</FormLabel>
                <Select
                  value={field.value ?? NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin asignar</SelectItem>
                    {workshops.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name={`pieces.${index}.arrived`}
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
              </FormControl>
              <FormLabel className="font-normal">
                La pieza ya está en tienda
              </FormLabel>
            </FormItem>
          )}
        />
        <TextField
          form={form}
          name={`pieces.${index}.notes`}
          label="Notas de la pieza"
          multiline
        />
      </div>
    </li>
  );
}

/**
 * Registro de una restauración (Paso 7.4): cliente, tipo de pago, piezas y total en
 * vivo. Al guardar abre el detalle con el mensaje de cotización para WhatsApp.
 */
export function RestorationForm({
  defaultDepositPercent,
  workshops,
  materials,
  services,
}: {
  defaultDepositPercent: number;
  workshops: { id: string; name: string }[];
  materials: CatalogOption[];
  services: CatalogOption[];
}) {
  const router = useRouter();
  const [client, setClient] = useState<ClientOption | null>(null);
  const [contacts, setContacts] = useState<ContactChoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(restorationSchema as never),
    defaultValues: {
      clientId: "",
      contactId: null,
      paymentType: "a_cuenta",
      depositPercent: String(defaultDepositPercent),
      notes: "",
      pieces: [EMPTY_PIECE],
    },
  });
  const pieces = useFieldArray({ control: form.control, name: "pieces" });
  const values = useWatch({ control: form.control });
  const total = liveTotal(values.pieces ?? []);
  const paymentType = values.paymentType ?? "a_cuenta";
  const percent = Number(values.depositPercent);
  const deposit =
    paymentType === "a_cuenta" && !(percent >= 1 && percent <= 100)
      ? null
      : expectedDeposit(total, paymentType, percent);

  // Aviso al salir con cambios sin guardar.
  const dirty = form.formState.isDirty && !saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const chooseClient = (option: ClientOption) => {
    if (option.source !== "local") return;
    setClient(option);
    form.setValue("clientId", option.clientId, {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
    form.setValue(
      "contactId",
      option.kind === "contacto" ? option.contactId : null,
    );
    setContacts([]);
    if (option.kind !== "persona") {
      listClientContacts(option.clientId)
        .then(setContacts)
        .catch(() => setContacts([]));
    }
  };

  const onSubmit = form.handleSubmit(() => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createRestoration(
        form.getValues() as RestorationFormInput,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.push(`/restauraciones/${result.id}?registrada=1`);
    });
  });

  const clientError = form.formState.errors.clientId?.message;
  const piecesError =
    form.formState.errors.pieces?.root?.message ??
    form.formState.errors.pieces?.message;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}

        <section className="space-y-4" aria-labelledby="datos-cliente">
          <h2 id="datos-cliente" className="text-heading text-lg font-semibold">
            Cliente
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="cliente">Cliente</Label>
            <ClientPicker
              id="cliente"
              value={client}
              onSelect={chooseClient}
              canCreate
            />
            {clientError ? (
              <p className="text-destructive text-sm">{clientError}</p>
            ) : null}
          </div>
          {client && client.kind !== "persona" ? (
            <FormField
              control={form.control}
              name="contactId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contacto que deja las piezas</FormLabel>
                  <Select
                    value={field.value ?? NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full sm:max-w-sm">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin contacto</SelectItem>
                      {contacts.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.position ? `${k.name} (${k.position})` : k.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </section>

        <section className="space-y-3" aria-labelledby="piezas">
          <div className="flex items-center justify-between gap-2">
            <h2 id="piezas" className="text-heading text-lg font-semibold">
              Piezas
            </h2>
            <span className="text-muted-foreground text-sm">
              {pieces.fields.length} de {MAX_PIECES}
            </span>
          </div>
          {piecesError ? (
            <p className="text-destructive text-sm">{piecesError}</p>
          ) : null}
          <ul className="space-y-3">
            {pieces.fields.map((field, index) => (
              <PieceCard
                key={field.id}
                form={form}
                index={index}
                total={pieces.fields.length}
                workshops={workshops}
                materials={materials}
                services={services}
                onDuplicate={() =>
                  pieces.insert(
                    index + 1,
                    structuredClone(form.getValues(`pieces.${index}`)),
                  )
                }
                onRemove={() => pieces.remove(index)}
              />
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            onClick={() => pieces.append(structuredClone(EMPTY_PIECE))}
            disabled={pieces.fields.length >= MAX_PIECES}
          >
            <Plus />
            Agregar pieza
          </Button>
        </section>

        <section className="space-y-4" aria-labelledby="pago">
          <h2 id="pago" className="text-heading text-lg font-semibold">
            Pago
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="paymentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de pago</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {PAYMENT_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {paymentType === "a_cuenta" ? (
              <TextField
                form={form}
                name="depositPercent"
                label="Adelanto (%)"
                inputMode="numeric"
              />
            ) : null}
          </div>
          <TextField form={form} name="notes" label="Notas" multiline />
        </section>

        <div className="bg-background sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:mx-0 sm:rounded-lg sm:border">
          <dl className="flex gap-6">
            <div>
              <dt className="text-muted-foreground text-xs">Total</dt>
              <dd
                className="text-heading font-semibold tabular-nums"
                data-testid="total-en-vivo"
              >
                {formatCents(total)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Adelanto</dt>
              <dd className="tabular-nums" data-testid="adelanto-en-vivo">
                {deposit === null ? "—" : formatCents(deposit)}
              </dd>
            </div>
          </dl>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Registrar restauración"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

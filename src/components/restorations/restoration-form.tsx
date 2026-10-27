"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Copy, Info, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";

import { FormAlert } from "@/components/auth/form-alert";
import { ClientPicker } from "@/components/clients/client-picker";
import { TextField } from "@/components/clients/form-fields";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClientOption } from "@/domain/client-search";
import {
  depositAmountHint,
  depositAmountLiveError,
  expectedDeposit,
  formatCents,
  lineCents,
  parseMoney,
  percentOf,
  sumCents,
  toDecimalString,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPES,
  type PaymentType,
} from "@/domain/money";
import { PIECE_STATUS_LABELS } from "@/domain/piece-state-machine";
import { PIECE_FREE_FIELDS, SALE_PRICE_HINT } from "@/domain/restoration-edit";
import {
  RESTORATION_KIND_LABELS,
  type RestorationKind,
} from "@/domain/restoration-status";
import { cn } from "@/lib/utils";
import {
  COPY_INITIAL_STATUSES,
  copyRestorationSchema,
  MAX_PIECES,
  MAX_QUANTITY,
  restorationSchema,
  whatsappQuoteSchema,
  type PieceFormInput,
  type RestorationFormInput,
  type WhatsappQuoteFormInput,
} from "@/lib/validation/restorations";
import {
  createRestoration,
  listClientContacts,
  type ContactChoice,
} from "@/server/restorations/actions";
import {
  createRestorationFromQuote,
  createWhatsappQuote,
  updateWhatsappQuote,
} from "@/server/whatsapp-quotes/actions";

import { GUIDE_SURFACE_CLASS, PIECE_ACCENT_CLASS } from "./guide-labels";
import { PieceFields, type CatalogOption } from "./piece-fields";
import {
  KIND_SHORT_DESCRIPTIONS,
  RestorationKindConfirmDialog,
} from "./restoration-kind-dialog";

export type { CatalogOption };

type FormValues = {
  /** Tipo de guía (punto 8): interna u observada no se cobran. */
  kind: RestorationKind;
  clientId: string;
  contactId: string | null;
  /** Solo cotización de WhatsApp sin cliente (P46). */
  customerName: string;
  customerPhone: string;
  paymentType: PaymentType;
  /** Adelanto "A cuenta" en soles: el % se calcula cuando hay precios. */
  depositAmount: string;
  /** Método con que se pagó el adelanto: al guardar, el adelanto se registra como pago. */
  depositMethodId: string;
  /** Solo lo lee el esquema de la cotización de WhatsApp (que no lleva pago): siempre "". */
  depositPercent: string;
  notes: string;
  pieces: PieceFormInput[];
};

const NONE = "ninguno";

export const EMPTY_PIECE: PieceFormInput = {
  workshopId: null,
  quantity: "1",
  description: "",
  measure: "",
  materials: [],
  services: [],
  weight: "",
  price: "",
  urgent: false,
  estimatedDeliveryDate: "",
  workshopDeliveryDate: "",
  notes: "",
};

/** Pieza nueva en la copia: también elige estado inicial, por defecto Consulta (P49). */
const EMPTY_COPY_PIECE: PieceFormInput = {
  ...EMPTY_PIECE,
  initialStatus: "en_consulta",
  statusNote: "",
};

const defaultIds = (options: readonly CatalogOption[]) =>
  options.filter((o) => o.isDefault && o.active !== false).map((o) => o.id);

/**
 * Pieza nueva con el material y el servicio por defecto ya elegidos (los marca el
 * admin en Configuración); se pueden quitar o cambiar.
 */
export function newPiece(
  materials: readonly CatalogOption[],
  services: readonly CatalogOption[],
  base: PieceFormInput = EMPTY_PIECE,
): PieceFormInput {
  return {
    ...structuredClone(base),
    materials: defaultIds(materials),
    services: defaultIds(services),
  };
}

/**
 * Total en vivo (lo que paga el cliente): suma precio × cantidad de cada pieza; los
 * precios vacíos o mal escritos cuentan 0 (y una cantidad inválida, 1), y crece a
 * medida que el admin asigna los precios (D59).
 */
export function liveTotal(
  pieces: readonly { price?: string; quantity?: string | number }[],
) {
  return sumCents(
    pieces.map((p) =>
      lineCents(parseMoney(p.price ?? "") ?? 0, quantityOf(p.quantity)),
    ),
  );
}

/** Cantidad escrita como entero de 1 a 999; vacía o inválida, 1. */
function quantityOf(text: string | number | undefined): number {
  const n = Number(String(text ?? "").trim() || "1");
  return Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY ? n : 1;
}

function PieceCard({
  form,
  index,
  total,
  workshops,
  materials,
  services,
  quoteOnly,
  showInitialStatus,
  canSetPrice,
  canAssignWorkshop,
  guideKind,
  onDuplicate,
  onRemove,
}: {
  form: UseFormReturn<FormValues>;
  index: number;
  total: number;
  workshops: { id: string; name: string }[];
  materials: CatalogOption[];
  services: CatalogOption[];
  /** Cotización de WhatsApp: sin taller, llegada ni marca urgente (P46). */
  quoteOnly: boolean;
  /** "Crear restauración" desde una cotización: estado inicial y nota (P49). */
  showInitialStatus: boolean;
  /** Puede asignar el precio de venta (admin, ventas y logística). */
  canSetPrice: boolean;
  /** Puede elegir el taller (logística y admin, D60). */
  canAssignWorkshop: boolean;
  /** Interna u observada: la pieza no lleva precio y nace Aprobada u Observada. */
  guideKind: RestorationKind;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const piece = useWatch({ control: form.control, name: `pieces.${index}` });
  const errors = form.formState.errors.pieces?.[index];
  const charged = guideKind === "normal";
  const price = charged ? parseMoney(piece?.price ?? "") : null;
  const title = piece?.description?.trim() || "Nueva pieza";
  const quantity = Number(String(piece?.quantity ?? "").trim());

  return (
    <li
      // Cada pieza en blanco con el acento de pieza, sobre el fondo de la guía.
      className={cn(
        "bg-card rounded-lg border",
        PIECE_ACCENT_CLASS,
        errors && "border-destructive",
      )}
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
              {Number.isInteger(quantity) && quantity >= 1 ? (
                <span
                  className="text-muted-foreground font-normal tabular-nums"
                  data-testid="cantidad-pieza"
                >
                  {" "}
                  ×{quantity}
                </span>
              ) : null}
            </span>
            {!charged ? (
              <span className="text-muted-foreground block text-xs">
                Pasa a{" "}
                {
                  PIECE_STATUS_LABELS[
                    guideKind === "interno" ? "aprobada" : "observada"
                  ]
                }
              </span>
            ) : showInitialStatus &&
              (piece?.initialStatus || price === null) ? (
              <span className="text-muted-foreground block text-xs">
                Pasa a{" "}
                {
                  PIECE_STATUS_LABELS[
                    price === null ? "en_consulta" : piece!.initialStatus!
                  ]
                }
              </span>
            ) : !showInitialStatus && !quoteOnly && price === null ? (
              <span className="text-muted-foreground block text-xs">
                Sin precio: pasa a Consulta
              </span>
            ) : null}
          </span>
        </button>
        <span
          className={cn(
            "text-sm tabular-nums",
            price === null && "text-muted-foreground",
          )}
          data-testid="precio-pieza"
        >
          {!charged
            ? "Sin cobro"
            : price !== null
              ? formatCents(lineCents(price, quantityOf(piece?.quantity)))
              : "Por definir"}
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
        {showInitialStatus ? (
          <InitialStatusFields form={form} index={index} />
        ) : null}
        <PieceFields
          form={form as unknown as UseFormReturn<FieldValues>}
          prefix={`pieces.${index}.`}
          workshops={workshops}
          materials={materials}
          services={services}
          showWorkshop={!quoteOnly && canAssignWorkshop}
          showUrgent={!quoteOnly}
          // El precio es opcional: en la cotización de WhatsApp lo escribe ventas; en la
          // restauración solo lo asigna el admin (D58). Sin precio, pasa a Consulta.
          editable={quoteOnly || canSetPrice ? undefined : PIECE_FREE_FIELDS}
          priceHint={SALE_PRICE_HINT}
          pricePlaceholder={"Por definir"}
          showPrice={charged}
        />
      </div>
    </li>
  );
}

/**
 * Estado al que pasa la pieza al crear la restauración desde la cotización (P49):
 * Consulta con nota obligatoria, o Aprobada.
 */
function InitialStatusFields({
  form,
  index,
}: {
  form: UseFormReturn<FormValues>;
  index: number;
}) {
  const status = useWatch({
    control: form.control,
    name: `pieces.${index}.initialStatus`,
  });
  const price = useWatch({
    control: form.control,
    name: `pieces.${index}.price`,
  });
  if (!price?.trim()) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="pasa-a-consulta"
      >
        Sin precio: la pieza pasa a{" "}
        <span className="text-foreground font-medium">Consulta</span> para
        cotizarlo.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name={`pieces.${index}.initialStatus`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Estado inicial</FormLabel>
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elige el estado" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {COPY_INITIAL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PIECE_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      {status === "en_consulta" ? (
        <TextField
          form={form}
          name={`pieces.${index}.statusNote`}
          label="Nota de la consulta (obligatoria)"
          multiline
        />
      ) : null}
    </div>
  );
}

/** Cliente (persona o empresa) ya vinculado a la cotización. */
export type QuoteClient = Extract<
  ClientOption,
  { source: "local"; kind: "persona" | "empresa" }
>;

/** Pieza cotizada por WhatsApp, para editar la cotización o pedirla (P46). */
export type QuoteItemForForm = {
  id: string;
  number: number;
  piece: PieceFormInput;
  priceLabel: string;
  /** Ya pedida en una restauración: no se puede volver a elegir. */
  orderedIn: string | null;
};

export type QuoteForForm = {
  id: string;
  code: string;
  /** Cliente vinculado; null si la cotización aún no tiene cliente. */
  client: QuoteClient | null;
  contactId: string | null;
  customerName: string;
  customerPhone: string;
  paymentType: PaymentType;
  depositPercent: number | null;
  notes: string;
  items: QuoteItemForForm[];
};

/**
 * - `nueva`: registro de una restauración, o de una cotización si se marca "El pedido
 *   vino por WhatsApp" (P46).
 * - `editar-cotizacion`: edición de una cotización (solo hasta la primera copia).
 * - `copia`: "Crear restauración" desde una cotización con las piezas elegidas.
 */
export type RestorationFormMode =
  | { kind: "nueva"; whatsapp?: boolean }
  | { kind: "editar-cotizacion"; quote: QuoteForForm }
  | { kind: "copia"; quote: QuoteForForm };

/**
 * Detalle de la restauración recién registrada; si el adelanto no se pudo registrar
 * como pago (`adelanto=pendiente`) o no se copiaron todas las fotos de la cotización
 * (`fotos=pendiente`), el detalle lo avisa.
 */
const createdUrl = (result: {
  id: string;
  warning?: string;
  photosWarning?: string;
}) =>
  `/restauraciones/${result.id}?registrada=1${result.warning ? "&adelanto=pendiente" : ""}${result.photosWarning ? "&fotos=pendiente" : ""}`;

/** Pieza cotizada como pieza del formulario de la copia (aún no llegó a la tienda). */
const copyPiece = (item: QuoteItemForForm): PieceFormInput => ({
  ...item.piece,
  quoteItemId: item.id,
  initialStatus: "en_consulta",
  statusNote: "",
});

function defaultsFor(
  mode: RestorationFormMode,
  materials: readonly CatalogOption[],
  services: readonly CatalogOption[],
): FormValues {
  if (mode.kind === "nueva") {
    return {
      kind: "normal",
      clientId: "",
      contactId: null,
      customerName: "",
      customerPhone: "",
      paymentType: "sin_definir",
      depositAmount: "",
      depositMethodId: "",
      depositPercent: "",
      notes: "",
      pieces: [newPiece(materials, services)],
    };
  }
  const q = mode.quote;
  return {
    kind: "normal",
    clientId: q.client?.clientId ?? "",
    contactId: q.contactId,
    customerName: q.customerName,
    customerPhone: q.customerPhone,
    paymentType: q.paymentType,
    // El % cotizado pasa a soles con el total cotizado.
    depositAmount:
      q.paymentType === "a_cuenta" && q.depositPercent
        ? toDecimalString(
            percentOf(liveTotal(q.items.map((i) => i.piece)), q.depositPercent),
          )
        : "",
    depositMethodId: "",
    depositPercent: "",
    notes: mode.kind === "copia" ? "" : q.notes,
    pieces:
      mode.kind === "copia"
        ? q.items.filter((i) => !i.orderedIn).map(copyPiece)
        : q.items.map((i) => i.piece),
  };
}

/**
 * Registro de una restauración (Paso 7.4) o de una cotización de WhatsApp (P46):
 * cliente, tipo de pago, piezas y total en vivo. Al guardar abre el detalle con el
 * mensaje de cotización para WhatsApp.
 */
/** Casilla de una línea con su explicación en un tooltip (ícono de información). */
function OptionCheckbox({
  checked,
  onChange,
  info,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  info: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="accent-primary size-4"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        {children}
      </label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={info}
            className="text-muted-foreground hover:text-foreground rounded-full"
          >
            <Info aria-hidden className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{info}</TooltipContent>
      </Tooltip>
    </span>
  );
}

export function RestorationForm({
  defaultDepositPercent,
  workshops,
  materials,
  services,
  mode = { kind: "nueva" },
  canSetPrice = false,
  canAssignWorkshop = false,
  canSetKind = false,
  paymentMethods = [],
}: {
  defaultDepositPercent: number;
  workshops: { id: string; name: string }[];
  materials: CatalogOption[];
  services: CatalogOption[];
  mode?: RestorationFormMode;
  /** Métodos de pago activos, para el adelanto (solo al registrar restauraciones). */
  paymentMethods?: { id: string; name: string }[];
  /** Puede asignar el precio de venta de las piezas (admin, ventas y logística). */
  canSetPrice?: boolean;
  /** Puede elegir el taller de las piezas (logística y admin, D60). */
  canAssignWorkshop?: boolean;
  /** Puede marcar la guía como interna u observada (admin y ventas, punto 8). */
  canSetKind?: boolean;
}) {
  const router = useRouter();
  const quote = mode.kind === "nueva" ? null : mode.quote;
  const [client, setClient] = useState<ClientOption | null>(
    quote?.client ?? null,
  );
  const [contacts, setContacts] = useState<ContactChoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  // Cotización de WhatsApp: casilla en el registro; fija al editar o copiar.
  const [viaWhatsapp, setViaWhatsapp] = useState(
    mode.kind === "editar-cotizacion" ||
      (mode.kind === "nueva" && Boolean(mode.whatsapp)),
  );
  // El resolver lee la casilla al validar (se actualiza al cambiarla, no al renderizar).
  const quoteMode = useRef(viaWhatsapp);

  const form = useForm<FormValues>({
    // El esquema depende de la casilla: la cotización no exige cliente; la copia
    // exige el estado inicial de cada pieza (P49).
    resolver: (values, context, options) =>
      zodResolver(
        (quoteMode.current
          ? whatsappQuoteSchema
          : mode.kind === "copia"
            ? copyRestorationSchema
            : restorationSchema) as never,
      )(values, context, options as never) as never,
    defaultValues: defaultsFor(mode, materials, services),
  });
  const pieces = useFieldArray({ control: form.control, name: "pieces" });
  const values = useWatch({ control: form.control });
  const guideKind: RestorationKind = viaWhatsapp
    ? "normal"
    : (values.kind ?? "normal");
  const charged = guideKind === "normal";
  // Tipo por confirmar en el diálogo (al marcar una casilla).
  const [pendingKind, setPendingKind] = useState<RestorationKind | null>(null);
  const total = charged ? liveTotal(values.pieces ?? []) : 0;
  const paymentType = charged
    ? (values.paymentType ?? "sin_definir")
    : "sin_definir";
  const depositText = (values.depositAmount ?? "").trim();
  // "A cuenta": el adelanto se escribe en soles (vacío = sin adelanto).
  const deposit =
    paymentType === "sin_definir"
      ? null
      : paymentType === "a_cuenta"
        ? depositText === ""
          ? 0
          : parseMoney(depositText)
        : expectedDeposit(total, paymentType);
  const depositLiveError =
    paymentType === "a_cuenta"
      ? depositAmountLiveError(values.depositAmount ?? "", total)
      : null;
  // Con adelanto, se cobra al registrar: se pide su método y queda como pago.
  const withDeposit =
    !viaWhatsapp &&
    paymentType === "a_cuenta" &&
    deposit !== null &&
    deposit > 0;
  const depositHint =
    depositText === ""
      ? total > 0
        ? `Sugerido (${defaultDepositPercent} %): ${formatCents(percentOf(total, defaultDepositPercent))}`
        : null
      : depositAmountHint(depositText, total);

  // Contactos de la empresa ya vinculada (al editar o copiar una cotización).
  useEffect(() => {
    if (quote?.client && quote.client.kind !== "persona") {
      listClientContacts(quote.client.clientId)
        .then(setContacts)
        .catch(() => setContacts([]));
    }
  }, [quote?.client]);

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

  const clearClient = () => {
    setClient(null);
    setContacts([]);
    form.setValue("clientId", "", { shouldDirty: true });
    form.setValue("contactId", null);
  };

  const toggleWhatsapp = (on: boolean) => {
    quoteMode.current = on;
    setViaWhatsapp(on);
    form.clearErrors();
    // La cotización siempre es normal.
    if (on) form.setValue("kind", "normal");
    // Sin permiso, la restauración no lleva el precio cotizado (D58).
    if (!on && !canSetPrice) {
      (form.getValues("pieces") ?? []).forEach((_, i) =>
        form.setValue(`pieces.${i}.price`, ""),
      );
    }
  };

  /**
   * Interna u observada (confirmado en el diálogo): sin cobro, así que se limpian el
   * tipo de pago, el adelanto y los precios.
   */
  const applyKind = (kind: RestorationKind) => {
    form.setValue("kind", kind, { shouldDirty: true });
    if (kind !== "normal") {
      form.setValue("paymentType", "sin_definir");
      form.setValue("depositAmount", "");
      form.setValue("depositMethodId", "");
      (form.getValues("pieces") ?? []).forEach((_, i) =>
        form.setValue(`pieces.${i}.price`, ""),
      );
    }
    form.clearErrors();
  };

  /** Elegir o quitar una pieza cotizada en la copia. */
  const toggleItem = (item: QuoteItemForForm, on: boolean) => {
    const index = (form.getValues("pieces") ?? []).findIndex(
      (p) => p.quoteItemId === item.id,
    );
    if (on && index < 0) pieces.append(copyPiece(item));
    if (!on && index >= 0) pieces.remove(index);
  };

  const onSubmit = form.handleSubmit(() => {
    if (pending) return;
    setError(null);
    const input = form.getValues();
    // La cotización no lleva pago: sin tipo elegido ni adelanto.
    if (viaWhatsapp) {
      input.paymentType = "sin_definir";
      input.depositAmount = "";
      input.depositPercent = "";
      input.kind = "normal";
    }
    // Interna u observada: sin cobro ni precios (la BD también los ignora).
    if (input.kind !== "normal") {
      input.paymentType = "sin_definir";
      input.depositAmount = "";
      input.depositMethodId = "";
      input.pieces = input.pieces.map((p) => ({ ...p, price: "" }));
    }
    startTransition(async () => {
      if (mode.kind === "copia") {
        const result = await createRestorationFromQuote(
          mode.quote.id,
          input as RestorationFormInput,
        );
        if ("error" in result) return setError(result.error);
        setSaved(true);
        router.push(createdUrl(result));
      } else if (mode.kind === "editar-cotizacion") {
        const result = await updateWhatsappQuote(
          mode.quote.id,
          input as unknown as WhatsappQuoteFormInput,
        );
        if ("error" in result) return setError(result.error);
        setSaved(true);
        router.push(`/cotizaciones-whatsapp/${mode.quote.id}`);
      } else if (viaWhatsapp) {
        const result = await createWhatsappQuote(
          input as unknown as WhatsappQuoteFormInput,
        );
        if ("error" in result) return setError(result.error);
        setSaved(true);
        router.push(`/cotizaciones-whatsapp/${result.id}?registrada=1`);
      } else {
        const result = await createRestoration(input as RestorationFormInput);
        if ("error" in result) return setError(result.error);
        setSaved(true);
        router.push(createdUrl(result));
      }
    });
  });

  const clientError = form.formState.errors.clientId?.message;
  const piecesError =
    form.formState.errors.pieces?.root?.message ??
    form.formState.errors.pieces?.message;
  // En la copia, si la cotización ya tiene cliente, ese es el cliente (P46).
  const clientFixed = mode.kind === "copia" && Boolean(quote?.client);
  const chosenItems = new Set(
    (values.pieces ?? []).map((p) => p?.quoteItemId).filter(Boolean),
  );
  const submitLabel =
    mode.kind === "copia"
      ? "Crear restauración"
      : mode.kind === "editar-cotizacion"
        ? "Guardar cotización"
        : viaWhatsapp
          ? "Registrar cotización"
          : "Registrar restauración";

  return (
    <Form {...form}>
      {/* El formulario es la guía: va sobre su fondo y sus piezas en blanco. */}
      <form
        onSubmit={onSubmit}
        className={cn(GUIDE_SURFACE_CLASS, "space-y-6")}
        noValidate
      >
        {error ? <FormAlert>{error}</FormAlert> : null}

        {mode.kind === "nueva" ? (
          // Opciones de registro en una sola fila; la explicación va en el ícono (i).
          <TooltipProvider>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-3 py-2">
              <OptionCheckbox
                checked={viaWhatsapp}
                onChange={toggleWhatsapp}
                info="Se registra como cotización (sin cliente obligatorio). Cuando el cliente confirme qué piezas quiere, se crea la restauración."
              >
                <WhatsAppIcon className="text-whatsapp-strong size-4" />
                El pedido vino por WhatsApp
              </OptionCheckbox>
              {!viaWhatsapp && canSetKind ? (
                <fieldset className="contents" data-testid="tipo-de-guia">
                  <legend className="sr-only">Tipo de guía</legend>
                  {(["interno", "observado"] as const).map((k) => (
                    <OptionCheckbox
                      key={k}
                      checked={guideKind === k}
                      // Excluyentes: marcar una desmarca la otra (con confirmación).
                      onChange={(on) =>
                        on ? setPendingKind(k) : applyKind("normal")
                      }
                      info={KIND_SHORT_DESCRIPTIONS[k]}
                    >
                      Guía {RESTORATION_KIND_LABELS[k].toLowerCase()}
                    </OptionCheckbox>
                  ))}
                </fieldset>
              ) : null}
            </div>
            <RestorationKindConfirmDialog
              kind={pendingKind}
              onCancel={() => setPendingKind(null)}
              onConfirm={() => {
                if (pendingKind) applyKind(pendingKind);
                setPendingKind(null);
              }}
            />
          </TooltipProvider>
        ) : null}

        <section className="space-y-4" aria-labelledby="datos-cliente">
          <h2 id="datos-cliente" className="text-heading text-lg font-semibold">
            Cliente
          </h2>
          {clientFixed ? (
            <p className="text-sm" data-testid="cliente-fijo">
              {client?.name}
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="cliente">
                {viaWhatsapp ? "Cliente (opcional)" : "Cliente"}
              </Label>
              <ClientPicker
                id="cliente"
                value={client}
                onSelect={chooseClient}
                canCreate
                createPrefill={
                  quote
                    ? { name: quote.customerName, phone: quote.customerPhone }
                    : {
                        name: values.customerName ?? "",
                        phone: values.customerPhone ?? "",
                      }
                }
              />
              {viaWhatsapp && client ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={clearClient}
                >
                  Quitar cliente
                </Button>
              ) : null}
              {clientError ? (
                <p className="text-destructive text-sm">{clientError}</p>
              ) : null}
            </div>
          )}
          {viaWhatsapp && !client ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                form={form}
                name="customerName"
                label="Nombre (opcional)"
              />
              <TextField
                form={form}
                name="customerPhone"
                label="Teléfono (opcional)"
                inputMode="tel"
              />
            </div>
          ) : null}
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

        {mode.kind === "copia" ? (
          <section className="space-y-3" aria-labelledby="piezas-cotizadas">
            <h2
              id="piezas-cotizadas"
              className="text-heading text-lg font-semibold"
            >
              Piezas de la cotización {mode.quote.code}
            </h2>
            <p className="text-muted-foreground text-sm">
              Elige las que el cliente pidió y, en cada pieza, si pasa a
              Consulta o Aprobada.{" "}
              {canSetPrice
                ? "Puedes ajustar el precio o agregar piezas nuevas abajo."
                : "Las piezas pedidas conservan el precio cotizado; las nuevas quedan sin precio de venta hasta que lo asigne el administrador."}
            </p>
            <ul className="bg-card divide-y rounded-lg border">
              {mode.quote.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 p-3">
                  <input
                    type="checkbox"
                    className="accent-primary mt-0.5 size-4"
                    aria-label={`Pedir ${item.piece.description}`}
                    checked={!item.orderedIn && chosenItems.has(item.id)}
                    disabled={Boolean(item.orderedIn)}
                    onChange={(e) => toggleItem(item, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words">
                      {item.number}. {item.piece.description}
                    </p>
                    {item.orderedIn ? (
                      <p className="text-muted-foreground text-xs">
                        Pedida en {item.orderedIn}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {item.priceLabel}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-3" aria-labelledby="piezas">
          <div className="flex items-center justify-between gap-2">
            <h2 id="piezas" className="text-heading text-lg font-semibold">
              {mode.kind === "copia" ? "Piezas de la restauración" : "Piezas"}
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
                quoteOnly={viaWhatsapp}
                showInitialStatus={mode.kind === "copia"}
                canSetPrice={canSetPrice}
                canAssignWorkshop={canAssignWorkshop}
                guideKind={guideKind}
                onDuplicate={() => {
                  const copy = structuredClone(
                    form.getValues(`pieces.${index}`),
                  );
                  pieces.insert(index + 1, {
                    ...copy,
                    // Una pieza nueva no trae precio cotizado (D58).
                    price: viaWhatsapp || canSetPrice ? copy.price : "",
                    quoteItemId: null,
                  });
                }}
                onRemove={() => pieces.remove(index)}
              />
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              pieces.append(
                newPiece(
                  materials,
                  services,
                  mode.kind === "copia" ? EMPTY_COPY_PIECE : EMPTY_PIECE,
                ),
              )
            }
            disabled={pieces.fields.length >= MAX_PIECES}
          >
            <Plus />
            Agregar pieza
          </Button>
        </section>

        {viaWhatsapp || !charged ? (
          <section className="space-y-4" aria-labelledby="notas">
            <h2 id="notas" className="sr-only">
              Notas generales
            </h2>
            <TextField
              form={form}
              name="notes"
              label="Notas generales"
              multiline
            />
          </section>
        ) : (
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
                <div className="space-y-1">
                  <TextField
                    form={form}
                    name="depositAmount"
                    label="Adelanto (S/) (opcional)"
                    inputMode="numeric"
                  />
                  {depositHint ? (
                    <p
                      className="text-muted-foreground text-xs"
                      data-testid="adelanto-porcentaje"
                    >
                      {depositHint}
                    </p>
                  ) : null}
                  {depositLiveError && !form.formState.errors.depositAmount ? (
                    <p className="text-destructive text-xs" role="alert">
                      {depositLiveError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {withDeposit ? (
                <FormField
                  control={form.control}
                  name="depositMethodId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método del adelanto</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Elige el método" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {paymentMethods.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-muted-foreground text-xs">
                        El adelanto se registra como pago al guardar.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </div>
            <TextField
              form={form}
              name="notes"
              label="Notas generales"
              multiline
            />
          </section>
        )}

        <div className="bg-background sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:mx-0 sm:rounded-lg sm:border">
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {!charged ? (
              <div>
                <dt className="text-muted-foreground text-xs">
                  Guía {RESTORATION_KIND_LABELS[guideKind].toLowerCase()}
                </dt>
                <dd className="font-semibold" data-testid="sin-cobro">
                  Sin cobro
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-muted-foreground text-xs">Total</dt>
                <dd
                  className="text-heading font-semibold tabular-nums"
                  data-testid="total-en-vivo"
                >
                  {formatCents(total)}
                </dd>
              </div>
            )}
            {viaWhatsapp || !charged ? null : (
              <div>
                <dt className="text-muted-foreground text-xs">Adelanto</dt>
                <dd className="tabular-nums" data-testid="adelanto-en-vivo">
                  {deposit === null ? "—" : formatCents(deposit)}
                </dd>
              </div>
            )}
          </dl>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

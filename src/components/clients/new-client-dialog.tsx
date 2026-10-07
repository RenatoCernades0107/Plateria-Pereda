"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_REGION, PERU_REGIONS } from "@/domain/regions";
import {
  companySchema,
  personSchema,
  type ClientFormInput,
  type CompanyFormInput,
  type PersonFormInput,
} from "@/lib/validation/clients";
import { createClient } from "@/server/clients/actions";

import { DocumentTypeField, TextField } from "./form-fields";
import { PhoneField } from "./phone-field";

/** Datos ya anotados (p. ej., en una cotización de WhatsApp) para no volver a escribirlos. */
export type ClientPrefill = { name: string; phone: string };

/** Separa "Ana María Pérez" en nombres ("Ana María") y apellido ("Pérez"). */
export function splitName(name: string): {
  firstName: string;
  lastName: string;
} {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstName: words[0] ?? "", lastName: "" };
  return {
    firstName: words.slice(0, -1).join(" "),
    lastName: words.at(-1)!,
  };
}

export type CreatedClient = {
  id: string;
  displayName: string;
  kind: "persona" | "empresa";
};

const PERSON_DEFAULTS: PersonFormInput = {
  kind: "persona",
  firstName: "",
  lastName: "",
  document: { documentType: null, documentNumber: "" },
  phone: "",
  email: "",
  address: "",
  notes: "",
};

const COMPANY_DEFAULTS: CompanyFormInput = {
  kind: "empresa",
  legalName: "",
  ruc: "",
  city: "Lima",
  region: DEFAULT_REGION,
  phone: "",
  email: "",
  address: "",
  notes: "",
};

/** Guarda los datos validados; devuelve un mensaje de error o null si salió bien. */
export type SaveClient = (input: ClientFormInput) => Promise<string | null>;

function useClientForm<T extends ClientFormInput>(
  schema: typeof personSchema | typeof companySchema,
  defaults: T,
  save: SaveClient,
  resetAfterSave: boolean,
) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<T>({
    // Se valida con el esquema; la acción vuelve a validar y normaliza.
    resolver: zodResolver(schema as never),
    defaultValues: defaults as never,
  });
  const onSubmit = form.handleSubmit(() => {
    setError(null);
    const input = form.getValues() as ClientFormInput;
    startTransition(async () => {
      const message = await save(input);
      if (message) {
        setError(message);
        return;
      }
      if (resetAfterSave) form.reset(defaults as never);
    });
  });
  return { form, error, pending, onSubmit };
}

type FormProps<T> = {
  save: SaveClient;
  defaults?: T;
  submitLabel?: string;
  resetAfterSave?: boolean;
};

export function PersonForm({
  save,
  defaults = PERSON_DEFAULTS,
  submitLabel = "Registrar persona",
  resetAfterSave = true,
}: FormProps<PersonFormInput>) {
  const { form, error, pending, onSubmit } = useClientForm(
    personSchema,
    defaults,
    save,
    resetAfterSave,
  );
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="firstName" label="Nombres" />
          <TextField form={form} name="lastName" label="Apellidos" />
          <DocumentTypeField form={form} name="document.documentType" />
          <TextField
            form={form}
            name="document.documentNumber"
            label="Número de documento"
          />
          <PhoneField form={form} name="phone" />
          <TextField
            form={form}
            name="email"
            label="Email"
            type="email"
            inputMode="email"
          />
        </div>
        <TextField form={form} name="address" label="Dirección" />
        <TextField form={form} name="notes" label="Notas" multiline />
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function CompanyForm({
  save,
  defaults = COMPANY_DEFAULTS,
  submitLabel = "Registrar empresa",
  resetAfterSave = true,
}: FormProps<CompanyFormInput>) {
  const { form, error, pending, onSubmit } = useClientForm(
    companySchema,
    defaults,
    save,
    resetAfterSave,
  );
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField form={form} name="legalName" label="Razón social" />
          </div>
          <TextField form={form} name="ruc" label="RUC" inputMode="numeric" />
          <PhoneField form={form} name="phone" />
          <TextField
            form={form}
            name="email"
            label="Email"
            type="email"
            inputMode="email"
          />
          <TextField form={form} name="city" label="Ciudad" />
          <FormField
            control={form.control}
            name="region"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Región</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PERU_REGIONS.map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <TextField form={form} name="address" label="Dirección" />
        <TextField form={form} name="notes" label="Notas" multiline />
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/**
 * Registro de una persona o empresa. Se reutiliza desde cualquier formulario (p. ej.
 * el de restauraciones): `onCreated` recibe el cliente recién creado.
 */
export function NewClientDialog({
  trigger,
  onCreated,
  open: controlledOpen,
  onOpenChange,
  prefill,
}: {
  /** Botón que abre el diálogo; `null` para abrirlo solo desde afuera (`open`). */
  trigger?: React.ReactNode | null;
  onCreated?: (client: CreatedClient) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Nombre y teléfono ya anotados: se proponen en el formulario. */
  prefill?: ClientPrefill | null;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const save: SaveClient = async (input) => {
    const result = await createClient(input);
    if ("error" in result) return result.error;
    toast.success(
      `${result.displayName} registrado. Se está enviando a Shopify.`,
    );
    setOpen(false);
    onCreated?.({
      id: result.id,
      displayName: result.displayName,
      kind: result.kind,
    });
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === null ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <UserPlus />
              Nuevo cliente
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Se registra en el sistema y se crea en Shopify automáticamente.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="persona">
          <TabsList className="w-full">
            <TabsTrigger value="persona">Persona</TabsTrigger>
            <TabsTrigger value="empresa">Empresa</TabsTrigger>
          </TabsList>
          <TabsContent value="persona">
            <PersonForm
              save={save}
              defaults={
                prefill
                  ? {
                      ...PERSON_DEFAULTS,
                      ...splitName(prefill.name),
                      phone: prefill.phone,
                    }
                  : undefined
              }
            />
          </TabsContent>
          <TabsContent value="empresa">
            <CompanyForm
              save={save}
              defaults={
                prefill
                  ? {
                      ...COMPANY_DEFAULTS,
                      legalName: prefill.name.trim(),
                      phone: prefill.phone,
                    }
                  : undefined
              }
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_LABELS, PERSON_DOCUMENT_TYPES } from "@/domain/documents";
import { DEFAULT_REGION, PERU_REGIONS } from "@/domain/regions";
import {
  companySchema,
  personSchema,
  type ClientFormInput,
  type CompanyFormInput,
  type PersonFormInput,
} from "@/lib/validation/clients";
import { createClient } from "@/server/clients/actions";

export type CreatedClient = {
  id: string;
  displayName: string;
  kind: "persona" | "empresa";
};

const NO_DOCUMENT = "ninguno";

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

function TextField<T extends ClientFormInput>({
  form,
  name,
  label,
  type = "text",
  inputMode,
  multiline = false,
}: {
  form: UseFormReturn<T>;
  name: FieldPath<T>;
  label: string;
  type?: string;
  inputMode?: "numeric" | "tel" | "email";
  multiline?: boolean;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {multiline ? (
              <Textarea rows={2} {...field} value={String(field.value ?? "")} />
            ) : (
              <Input
                type={type}
                inputMode={inputMode}
                autoComplete="off"
                {...field}
                value={String(field.value ?? "")}
              />
            )}
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function useClientForm<T extends ClientFormInput>(
  schema: typeof personSchema | typeof companySchema,
  defaults: T,
  onCreated: (client: CreatedClient) => void,
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
      const result = await createClient(input);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      form.reset(defaults as never);
      onCreated({
        id: result.id,
        displayName: result.displayName,
        kind: result.kind,
      });
    });
  });
  return { form, error, pending, onSubmit };
}

function PersonForm({ onCreated }: { onCreated: (c: CreatedClient) => void }) {
  const { form, error, pending, onSubmit } = useClientForm(
    personSchema,
    PERSON_DEFAULTS,
    onCreated,
  );
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="firstName" label="Nombres" />
          <TextField form={form} name="lastName" label="Apellidos" />
          <FormField
            control={form.control}
            name="document.documentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de documento</FormLabel>
                <Select
                  value={field.value ?? NO_DOCUMENT}
                  onValueChange={(v) =>
                    field.onChange(v === NO_DOCUMENT ? null : v)
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_DOCUMENT}>Sin documento</SelectItem>
                    {PERSON_DOCUMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {DOCUMENT_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <TextField
            form={form}
            name="document.documentNumber"
            label="Número de documento"
          />
          <TextField
            form={form}
            name="phone"
            label="Teléfono"
            type="tel"
            inputMode="tel"
          />
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
            {pending ? "Guardando…" : "Registrar persona"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function CompanyForm({ onCreated }: { onCreated: (c: CreatedClient) => void }) {
  const { form, error, pending, onSubmit } = useClientForm(
    companySchema,
    COMPANY_DEFAULTS,
    onCreated,
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
          <TextField
            form={form}
            name="phone"
            label="Teléfono"
            type="tel"
            inputMode="tel"
          />
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
            {pending ? "Guardando…" : "Registrar empresa"}
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
}: {
  /** Botón que abre el diálogo; `null` para abrirlo solo desde afuera (`open`). */
  trigger?: React.ReactNode | null;
  onCreated?: (client: CreatedClient) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const handleCreated = (client: CreatedClient) => {
    toast.success(
      `${client.displayName} registrado. Se está enviando a Shopify.`,
    );
    setOpen(false);
    onCreated?.(client);
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
            <PersonForm onCreated={handleCreated} />
          </TabsContent>
          <TabsContent value="empresa">
            <CompanyForm onCreated={handleCreated} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  WHATSAPP_PLACEHOLDERS,
} from "@/domain/whatsapp-template";
import {
  settingsSchema,
  type SettingsFormInput,
  type SettingsInput,
} from "@/lib/validation/settings";
import { updateSettings } from "@/server/settings-actions";

type TextField = {
  name: keyof SettingsFormInput;
  label: string;
  type?: string;
  inputMode?: "numeric" | "decimal";
  description?: string;
};

function TextFields({
  form,
  fields,
}: {
  form: ReturnType<typeof useForm<SettingsFormInput, unknown, SettingsInput>>;
  fields: TextField[];
}) {
  return fields.map((f) => (
    <FormField
      key={f.name}
      control={form.control}
      name={f.name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{f.label}</FormLabel>
          <FormControl>
            <Input
              type={f.type ?? "text"}
              inputMode={f.inputMode}
              {...field}
              value={field.value ?? ""}
            />
          </FormControl>
          {f.description ? (
            <FormDescription>{f.description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  ));
}

export function SettingsForm({
  defaultValues,
}: {
  defaultValues: SettingsFormInput;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<SettingsFormInput, unknown, SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await updateSettings(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      form.reset(values);
      toast.success("Configuración guardada.");
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}

        <Card>
          <CardHeader>
            <CardTitle>Datos de la empresa</CardTitle>
            <CardDescription>
              Aparecen en las cotizaciones en PDF.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <TextFields
              form={form}
              fields={[
                { name: "legalName", label: "Razón social" },
                { name: "ruc", label: "RUC", inputMode: "numeric" },
                { name: "address", label: "Dirección" },
                {
                  name: "phones",
                  label: "Teléfonos",
                  description: "Separa varios números con comas.",
                },
                { name: "email", label: "Email", type: "email" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restauraciones</CardTitle>
            <CardDescription>
              Valores que se proponen al aprobar una restauración y al enviar la
              cotización por WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs">
              <TextFields
                form={form}
                fields={[
                  {
                    name: "depositPercent",
                    label: "Adelanto por defecto (%)",
                    type: "number",
                    inputMode: "decimal",
                  },
                ]}
              />
            </div>
            <FormField
              control={form.control}
              name="whatsappTemplate"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FormLabel>Mensaje de cotización por WhatsApp</FormLabel>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() =>
                        form.setValue(
                          "whatsappTemplate",
                          DEFAULT_WHATSAPP_TEMPLATE,
                          { shouldDirty: true, shouldValidate: true },
                        )
                      }
                    >
                      Restaurar mensaje original
                    </Button>
                  </div>
                  <FormControl>
                    <Textarea rows={10} className="font-mono" {...field} />
                  </FormControl>
                  <FormDescription>
                    Escribe las variables entre llaves; se reemplazan al armar
                    el mensaje de cada restauración.
                  </FormDescription>
                  <ul className="text-muted-foreground grid gap-x-4 text-sm sm:grid-cols-2">
                    {Object.entries(WHATSAPP_PLACEHOLDERS).map(
                      ([name, help]) => (
                        <li key={name}>
                          <code className="text-foreground">{`{${name}}`}</code>{" "}
                          {help}
                        </li>
                      ),
                    )}
                  </ul>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cotizaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-xs">
              <TextFields
                form={form}
                fields={[
                  {
                    name: "quoteValidityDays",
                    label: "Vigencia por defecto (días)",
                    type: "number",
                    inputMode: "numeric",
                  },
                ]}
              />
            </div>
            <FormField
              control={form.control}
              name="terms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Términos y condiciones</FormLabel>
                  <FormControl>
                    <Textarea rows={6} {...field} />
                  </FormControl>
                  <FormDescription>
                    Tiempo de fabricación, formas de pago, cuentas bancarias,
                    etc.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

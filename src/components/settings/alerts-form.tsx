"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bell } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ALERT_DESCRIPTIONS,
  ALERT_GROUPS,
  ALERT_KINDS,
  ALERT_LABELS,
  ALERT_PLACEHOLDERS,
  ALERT_PREVIEW,
  ALERT_ROLES,
  DEFAULT_ALERT_TEMPLATES,
  renderAlert,
  type AlertKind,
} from "@/domain/alerts";
import { ROLE_LABELS } from "@/lib/roles";
import {
  alertSettingsSchema,
  type AlertSettingsInput,
} from "@/lib/validation/alerts";
import { updateAlertSettings } from "@/server/alerts-actions";
import type { AlertRecipient } from "@/server/alerts";

type FormControlType = Control<AlertSettingsInput>;

function Preview({
  control,
  index,
  kind,
}: {
  control: FormControlType;
  index: number;
  kind: AlertKind;
}) {
  const template = useWatch({ control, name: `alerts.${index}.template` });
  const alert = renderAlert({ kind, ...ALERT_PREVIEW[kind] }, template);
  return (
    <div className="bg-muted/40 rounded-md border p-3 text-sm">
      <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
        Vista previa
      </p>
      <p className="text-heading flex items-center gap-2 font-medium">
        <Bell className="size-4 shrink-0" aria-hidden />
        {alert.title}
      </p>
      <p className="text-muted-foreground mt-1">{alert.body}</p>
    </div>
  );
}

function AlertFields({
  control,
  index,
  kind,
  recipients,
  setTemplate,
}: {
  control: FormControlType;
  index: number;
  kind: AlertKind;
  recipients: AlertRecipient[];
  setTemplate: (value: string) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const enabled = useWatch({ control, name: `alerts.${index}.enabled` });
  const candidates = recipients.filter((r) =>
    ALERT_ROLES[kind].includes(r.role),
  );

  // Inserta la variable donde está el cursor (o al final).
  const insert = (name: string, current: string) => {
    const el = textarea.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    setTemplate(current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <section
      aria-labelledby={`alerta-${kind}`}
      className="space-y-4 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 id={`alerta-${kind}`} className="text-heading font-medium">
            {ALERT_LABELS[kind]}
          </h3>
          <p className="text-muted-foreground text-sm">
            {ALERT_DESCRIPTIONS[kind]}
          </p>
        </div>
        <FormField
          control={control}
          name={`alerts.${index}.enabled`}
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <input
                  type="checkbox"
                  className="accent-primary size-4"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormLabel className="font-normal">Activa</FormLabel>
            </FormItem>
          )}
        />
      </div>

      <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-60">
        <FormField
          control={control}
          name={`alerts.${index}.template`}
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <FormLabel>Mensaje</FormLabel>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setTemplate(DEFAULT_ALERT_TEMPLATES[kind])}
                >
                  Restaurar mensaje original
                </Button>
              </div>
              <FormControl>
                <Textarea
                  rows={3}
                  {...field}
                  ref={(el) => {
                    field.ref(el);
                    textarea.current = el;
                  }}
                />
              </FormControl>
              <FormDescription>
                Haz clic en una variable para insertarla. El título (código de
                la guía y nombre de la alerta) se pone solo.
              </FormDescription>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(ALERT_PLACEHOLDERS).map(([name, help]) => (
                  <Button
                    key={name}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 font-mono text-xs"
                    title={help}
                    aria-label={`Insertar {${name}}: ${help}`}
                    onClick={() => insert(name, field.value)}
                  >
                    {`{${name}}`}
                  </Button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Preview control={control} index={index} kind={kind} />

        <FormField
          control={control}
          name={`alerts.${index}.recipientIds`}
          render={({ field }) => (
            <FormItem>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Quiénes la reciben
                </legend>
                <p className="text-muted-foreground text-sm">
                  Usuarios de{" "}
                  {ALERT_ROLES[kind].map((r) => ROLE_LABELS[r]).join(" y ")}.
                  Quien hace el cambio no recibe su propia alerta.
                </p>
                {candidates.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No hay usuarios activos con esos roles.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {candidates.map((user) => (
                      <li key={user.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="accent-primary size-4"
                            checked={field.value.includes(user.id)}
                            onChange={(e) =>
                              field.onChange(
                                e.target.checked
                                  ? [...field.value, user.id]
                                  : field.value.filter((id) => id !== user.id),
                              )
                            }
                          />
                          <span>
                            {user.fullName}{" "}
                            <span className="text-muted-foreground">
                              · {ROLE_LABELS[user.role]}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              <FormMessage />
            </FormItem>
          )}
        />
      </fieldset>
    </section>
  );
}

export function AlertsForm({
  defaultValues,
  recipients,
}: {
  defaultValues: AlertSettingsInput;
  recipients: AlertRecipient[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<AlertSettingsInput>({
    resolver: zodResolver(alertSettingsSchema),
    defaultValues,
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await updateAlertSettings(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      form.reset(values);
      toast.success("Alertas guardadas.");
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}

        {ALERT_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>
                {group.description} Llegan a la campana del encabezado.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.kinds.map((kind) => {
                const index = ALERT_KINDS.indexOf(kind);
                return (
                  <AlertFields
                    key={kind}
                    control={form.control}
                    index={index}
                    kind={kind}
                    recipients={recipients}
                    setTemplate={(value) =>
                      form.setValue(`alerts.${index}.template`, value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                );
              })}
            </CardContent>
          </Card>
        ))}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

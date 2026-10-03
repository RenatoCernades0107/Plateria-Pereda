"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

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
import { recoverPasswordSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/server/auth-actions";

import { FormAlert } from "./form-alert";

export function RecoverPasswordForm() {
  const [result, setResult] = useState<{ ok: true } | { error: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(recoverPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => setResult(await requestPasswordReset(values)));
  });

  if (result && "ok" in result) {
    return (
      <FormAlert variant="info">
        Si el email está registrado, te enviamos un enlace para crear una nueva
        contraseña. Revisa tu bandeja de entrada.
      </FormAlert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {result && "error" in result ? (
          <FormAlert>{result.error}</FormAlert>
        ) : null}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Enviando…" : "Enviar enlace"}
        </Button>
      </form>
    </Form>
  );
}

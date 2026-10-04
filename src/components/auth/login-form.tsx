"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
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
import { loginSchema } from "@/lib/validation/auth";
import { login } from "@/server/auth-actions";

import { FormAlert } from "./form-alert";

export function LoginForm({
  next,
  notice,
}: {
  next?: string | null;
  notice?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await login(values, next);
      if (result && "error" in result) setError(result.error);
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {notice && !error ? (
          <FormAlert variant="info">{notice}</FormAlert>
        ) : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Contraseña</FormLabel>
                <Link
                  href="/recuperar-contrasena"
                  className="text-muted-foreground hover:text-brand-dark text-xs underline-offset-4 hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </Form>
  );
}

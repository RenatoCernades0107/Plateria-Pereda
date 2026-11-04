import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import { MENSAJE_INACTIVO } from "@/lib/auth/messages";

export const metadata: Metadata = { title: "Iniciar sesión" };

const NOTICES: Record<string, string> = {
  inactivo: MENSAJE_INACTIVO,
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, motivo } = await searchParams;
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-primary text-xs font-medium tracking-[0.2em] uppercase">
          Acceso al sistema
        </p>
        <h1 className="text-heading text-3xl font-semibold tracking-tight">
          Iniciar sesión
        </h1>
        <p className="text-muted-foreground text-sm">
          Ingresa con tu cuenta de Platería Pereda para continuar.
        </p>
      </header>
      <LoginForm
        next={typeof next === "string" ? next : null}
        notice={typeof motivo === "string" ? NOTICES[motivo] : undefined}
      />
      <p className="text-muted-foreground border-t pt-6 text-center text-xs">
        ¿Problemas para ingresar? Comunícate con el administrador del sistema.
      </p>
    </div>
  );
}

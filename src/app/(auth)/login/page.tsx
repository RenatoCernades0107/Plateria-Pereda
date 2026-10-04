import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MENSAJE_INACTIVO } from "@/lib/auth/messages";

export const metadata: Metadata = { title: "Iniciar sesión" };

const NOTICES: Record<string, string> = {
  inactivo: MENSAJE_INACTIVO,
  "enlace-invalido": "El enlace no es válido o ya venció. Pide uno nuevo.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, motivo } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading text-xl">Iniciar sesión</CardTitle>
        <CardDescription>
          Sistema de restauraciones y cotizaciones
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          next={typeof next === "string" ? next : null}
          notice={typeof motivo === "string" ? NOTICES[motivo] : undefined}
        />
      </CardContent>
    </Card>
  );
}

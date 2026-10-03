import type { Metadata } from "next";
import Link from "next/link";

import { RecoverPasswordForm } from "@/components/auth/recover-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-heading text-xl">
          Recuperar contraseña
        </CardTitle>
        <CardDescription>
          Te enviaremos un enlace para crear una nueva.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RecoverPasswordForm />
        <Link
          href="/login"
          className="text-muted-foreground hover:text-brand-dark block text-center text-sm underline-offset-4 hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </CardContent>
    </Card>
  );
}

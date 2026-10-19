"use client";

import { RefreshCw } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generatePassword } from "@/lib/password";

/** Contraseña visible (el admin se la pasa al usuario) con un botón para generar una. */
export function PasswordInput({
  onGenerate,
  ...props
}: ComponentProps<typeof Input> & { onGenerate: (password: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input
        type="text"
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
        {...props}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => onGenerate(generatePassword())}
      >
        <RefreshCw />
        Generar
      </Button>
    </div>
  );
}

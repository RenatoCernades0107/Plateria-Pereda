import { z } from "zod";

export const ROLES = ["admin", "ventas", "logistica"] as const;

export const roleSchema = z.enum(ROLES, { error: "Elige un rol" });

export const newUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Ingresa el nombre completo")
    .max(100, "Máximo 100 caracteres"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Ingresa un email válido")),
  role: roleSchema,
});
export type NewUserInput = z.infer<typeof newUserSchema>;

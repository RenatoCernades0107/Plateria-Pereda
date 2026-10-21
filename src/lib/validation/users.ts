import { z } from "zod";

export const ROLES = ["admin", "ventas", "logistica"] as const;

export const roleSchema = z.enum(ROLES, { error: "Elige un rol" });

export const userPasswordSchema = z
  .string()
  .min(8, "Debe tener al menos 8 caracteres")
  .max(72, "Máximo 72 caracteres");

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
  password: userPasswordSchema,
});
export type NewUserInput = z.infer<typeof newUserSchema>;

export const setPasswordSchema = z.object({ password: userPasswordSchema });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

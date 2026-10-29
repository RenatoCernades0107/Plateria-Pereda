import { z } from "zod";

/**
 * Las server actions son endpoints públicos: sus argumentos llegan del navegador y
 * pueden no ser lo que dice el tipo de TypeScript. Las que no reciben un formulario
 * (que ya tiene su esquema) validan sus argumentos sueltos con estos esquemas.
 */
export const INVALID_ARGS =
  "Datos inválidos. Recarga la página e intenta de nuevo.";

export const idArg = z.guid();
export const optionalIdArg = z.guid().nullable();
/** Las acciones masivas del kanban mueven a lo más unas cientos de piezas. */
export const idsArg = z.array(z.guid()).max(1000);
export const textArg = z.string().max(5000);
export const optionalTextArg = textArg.nullable();

/** `true` si los argumentos cumplen la tupla de esquemas. */
export function validArgs(
  schemas: [z.ZodType, ...z.ZodType[]],
  args: unknown[],
): boolean {
  return z.tuple(schemas).safeParse(args).success;
}

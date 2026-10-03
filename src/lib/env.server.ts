import "server-only";

import { parseServerEnv, type ServerEnv } from "./env";

let cachedServerEnv: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}

import type { TestProject } from "vitest/node";

import { readLocalSupabaseEnv } from "../support/supabase-local";

declare module "vitest" {
  export interface ProvidedContext {
    supabaseEnv: Record<string, string>;
  }
}

export default function setup(project: TestProject) {
  project.provide("supabaseEnv", readLocalSupabaseEnv());
}

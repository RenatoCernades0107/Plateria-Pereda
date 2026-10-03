import { describe, expect, it } from "vitest";

import type { AppRole } from "@/lib/roles";

import {
  ALL_PERMISSIONS,
  can,
  homePathFor,
  type Permission,
} from "./permissions";

// Matriz esperada, escrita aparte del código: si alguien cambia un permiso, este test lo detecta.
const A = "admin";
const V = "ventas";
const L = "logistica";
const ESPERADO: Record<Permission, AppRole[]> = {
  "restauraciones.ver": [A, V, L],
  "restauraciones.editar": [A, V],
  "restauraciones.ver-pasadas": [A, V],
  "dinero.ver": [A, V],
  "pagos.registrar": [A, V],
  "pagos.corregir": [A],
  "piezas.consultar-aprobar-anular": [A, V],
  "piezas.marcar-llegada": [A, V, L],
  "piezas.enviar-recibir-taller": [A, L],
  "piezas.asignar-taller": [A, V, L],
  "piezas.entregar-observar": [A, V, L],
  "fotos.subir": [A, V, L],
  "fotos.eliminar-ajenas": [A],
  "talleres.gestionar": [A, L],
  "clientes.ver": [A, V, L],
  "clientes.editar": [A, V],
  "cotizador.usar": [A, V],
  "dashboard.ver": [A, V],
  "historial.ver": [A, V],
  "usuarios.gestionar": [A],
  "configuracion.gestionar": [A],
  "auditoria.ver": [A],
};

const ROLES: AppRole[] = [A, V, L];

describe("matriz de permisos", () => {
  it("cubre exactamente las acciones esperadas", () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual(Object.keys(ESPERADO).sort());
  });

  const casos = ALL_PERMISSIONS.flatMap((permission) =>
    ROLES.map(
      (role) =>
        [permission, role, ESPERADO[permission].includes(role)] as const,
    ),
  );

  it.each(casos)("%s para %s → %s", (permission, role, permitido) => {
    expect(can(role, permission)).toBe(permitido);
  });

  it("logística no ve precios, pagos, métricas ni historial", () => {
    for (const permission of [
      "dinero.ver",
      "pagos.registrar",
      "dashboard.ver",
      "historial.ver",
    ] as const) {
      expect(can(L, permission)).toBe(false);
    }
  });
});

describe("homePathFor", () => {
  it("lleva a cada rol a su primera pantalla", () => {
    expect(homePathFor(A)).toBe("/dashboard");
    expect(homePathFor(V)).toBe("/dashboard");
    expect(homePathFor(L)).toBe("/piezas");
  });
});

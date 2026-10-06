import type { AppRole } from "@/lib/roles";

/** Matriz de permisos acordada en Notas.md (P30 y P42). */
const PERMISSIONS = {
  "restauraciones.ver": ["admin", "ventas", "logistica"],
  "restauraciones.editar": ["admin", "ventas"],
  "restauraciones.ver-pasadas": ["admin", "ventas"],
  "dinero.ver": ["admin", "ventas"],
  "pagos.registrar": ["admin", "ventas"],
  "pagos.corregir": ["admin"],
  "piezas.consultar-aprobar-anular": ["admin", "ventas"],
  "piezas.marcar-llegada": ["admin", "ventas", "logistica"],
  "piezas.enviar-recibir-taller": ["admin", "logistica"],
  "piezas.asignar-taller": ["admin", "ventas", "logistica"],
  "piezas.entregar-observar": ["admin", "ventas", "logistica"],
  "fotos.subir": ["admin", "ventas", "logistica"],
  "fotos.eliminar-ajenas": ["admin"],
  "talleres.gestionar": ["admin", "logistica"],
  "clientes.ver": ["admin", "ventas", "logistica"],
  "clientes.editar": ["admin", "ventas"],
  "cotizador.usar": ["admin", "ventas"],
  /** Cotizaciones de restauración por WhatsApp (P46): logística no las ve. */
  "cotizaciones-whatsapp.usar": ["admin", "ventas"],
  "dashboard.ver": ["admin", "ventas"],
  "historial.ver": ["admin", "ventas"],
  "usuarios.gestionar": ["admin"],
  "configuracion.gestionar": ["admin"],
  "auditoria.ver": ["admin"],
} as const satisfies Record<string, readonly AppRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function can(role: AppRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AppRole[]).includes(role);
}

/** Primera pantalla de cada rol: logística no tiene dashboard y trabaja desde la vista de piezas. */
export function homePathFor(role: AppRole): string {
  return can(role, "dashboard.ver") ? "/dashboard" : "/piezas";
}

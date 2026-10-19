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
  /** Consulta → Espera respuesta cliente: también logística (2026-10-19). */
  "piezas.pasar-a-espera": ["admin", "ventas", "logistica"],
  "piezas.marcar-llegada": ["admin", "ventas", "logistica"],
  "piezas.enviar-recibir-taller": ["admin", "logistica"],
  /** Taller de la pieza: lo asignan o cambian logística y el admin (D60); ventas lo ve. */
  "piezas.asignar-taller": ["admin", "logistica"],
  /** Costo de servicio de la pieza: lo que cobra el taller (solo admin y logística). */
  "piezas.costo-servicio": ["admin", "logistica"],
  /**
   * Precio de venta de la pieza: lo asignan o cambian el admin (D58) y logística
   * (2026-10-19), también con motivo si la orden de Shopify ya existe; ventas lo ve.
   */
  "piezas.precio-venta": ["admin", "logistica"],
  /**
   * Ver el precio de venta de cada pieza. Logística lo ve (y lo edita), pero no los
   * totales, pagos, márgenes ni el PDF de la guía (eso sigue en `dinero.ver`).
   */
  "piezas.precio-venta.ver": ["admin", "ventas", "logistica"],
  /** Marca "Urgente" de las piezas (2026-10-19). */
  "piezas.marcar-urgente": ["admin", "ventas", "logistica"],
  "piezas.entregar-observar": ["admin", "ventas", "logistica"],
  "fotos.subir": ["admin", "ventas", "logistica"],
  "fotos.eliminar-ajenas": ["admin"],
  "talleres.gestionar": ["admin", "logistica"],
  /** PDF de la guía: lleva los datos del cliente, así que logística no lo exporta. */
  "guias.exportar-pdf": ["admin", "ventas"],
  /** Clientes y sus datos (nombre, teléfono, contactos): logística no los ve en ningún lado. */
  "clientes.ver": ["admin", "ventas"],
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

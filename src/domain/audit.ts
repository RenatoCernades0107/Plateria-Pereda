import { DOCUMENT_LABELS, type DocumentType } from "@/domain/documents";
import { PAYMENT_TYPE_LABELS, type PaymentType } from "@/domain/money";
import { formatPhone } from "@/domain/phone";
import {
  PIECE_STATUS_LABELS,
  type PieceStatus,
} from "@/domain/piece-state-machine";
import { PERU_REGIONS } from "@/domain/regions";
import {
  RESTORATION_STATUS_LABELS,
  type RestorationStatus,
} from "@/domain/restoration-status";
import { formatMoney } from "@/lib/format";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

export type AuditAction = "insert" | "update" | "delete";

/** Columnas cambiadas tal como las guarda audit.log_change(). */
export type AuditChanges = Record<string, { old?: unknown; new?: unknown }>;

type FieldDef = { label: string; format?: (value: unknown) => string };
type EntityDef = { label: string; fields: Record<string, FieldDef> };

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  insert: "Creación",
  update: "Edición",
  delete: "Eliminación",
};

/** Nombre de cada tabla auditada y de sus columnas, en el orden en que se muestran. */
export const AUDIT_ENTITIES: Record<string, EntityDef> = {
  profiles: {
    label: "Usuario",
    fields: {
      full_name: { label: "Nombre" },
      email: { label: "Email" },
      role: {
        label: "Rol",
        format: (value) => ROLE_LABELS[value as AppRole] ?? formatValue(value),
      },
      active: {
        label: "Estado",
        format: (value) => (value ? "Activo" : "Desactivado"),
      },
    },
  },
  workshops: {
    label: "Taller",
    fields: {
      name: { label: "Nombre" },
      contact_name: { label: "Contacto" },
      phone: { label: "Teléfono" },
      address: { label: "Dirección" },
      notes: { label: "Notas" },
      active: {
        label: "Estado",
        format: (value) => (value ? "Activo" : "Inactivo"),
      },
    },
  },
  materials: {
    label: "Material",
    fields: {
      name: { label: "Nombre" },
      active: {
        label: "Estado",
        format: (value) => (value ? "Activo" : "Inactivo"),
      },
    },
  },
  services: {
    label: "Servicio",
    fields: {
      name: { label: "Nombre" },
      suggested_price: {
        label: "Precio sugerido",
        format: (value) => formatMoney(Number(value)),
      },
      active: {
        label: "Estado",
        format: (value) => (value ? "Activo" : "Inactivo"),
      },
    },
  },
  payment_methods: {
    label: "Método de pago",
    fields: {
      name: { label: "Nombre" },
      active: {
        label: "Estado",
        format: (value) => (value ? "Activo" : "Inactivo"),
      },
    },
  },
  clients: {
    label: "Cliente",
    fields: {
      kind: {
        label: "Tipo",
        format: (value) => (value === "empresa" ? "Empresa" : "Persona"),
      },
      first_name: { label: "Nombres" },
      last_name: { label: "Apellidos" },
      legal_name: { label: "Razón social" },
      document_type: {
        label: "Tipo de documento",
        format: (value) =>
          DOCUMENT_LABELS[value as DocumentType] ?? formatValue(value),
      },
      document_number: { label: "Número de documento" },
      phone: {
        label: "Teléfono",
        format: (value) => formatPhone(String(value)),
      },
      email: { label: "Email" },
      address: { label: "Dirección" },
      city: { label: "Ciudad" },
      region: {
        label: "Región",
        format: (value) =>
          PERU_REGIONS.find((r) => r.code === value)?.name ??
          formatValue(value),
      },
      notes: { label: "Notas" },
      active: {
        label: "Estado",
        format: (value) => (value ? "Activo" : "Inactivo"),
      },
      shopify_customer_id: { label: "Cliente en Shopify" },
      shopify_company_id: { label: "Empresa en Shopify" },
      shopify_company_location_id: { label: "Ubicación en Shopify" },
    },
  },
  contacts: {
    label: "Contacto",
    fields: {
      client_id: { label: "Empresa" },
      first_name: { label: "Nombre" },
      last_name: { label: "Apellidos" },
      position: { label: "Cargo" },
      document_type: {
        label: "Tipo de documento",
        format: (value) =>
          DOCUMENT_LABELS[value as DocumentType] ?? formatValue(value),
      },
      document_number: { label: "Número de documento" },
      phone: {
        label: "Teléfono",
        format: (value) => formatPhone(String(value)),
      },
      email: { label: "Email" },
      active: {
        label: "Estado",
        format: (value) => (value ? "Activo" : "Inactivo"),
      },
      shopify_customer_id: { label: "Cliente en Shopify" },
      shopify_company_contact_id: { label: "Contacto en Shopify" },
    },
  },
  restorations: {
    label: "Restauración",
    fields: {
      code: { label: "Código" },
      client_id: { label: "Cliente" },
      contact_id: { label: "Contacto" },
      status: {
        label: "Estado",
        format: (value) =>
          RESTORATION_STATUS_LABELS[value as RestorationStatus] ??
          formatValue(value),
      },
      payment_type: {
        label: "Tipo de pago",
        format: (value) =>
          PAYMENT_TYPE_LABELS[value as PaymentType] ?? formatValue(value),
      },
      deposit_percent: { label: "Adelanto (%)" },
      total: { label: "Total", format: (value) => formatMoney(Number(value)) },
      paid: { label: "Pagado", format: (value) => formatMoney(Number(value)) },
      payment_status: { label: "Estado de pago" },
      notes: { label: "Notas" },
      shopify_order_id: { label: "Orden en Shopify" },
      shopify_order_name: { label: "Número de orden en Shopify" },
    },
  },
  pieces: {
    label: "Pieza",
    fields: {
      code: { label: "Código" },
      number: { label: "Número" },
      restoration_id: { label: "Restauración" },
      status: {
        label: "Estado",
        format: (value) =>
          PIECE_STATUS_LABELS[value as PieceStatus] ?? formatValue(value),
      },
      workshop_id: { label: "Taller" },
      description: { label: "Descripción" },
      measure: { label: "Medida" },
      material_id: { label: "Material (catálogo)" },
      material_name: { label: "Material" },
      service_id: { label: "Servicio (catálogo)" },
      service_name: { label: "Servicio" },
      weight_grams: { label: "Peso (g)" },
      price: { label: "Precio", format: (value) => formatMoney(Number(value)) },
      notes: { label: "Notas" },
      arrived_at: { label: "Llegada a tienda" },
      approved_at: { label: "Aprobada" },
      received_at: { label: "Recibida" },
      first_sent_at: { label: "Primer envío al taller" },
      last_returned_at: { label: "Última devolución del taller" },
      delivered_at: { label: "Entregada" },
      cancelled_at: { label: "Anulada" },
      shopify_line_item_id: { label: "Línea en Shopify" },
    },
  },
  settings: {
    label: "Configuración",
    fields: {
      legal_name: { label: "Razón social" },
      ruc: { label: "RUC" },
      address: { label: "Dirección" },
      phones: { label: "Teléfonos" },
      email: { label: "Email" },
      logo_path: { label: "Logo" },
      quote_validity_days: { label: "Vigencia de cotizaciones (días)" },
      deposit_percent: { label: "Adelanto por defecto (%)" },
      whatsapp_template: { label: "Plantilla de WhatsApp" },
      terms: { label: "Términos y condiciones" },
    },
  },
};

export const SYSTEM_ACTOR = "Sistema";

export function entityLabel(table: string): string {
  return AUDIT_ENTITIES[table]?.label ?? humanize(table);
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value)) return value.map(formatValue).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function humanize(column: string): string {
  const text = column.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Convierte el diff de un registro de auditoría en líneas legibles,
 * p. ej. "Taller: Taller A → Taller B".
 */
export function describeChanges(
  table: string,
  action: AuditAction,
  changes: AuditChanges,
): string[] {
  const fields = AUDIT_ENTITIES[table]?.fields ?? {};
  const known = Object.keys(fields).filter((key) => key in changes);
  const others = Object.keys(changes)
    .filter((key) => !(key in fields))
    .sort();

  return [...known, ...others].map((key) => {
    const field = fields[key];
    const label = field?.label ?? humanize(key);
    const format = (value: unknown) =>
      value === null || value === undefined
        ? "—"
        : (field?.format ?? formatValue)(value);
    const change = changes[key] ?? {};

    if (action === "insert") return `${label}: ${format(change.new)}`;
    if (action === "delete") return `${label}: ${format(change.old)}`;
    return `${label}: ${format(change.old)} → ${format(change.new)}`;
  });
}

/** Un registro del historial, listo para mostrar. */
export type AuditEntry = {
  id: number;
  occurredAt: string;
  /** Vacío cuando el cambio lo hizo el sistema (Shopify, tareas, semillas). */
  actorName: string | null;
  table: string;
  recordId: string;
  action: AuditAction;
  changes: AuditChanges;
};

import {
  ClipboardList,
  FileText,
  Gem,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import type { Permission } from "@/domain/permissions";

export type NavItem = {
  title: string;
  href: string;
  /** Un ícono de lucide o uno propio (p. ej., el de WhatsApp). */
  icon: ComponentType<{ className?: string }>;
  /** Clases del ícono, p. ej., el verde de WhatsApp. */
  iconClassName?: string;
  permission: Permission;
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.ver",
  },
  {
    title: "Restauraciones",
    href: "/restauraciones",
    icon: ClipboardList,
    permission: "restauraciones.ver",
  },
  {
    title: "Piezas",
    href: "/piezas",
    icon: Gem,
    permission: "restauraciones.ver",
  },
  {
    title: "Cotizaciones de WhatsApp",
    href: "/cotizaciones-whatsapp",
    icon: WhatsAppIcon,
    iconClassName: "text-whatsapp-strong",
    permission: "cotizaciones-whatsapp.usar",
  },
  {
    title: "Clientes",
    href: "/clientes",
    icon: Users,
    permission: "clientes.ver",
  },
  {
    title: "Cotizaciones",
    href: "/cotizaciones",
    icon: FileText,
    permission: "cotizador.usar",
  },
  {
    title: "Talleres",
    href: "/talleres",
    icon: Wrench,
    permission: "talleres.gestionar",
  },
  {
    title: "Usuarios",
    href: "/usuarios",
    icon: UserCog,
    permission: "usuarios.gestionar",
  },
  {
    title: "Auditoría",
    href: "/auditoria",
    icon: ShieldCheck,
    permission: "auditoria.ver",
  },
  {
    title: "Configuración",
    href: "/configuracion",
    icon: Settings,
    permission: "configuracion.gestionar",
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

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
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/domain/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
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

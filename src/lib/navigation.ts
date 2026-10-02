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

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Restauraciones", href: "/restauraciones", icon: ClipboardList },
  { title: "Piezas", href: "/piezas", icon: Gem },
  { title: "Clientes", href: "/clientes", icon: Users },
  { title: "Cotizaciones", href: "/cotizaciones", icon: FileText },
  { title: "Talleres", href: "/talleres", icon: Wrench },
  { title: "Usuarios", href: "/usuarios", icon: UserCog },
  { title: "Auditoría", href: "/auditoria", icon: ShieldCheck },
  { title: "Configuración", href: "/configuracion", icon: Settings },
];

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

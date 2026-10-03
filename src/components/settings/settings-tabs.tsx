"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CATALOGS } from "@/domain/catalogs";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/configuracion", title: "Empresa" },
  ...Object.values(CATALOGS).map(({ href, title }) => ({ href, title })),
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones de configuración"
      className="-mx-1 overflow-x-auto"
    >
      <ul className="bg-muted inline-flex min-w-max gap-1 rounded-lg p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-background text-heading shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

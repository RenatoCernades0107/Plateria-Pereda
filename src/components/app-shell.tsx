"use client";

import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { findNavItem, NAV_ITEMS } from "@/lib/navigation";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { logout } from "@/server/auth-actions";

export type ShellUser = { fullName: string; email: string; role: AppRole };

function AppNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const current = findNavItem(pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-md px-1 py-2"
          onClick={() => setOpenMobile(false)}
        >
          <Image
            src="/logo-simbolo.png"
            alt=""
            width={32}
            height={31}
            className="shrink-0"
            priority
          />
          <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-heading text-base font-semibold tracking-[0.2em]">
              PEREDA
            </span>
            <span className="text-muted-foreground text-xs">
              Platería · Joyería
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Navegación principal">
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={current?.href === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href} onClick={() => setOpenMobile(false)}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto flex-col items-end gap-0 px-2 py-1"
        >
          <span className="text-heading text-sm font-medium">
            {user.fullName}
          </span>
          <span className="text-muted-foreground text-xs">
            {ROLE_LABELS[user.role]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              Cerrar sesión
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppHeader({ user }: { user: ShellUser }) {
  const current = findNavItem(usePathname());

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" aria-label="Abrir o cerrar el menú" />
      <Separator
        orientation="vertical"
        className="mr-2 data-[orientation=vertical]:h-4"
      />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{current?.title ?? "Inicio"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </header>
  );
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: ShellUser;
}) {
  return (
    <SidebarProvider>
      <AppNav />
      <SidebarInset>
        <AppHeader user={user} />
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

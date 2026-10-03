"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { ROLES } from "@/lib/validation/users";
import {
  resendAccess,
  setUserActive,
  updateUserRole,
  type UserActionResult,
} from "@/server/users-actions";

export type UserRow = {
  id: string;
  fullName: string;
  email: string | null;
  role: AppRole;
  active: boolean;
};

function UserActions({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<UserActionResult>, success: string) => {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) toast.error(result.error);
      else toast.success(success);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      <Select
        value={user.role}
        disabled={isSelf || pending}
        onValueChange={(role) =>
          run(
            () => updateUserRole(user.id, role as AppRole),
            `${user.fullName} ahora es ${ROLE_LABELS[role as AppRole]}.`,
          )
        }
      >
        <SelectTrigger
          size="sm"
          className="w-36"
          aria-label={`Rol de ${user.fullName}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {ROLE_LABELS[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () => resendAccess(user.id),
            `Enviamos un enlace de acceso a ${user.email}.`,
          )
        }
      >
        Reenviar acceso
      </Button>
      <Button
        variant={user.active ? "outline" : "default"}
        size="sm"
        disabled={isSelf || pending}
        onClick={() =>
          run(
            () => setUserActive(user.id, !user.active),
            user.active
              ? `${user.fullName} fue desactivado.`
              : `${user.fullName} fue activado.`,
          )
        }
      >
        {user.active ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "secondary" : "outline"}>
      {active ? "Activo" : "Desactivado"}
    </Badge>
  );
}

function SelfTag({ show }: { show: boolean }) {
  return show ? (
    <span className="text-muted-foreground ml-2 text-xs">(tú)</span>
  ) : null;
}

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  return (
    <>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Rol y acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} data-testid={`usuario-${user.email}`}>
              <TableCell className="text-heading font-medium">
                {user.fullName}
                <SelfTag show={user.id === currentUserId} />
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <StatusBadge active={user.active} />
              </TableCell>
              <TableCell>
                <UserActions user={user} isSelf={user.id === currentUserId} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="space-y-3 md:hidden" aria-label="Usuarios">
        {users.map((user) => (
          <li
            key={user.id}
            className="space-y-3 rounded-lg border p-4"
            data-testid={`usuario-movil-${user.email}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-heading font-medium">
                  {user.fullName}
                  <SelfTag show={user.id === currentUserId} />
                </p>
                <p className="text-muted-foreground truncate text-sm">
                  {user.email}
                </p>
              </div>
              <StatusBadge active={user.active} />
            </div>
            <UserActions user={user} isSelf={user.id === currentUserId} />
          </li>
        ))}
      </ul>
    </>
  );
}

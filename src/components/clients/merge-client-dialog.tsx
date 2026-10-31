"use client";

import { Merge, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { reasonsLabel, type SimilarClient } from "@/domain/client-duplicates";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { formatPhone } from "@/domain/phone";
import { findDuplicatesOf, mergeClients } from "@/server/clients/actions";
import { searchClients } from "@/server/clients/search-actions";

/** Un cliente que se puede elegir como duplicado (de las sugerencias o del buscador). */
type Candidate = Omit<SimilarClient, "kind">;

function details(c: Candidate): string {
  return [
    c.documentType && `${DOCUMENT_LABELS[c.documentType]} ${c.documentNumber}`,
    c.phone && formatPhone(c.phone),
    c.email,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Fusión de dos personas duplicadas (solo admin), desde la ficha de la que se queda:
 * se elige el duplicado (sugeridos por nombre, documento, teléfono o email, o buscando)
 * y, tras confirmar, sus guías y cotizaciones pasan a este cliente.
 */
export function MergeClientDialog({
  client,
}: {
  client: { id: string; displayName: string };
}) {
  const [open, setOpen] = useState(false);
  const [suggested, setSuggested] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState("");
  // Resultados del buscador, con el texto que se buscó.
  const [results, setResults] = useState<{
    text: string;
    list: Candidate[];
  } | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    findDuplicatesOf(client.id).then((list) => {
      if (!cancelled) setSuggested(list.filter((c) => c.kind === "persona"));
    });
    return () => {
      cancelled = true;
    };
  }, [open, client.id]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchClients(text).then(({ options }) => {
        if (cancelled) return;
        setResults({
          text,
          list: options.flatMap((o): Candidate[] =>
            o.source === "local" &&
            o.kind === "persona" &&
            o.clientId !== client.id
              ? [
                  {
                    id: o.clientId,
                    name: o.name,
                    documentType: o.documentType,
                    documentNumber: o.documentNumber,
                    phone: o.phone,
                    email: o.email,
                    reasons: [],
                  },
                ]
              : [],
          ),
        });
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, client.id]);

  const change = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setSuggested(null);
      setQuery("");
      setResults(null);
      setChosen(null);
    }
  };

  const merge = () =>
    startTransition(async () => {
      if (!chosen) return;
      const result = await mergeClients(client.id, chosen.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(result.summary);
      change(false);
    });

  const text = query.trim();
  const searching = text.length >= 2;
  const found = searching && results?.text === text ? results.list : null;
  const list = searching ? (found ?? []) : (suggested ?? []);

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Merge />
          Fusionar duplicado
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Fusionar con un cliente duplicado</DialogTitle>
          <DialogDescription>
            {client.displayName} se queda. Elige el registro que sobra: sus
            guías y cotizaciones pasan a {client.displayName} y el duplicado
            queda desactivado.
          </DialogDescription>
        </DialogHeader>

        {chosen ? (
          <div className="space-y-3 text-sm">
            <p>
              Vas a fusionar <strong>{chosen.name}</strong>
              {details(chosen) ? ` (${details(chosen)})` : ""} en{" "}
              <strong>{client.displayName}</strong>:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Sus guías, cotizaciones y cotizaciones de WhatsApp pasan a{" "}
                {client.displayName}.
              </li>
              <li>
                El duplicado queda desactivado, con una nota que dice en quién
                se fusionó.
              </li>
              <li>
                Si {client.displayName} no tiene documento, toma el del
                duplicado.
              </li>
              <li>
                El teléfono y el email del duplicado quedan anotados en las
                notas de {client.displayName}. No se copian solos: en Shopify
                todavía los tiene la ficha del duplicado y chocarían.
              </li>
              <li>
                En Shopify no se borra nada: las dos fichas siguen allí con su
                historial. Si quieres pasarle ese teléfono o email, primero
                quítaselo a la ficha del duplicado en Shopify y luego edita{" "}
                {client.displayName} aquí.
              </li>
            </ul>
            <p className="text-muted-foreground">
              No se puede deshacer desde el sistema.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setChosen(null)}
              >
                Volver
              </Button>
              <Button variant="destructive" disabled={pending} onClick={merge}>
                {pending ? "Fusionando…" : "Fusionar"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search
                className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar otro cliente por nombre, documento o teléfono…"
                aria-label="Buscar el cliente duplicado"
                className="pl-8"
              />
            </div>
            <p className="text-muted-foreground text-sm">
              {searching
                ? found === null
                  ? "Buscando…"
                  : "Resultados de la búsqueda (solo personas):"
                : suggested === null
                  ? "Buscando posibles duplicados…"
                  : suggested.length > 0
                    ? "Posibles duplicados (mismo nombre, documento, teléfono o email):"
                    : "No encontramos duplicados parecidos. Búscalo arriba."}
            </p>
            <ul className="space-y-2">
              {list.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium break-words">
                      {c.name}
                    </span>
                    {details(c) ? (
                      <span className="text-muted-foreground block text-xs break-words">
                        {details(c)}
                      </span>
                    ) : null}
                    {c.reasons.length > 0 ? (
                      <Badge variant="outline">{reasonsLabel(c.reasons)}</Badge>
                    ) : null}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChosen(c)}
                  >
                    Elegir
                  </Button>
                </li>
              ))}
              {found !== null && found.length === 0 ? (
                <li className="text-muted-foreground text-sm">
                  Ninguna persona coincide.
                </li>
              ) : null}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

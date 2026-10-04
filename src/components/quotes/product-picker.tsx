"use client";

import { ArrowLeft, Loader2, Package, PencilLine, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toCents, formatCents } from "@/domain/money";
import {
  freeLine,
  lineFromCatalog,
  variantName,
  type CatalogProduct,
  type QuoteLineDraft,
} from "@/domain/quote-line";
import {
  getCatalogProduct,
  searchCatalog,
} from "@/server/quotes/catalog-actions";
import type { ShopifyProductSummary } from "@/server/shopify/types";

const price = (amount: string) => formatCents(toCents(Number(amount)));

function priceRange(product: ShopifyProductSummary): string {
  return product.minPrice === product.maxPrice
    ? price(product.minPrice)
    : `${price(product.minPrice)} – ${price(product.maxPrice)}`;
}

function Thumbnail({ url, alt }: { url: string | null; alt: string }) {
  return url ? (
    // Imágenes del CDN de Shopify; next/image necesitaría configurar su dominio.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="size-10 shrink-0 rounded border object-cover"
    />
  ) : (
    <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded border">
      <Package className="size-4" aria-hidden />
    </span>
  );
}

/**
 * Agrega líneas a la cotización: busca en el catálogo de Shopify (título o SKU), deja
 * elegir la variante y crea la línea con el precio del catálogo. También permite
 * una línea libre, sin producto del catálogo (P37).
 */
export function ProductPicker({
  onSelect,
}: {
  onSelect: (line: QuoteLineDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShopifyProductSummary[]>([]);
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState<"search" | "product" | null>(null);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    request.current += 1;
    if (timer.current) clearTimeout(timer.current);
    setQuery("");
    setResults([]);
    setProduct(null);
    setLoading(null);
  };

  const finish = (line: QuoteLineDraft) => {
    onSelect(line);
    setOpen(false);
    reset();
  };

  // Búsqueda con espera (debounce) de 300 ms; se ignoran las respuestas viejas.
  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const current = ++request.current;
    if (value.trim().length < 2) {
      setResults([]);
      setLoading(null);
      return;
    }
    setLoading("search");
    timer.current = setTimeout(async () => {
      const result = await searchCatalog(value).catch(() => null);
      if (current !== request.current) return;
      setLoading(null);
      if (!result || "error" in result) {
        toast.error(result?.error ?? "No se pudo buscar. Intenta de nuevo.");
        setResults([]);
        return;
      }
      setResults(result.products);
    }, 300);
  };

  const chooseProduct = async (summary: ShopifyProductSummary) => {
    const current = ++request.current;
    setLoading("product");
    const result = await getCatalogProduct(summary.id).catch(() => null);
    if (current !== request.current) return;
    setLoading(null);
    if (!result || "error" in result) {
      toast.error(result?.error ?? "No se pudo leer el producto.");
      return;
    }
    const { product: loaded } = result;
    if (loaded.variants.length === 1) {
      finish(lineFromCatalog(loaded, loaded.variants[0]!));
    } else if (loaded.variants.length === 0) {
      toast.error("El producto no tiene variantes a la venta.");
    } else {
      setProduct(loaded);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Plus aria-hidden />
          Agregar producto
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
        align="start"
      >
        {product ? (
          <Command shouldFilter={false}>
            <div className="flex items-center gap-2 border-b p-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Volver a los resultados"
                onClick={() => setProduct(null)}
              >
                <ArrowLeft aria-hidden />
              </Button>
              <span className="text-heading truncate text-sm font-medium">
                {product.title}
              </span>
            </div>
            <CommandList aria-label="Variantes">
              <CommandGroup heading="Elige la variante">
                {product.variants.map((variant) => (
                  <CommandItem
                    key={variant.id}
                    value={variant.id}
                    onSelect={() => finish(lineFromCatalog(product, variant))}
                  >
                    <Thumbnail
                      url={variant.imageUrl ?? product.imageUrl}
                      alt=""
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {variantName(variant) || product.title}
                      </span>
                      {variant.sku ? (
                        <span className="text-muted-foreground truncate text-xs">
                          SKU {variant.sku}
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums">{price(variant.price)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={search}
              placeholder="Título o SKU"
              aria-label="Buscar producto"
            />
            <CommandList>
              {loading ? (
                <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {loading === "product" ? "Cargando variantes…" : "Buscando…"}
                </div>
              ) : query.trim().length < 2 ? (
                <p className="text-muted-foreground p-3 text-sm">
                  Escribe al menos 2 caracteres para buscar en Shopify.
                </p>
              ) : (
                <CommandEmpty>No se encontraron productos.</CommandEmpty>
              )}
              {!loading && results.length > 0 ? (
                <CommandGroup heading="Catálogo de Shopify">
                  {results.map((summary) => (
                    <CommandItem
                      key={summary.id}
                      value={summary.id}
                      onSelect={() => void chooseProduct(summary)}
                    >
                      <Thumbnail url={summary.imageUrl} alt="" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">
                          {summary.title}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {priceRange(summary)}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="linea-libre"
                  onSelect={() => finish(freeLine())}
                >
                  <PencilLine className="size-4" aria-hidden />
                  Línea libre (producto que no está en el catálogo)
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

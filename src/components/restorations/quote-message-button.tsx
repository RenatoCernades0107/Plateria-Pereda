"use client";

import { MessageCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { WhatsAppQuoteDialog } from "./whatsapp-quote-dialog";

/**
 * Botón "Mensaje de cotización" del detalle (Paso 7.5). Recién registrada la
 * restauración (`autoOpen`) el diálogo se abre solo; al cerrarlo se limpia la URL
 * para que no vuelva a abrirse al recargar.
 */
export function QuoteMessageButton({
  message,
  phone,
  autoOpen = false,
}: {
  message: string;
  phone: string | null;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(autoOpen);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <MessageCircle />
        Mensaje de cotización
      </Button>
      <WhatsAppQuoteDialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value && autoOpen) router.replace(pathname, { scroll: false });
        }}
        message={message}
        phone={phone}
      />
    </>
  );
}

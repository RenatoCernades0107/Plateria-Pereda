import { todayInLima } from "@/domain/delivery-date";
import {
  quoteWorkshopPdfFileName,
  quoteWorkshopPdfModel,
  type WorkshopQuote,
} from "@/domain/quote-workshop-pdf";
import { PDF_LOGO_URL, thumbnail } from "@/components/restorations/pdf-images";

import { drawQuoteWorkshopPdf } from "./quote-workshop-pdf-draw";

/** Lado mayor (px) de las fotos: bastan para 32 mm a buena resolución. */
const PHOTO_PX = 480;

/** Fotos de los productos (por id de línea); las que no se puedan bajar se omiten. */
async function loadLineImages(
  quotes: readonly WorkshopQuote[],
): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  await Promise.all(
    quotes
      .flatMap((q) => q.lines)
      .map(async (line) => {
        if (!line.image) return;
        try {
          images.set(line.id, await thumbnail(line.image, PHOTO_PX));
        } catch {
          // Sin la foto, el producto sale igual (con "Sin foto").
        }
      }),
  );
  return images;
}

/** Genera y descarga la orden para taller de las cotizaciones. */
export async function exportWorkshopPdf(
  quotes: readonly WorkshopQuote[],
): Promise<void> {
  const today = todayInLima();
  const model = quoteWorkshopPdfModel(quotes, today);
  const [logo, images] = await Promise.all([
    // Sin el logo, el PDF sale igual.
    thumbnail(PDF_LOGO_URL, 400).catch(() => null),
    loadLineImages(quotes),
  ]);
  const pdf = await drawQuoteWorkshopPdf(model, { logo, images });
  pdf.save(
    quoteWorkshopPdfFileName(
      quotes.map((q) => q.code),
      today,
    ),
  );
}

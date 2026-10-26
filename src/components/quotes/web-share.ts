/**
 * Soporte del navegador para compartir archivos con el menú nativo (Web Share API,
 * Paso 14.6). En celular (Android/iOS) deja elegir WhatsApp directamente; en
 * escritorio casi nunca está, así que el botón "Compartir" cae a descargar + abrir
 * WhatsApp con un mensaje.
 */
export function canShareFiles(file: File): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

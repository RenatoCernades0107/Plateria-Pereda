/**
 * Cabeceras de seguridad de todas las respuestas (Paso 15.1).
 *
 * CSP sin nonces (guía "Without Nonces" de Next): un nonce obligaría a renderizar todo
 * de forma dinámica. Los scripts y estilos en línea que genera Next se permiten con
 * 'unsafe-inline'; lo que la CSP sí cierra es de dónde se cargan scripts, imágenes y
 * conexiones, quién puede enmarcar el sistema y a dónde se envían formularios.
 */

/** Imágenes de productos del catálogo de Shopify (cotizador y su PDF). */
const SHOPIFY_CDN = "https://cdn.shopify.com";

export function contentSecurityPolicy({
  supabaseUrl,
  isDev,
}: {
  supabaseUrl: string;
  isDev: boolean;
}): string {
  const supabase = new URL(supabaseUrl);
  // Realtime (campana de alertas) abre un WebSocket contra el mismo host.
  const realtime = `${supabase.protocol === "https:" ? "wss:" : "ws:"}//${supabase.host}`;
  const directives = [
    "default-src 'self'",
    // React usa eval en desarrollo para reconstruir las pilas de error.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Fotos de Storage (URL firmadas), miniaturas locales (blob/data) y catálogo.
    `img-src 'self' blob: data: ${supabase.origin} ${SHOPIFY_CDN}`,
    "font-src 'self'",
    // Las fotos y el catálogo también se bajan con fetch para armar los PDF.
    `connect-src 'self' ${supabase.origin} ${realtime} ${SHOPIFY_CDN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // En local Supabase va por http: subirlo a https lo rompería.
  if (supabase.protocol === "https:")
    directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders(options: {
  supabaseUrl: string;
  isDev: boolean;
}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // Sin dominio propio todavía (P04): HTTPS obligatorio por dos años.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // La cámara se usa con <input capture>, que no necesita el permiso.
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];
}

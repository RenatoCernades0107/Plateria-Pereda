import type { MetadataRoute } from "next";

/** Manifiesto de la app instalable (PWA): necesario para las notificaciones push en iPhone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Platería Pereda",
    short_name: "Pereda",
    description: "Sistema de restauraciones y cotizaciones de Platería Pereda",
    lang: "es-PE",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

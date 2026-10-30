// Service worker del sistema: muestra las alertas que llegan por push y, al tocarlas,
// abre la guía. No guarda nada en caché (el sistema necesita conexión).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Platería Pereda", {
      body: data.body || "Tienes una alerta nueva.",
      icon: "/icon-192.png",
      badge: "/badge-96.png",
      tag: data.tag,
      // Con la misma guía y tipo, la nueva reemplaza a la anterior y vuelve a sonar.
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin)
    .href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Usa una ventana abierta del sistema si la hay.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) return client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});

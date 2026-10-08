# Notas · Preguntas, respuestas y decisiones

> **Cómo responder:** cada pregunta trae una **propuesta**. Si estás de acuerdo basta con responder "OK" (p. ej., "P03 OK"); si no, indica el cambio.
> Iré registrando aquí tus respuestas y ajustando [`Todo.md`](./Todo.md).
> **Bloqueante** = hay que responderla antes de empezar la fase indicada.

**Última actualización:** 2026-10-08

## Resumen de pendientes

| Estado | Preguntas |
|---|---|
| Bloqueantes | Ninguna |
| Pendientes (no bloquean el inicio) | S1–S5, P03–P06, P21, P23, P26, P28, P29, P31–P39 |
| Respondidas | P01, P02, P07, P08, P09, P10, P11, P12, P14, P15, P16, P18, P19, P20, P27, P22, P24, P40, P41 (b–f con la propuesta), P42, P43, P44, P45, P46, P47, P48, P49, P50, N1, N2 |
| Respondidas en parte | P13 (falta el efecto de "no incluye IGV"), P17 (→ P41), P25 (propuesta enviada), P28, P30 (→ P42) |
| Supuestos por confirmar | P46 (supuestos b–c), P47 (supuesto b) |

> **Hallazgos del 2026-10-02 (cambian el plan):**
> 1. En el plan Grow, los **pagos parciales** solo se pueden registrar en el **POS**. En el panel de Shopify y por API son exclusivos de Shopify Plus. Esto corrige lo anotado el 2026-09-30 en P07 y N1 → nueva propuesta de pagos en **P43**.
> 2. Desde el 1 de enero de 2026 las apps ya no se crean desde el panel de Shopify sino en el **Dev Dashboard**. La app de producción debe pertenecer a la organización de la Platería → ver **P07**.
> 3. Desde abril de 2026 el plan Grow incluye **perfiles de empresa** (Companies) → nueva opción en **P14**.

---

## Supuestos (confirmar)

- **S1.** Interfaz en español (Perú).
- **S2.** Moneda: soles (S/, PEN), 2 decimales.
- **S3.** Zona horaria `America/Lima`; fechas en formato dd/mm/aaaa.
- **S4.** Una sola tienda de Shopify.
- **S5.** Cada usuario tiene un solo rol (administrador, logística o ventas).

**Respuesta:** _pendiente_

---

## A. Cuentas, entornos e infraestructura

### P01 · ¿Quién es dueño de las cuentas? — Bloqueante (Fase 0)
- **Contexto:** se necesitan cuentas de GitHub, Supabase, Vercel, la app de Shopify y el dominio.
- **Propuesta:** todas a nombre de la Platería (dueña de los datos y la facturación), con acceso de colaborador para el equipo de desarrollo.
- **Respuesta:** ✅ Vercel y Supabase están a nombre del desarrollador (también el repositorio de GitHub). La tienda de Shopify es de la Platería, así que la app de producción se crea en la organización de la Platería (ver P07). El dominio se define en P04.

### P02 · ¿Qué planes de Supabase y Vercel se contratarán? — Bloqueante (Fase 4 y 16)
- **Contexto:** el plan Hobby de Vercel es solo para uso personal no comercial y su cron corre como máximo una vez al día (necesitamos reintentos frecuentes hacia Shopify). El plan Free de Supabase pausa los proyectos inactivos y no incluye backups diarios.
- **Propuesta:** Vercel Pro + Supabase Pro (backups diarios incluidos). Si se prefiere no pagar Vercel Pro, los reintentos pueden correr con `pg_cron` de Supabase.
- **Respuesta:** ✅ Desarrollo con planes **gratuitos** (Supabase Free + Vercel Hobby); producción con **Pro** (P40). Los reintentos hacia Shopify usan Vercel Cron cada 5 minutos, que requiere Pro: en Hobby el deploy falla si el cron corre más de una vez al día, así que se activa al pasar a Pro (Paso 16.2).

### P03 · ¿Qué hacemos con los "preview deployments" de Vercel?
- **Contexto:** solo habrá 2 entornos (local y producción). Un preview en Vercel no tendría una base de datos propia y apuntaría a producción.
- **Propuesta:** desactivar los previews; toda prueba se hace en local.
- **Respuesta:** _pendiente_

### P04 · ¿En qué dominio vivirá el sistema?
- **Propuesta:** un subdominio, p. ej. `sistema.<dominio-de-la-plateria>`.
- **Respuesta:** _pendiente_

### P05 · ¿Qué correo usamos para los emails de acceso (invitación, recuperar contraseña)?
- **Contexto:** el SMTP que trae Supabase tiene límites muy bajos y es solo para pruebas.
- **Propuesta:** un proveedor transaccional (p. ej., Resend o Brevo) con un remitente del dominio de la Platería.
- **Respuesta:** _pendiente_

### P06 · ¿Usamos una herramienta de monitoreo de errores?
- **Propuesta:** sí, Sentry en su plan gratuito, para enterarnos de los errores antes que los usuarios.
- **Respuesta:** _pendiente_

---

## B. Shopify

### P07 · ¿Qué plan de Shopify tienen y quién puede crear la app? — Bloqueante (Fase 0)
- **Contexto:** necesitamos una app en la tienda con acceso a la API (clientes, órdenes, borradores de orden, edición de órdenes y productos). Algunas funciones dependen del plan.
- **Propuesta:** que el dueño de la tienda nos dé acceso para crear la app con los permisos mínimos.
- **Respuesta:** ✅ Plan **Grow**. Implicancias (actualizado el 2026-10-02):
  - **Pagos parciales y depósitos:** solo Plus, tanto en el panel como por API (el monto de `orderCreateManualPayment` exige Plus). En Grow la API solo registra un pago que complete el saldo. El POS sí permite pagos parciales en Grow → ver **P43**. _(Corrige lo anotado el 2026-09-30.)_
  - **Perfiles de empresa (Companies):** disponibles en Grow desde abril de 2026 → ver **P14**.
  - **Edición de órdenes:** disponible.
  - **Creación de la app:** desde el 1 de enero de 2026 se crea en el **Dev Dashboard** (ya no en "Desarrollar apps" del panel). Para que el sistema obtenga su token sin intervención (*client credentials*: token de 24 h que el sistema renueva solo), la app debe pertenecer a la **misma organización que la tienda**. Por eso la Platería debe crearla o darle acceso al desarrollador a su organización para crearla. Se valida en el spike (4.1); alternativa: instalar la app con un enlace de instalación (OAuth).
  - **Permisos mínimos:** `read_customers`, `write_customers`, `read_orders`, `write_orders`, `read_draft_orders`, `write_draft_orders`, `write_order_edits`, `read_products` (+ `read_merchant_managed_fulfillment_orders` y `write_merchant_managed_fulfillment_orders` si P44 = sí).

### P08 · ¿Podemos usar una tienda de desarrollo para pruebas? — Bloqueante (Fase 4)
- **Contexto:** no queremos crear clientes ni órdenes de prueba en la tienda real.
- **Propuesta:** crear una tienda de desarrollo gratuita con algunos productos copiados del catálogo real. Los tests automáticos usan un "Shopify falso" y la tienda de desarrollo solo se usa para pruebas manuales.
- **Respuesta:** ✅ La tienda real es de la Platería y no se usa para pruebas. La tienda de desarrollo (gratuita) y su app de prueba se crean en la organización del desarrollador.

### P09 · ¿Cómo registran hoy los pagos en Shopify? — Bloqueante (Fase 4)
- **Contexto:** necesitamos saber por dónde se registran los pagos (POS, panel, links de pago, Yape/Plin a mano). Para "A cuenta" hay que poder registrar **pagos parciales** en la orden.
- **Propuesta:** validarlo en el spike técnico (Paso 4.1); si hace falta, un botón "Registrar pago" en nuestro sistema.
- **Respuesta:** ✅ Hoy registran los pagos en el POS y en el panel (N1). Desde ahora se registrarán **desde nuestro sistema** → diseño en **P43**.

### P10 · ¿Qué pasa si el cliente deja un adelanto antes de que exista la orden? — Bloqueante (Fase 9)
- **Contexto:** la orden en Shopify se crea cuando la restauración se **aprueba** (todas las piezas aprobadas).
- **Opciones:**
  - (a) El adelanto se cobra solo al aprobar la restauración.
  - (b) La orden se crea al registrar (pendiente de pago) y se actualiza al aprobar.
  - (c) El adelanto se anota en nuestro sistema y se traslada a la orden cuando se cree.
- **Propuesta:** (a) si su proceso lo permite; si no, (b).
- **Respuesta:** ✅ Opción **(a)**, confirmada por el negocio (N2): el adelanto siempre se paga después de aprobar la cotización. Es el **50 %** del total y en algunos casos otro porcentaje.
  - **Supuesto:** en el caso raro de P18 (piezas en el taller mientras otras siguen en consulta), el adelanto se cobra cuando toda la cotización queda aprobada, que es cuando se crea la orden.

### P11 · ¿Cómo se ven las líneas de la orden en Shopify? — Bloqueante (Fase 9)
- **Contexto:** las restauraciones no son productos del catálogo.
- **Propuesta:** una línea personalizada por pieza (no afecta stock); la orden lleva la etiqueta `restauracion` y el código.
- **Respuesta:** ✅ Ya usan **líneas personalizadas** (venta personalizada) en sus órdenes: p. ej., la orden #4063 del POS de Miraflores tiene la línea "Guía #10117" (S/ 30.00, `_shopify_item_type: custom_sale`). Usamos una línea personalizada por pieza, sin afectar stock.
  - **Título de la línea:** ✅ solo el código (P12) (`Restauración RES-00123-1`), igual que su "Guía #10117".

### P12 · ¿Qué hacemos con cambios después de crear la orden? — Bloqueante (Fase 7 y 9)
- **Contexto:** después de aprobar puede anularse una pieza, cambiar un precio o agregarse una pieza nueva.
- **Propuesta inicial (2026-09-30):**
  - Anular pieza → la orden de Shopify se edita automáticamente (se quita la línea).
  - Cambiar precio → solo el administrador; la orden se edita automáticamente.
  - Agregar pieza → se agrega a la orden cuando esa pieza se apruebe.
  - Si el cliente ya pagó más que el nuevo total → alerta para hacer el reembolso.
- **Respuesta:** 🟡 Todo cambio debe quedar **registrado para auditarlo** (quién, cuándo, valor anterior → nuevo). Se pueden actualizar los campos que **no interfieren con Shopify**; el resto hay que conversarlo.
- **Análisis de campos (para conversar):**

  **No tocan Shopify** → editables por ventas y admin, con auditoría (logística solo fotos):

  | Dónde | Campos |
  |---|---|
  | Restauración | Contacto, tipo de pago, % de adelanto, notas |
  | Pieza | Medida, material, peso, taller, notas, fotos |
  | Pieza (el título de la línea lleva solo el código) | Descripción, servicio |

  **Sí tocan Shopify** → a conversar:

  | Cambio | Efecto en Shopify | Propuesta |
  |---|---|---|
  | Precio de una pieza | Cambia la línea y el total de la orden | Solo admin, con motivo; la orden se edita sola |
  | Agregar una pieza | Nueva línea en la orden | Se agrega cuando esa pieza se aprueba |
  | Anular una pieza | Se quita la línea; si ya pagó más que el nuevo total, hay que devolver dinero | Con motivo; alerta de reembolso |
  | Cambiar el cliente | Cambia el cliente de la orden | Solo admin; si la API no lo permite (se ve en el spike), se corrige a mano en Shopify |
  | Descripción o servicio | Solo si van en el título de la línea | Título solo con el código → dejan de tocar Shopify |
  | Pagos | Se registran en la orden (P43) | No se editan; un error lo corrige el admin con un reembolso |
  | Entregar una pieza | Solo si P44 = sí | Marca la línea como preparada |

  - **Nunca editables:** código, cliente (ver abajo), orden de Shopify, fechas de cada estado (cambian solo con las transiciones) y quién lo creó.
  - **Antes de crear la orden** (antes de aprobar) todo es editable por ventas y admin, salvo el cliente, y también queda auditado.
- **Respuesta (2026-10-03):** ✅ Las propuestas de precio, agregar pieza, anular pieza, pagos y entrega están bien. **El cliente no se puede cambiar** una vez registrada la restauración; si hace falta, lo cambian en Shopify.
- **Puntos finales (respondidos el 2026-10-03):**
  - (1) **Título de la línea.** Ejemplo: la pieza se registra como "Fuente de plata – Limpieza". Si el título en Shopify es `Restauración RES-00123-1 · Fuente de plata · Limpieza` y luego el asesor corrige la descripción a "Fuente ovalada de plata 950", Shopify no permite renombrar una línea: habría que quitarla y agregar otra, o dejar el texto viejo en Shopify. Si el título es solo `Restauración RES-00123-1` (como su "Guía #10117"), la descripción y el servicio se corrigen solo en nuestro sistema, sin tocar Shopify; el detalle se ve en el sistema con el enlace que va en la nota de la orden. — ✅ **Respuesta:** título solo con el código.
  - (2) Si cambian el cliente de una orden en Shopify, ¿la restauración también debe mostrar el nuevo cliente? — ✅ **Respuesta:** sí; el sistema lo toma de Shopify automáticamente por webhook (queda auditado como cambio hecho desde Shopify).

### P13 · ¿Los precios incluyen IGV?
- **Contexto:** aplica a restauraciones (orden de Shopify y mensaje de WhatsApp) y a cotizaciones (PDF). Depende también de la configuración de impuestos de la tienda.
- **Propuesta:** todos los precios incluyen IGV; en el PDF se puede mostrar el desglose (op. gravada + IGV 18 %) si lo desean.
- **Respuesta (2026-10-05):** 🟡 **No asumir: preguntar siempre si el precio incluye IGV** (en cada restauración y en cada cotización). Falta confirmar qué pasa cuando **no** lo incluye (¿se suma el 18 % al total que se cobra o solo se indica "+ IGV"?) y si aplica igual a restauraciones y cotizaciones.

### P14 · ¿Cómo registramos a las empresas en Shopify?
- **Contexto:** desde abril de 2026 el plan Grow incluye perfiles de empresa (Companies), con contactos y ubicaciones.
- **Opciones:**
  - (a) La empresa es un cliente de Shopify, con la razón social como nombre y el RUC en un metacampo; sus contactos solo están en nuestro sistema. Simple.
  - (b) La empresa es una "Company" de Shopify y sus contactos son contactos de la empresa; las órdenes quedan a nombre de la empresa. Más fiel a la realidad, pero más compleja.
- **Propuesta:** (a); revisamos (b) en el spike (4.1).
- **Respuesta (2026-10-04):** ✅ **(b) Company de Shopify.** La empresa (razón social y RUC) es una Company; sus contactos son clientes de Shopify asociados a ella como contactos, y las órdenes se crean a nombre de la empresa (su ubicación) con el contacto que la pidió. En el spike (4.1) se valida: alta de Company con contacto y ubicación por API, dónde guardar el RUC (identificador externo o metacampo), crear órdenes con la empresa como comprador y qué webhooks llegan al cambiarla.

### P15 · ¿Hay clientes existentes en Shopify? ¿Los importamos?
- **Propuesta:** importación inicial de todos los clientes de Shopify a nuestra base + búsqueda en vivo en Shopify para los que se creen después desde otros canales.
- **Respuesta (2026-10-04):** ✅ Son alrededor de **1000** clientes. No hace falta importarlos ahora: la importación se construye y se prueba con clientes de prueba de la tienda de desarrollo, y se ejecuta con la tienda real al pasar a producción (16.4).

### P16 · Si se edita un cliente, ¿se actualiza en ambos lados?
- **Propuesta:** sí. Editar en nuestro sistema actualiza Shopify, y los cambios hechos en Shopify llegan por webhook (nombre, email, teléfono, dirección).
- **Respuesta (2026-10-04):** ✅ Sí, se actualiza en ambos lados.

---

### Spike 4.1 — Ronda 1 (2026-10-04, tienda `peredadev.myshopify.com`, API 2026-10)
Reporte: `tests/fixtures/shopify/spike/reporte-20261004183003.json`.
- ✅ **Token client credentials** funciona con la app instalada en una tienda de la misma organización. El pedido va como formulario (`application/x-www-form-urlencoded`); en JSON responde 400. Si la app no está instalada: `400 app_not_installed`. Los permisos `write_*` incluyen sus `read_*`.
- ✅ **Orden con adelanto (P43):** `orderCreate` con líneas personalizadas y una transacción `SALE` de S/ 200 sobre S/ 400 queda **"Parcialmente pagada"**. El gateway de esa transacción (`Yape`) es texto libre: no hace falta configurarlo.
- ✅ **Edición de orden:** se agregan y quitan líneas (`orderEditBegin` → `orderEditAddCustomItem` / `orderEditSetQuantity 0` → `orderEditCommit`). La línea quitada sigue en la orden con `quantity` original: hay que leer `currentQuantity` y `currentTotalPriceSet` (`totalPriceSet` queda en el total original).
- ✅ Clientes: `defaultEmailAddress` y `defaultPhoneNumber` funcionan. Productos: búsqueda con imágenes y variantes funciona.
- ⚠️ **Búsquedas inmediatas vacías** (cliente recién creado y orden por etiqueta): el índice de búsqueda de Shopify tarda. Consecuencia: para no duplicar órdenes en un reintento no basta con buscar por etiqueta → probar `@idempotent` en `orderCreate` (ronda 2) y guardar siempre el id de la orden en nuestra BD.
- ⚠️ **Pago del saldo:** `orderCreateManualPayment` con `paymentMethodName: "Efectivo"` falla con "Payment provider is not configured on shop": el nombre debe existir como **método de pago manual** en Ajustes → Pagos de la tienda (Efectivo, Tarjeta, Yape, Plin). Ronda 2 prueba también sin nombre.
- ⚠️ **Reembolso:** en 2026-10 `refundCreate` exige la directiva `@idempotent(key: …)`. Conviene usarla en todas las mutaciones que la acepten.
- ❌ **Company:** `companyCreate` rechazó la dirección de la ubicación (INVALID_INPUT); probablemente falta la región (`zoneCode` "LIM"). Ronda 2 la envía como dirección de envío con región.
- ℹ️ La tienda de desarrollo está en USD; la de la Platería estará en PEN (el código toma la moneda de la tienda).

### Spike 4.1 — Ronda 2 (2026-10-04) — 15/15 pasos
Reporte: `tests/fixtures/shopify/spike/reporte-20261004183525.json`.
- ✅ **Company:** `companyCreate` funciona con la ubicación como dirección de **envío con región** (`zoneCode: "LIM"`) y `billingSameAsShipping: true`; el RUC va en `externalId`. Crea la Company, su contacto (un cliente) y la ubicación.
- ✅ **Orden a nombre de la empresa:** `orderCreate` con `customerId` del contacto + `companyLocationId` → `purchasingEntity` = la Company, su ubicación y el contacto.
- ✅ **Edición:** la línea quitada queda con `currentQuantity` 0; `currentTotalPriceSet` da el total vigente (300) y `totalPriceSet` el original (450).
- ✅ **Pago del saldo** sin nombre de método: la orden queda **"Pagada"** y la transacción con gateway `manual`. Con `paymentMethodName: "Efectivo"` sigue fallando si el método manual no existe en la tienda → el adaptador intenta con el nombre y, si no está configurado, registra sin nombre; el sistema guarda el método real.
- ✅ **Preparar** una línea con `fulfillmentCreate` (por fulfillment order). ✅ **Reembolso** parcial con `@idempotent` → "Parcialmente reembolsada".
- ⚠️ **`@idempotent` no evita duplicar `orderCreate`:** la misma clave dos veces creó dos órdenes (#1003 y #1004). **Decisión:** antes de crear la orden, el handler del outbox la busca por la etiqueta del código; el índice tarda ~5 s (clientes) y ~7,5 s (órdenes), y el outbox reintenta recién a los 30 s.
- **Decisión (2026-10-04):** en la tienda no se pueden crear métodos manuales llamados Efectivo, Tarjeta, Yape o Plin (el buscador de formas de pago solo ofrece proveedores, p. ej. "yappy"); sí se pudieron agregar Visa, Mastercard, transferencia bancaria y PagoEfectivo. Es aceptable que el saldo quede como "manual" en Shopify; con esos cuatro métodos va con su nombre (D34).
- Pendiente (ronda 3): confirmar que el id de la línea calculada de una edición termina en el mismo número que la línea (el adaptador los relaciona así) y el pago del saldo con los métodos manuales creados en la tienda.

### Spike 4.1 — Ronda 3 (2026-10-04)
Reporte: `tests/fixtures/shopify/spike/reporte-20261004193129.json`.
- ✅ `companyContactCreate` y `companyAssignCustomerAsContact` funcionan.
- ❌ **Un contacto agregado después no puede hacer pedidos:** "Order could not be created, because the customer has no role in this company". Solo el contacto creado junto con la empresa recibe rol automáticamente. **Decisión:** al crear o vincular un contacto, el sistema le asigna el rol de compra en la ubicación (`companyContactAssignRole`, rol "Ordering only" si existe). Se valida en la ronda 4.
- ✅ Región distinta de Lima: `zoneCode: "ARE"` se acepta (Shopify lo guarda como `PE-ARE`).
- ✅ El id de la línea calculada de una edición termina en el mismo número que la línea: el adaptador puede relacionarlas así.
- Se repiten los hallazgos: `@idempotent` no evita duplicar `orderCreate`; el pago con nombre requiere el método manual en la tienda; el índice de búsqueda tarda ~5 s.

## C. Restauraciones y piezas

### P17 · ¿Validan las transiciones de estado de las piezas? — Bloqueante (Fase 8)
- **Contexto:** la tabla propuesta está en `Todo.md` §7.1. Puntos a definir:
  - (a) Si el cliente rechaza la consulta y la pieza pasa a "Observada" **sin haber ido nunca al taller**, ¿a qué estado pasa al resolverse? — **Propuesta:** vuelve a "En consulta" o a "Aprobada".
  - (b) ¿Se puede "Observar" una pieza ya **entregada** (reclamo posterior)? — **Propuesta:** sí.
  - (c) ¿Una pieza anulada se puede **reactivar**? — **Propuesta:** no; si hace falta, se agrega una pieza nueva.
  - (d) ¿Se puede **anular** una pieza que está en el taller? — **Propuesta:** solo el administrador.
  - (e) ¿Se puede pasar de "Registrada" directo a "Aprobada" sin consulta? — **Propuesta:** sí.
  - (f) ¿Una pieza "Devuelta por el taller" puede volver al taller sin pasar por "Observada"? — **Propuesta:** no; siempre pasa por "Observada" (queda registrado el motivo).
- **Respuesta:** 🟡 Parcial:
  - (a) Ese caso **no existe**: una pieza solo puede pasar a "Observada" después de haber llegado al taller.
  - El resto continúa en **P41**.

### P18 · ¿Se puede enviar una pieza al taller mientras otras piezas de la misma restauración siguen en consulta? — Bloqueante (Fase 8)
- **Contexto:** afecta el estado general y el momento en que se crea la orden en Shopify (que espera a que **todas** las piezas estén aprobadas).
- **Propuesta:** sí se permite (no se retrasa el trabajo); la orden se crea cuando todas las piezas no anuladas estén aprobadas.
- **Respuesta:** ✅ Sí se permite. Son casos raros, pero existen.

### P19 · ¿Validan cómo se calcula el estado general?
- **Contexto:** la regla propuesta está en `Todo.md` §7.3. Un caso a confirmar: si una pieza devuelta se observa y vuelve al taller, la restauración puede **retroceder** de "Lista" a "Parcialmente lista" o "En proceso".
- **Propuesta:** sí, el estado refleja siempre la situación real y puede retroceder.
- **Respuesta (2026-10-05):** ✅ **Solo avanza.** El estado general nunca retrocede: si una pieza devuelta se observa y vuelve al taller, la restauración conserva el estado al que ya había llegado. Excepción: si se anulan todas las piezas queda Anulada.

### P20 · ¿La pieza suele llegar a la tienda al registrar la restauración?
- **Contexto:** si llega antes de aprobarse, debe pasar a "Recibida" apenas se apruebe; hay que saber que ya está físicamente en la tienda.
- **Propuesta:** en el registro, casilla "La pieza ya está en tienda" marcada por defecto; para las que llegan después, un botón "Marcar llegada" (lo usan logística y ventas).
- **Respuesta (2026-10-05):** ✅ **Sí, suelen llegar al registrar.** La casilla "La pieza ya está en tienda" viene marcada por defecto (se desmarca para las que llegan después).
- **Reemplazada (2026-10-06, P48):** se quita la casilla. Toda pieza registrada en oficina ya está en la tienda ("Sin enviar"); solo las que vienen de una cotización de WhatsApp empiezan "Por WhatsApp".

### P21 · ¿Hay una sola tienda física?
- **Contexto:** si hay varias sedes, la ubicación "En tienda" debería indicar en cuál está la pieza.
- **Propuesta:** una sola tienda.
- **Respuesta:** _pendiente_

### P22 · ¿Cómo se registran los campos de cada pieza? — Bloqueante (Fase 5 y 7)
- **Propuesta:**
  - **Medida:** texto libre (p. ej., "30 × 20 cm").
  - **Material:** lista editable por el administrador (p. ej., plata 950, plata 925, alpaca, bronce…) con opción "Otro".
  - **Peso:** en gramos, opcional.
  - **Servicio:** lista editable (limpieza, soldadura, reposición de piezas, plateado, pulido…) con precio sugerido opcional y opción "Otro".
  - **Precio:** obligatorio.
  - **Taller:** opcional al registrar; obligatorio al enviar al taller.
- **Respuesta:** ✅ Material y servicio se eligen de una **lista** y también se pueden **escribir libremente**. El resto según la propuesta.

### P23 · ¿Cómo se definen "días en taller" y "días de cumplimiento"?
- **Propuesta:**
  - **Días en taller:** suma de todos los viajes al taller (incluye reenvíos por observación).
  - **Días de cumplimiento:** desde el registro hasta la entrega al cliente.
  - Días calendario (no hábiles).
- **Pregunta extra:** ¿"cumplimiento" se refiere al tiempo total o a cumplir una **fecha de entrega prometida** al cliente? Si es lo segundo, agregamos una "fecha prometida" por pieza y mostramos si se cumplió o con cuántos días de retraso.
- **Respuesta:** _pendiente_

### P24 · ¿Qué formato de código usamos? ¿Necesitan etiquetas impresas?
- **Contexto (2026-10-03):** hoy la "guía" (registro de la restauración) se llena en papel y en Shopify solo se registra el pago, como venta personalizada con el número de guía (p. ej., "Guía #10117").
- **Propuesta:** restauración `RES-00123`, pieza `RES-00123-1`. Alternativa: llamarla "Guía" y seguir la numeración de sus guías de papel (p. ej., `G-10118`, pieza `G-10118-1`). Imprimir etiquetas o stickers para identificar las piezas físicas queda como mejora futura (no incluida).
- **Respuesta:** ✅ Formato `RES-XXXXX` (5 dígitos): restauración `RES-00001`, pieza `RES-00001-1`. Etiquetas impresas: mejora futura.

### P25 · ¿Cómo debe verse el mensaje de cotización por WhatsApp?
- **Contexto:** si tienen un ejemplo del mensaje que envían hoy, lo usamos como base. La plantilla será editable desde "Configuración".
- **Propuesta:**
  ```
  Hola {cliente}, te saludamos de Platería Pereda.
  Te compartimos la cotización de tu restauración *{código}*:

  1. {descripción} – {servicio}: S/ {precio}
  2. {descripción} – {servicio}: S/ {precio}

  *Total: S/ {total}*
  Forma de pago: {tipo de pago} (adelanto: S/ {adelanto})
  {condiciones}
  ```
  Con botón "Copiar" y botón "Abrir WhatsApp" con el número del cliente.
- **Respuesta (2026-10-05):** 🟡 Piden una propuesta concreta: se les envió un ejemplo con los tres tipos de pago (ver abajo); falta su visto bueno.
- **Propuesta concreta (2026-10-05):** plantilla editable en Configuración; una línea por pieza no anulada y la forma de pago según el tipo:
  ```
  Hola Ana Pérez, te saludamos de Platería Pereda.
  Te compartimos la cotización de tu restauración *RES-00012*:

  1. Fuente ovalada abollada – Restauración completa: S/ 1,200.50
  2. Juego de cubiertos (12) – Limpieza y pulido: S/ 180.00
  3. Candelabro de 3 brazos – Soldadura: S/ 95.00

  *Total: S/ 1,475.50*
  Forma de pago: A cuenta (adelanto del 50 %: S/ 737.75)
  {condiciones de la configuración}
  ```
  - Al contado: "Forma de pago: Al contado (S/ 1,475.50)". Al crédito: "Forma de pago: Al crédito (sin adelanto)".
  - Si la restauración es de un contacto de una empresa, el saludo va a su nombre.
  - Según P13 se agregaría "(incluye IGV)" o "(+ IGV)" junto al total.

### P26 · ¿Hay restauraciones en curso que migrar?
- **Contexto:** si hoy llevan el control en Excel u otro sistema, podemos cargar las restauraciones en curso al lanzar.
- **Propuesta:** cargar solo las restauraciones abiertas a partir de un Excel con formato que les enviaremos.
- **Respuesta:** _pendiente_

---

## D. Clientes y contactos

### P27 · ¿Qué datos son obligatorios al registrar un cliente?
- **Propuesta:**
  - **Persona:** nombres, apellidos y teléfono obligatorios; tipo y número de documento (DNI/CE/pasaporte), email y dirección opcionales.
  - **Empresa:** razón social, RUC y teléfono obligatorios; email y dirección opcionales.
  - **Contacto:** nombre y teléfono obligatorios; documento, email y cargo opcionales.
- **Respuesta (2026-10-04):** ✅ De acuerdo con la propuesta.

---

## E. Pagos

### P28 · Detalles de los tipos de pago
- **Preguntas:** ¿"A cuenta" exige un adelanto mínimo (%)? ¿"Al contado" significa que paga todo al aprobar? ¿"Al crédito" está disponible para cualquier cliente o solo para algunos (p. ej., empresas)? ¿Se puede cambiar el tipo de pago después?
- **Propuesta:** % de adelanto configurable (por defecto 50 %); crédito disponible para todos, pero solo ventas/admin lo eligen; el tipo de pago se puede cambiar mientras no haya pagos registrados.
- **Respuesta:** 🟡 El adelanto es el **50 %** del total por defecto y en algunos casos otro porcentaje (N2) → % por defecto configurable y editable en cada restauración. Pendiente: ¿"Al contado" = paga todo al aprobar? ¿Crédito para quién? ¿Se puede cambiar el tipo de pago después?

### P29 · ¿Qué estados de pago usamos?
- **Propuesta:** Pendiente, Parcial, Pagado y Reembolsado (si se devuelve el dinero).
- **Respuesta:** _pendiente_

---

## F. Roles y usuarios

### P30 · ¿Validan la matriz de permisos? — Bloqueante (Fase 2)
- **Respuesta:** 🟡 Logística no ve precios ni pagos (2026-09-30). La matriz actualizada está en **P42**.

### P31 · ¿Cuántos usuarios habrá y cómo inician sesión?
- **Propuesta:** email + contraseña; el administrador crea/invita a los usuarios (no hay registro público).
- **Respuesta:** _pendiente_ (indicar número aproximado por rol)

---

## G. Fotos y archivos

### P32 · ¿Qué archivos se pueden subir y quién puede borrarlos?
- **Contexto:** además de las fotos de cada pieza, habrá una **foto general** de todas las piezas de la restauración (P42).
- **Propuesta:** JPG, PNG, HEIC/WebP y PDF; máximo 10 MB por archivo; las fotos se comprimen automáticamente (lado mayor 1920 px) para ahorrar espacio; sin límite de cantidad; clasificación Antes / Después / Documento / Otro; borran el administrador y quien lo subió.
- **Respuesta:** _pendiente_

---

## H. Dashboard

### P33 · ¿Qué significa "ventas de restauraciones" y qué filtros/exportaciones necesitan?
- **Propuesta:** mostrar ambos: **monto vendido** (restauraciones aprobadas, por fecha de aprobación) y **monto cobrado** (pagos recibidos, por fecha de pago), con filtros por rango de fechas y taller. Exportar listados a CSV/Excel.
- **Respuesta:** _pendiente_

---

## I. Cotizador

### P34 · ¿Guardamos historial de cotizaciones con estados?
- **Propuesta:** sí: Borrador, Emitida, Aceptada, Rechazada y Vencida (automática al pasar la vigencia). Convertir una cotización aceptada en orden de Shopify queda como mejora futura (no incluida).
- **Respuesta:** _pendiente_

### P35 · ¿Descuentos y moneda en las cotizaciones?
- **Propuesta:** solo soles; descuento opcional por línea (monto o %); sin descuento global.
- **Respuesta:** _pendiente_

### P36 · ¿Qué debe incluir el PDF?
- **Propuesta:** logo, razón social, RUC, dirección, teléfonos, redes sociales; código y fechas de emisión y vigencia (por defecto **15 días**, editable); datos del cliente; productos con descripción de la personalización, cantidad, precio unitario y subtotal; total; condiciones (tiempo de fabricación, adelanto, formas de pago y cuentas bancarias).
- **Respuesta:** _pendiente_ (enviar logo en alta resolución y el texto de condiciones)

### P37 · ¿Se pueden cotizar productos que no están en Shopify? ¿Mostramos la imagen del producto?
- **Propuesta:** sí a ambas: se permite agregar una línea libre (sin producto del catálogo) y se muestra la imagen del producto en el PDF cuando existe.
- **Respuesta:** _pendiente_

### P38 · ¿Quién usa el cotizador y qué se muestra si se cotiza a un contacto?
- **Propuesta:** lo usan ventas y admin. Si se elige un contacto de una empresa, el PDF muestra la empresa como cliente y "Atención: {contacto}".
- **Respuesta:** _pendiente_

### P39 · ¿Cómo se comparte la cotización?
- **Propuesta:** descarga del PDF (incluido). Además, en el celular, botón "Compartir" que envía el PDF directamente por WhatsApp con el menú de compartir del teléfono.
- **Respuesta:** _pendiente_

---

## J. Nuevas preguntas (derivadas de las respuestas)

### P40 · ¿Qué planes usaremos en producción? — Bloqueante (Fase 16)
- **Contexto:** el desarrollo arranca con planes gratuitos (P02). Vercel Hobby no permite uso comercial y Supabase Free pausa proyectos inactivos y no tiene backups diarios.
- **Respuesta:** ✅ Producción con **Vercel Pro + Supabase Pro**. Con Pro: cron cada 5 minutos (Vercel), backups diarios y sin pausa por inactividad (Supabase).

### P41 · Transiciones pendientes de la pieza — Bloqueante (Fase 8)
- (a') Si el cliente **rechaza** la propuesta de la consulta, ¿qué pasa?
  - **Respuesta:** ✅ El rechazo **no se registra** en el sistema como estado propio; el asesor coordina con el cliente por WhatsApp.
  - **Actualizado (2026-10-06, P47):** el rechazo ahora **sí se registra** como "Rechazado (cliente)".
  - **Supuesto:** si el cliente finalmente no acepta, la pieza se anula con un motivo.
- (g) ¿Seguimos usando el estado "En espera de respuesta del cliente"? Por lo que describes, "En consulta" ya cubre el tiempo en que se coordina con el cliente. — **Propuesta:** quitarlo (En consulta → Aprobada), salvo que les sirva para distinguir "estamos revisando la pieza" de "ya le enviamos la propuesta al cliente".
- (b) ¿Se puede "Observar" una pieza ya **entregada** (reclamo posterior)? Ya estuvo en el taller, así que encaja con la regla de P17. — **Propuesta:** sí.
- (c) ¿Una pieza anulada se puede **reactivar**? — **Propuesta:** no; se agrega una pieza nueva.
- (d) ¿Se puede **anular** una pieza que está en el taller? — **Propuesta:** solo el administrador.
- (e) ¿Se puede pasar de "Registrada" directo a "Aprobada" sin consulta? — **Propuesta:** sí.
- (f) ¿Una pieza "Devuelta por el taller" puede volver al taller sin pasar por "Observada"? — **Propuesta:** no.
- **Respuesta (b)–(g):** ✅ (g) **Se mantiene** "En espera de respuesta del cliente". Flujo: la consulta es opcional (para piezas en condiciones especiales o complicadas; si el cliente acepta en el momento, pasa directo a "Aprobada"). Cuando se le envía el mensaje al cliente por WhatsApp, la pieza pasa a "En espera de respuesta del cliente"; si el cliente acepta, se aprueba; si no, se anula. (e) Sí: de "Registrada" a "Aprobada" directo. (b), (c), (d) y (f): no hubo comentarios, así que se aplican las propuestas mientras no se diga lo contrario.
- **Actualizado (2026-10-06, P47):** se quitan Recibida y Devuelta por el taller; (f) ahora es: una pieza que volvió del taller (Interno · Lista para entregar) vuelve al taller solo pasando por "Observación".

### P42 · ¿Validan el resto de la matriz de permisos (P30)? — Bloqueante (Fase 2)
- **Respuesta:** ✅ "Por ahora está bien", con estos cambios para **logística**: no ve precios, pagos, métricas ni el historial; no crea restauraciones; de los datos de la restauración solo edita las **fotos**: antes y después de cada pieza y una **foto general** de todas las piezas.
- **Matriz actualizada:**

| Acción | Admin | Ventas | Logística |
|---|:-:|:-:|:-:|
| Ver restauraciones y piezas | ✅ | ✅ | ✅ (sin precios) |
| Registrar / editar restauraciones y piezas | ✅ | ✅ | ❌ |
| Ver precios, pagos y saldos | ✅ | ✅ | ❌ |
| Registrar pagos | ✅ | ✅ | ❌ |
| Corregir pagos (reembolso) | ✅ | ❌ | ❌ |
| Consultas, aprobar y anular piezas | ✅ | ✅ | ❌ |
| Marcar llegada a tienda | ✅ | ✅ | ✅ |
| Enviar al taller y marcar devuelta por el taller | ✅ | ❌ | ✅ |
| Asignar / cambiar taller | ✅ | ✅ | ✅ |
| Entregar al cliente (ver P45) y observar | ✅ | ✅ | ✅ |
| Subir y editar fotos (por pieza y foto general) | ✅ | ✅ | ✅ |
| Eliminar fotos y archivos | ✅ | Solo los suyos | Solo los suyos |
| Gestionar talleres | ✅ | ❌ | ✅ |
| Clientes y contactos | ✅ | ✅ | Solo ver |
| Cotizador | ✅ | ✅ | ❌ |
| Dashboard (todas las métricas) | ✅ | ✅ | ❌ |
| Pestaña "Historial" (quién cambió qué y cuándo) | ✅ | ✅ | ❌ |
| Restauraciones pasadas (entregadas o anuladas) | ✅ | ✅ | ❌ |
| Usuarios, configuración y catálogos | ✅ | ❌ | ❌ |
| Auditoría de todo el sistema | ✅ | ❌ | ❌ |

- Como logística no tiene dashboard, al iniciar sesión entra directo a su vista de piezas.
- **Detalles pendientes:**
  - (a) Cuando dices que logística no ve "el historial", ¿te refieres a la pestaña "Historial" (quién cambió qué y cuándo)? — **Propuesta:** no la ve, pero sí ve el estado actual de cada pieza y la nota de la última observación (la necesita para explicarle al taller qué corregir).
  - (b) En su vista de piezas, ¿logística ve cuántos días lleva cada pieza en el taller? — **Propuesta:** sí; es un dato para hacerle seguimiento al taller, no una métrica del dashboard.
  - **Respuesta (2026-10-03):** ✅ Logística no ve el historial de cambios **ni el historial de pedidos** (restauraciones pasadas, entregadas o anuladas). Sí ve la nota de la última observación y cuántos días lleva cada pieza en el taller.

### P43 · ¿Cómo registramos los pagos con el plan Grow? — Bloqueante (Fase 9 y 11)
- **Contexto:** prefieren registrar los pagos desde nuestro sistema (N1). Pero en Grow, Shopify solo permite pagos **parciales** desde el POS; en el panel y por API son exclusivos de Plus. Por API en Grow sí se puede: (1) crear la orden con pagos ya incluidos, aunque sean parciales, y (2) registrar el pago que completa el saldo.
- **Propuesta:**
  1. Nuestro sistema lleva el **registro de pagos**: monto, método (efectivo, tarjeta, Yape, Plin), fecha y quién lo registró.
  2. **Adelanto:** al aprobar, el asesor lo registra en el mismo paso (monto sugerido: 50 % del total, editable). La orden de Shopify se crea con el adelanto incluido y queda "Parcialmente pagada", igual que hoy con el POS.
  3. **Saldo:** antes de la entrega se registra en el sistema; en Shopify entra como el pago que completa la orden, que queda "Pagada".
  4. **Casos especiales** (adelanto registrado después de crear la orden o saldo pagado en partes): se guardan en el sistema y llegan a Shopify junto con el pago que completa el saldo. Mientras tanto, Shopify muestra un monto pagado menor que el real; nuestro sistema muestra el real.
  5. Si alguien registra un pago directamente en el POS o el panel, igual llega al sistema por webhook y no se duplica.
  6. Lo validamos en el spike (4.1) con la tienda de desarrollo.
- **Alternativa:** seguir registrando los adelantos en el POS (que sí permite pagos parciales) y que el sistema solo los lea.
- **Dato que nos ayudaría:** ¿cómo registran hoy el adelanto en el panel? En Grow el panel no permite montos parciales: ¿usan alguna app o lo hacen solo en el POS?
- **Respuesta (2026-10-03):** ✅ De acuerdo. Hoy la guía se llena **en papel** y solo el pago se registra en el POS de Shopify (iPhone y Android), poniendo los datos de la guía en un texto libre. El objetivo es digitalizar la guía con un formulario adecuado y registrar los pagos desde el sistema.
  - **Ejemplo del flujo:** total S/ 400. Al aprobar, el cliente paga el adelanto de S/ 200 por Yape; el asesor lo registra en el sistema y la orden se crea en Shopify con S/ 200 pagados ("Parcialmente pagada"). El día del recojo paga S/ 200 en efectivo; el asesor lo registra en el sistema y este le avisa a Shopify que se pagó el resto, así que la orden queda "Pagada". Nadie tiene que entrar a Shopify.
  - **Único límite:** si el saldo se paga en partes (S/ 100 y luego S/ 100), el primer pago queda solo en el sistema hasta que llegue el segundo; entonces Shopify recibe los S/ 200 juntos.

### P44 · ¿Marcamos la pieza como "Preparada" en Shopify al entregarla?
- **Contexto:** sus ventas del POS quedan "Pagado · Preparado · Archivado" (orden #4063). Si el sistema no marca las entregas, las órdenes de restauración quedan "No preparadas" para siempre y se mezclan con los pedidos pendientes de preparar.
- **Propuesta:** sí; al entregar una pieza, el sistema marca su línea como preparada en Shopify. Cuando todas las piezas están entregadas y la orden está pagada, queda igual que sus ventas del POS. Requiere los permisos `read_merchant_managed_fulfillment_orders` y `write_merchant_managed_fulfillment_orders`.
- **Respuesta:** ✅ Sí, se marca como preparada al entregarla.

### P45 · ¿Se puede entregar una pieza si falta pagar el saldo? — Bloqueante (Fase 11)
- **Contexto:** el saldo se cobra antes de la entrega (N1), pero logística puede marcar entregas y no ve pagos.
- **Propuesta:** si la restauración tiene saldo pendiente (y no es "Al crédito"), el sistema no deja marcar "Entregada" y muestra "Falta cobrar el saldo", sin montos. Ventas y admin pueden entregar igual confirmándolo, para casos especiales (entregas parciales, clientes de confianza).
- **Respuesta:** ✅ De acuerdo con la propuesta.

### P46 · Cotizaciones de restauración por WhatsApp (pedido del 2026-10-05)
- **Contexto:** piden distinguir si un pedido llega **por WhatsApp o por oficina**. Lo que llega por WhatsApp es en realidad una **cotización**: el cliente manda fotos, se le cotizan varias piezas y al final suele pedir solo algunas. Quieren conservar la cotización completa porque el cliente puede volver a preguntar por una pieza ya cotizada. Si fuera una restauración más, ensuciaría los listados, la vista de logística, el dashboard, la numeración `RES-` y la creación de la orden de Shopify.
- **Respuesta (2026-10-05 y 2026-10-06):** ✅ opción A, con estas reglas:
  - (1) La casilla **"El pedido vino por WhatsApp"** del registro crea una **cotización** con código propio `CWA-00001`, no una restauración. Queda fija, nunca va a Shopify y **no lleva fotos** (las fotos solo van en las restauraciones reales).
  - (2) **"Crear restauración"** copia las piezas elegidas a una restauración normal (`RES-`, origen WhatsApp). Se hace cuando el cliente confirma, y las piezas entran **Aprobadas** y con ubicación "Sin enviar". Siempre se copia, aunque pida todas las piezas. _(Cambiado en P49: las piezas ya no se aprueban solas; cada una pasa al estado que elige el usuario. La ubicación inicial es "Por WhatsApp", según P48.)_
  - (3) Se puede copiar **varias veces**: cada pieza de la cotización muestra en qué restauración se pidió, y una ya pedida no se vuelve a elegir. En la copia se pueden cambiar precios y agregar piezas; el precio original queda en la cotización como referencia.
  - (4) **Cliente opcional** en la cotización: sin cliente se pueden anotar nombre y teléfono, ninguno obligatorio, y no se crea nada en Shopify. Al pasar a restauración el cliente es **obligatorio** y la cotización queda vinculada a él. Sin nombre, el saludo del mensaje es genérico; sin teléfono, solo hay "Copiar".
  - (5) Estados de la cotización: **Cotizada**, **Pedida en parte**, **Pedida completa** y **Descartada** (con motivo). Sin vencimiento automático: se muestra la antigüedad. Solo se edita hasta la primera copia.
  - (6) **Nunca se mezclan con las restauraciones en una misma vista:** tienen su propio menú y listado (con búsqueda por descripción de pieza), y en el detalle del cliente van en una pestaña aparte. El listado de restauraciones suma un filtro "Origen" (oficina o WhatsApp) y el dashboard medirá por origen.
  - (7) El origen no se cambia después de registrar; las restauraciones de oficina no tienen copia. Solo ventas y admin ven las cotizaciones. No se cruza con el cotizador `COT-`.
- **Supuestos (confirmar):**
  - (a) Si una pieza de la restauración copiada se anula, se rechaza o queda sin arreglo, su pieza vuelve a quedar pendiente en la cotización.
  - (b) Una cotización descartada no se copia; ventas o admin pueden **reabrirla**.
  - (c) La copia encola la orden de Shopify en cuanto todas sus piezas quedan aprobadas, igual que al aprobar una restauración completa. El adelanto al aprobar llega con la Fase 11. _(Con P49 esto ocurre al copiar solo si todas las piezas se eligen Aprobadas; si no, cuando se aprueben después.)_

### P47 · Nuevos estados de la pieza (pedido del 2026-10-06)
- **Contexto:** la Platería envió su lista de estados con colores: Consulta, Espera respuesta cliente, Aprobada, No tiene arreglo, Rechazado (cliente), Anulado, Interno, Aprobado urgente y Observación.
- **Respuesta (2026-10-06):** ✅
  - (1) **"Aprobado urgente" no es un estado:** es una marca aparte, "Urgente", por pieza.
  - (2) **"Interno"** es el nuevo nombre de "Enviada al taller".
  - (3) **Se quitan "Recibida" y "Devuelta por el taller".** La llegada a la tienda y la vuelta del taller pasan a ser cambios de **ubicación**: "Marcar llegada" y "Recibir del taller" ya no cambian el estado. Una pieza en Interno que volvió del taller queda "En tienda · Lista para entregar"; los días en taller y los estados Lista y Parcialmente lista de la restauración se mantienen.
  - (4) **Rechazado (cliente):** el cliente o la tienda no aceptan el trabajo antes de aprobarlo. Se llega desde Registrada, Consulta o Espera respuesta, con nota; es final. Reemplaza a "En espera → Anulada" (cambia D21). _(Cambiado en P50: solo desde Espera respuesta cliente.)_
  - (5) **Anulado** queda para errores de registro, duplicados o cancelaciones después de aprobar.
  - (6) **No tiene arreglo:** desde Consulta (lo decide la tienda) o desde Interno (lo avisa el taller), con nota; es final.
  - (7) **Rechazado y No tiene arreglo no se cobran**, igual que Anulado: salen del total, del mensaje y de la orden de Shopify.
  - (8) **"Devolver al cliente":** para piezas rechazadas o sin arreglo que están en la tienda. Guarda la fecha y la ubicación pasa a "Entregada", sin tocar Shopify ni pedir el saldo.
  - (9) **Observación:** desde Interno (ya de vuelta del taller) o desde Entregada (reclamo); vuelve a Interno (reenvío al taller) o pasa a Entregada si se resolvió en la tienda.
  - (10) La ubicación "Por recibir" pasa a llamarse **"Sin enviar"**, también en la BD.
- **Supuestos (confirmar):**
  - (a) Si todas las piezas quedan anuladas, rechazadas o sin arreglo, la restauración queda **Anulada**.
  - (b) **Urgente:** casilla por pieza en el registro y la edición (ventas y admin); logística la ve; en `/piezas` y el kanban las urgentes van primero y se filtran con "Solo urgentes"; no cambia el precio.
  - (c) Para enviar una pieza al taller debe estar en la tienda; para entregarla u observarla desde Interno debe haber vuelto del taller.

### P48 · Ubicaciones de la pieza y restauración "Rechazada" (2026-10-06)
- **Contexto:** al revisar los supuestos de P46 y P47, la Platería corrigió las ubicaciones y el estado general cuando todas las piezas quedan cerradas.
- **Respuesta (2026-10-06):** ✅
  - (1) **Cinco ubicaciones**, en orden: **Por WhatsApp** (pieza de una restauración que salió de una cotización de WhatsApp y aún no llega) → **Sin enviar** (en la tienda, aún no enviada al taller; con P50 también la pieza en Observación, por reenviar) → **En taller** → **En tienda** (volvió del taller) → **Entregada**. Una pieza anulada mantiene la ubicación **Anulada**.
  - (2) **Se quita la casilla "La pieza ya está en tienda"** (reemplaza P20): toda pieza registrada en oficina nace "Sin enviar"; las de WhatsApp pasan de "Por WhatsApp" a "Sin enviar" con "Marcar llegada".
  - (3) Se enviará al taller solo desde **Sin enviar**; desde Interno se entrega u observa solo cuando está **En tienda**.
  - (4) Si todas las piezas quedan cerradas, la restauración queda **Rechazada** si alguna fue rechazada o no tiene arreglo, y **Anulada** solo si todas se anularon (antes quedaba siempre Anulada, lo que parecía un error).
  - (5) Logística ve las restauraciones **Rechazadas mientras tengan piezas por devolver** al cliente; después pasan a ser pasadas (D24).
  - (6) Supuesto P46 (a) confirmado: si una pieza copiada se anula, se rechaza o queda sin arreglo, vuelve a quedar pendiente en la cotización. Reemplaza los supuestos P47 (a) y (c).

### P49 · Estado inicial de las piezas al pasar una cotización de WhatsApp a restauración (2026-10-07)
- **Contexto:** al pasar una cotización a restauración, las piezas se aprobaban solas y la restauración nacía Aprobada (con la orden de Shopify encolada). No siempre es así: el cliente puede pedir piezas que aún hay que consultar.
- **Respuesta (2026-10-07):** ✅
  - (1) Ni las piezas ni la restauración se aprueban solas: las piezas nacen **Registradas** y cada una pasa al **estado inicial** que elige el usuario en "Crear restauración".
  - (2) Opciones por pieza: **Consulta** o **Aprobada**; por defecto **Consulta**. También las piezas nuevas que se agregan en la copia.
  - (3) Consulta lleva **nota obligatoria por pieza**. No se puede saltar a "Espera respuesta cliente": la pieza sigue el flujo de siempre, Consulta → Espera respuesta cliente → Aprobada, con las acciones normales.
  - (4) El estado general de la restauración **se calcula como en oficina**: nace Registrada y pasa a Aprobada (y encola la orden de Shopify) cuando todas sus piezas activas están aprobadas. Si todas se eligen Aprobadas, queda Aprobada al copiar.
  - (5) Una pieza en Consulta ya cuenta como **pedida** en la cotización.

### P50 · Rechazo del cliente y ubicación de las piezas observadas (2026-10-08)
- **Contexto:** al revisar el diagrama de estados (`docs/flujo-estados.excalidraw`), la Platería corrigió dos puntos.
- **Respuesta (2026-10-08):** ✅
  - (1) **"Rechazado (cliente)" solo desde "Espera respuesta cliente"**: es ahí donde el cliente aprueba o rechaza la cotización. Desde Registrada o Consulta ya no se rechaza; si la pieza no sigue antes de eso, se **anula**. Ajusta P47 (4).
  - (2) Una pieza en **Observación** queda en la ubicación **Sin enviar** (en la tienda): hay que volver a programar su envío al taller. Vale para las dos observaciones: la que se hace al volver del taller y el reclamo después de la entrega. Ajusta P48 (1).
  - (3) Se reenvía con la acción de siempre, "Reenviar al taller" (Observación → Interno, ubicación En taller). Si se resuelve en la tienda, pasa a Entregada.

---

## Preguntas para el negocio

> Preguntas redactadas para hacérselas directamente a la Platería.

### N1 · ¿Cómo registran hoy los pagos a cuenta (adelanto + saldo)? — ✅ Respondida

**Respuestas (2026-10-02):**
1. Dónde registran el adelanto: **en ambos** (POS y panel).
2. Medios de pago: **efectivo, tarjeta, Yape y Plin**.
3. Cuándo: el **adelanto** al aprobar la cotización y el **saldo** al final, antes de la entrega.
4. El saldo se registra en la **misma orden**.
5. Usan el POS en **iPhone/iPad y en Android**. En Android el POS no permite cobrar el saldo de una orden parcialmente pagada (solo en iPhone/iPad).
6. Prefieren registrar los pagos **desde nuestro sistema** → diseño en **P43**.

**Formas de registrar pagos en Shopify (plan Grow, corregido el 2026-10-02):**

| # | Forma | ¿Pago parcial en Grow? | Comentario |
|---|---|---|---|
| 1 | Panel → "Cobrar pago" → "Marcar como pagado" | ❌ Solo el total | |
| 2 | Panel → registrar un pago con monto | ❌ Solo Plus | Los pagos parciales y depósitos en el panel son exclusivos de Plus. |
| 3 | POS → cobrar un monto → "Marcar como parcial" | ✅ | El saldo solo se cobra desde iPhone/iPad. |
| 4 | API: registrar un pago (`orderCreateManualPayment`) | ❌ Solo Plus | En Grow solo registra el pago que completa el saldo. |
| 5 | API: crear la orden con pagos incluidos (`orderCreate`) | ✅ Al crear la orden | Base de la propuesta de P43; se valida en el spike. |

### N2 · ¿El adelanto se entrega siempre después de aprobar la cotización? — ✅ Respondida
- **Respuesta (2026-10-02):** sí, siempre después de aprobar, porque el adelanto se calcula como el **50 %** del costo total. En algunos casos es otro porcentaje.

---

## Decisiones tomadas

| # | Decisión | Motivo |
|---|---|---|
| D01 | Next.js (App Router) + TypeScript + shadcn/ui + Tailwind | Pedido del proyecto |
| D02 | Supabase local con Docker (Supabase CLI) como entorno de prueba y Supabase Cloud como producción | Pedido del proyecto |
| D03 | Tests: Vitest + Testing Library + MSW (unit), pgTAP (BD), Playwright (E2E desktop y móvil) | Cobertura por capas |
| D04 | Shopify detrás de un puerto con adaptadores `live` y `fake`; los tests automáticos nunca llaman a Shopify real | Tests rápidos y seguros |
| D05 | Outbox para escrituras hacia Shopify + webhooks idempotentes | No perder órdenes ni pagos por errores de red |
| D06 | La BD es la fuente de verdad de los estados (RPC + triggers) y hay un test de consistencia con la máquina de estados en TypeScript | Evitar reglas duplicadas que diverjan |
| D07 | Conventional Commits en español; un commit por cada cambio o feature | Pedido del proyecto |
| D08 | pnpm y Node LTS | Reproducibilidad |
| D09 | Desarrollo con planes gratuitos (Vercel Hobby, Supabase Free) y producción con Vercel Pro + Supabase Pro; reintentos del outbox con Vercel Cron cada 5 min (requiere Pro) | P02, P40 |
| D10 | Plan Grow: sin pagos parciales ni depósitos en el panel ni por API (solo Plus); los perfiles de empresa sí están disponibles desde abril de 2026 | P07 |
| D11 | El adelanto se cobra después de aprobar: 50 % del total por defecto, editable por restauración | P10, N2 |
| D12 | Una línea personalizada (custom sale) por pieza en la orden | P11 |
| D13 | "Observada" (ahora "Observación") solo es posible después de que la pieza estuvo en el taller | P17, P47 |
| D14 | Se puede enviar una pieza al taller aunque otras sigan en consulta | P18 |
| D15 | Material y servicio: lista + texto libre | P22 |
| D16 | Logística no ve precios, pagos, métricas ni la pestaña "Historial"; no registra restauraciones; sube y edita fotos (por pieza y foto general) | P30, P42 |
| D17 | GitHub, Vercel y Supabase a nombre del desarrollador; la tienda de Shopify es de la Platería | P01 |
| D18 | Pruebas en una tienda de desarrollo de la organización del desarrollador; la tienda real no se usa para pruebas | P08 |
| D19 | Apps de Shopify creadas en el Dev Dashboard (token de 24 h que el sistema renueva); la de producción, en la organización de la Platería | P07 |
| D20 | Los pagos se registran desde nuestro sistema (efectivo, tarjeta, Yape, Plin), siempre en la misma orden | N1 |
| D21 | ~~El rechazo del cliente no se registra~~ → reemplazada por D46: el rechazo es el estado "Rechazado (cliente)" | P41, P47 |
| D22 | Toda edición queda en la auditoría (quién, cuándo, antes → después) | P12 |
| D23 | Se mantiene "En espera de respuesta del cliente" (ahora "Espera respuesta cliente"): consulta (opcional) → en espera → aprobada o rechazada | P41, P47 |
| D24 | Logística no ve restauraciones pasadas (entregadas o anuladas); sí ve la última observación y los días en taller | P42 |
| D25 | El cliente de una restauración no se cambia en el sistema; solo desde Shopify | P12 |
| D26 | Cambios de precio (admin), piezas agregadas o anuladas se reflejan automáticamente en la orden; correcciones de pagos con reembolso | P12 |
| D27 | Al entregar una pieza se marca su línea como "Preparado" en Shopify | P44 |
| D28 | Con saldo pendiente no se puede entregar (salvo "Al crédito"); ventas y admin pueden hacerlo confirmándolo | P45 |
| D29 | La guía de papel se digitaliza en el sistema y los pagos se registran desde ahí | P43 |
| D30 | Título de la línea en Shopify: solo el código (`Restauración RES-00001-1`) | P11, P12 |
| D31 | Si cambian el cliente de la orden en Shopify, la restauración se actualiza por webhook | P12 |
| D32 | Códigos `RES-00001` y pieza `RES-00001-1` | P24 |
| D33 | Las empresas son Companies de Shopify; sus contactos son contactos de la Company y las órdenes van a nombre de la empresa | P14 |
| D34 | El pago del saldo se registra en Shopify como "manual", salvo que el método exista en la tienda (Visa, Mastercard, transferencia bancaria, PagoEfectivo): entonces va con ese nombre. El adelanto (incluido al crear la orden) sí lleva el nombre real (Yape, Plin, etc.). El sistema siempre guarda el método real | Spike 4.1 |

| D35 | Lo que llega por WhatsApp se registra como **cotización** (`CWA-00001`): no es una restauración, no va a Shopify y no lleva fotos | P46 |
| D36 | "Crear restauración" copia las piezas elegidas a una restauración con origen WhatsApp; ~~entran Aprobadas~~ → pasan al estado inicial elegido (D51). Se puede repetir con las pendientes | P46, P49 |
| D37 | Cliente opcional en la cotización (nombre y teléfono libres, opcionales); obligatorio al copiarla, y la cotización queda vinculada a él | P46 |
| D38 | Estados de la cotización: Cotizada, Pedida en parte, Pedida completa, Descartada. Se edita solo hasta la primera copia | P46 |
| D39 | Cotizaciones y restauraciones nunca en la misma vista: menú propio, pestañas separadas en el cliente; filtro "Origen" en restauraciones | P46 |
| D40 | Solo ventas y admin ven las cotizaciones de WhatsApp; no se cruzan con el cotizador `COT-` | P46 |
| D41 | Estados de la pieza: Registrada, Consulta, Espera respuesta cliente, Aprobada, Interno, Observación, Entregada, Rechazado (cliente), No tiene arreglo y Anulado | P47 |
| D42 | Se quitan Recibida y Devuelta por el taller: la llegada y la vuelta del taller son cambios de ubicación ("Lista para entregar") | P47 |
| D43 | "Urgente" es una marca por pieza, no un estado | P47 |
| D44 | Rechazado y No tiene arreglo son finales y no se cobran (como Anulado); las piezas se devuelven al cliente con "Devolver al cliente" | P47 |
| D45 | La ubicación "Por recibir" pasa a "Sin enviar" (`sin_enviar`) | P47 |
| D46 | El rechazo del cliente se registra como "Rechazado (cliente)"; Anulado queda para errores y cancelaciones | P47 |
| D47 | Ubicaciones: Por WhatsApp → Sin enviar → En taller → En tienda (de vuelta del taller) → Entregada; Anulada para las piezas anuladas. Reemplaza D42 y D45 en lo que diga distinto | P48 |
| D48 | Sin casilla "La pieza ya está en tienda": las piezas de oficina nacen en la tienda; las de WhatsApp se marcan al llegar | P48, reemplaza P20 |
| D49 | Restauración con todas las piezas cerradas: Rechazada si alguna fue rechazada o sin arreglo; Anulada si todas se anularon | P48 |
| D50 | Logística ve las restauraciones Rechazadas mientras tengan piezas por devolver | P48, ajusta D24 |
| D51 | Al pasar una cotización de WhatsApp a restauración nada se aprueba solo: cada pieza elige Consulta (por defecto, con nota; luego sigue a Espera respuesta cliente → Aprobada) o Aprobada; la restauración nace Registrada y su estado se calcula como en oficina | P49, reemplaza D36 en lo del estado |
| D52 | "Rechazado (cliente)" solo desde "Espera respuesta cliente"; antes se anula | P50, ajusta P47 (4) y D46 |
| D53 | Una pieza en Observación queda en la ubicación "Sin enviar" hasta reenviarla al taller o entregarla | P50, ajusta P48 (1) y D47 |

---

## Registro de respuestas

| Fecha | Preguntas | Resumen |
|---|---|---|
| 2026-09-30 | P02, P07, P09, P10, P11, P17, P18, P22, P30 | Planes gratuitos para desarrollo; Shopify Grow; pagos desde el admin (falta detalle de pagos a cuenta → N1); adelanto después de aprobar (confirmar → N2); líneas personalizadas; "Observada" solo tras el taller; taller con piezas en consulta permitido; listas + texto libre; logística sin precios. Nuevas: P40–P42, N1, N2. |
| 2026-10-02 | N1, N2, P01, P08, P12, P40, P41, P42 | Pagos en POS y panel con efectivo, tarjeta, Yape y Plin; adelanto al aprobar (50 % u otro %) y saldo antes de entregar, en la misma orden; desde ahora, desde nuestro sistema. Cuentas a nombre del desarrollador y tienda de la Platería; producción en Pro. Sin rechazo en el sistema. Logística: sin métricas ni historial, solo fotos (por pieza y general). P12 en discusión. Hallazgos: pagos parciales solo Plus, apps en el Dev Dashboard, Companies en Grow. Nuevas: P43–P45. |
| 2026-10-05 | P13, P19, P20, P25 | Preguntar siempre si el precio incluye IGV (falta el efecto si no lo incluye); el estado general solo avanza; las piezas suelen llegar al registrar (casilla marcada por defecto); P25: piden propuesta concreta. |
| 2026-10-03 | P12, P41, P42, P43, P44, P45 | Propuesta de pagos aceptada (hoy la guía es de papel y el pago se registra en el POS con un texto libre); entrega bloqueada con saldo pendiente; se mantiene "En espera de respuesta del cliente"; logística sin historial de pedidos pero con última observación y días en taller; marcar "Preparado" al entregar; el cliente no se cambia en el sistema. Pendiente en P12: título de la línea y cambio de cliente hecho en Shopify. |
| 2026-10-03 | P12 (cierre), P24 | Título de la línea solo con el código; el cambio de cliente hecho en Shopify se refleja en el sistema; códigos `RES-00001`. No quedan preguntas bloqueantes. |
| 2026-10-04 | P14 | Empresas como Companies de Shopify (opción b). |
| 2026-10-04 | P15, P16, P27 | Datos obligatorios según la propuesta; edición sincronizada en ambos sentidos; ~1000 clientes en Shopify, importación construida ahora y ejecutada al pasar a producción. |
| 2026-10-05 | P46 | Cotizaciones por WhatsApp: código `CWA-`, copia parcial y repetible a una restauración con piezas aprobadas, estados propios, editable hasta la primera copia. |
| 2026-10-06 | P48 | Cinco ubicaciones (Por WhatsApp, Sin enviar, En taller, En tienda, Entregada) y Anulada aparte; sin casilla "ya está en tienda"; restauración Rechazada vs Anulada; logística ve las rechazadas con piezas por devolver. |
| 2026-10-08 | P50 | El cliente rechaza solo desde Espera respuesta cliente; una pieza en Observación queda Sin enviar (por reenviar al taller). |
| 2026-10-07 | P49 | Al pasar una cotización de WhatsApp a restauración, cada pieza elige Consulta (por defecto, con nota por pieza) o Aprobada; no se salta a Espera respuesta cliente; la restauración nace Registrada y se aprueba como en oficina. |
| 2026-10-06 | P46, P47 | Cotización sin fotos y con cliente opcional (obligatorio al copiar); nunca en la misma vista que las restauraciones. Estados nuevos de la pieza: Rechazado, No tiene arreglo, Interno, Observación; sin Recibida ni Devuelta; marca Urgente; "Sin enviar" en vez de "Por recibir". |

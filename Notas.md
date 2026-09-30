# Notas · Preguntas, respuestas y decisiones

> **Cómo responder:** cada pregunta trae una **propuesta**. Si estás de acuerdo basta con responder "OK" (p. ej., "P03 OK"); si no, indica el cambio.
> Iré registrando aquí tus respuestas y ajustando [`Todo.md`](./Todo.md).
> **Bloqueante** = hay que responderla antes de empezar la fase indicada.

**Última actualización:** 2026-09-30

## Resumen de pendientes

| Estado | Preguntas |
|---|---|
| Bloqueantes | P01, P08, P09 (→ N1), P12, P41, P42 |
| Pendientes (no bloquean el inicio) | P03–P06, P13–P16, P19–P21, P23–P29, P31–P39, P40 |
| Para preguntar al negocio | N1, N2 |
| Respondidas | P02, P07, P10 (confirmar N2), P11, P18, P22 |
| Respondidas en parte | P09, P17, P30 |

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
- **Respuesta:** _pendiente_

### P02 · ¿Qué planes de Supabase y Vercel se contratarán? — Bloqueante (Fase 4 y 16)
- **Contexto:** el plan Hobby de Vercel es solo para uso personal no comercial y su cron corre como máximo una vez al día (necesitamos reintentos frecuentes hacia Shopify). El plan Free de Supabase pausa los proyectos inactivos y no incluye backups diarios.
- **Propuesta:** Vercel Pro + Supabase Pro (backups diarios incluidos). Si se prefiere no pagar Vercel Pro, los reintentos pueden correr con `pg_cron` de Supabase.
- **Respuesta:** ✅ Para el desarrollo se usan los planes **gratuitos** (Supabase Free + Vercel Hobby). Consecuencia: los reintentos hacia Shopify corren con `pg_cron` + `pg_net` de Supabase (el cron de Vercel Hobby es 1 vez al día). Antes del lanzamiento hay que volver a decidir los planes de producción (Hobby no permite uso comercial y Supabase Free no tiene backups diarios) → ver **P40**.

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
- **Contexto:** necesitamos una app en la tienda con acceso a la API (clientes, órdenes, borradores de orden, edición de órdenes y productos). Algunas funciones (p. ej., B2B/Companies) dependen del plan.
- **Propuesta:** que el dueño de la tienda nos dé acceso de colaborador para crear la app con estos permisos mínimos: `read_customers`, `write_customers`, `read_orders`, `write_orders`, `read_draft_orders`, `write_draft_orders`, `write_order_edits`, `read_products`.
- **Respuesta:** ✅ Plan **Grow**. Implicancias: B2B/Companies y los depósitos en borradores de orden son exclusivos de Shopify Plus, así que no los usamos (refuerza la propuesta de P14). Order Editing y el registro de pagos manuales parciales por API (`orderCreateManualPayment`) sí están disponibles. Queda pendiente quién crea la app (P01).

### P08 · ¿Podemos usar una tienda de desarrollo para pruebas? — Bloqueante (Fase 4)
- **Contexto:** no queremos crear clientes ni órdenes de prueba en la tienda real.
- **Propuesta:** crear una tienda de desarrollo gratuita con algunos productos copiados del catálogo real. Los tests automáticos usan un "Shopify falso" y la tienda de desarrollo solo se usa para pruebas manuales.
- **Respuesta:** _pendiente_

### P09 · ¿Cómo registran hoy los pagos en Shopify? — Bloqueante (Fase 4)
- **Contexto:** los pagos llegan al sistema por webhook, así que necesitamos saber por dónde se registran: ¿POS en tienda?, ¿admin de Shopify ("marcar como pagado")?, ¿links de pago?, ¿transferencias/Yape/Plin registrados a mano? Para "A cuenta" hay que poder registrar **pagos parciales** en la orden.
- **Propuesta:** validarlo en el spike técnico (Paso 4.1). Si el canal que usan no permite registrar pagos parciales cómodamente, agregar en nuestro sistema un botón "Registrar pago" que lo registre en Shopify vía API.
- **Respuesta:** 🟡 Registran los pagos desde el **panel de administración** de Shopify. Falta confirmar con el negocio cómo registran hoy los pagos **a cuenta** → ver **Preguntas para el negocio · N1**.

### P10 · ¿Qué pasa si el cliente deja un adelanto antes de que exista la orden? — Bloqueante (Fase 9)
- **Contexto:** la orden en Shopify se crea cuando la restauración se **aprueba** (todas las piezas aprobadas). Pero en "A cuenta" el cliente podría dejar el adelanto al registrar, cuando todavía no hay orden donde registrar el pago (sobre todo si alguna pieza queda "En consulta").
- **Opciones:**
  - (a) El adelanto se cobra solo al aprobar la restauración.
  - (b) La orden se crea al registrar (pendiente de pago) y se actualiza al aprobar.
  - (c) El adelanto se anota en nuestro sistema y se traslada a la orden cuando se cree.
- **Propuesta:** (a) si su proceso lo permite; si no, (b).
- **Respuesta:** ✅ Opción **(a)**: el adelanto se entrega solo cuando la cotización ya fue aprobada, así que siempre existe la orden donde registrarlo. Confirmar con el negocio → **N2**.

### P11 · ¿Cómo se ven las líneas de la orden en Shopify? — Bloqueante (Fase 9)
- **Contexto:** las restauraciones no son productos del catálogo.
- **Propuesta:** una línea personalizada por pieza (no afecta stock), con título "Restauración RES-000123-1 · {descripción} · {servicio}" y su precio; la orden lleva la etiqueta `restauracion` y el código. Alternativa: un producto genérico "Servicio de restauración" para reportes en Shopify.
- **Respuesta:** ✅ Ya usan **líneas personalizadas** (venta personalizada) en sus órdenes: p. ej., la orden #4063 del POS de Miraflores tiene la línea "Guía #10117" (S/ 30.00, `_shopify_item_type: custom_sale`). Usamos una línea personalizada por pieza, sin afectar stock, con título `Restauración RES-000123-1 · {descripción} · {servicio}`.

### P12 · ¿Qué hacemos con cambios después de crear la orden? — Bloqueante (Fase 7 y 9)
- **Contexto:** después de aprobar puede anularse una pieza, cambiar un precio o agregarse una pieza nueva.
- **Propuesta:**
  - Anular pieza → la orden de Shopify se edita automáticamente (se quita la línea).
  - Cambiar precio → solo el administrador; la orden se edita automáticamente.
  - Agregar pieza → se agrega a la orden cuando esa pieza se apruebe.
  - Si el cliente ya pagó más que el nuevo total → alerta para hacer el reembolso manualmente en Shopify.
- **Respuesta:** _pendiente_

### P13 · ¿Los precios incluyen IGV?
- **Contexto:** aplica a restauraciones (orden de Shopify y mensaje de WhatsApp) y a cotizaciones (PDF). Depende también de la configuración de impuestos de la tienda.
- **Propuesta:** todos los precios incluyen IGV; en el PDF se puede mostrar el desglose (op. gravada + IGV 18 %) si lo desean.
- **Respuesta:** _pendiente_

### P14 · ¿Cómo registramos a las empresas en Shopify?
- **Contexto:** las funciones B2B/Companies de Shopify dependen del plan.
- **Propuesta:** la empresa se crea como cliente de Shopify con la razón social como nombre y el RUC en un metacampo; sus contactos se guardan solo en nuestra base de datos.
- **Respuesta:** _pendiente_

### P15 · ¿Hay clientes existentes en Shopify? ¿Los importamos?
- **Propuesta:** importación inicial de todos los clientes de Shopify a nuestra base + búsqueda en vivo en Shopify para los que se creen después desde otros canales.
- **Respuesta:** _pendiente_ (indicar número aproximado de clientes)

### P16 · Si se edita un cliente, ¿se actualiza en ambos lados?
- **Propuesta:** sí. Editar en nuestro sistema actualiza Shopify, y los cambios hechos en Shopify llegan por webhook (nombre, email, teléfono, dirección).
- **Respuesta:** _pendiente_

---

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
  - (a) Ese caso **no existe**: una pieza solo puede pasar a "Observada" después de haber llegado al taller. Se elimina la transición "En espera de respuesta → Observada".
  - Pendiente: ¿qué pasa cuando el cliente **rechaza** la propuesta de la consulta? (propuesta: vuelve a "En consulta" para una nueva propuesta, o se anula) → **P41**.
  - Pendiente: (b)–(f) → **P41**.

### P18 · ¿Se puede enviar una pieza al taller mientras otras piezas de la misma restauración siguen en consulta? — Bloqueante (Fase 8)
- **Contexto:** afecta el estado general y el momento en que se crea la orden en Shopify (que espera a que **todas** las piezas estén aprobadas).
- **Propuesta:** sí se permite (no se retrasa el trabajo); la orden se crea cuando todas las piezas no anuladas estén aprobadas.
- **Respuesta:** ✅ Sí se permite. Son casos raros, pero existen.

### P19 · ¿Validan cómo se calcula el estado general?
- **Contexto:** la regla propuesta está en `Todo.md` §7.3. Un caso a confirmar: si una pieza devuelta se observa y vuelve al taller, la restauración puede **retroceder** de "Lista" a "Parcialmente lista" o "En proceso".
- **Propuesta:** sí, el estado refleja siempre la situación real y puede retroceder.
- **Respuesta:** _pendiente_

### P20 · ¿La pieza suele llegar a la tienda al registrar la restauración?
- **Contexto:** si llega antes de aprobarse, debe pasar a "Recibida" apenas se apruebe; hay que saber que ya está físicamente en la tienda.
- **Propuesta:** en el registro, casilla "La pieza ya está en tienda" marcada por defecto; para las que llegan después, un botón "Marcar llegada" (lo usan logística y ventas).
- **Respuesta:** _pendiente_

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
- **Propuesta:** restauración `RES-000123`, pieza `RES-000123-1`. Imprimir etiquetas o stickers para identificar las piezas físicas queda como mejora futura (no incluida).
- **Respuesta:** _pendiente_

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
- **Respuesta:** _pendiente_

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
- **Respuesta:** _pendiente_

---

## E. Pagos

### P28 · Detalles de los tipos de pago
- **Preguntas:** ¿"A cuenta" exige un adelanto mínimo (%)? ¿"Al contado" significa que paga todo al aprobar? ¿"Al crédito" está disponible para cualquier cliente o solo para algunos (p. ej., empresas)? ¿Se puede cambiar el tipo de pago después?
- **Propuesta:** % mínimo de adelanto configurable (por defecto 50 %); crédito disponible para todos, pero solo ventas/admin lo eligen; el tipo de pago se puede cambiar mientras no haya pagos registrados.
- **Respuesta:** _pendiente_

### P29 · ¿Qué estados de pago usamos?
- **Propuesta:** Pendiente, Parcial, Pagado y Reembolsado (si se devuelve el dinero).
- **Respuesta:** _pendiente_

---

## F. Roles y usuarios

### P30 · ¿Validan la matriz de permisos? — Bloqueante (Fase 2)
- **Propuesta:**

| Acción | Admin | Ventas | Logística |
|---|:-:|:-:|:-:|
| Ver restauraciones y piezas | ✅ | ✅ | ✅ |
| Registrar / editar restauraciones y piezas | ✅ | ✅ | ❌ |
| Ver precios, pagos y saldos | ✅ | ✅ | ❌ |
| Consultas, aprobar y anular piezas | ✅ | ✅ | ❌ |
| Marcar llegada a tienda | ✅ | ✅ | ✅ |
| Enviar al taller y marcar devuelta por el taller | ✅ | ❌ | ✅ |
| Asignar / cambiar taller | ✅ | ✅ | ✅ |
| Entregar al cliente y observar | ✅ | ✅ | ✅ |
| Subir fotos y archivos | ✅ | ✅ | ✅ |
| Eliminar fotos y archivos | ✅ | Solo los suyos | Solo los suyos |
| Gestionar talleres | ✅ | ❌ | ✅ |
| Clientes y contactos | ✅ | ✅ | Solo ver |
| Cotizador | ✅ | ✅ | ❌ |
| Dashboard: métricas de ventas | ✅ | ✅ | ❌ |
| Dashboard: métricas operativas (estados, días en taller) | ✅ | ✅ | ✅ |
| Usuarios, configuración y catálogos | ✅ | ❌ | ❌ |
| Auditoría | ✅ | ❌ | ❌ |

- **Nota:** ocultar precios a logística se hace en la base de datos (no solo en pantalla), así que es importante definirlo desde el inicio.
- **Respuesta:** 🟡 Confirmado: **logística no ve precios ni pagos** (se aplica en la base de datos). Falta validar el resto de la matriz → **P42**.

### P31 · ¿Cuántos usuarios habrá y cómo inician sesión?
- **Propuesta:** email + contraseña; el administrador crea/invita a los usuarios (no hay registro público).
- **Respuesta:** _pendiente_ (indicar número aproximado por rol)

---

## G. Fotos y archivos

### P32 · ¿Qué archivos se pueden subir y quién puede borrarlos?
- **Propuesta:** JPG, PNG, HEIC/WebP y PDF; máximo 10 MB por archivo; las fotos se comprimen automáticamente (lado mayor 1920 px) para ahorrar espacio; sin límite de cantidad por pieza; clasificación Antes / Después / Documento / Otro; borran el administrador y quien lo subió.
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
- **Propuesta:** decidirlo antes del lanzamiento; como mínimo Supabase Pro (backups) y Vercel Pro, o hospedar la app en otro servicio si no se quiere pagar Vercel.
- **Respuesta:** _pendiente_

### P41 · Transiciones pendientes de la pieza — Bloqueante (Fase 8)
- (a') Si el cliente **rechaza** la propuesta de la consulta, ¿qué pasa? — **Propuesta:** vuelve a "En consulta" (se prepara otra propuesta) o se anula la pieza.
- (b) ¿Se puede "Observar" una pieza ya **entregada** (reclamo posterior)? Ya estuvo en el taller, así que encaja con la regla de P17. — **Propuesta:** sí.
- (c) ¿Una pieza anulada se puede **reactivar**? — **Propuesta:** no; se agrega una pieza nueva.
- (d) ¿Se puede **anular** una pieza que está en el taller? — **Propuesta:** solo el administrador.
- (e) ¿Se puede pasar de "Registrada" directo a "Aprobada" sin consulta? — **Propuesta:** sí.
- (f) ¿Una pieza "Devuelta por el taller" puede volver al taller sin pasar por "Observada"? — **Propuesta:** no.
- **Respuesta:** _pendiente_

### P42 · ¿Validan el resto de la matriz de permisos (P30)? — Bloqueante (Fase 2)
- **Contexto:** ya está confirmado que logística no ve precios ni pagos (tampoco el cotizador ni las métricas de ventas). Faltan las demás filas de la tabla de P30.
- **Respuesta:** _pendiente_

---

## Preguntas para el negocio

> Preguntas redactadas para hacérselas directamente a la Platería.

### N1 · ¿Cómo registran hoy los pagos a cuenta (adelanto + saldo)? — Bloqueante (Fase 4)

**Qué averiguamos (plan Grow):**

| # | Forma | ¿Permite pago parcial? | Comentario |
|---|---|---|---|
| 1 | **Admin → orden con pago pendiente → "Cobrar pago" → "Marcar como pagado"** | ❌ Solo el total | Sirve para "Al contado", no para adelantos. |
| 2 | **Admin → orden con condiciones de pago (payment terms) → registrar pago con monto** (efectivo, transferencia, Yape, etc.) | ✅ | La orden queda "Parcialmente pagada". Hay que verificar en la tienda de desarrollo que esté disponible en Grow (los *depósitos* automáticos en borradores de orden son solo Plus). |
| 3 | **POS (iPhone/iPad) → cobrar un monto → "Marcar como parcial"**; luego se recupera la orden y se cobra el saldo | ✅ | En POS para Android se puede dejar el pago parcial, pero el saldo solo se cobra desde iPhone/iPad. Su orden #4063 salió del POS de Miraflores. |
| 4 | **Admin → "Enviar factura" / link de pago** por el adelanto o el saldo | ✅ (el cliente paga en línea) | Útil si el cliente paga con tarjeta a distancia. |
| 5 | **Botón "Registrar pago" en nuestro sistema** (API `orderCreateManualPayment`) | ✅ | Registra el pago manual en la orden de Shopify sin depender de la interfaz de Shopify. Opción de respaldo si la 2 o la 3 no les resultan cómodas. |

**Preguntas tipo:**
1. Cuando un cliente deja un adelanto, ¿dónde lo registran hoy: en el POS de la tienda o en el panel de administración de Shopify? ¿Nos pueden mostrar cómo lo hacen con una orden real?
2. ¿Con qué medios pagan los clientes el adelanto y el saldo? (efectivo, tarjeta, Yape, Plin, transferencia…)
3. ¿Quién registra el pago y en qué momento: al recibir el dinero o después, al revisar la cuenta bancaria?
4. Cuando el cliente paga el saldo, ¿lo registran en la **misma orden** del adelanto o crean una orden nueva?
5. ¿El POS que usan es en iPhone/iPad o en Android?
6. ¿Les serviría registrar el pago desde nuestro sistema (y que se refleje solo en Shopify), o prefieren seguir haciéndolo en Shopify?

### N2 · ¿El adelanto se entrega siempre después de aprobar la cotización?

**Pregunta tipo:** "Cuando un cliente deja una pieza para restaurar, ¿en algún caso les deja dinero **antes** de aprobar la cotización? Por ejemplo, un pago por diagnóstico, por 'separar' el trabajo o porque ya sabe que quiere el servicio. Si pasa, ¿cómo lo registran hoy?"
- **Por qué importa:** la orden de Shopify se crea recién al aprobar; si hubiera pagos antes, habría que guardarlos en nuestro sistema y trasladarlos a la orden después (P10 opción c).

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
| D09 | Desarrollo con planes gratuitos; reintentos del outbox con `pg_cron` + `pg_net` de Supabase | P02 |
| D10 | Sin B2B/Companies ni depósitos de Shopify Plus (tienda en plan Grow) | P07 |
| D11 | El adelanto se registra en la orden de Shopify, que se crea al aprobar | P10 |
| D12 | Una línea personalizada (custom sale) por pieza en la orden | P11 |
| D13 | "Observada" solo es posible después de que la pieza estuvo en el taller | P17 |
| D14 | Se puede enviar una pieza al taller aunque otras sigan en consulta | P18 |
| D15 | Material y servicio: lista + texto libre | P22 |
| D16 | Logística no ve precios ni pagos (RLS en BD) | P30 |

---

## Registro de respuestas

| Fecha | Preguntas | Resumen |
|---|---|---|
| 2026-09-30 | P02, P07, P09, P10, P11, P17, P18, P22, P30 | Planes gratuitos para desarrollo; Shopify Grow; pagos desde el admin (falta detalle de pagos a cuenta → N1); adelanto después de aprobar (confirmar → N2); líneas personalizadas; "Observada" solo tras el taller; taller con piezas en consulta permitido; listas + texto libre; logística sin precios. Nuevas: P40–P42, N1, N2. |

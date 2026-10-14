# Mejoras de UI/UX · Ideas tomadas de Shopify Admin (Polaris) y Kommo CRM

> **Fecha:** 2026-10-13 · **Tipo:** investigación (no hay código en este documento).
> **Alcance:** funciones y patrones documentados por Shopify (Polaris, Help Center, shopify.dev) y por Kommo (centro de ayuda, docs para desarrolladores), y cómo aplicarlos a las pantallas actuales del sistema: Dashboard, Restauraciones (guías `RES-…`), Piezas (tabla tipo hoja y kanban), Detalle de pieza, Cotizaciones de WhatsApp (`CWA-…`), Clientes, Cotizaciones (`COT-…`), Talleres, Pagos, Auditoría.
> **Cómo se investigó:** las páginas **no se pudieron abrir directamente** desde este entorno (ver [Fuentes que fallaron](#fuentes-que-fallaron)). Toda la información sale de los resultados del buscador web, que citan y resumen esas páginas. Cada idea enlaza su fuente. Si la única fuente es de terceros, o si algo no se encontró, se indica.

**Leyenda:** Esfuerzo **S** = 1 día o menos · **M** = 2 a 5 días · **L** = más de 1 semana. Prioridad **Alta / Media / Baja**.

**Restricciones del proyecto que se respetan** (ver `Todo.md`):

- No hay envío automático de WhatsApp ni de email: los mensajes se copian o comparten a mano (§11).
- No hay app nativa: el sistema se usa en el navegador del celular y la computadora (§11).
- Los kanban de piezas permiten arrastrar entre estados (pedido del 2026-10-13), solo hacia las transiciones válidas del rol; el de guías no, porque su estado se calcula de las piezas.
- Ya existen: filtros en la URL, vista tabla/kanban, barra de acciones masivas (`PiecesBulkBar`), resaltado por días en taller, línea de tiempo por pieza, auditoría, motivo de descarte en las CWA, `sonner` (toasts) y `command.tsx` (cmdk) en `components/ui`, botón de impresión en Talleres.

---

## Resumen · Top 10 quick wins

| #   | Idea                                                                                                                               | Pantalla                                                      | Inspiración                                | Esfuerzo                | Prioridad |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ | ----------------------- | --------- |
| 1   | [S3 · Toda la fila lleva al detalle](#s3--toda-la-fila-lleva-al-detalle)                                                           | Restauraciones, Piezas, Clientes, CWA, COT                    | Polaris Index table                        | S                       | Alta      |
| 2   | [S5 · Insignias con tono y progreso](#s5--insignias-con-tono-y-progreso-pago-y-estado-general)                                     | Estado de pago, estado general                                | Polaris Badge                              | S                       | Alta      |
| 3   | [K12 · Filtros de un clic (chips)](#k12--filtros-predefinidos-de-un-clic)                                                          | Piezas, Restauraciones                                        | Kommo preset filters                       | S                       | Alta      |
| 4   | [C5 · Días en el estado actual con color](#c5--días-en-el-estado-actual-con-semáforo)                                              | Kanban, tabla de piezas                                       | Kommo (alerta de espera) + Polaris (tonos) | S                       | Alta      |
| 5   | [K10 · Campos obligatorios por estado](#k10--campos-obligatorios-por-estado)                                                       | Cambio de estado de la pieza                                  | Kommo required fields by stage             | S–M                     | Alta      |
| 6   | [K6 · Mensaje de WhatsApp sugerido al entrar a un estado](#k6--mensaje-sugerido-al-entrar-a-un-estado-versión-manual-del-salesbot) | Detalle de pieza / guía                                       | Kommo Salesbot por etapa                   | S–M                     | Alta      |
| 7   | [S13 · "Cosas por hacer" con contadores](#s13--cosas-por-hacer-con-contadores-en-el-dashboard)                                     | Dashboard                                                     | Shopify Home "Things to do next"           | S–M                     | Alta      |
| 8   | [S1 · Vistas guardadas en pestañas](#s1--vistas-guardadas-en-pestañas)                                                             | Restauraciones, Piezas                                        | Shopify Orders + Polaris Index filters     | S (fijas) / M (propias) | Alta      |
| 9   | [K11 · Motivos estructurados y análisis de pérdidas](#k11--motivos-estructurados-y-análisis-ganadoperdido)                         | Rechazada / Sin arreglo / Anulada / CWA descartada, Dashboard | Kommo Win-Loss analysis                    | S–M                     | Alta      |
| 10  | [S11 · Búsqueda global con Ctrl/⌘ + K](#s11--búsqueda-global-con-ctrl--k)                                                          | Toda la app                                                   | Shopify admin search                       | M                       | Alta      |

---

## 1. Shopify Admin / Polaris

### S1 · Vistas guardadas en pestañas

- **Qué es:** en Pedidos, una combinación de filtros se guarda como vista con nombre ("Guardar como" → nombre → "Guardar vista"). La vista "Sin preparar" que viene por defecto es solo un filtro guardado. Polaris `IndexFilters` junta búsqueda, filtros y orden, y deja guardar el resultado como vista.
- **Fuente:** [Shopify · Searching, viewing and printing orders](https://help.shopify.com/manual/orders/search-view-print-orders), [Polaris · Index filters](https://polaris.shopify.com/components/selection-and-input/index-filters).
- **Aplicación:** pestañas arriba de `/restauraciones` y `/piezas`. Fijas por rol: logística "Por enviar al taller", "En taller > 7 días", "Por devolver"; ventas "Espera respuesta", "Listas para entregar", "Sin pagar". Más adelante, vistas propias por usuario. Como los filtros ya viven en la URL, cada vista es una URL con nombre.
- **Beneficio:** cada rol abre su lista de trabajo en un clic y no rearma filtros.
- **Esfuerzo:** S (vistas fijas en código) · M (vistas propias guardadas en BD) · **Prioridad:** Alta

### S2 · Columnas configurables guardadas en cada vista

- **Qué es:** en Pedidos se muestran, ocultan y reordenan columnas, y el orden queda guardado en cada vista (changelog de 2021).
- **Fuente:** [Shopify Changelog · Customize your orders list](https://changelog.shopify.com/posts/customize-your-orders-list-and-get-to-work-faster), [Help Center](https://help.shopify.com/manual/orders/search-view-print-orders).
- **Aplicación:** la tabla tipo hoja de `/piezas` tiene muchas columnas (foto, guía, cliente, descripción, servicio, material · medida · peso, estado, taller, días, costo, precio). Agregar un menú "Columnas" y guardar la elección en la vista (S1), o por usuario en `localStorage`.
- **Beneficio:** menos desplazamiento horizontal. Logística y admin ven lo suyo.
- **Esfuerzo:** S (TanStack ya tiene visibilidad de columnas) · **Prioridad:** Media

### S3 · Toda la fila lleva al detalle

- **Qué es:** Polaris pide que las filas de una index table "hagan algo al hacer clic": abrir el detalle del recurso. El enlace principal se marca con `data-primary-link` y el clic en cualquier parte de la fila navega. Recomienda paginar a partir de 50 ítems.
- **Fuente:** [Polaris · Index table](https://polaris.shopify.com/components/index-table), [Comunidad Shopify · onClick en filas](https://community.shopify.com/t/how-can-i-add-onclick-functionality-to-indextable-rows/103449).
- **Aplicación:** en las tablas de restauraciones, piezas, clientes, CWA y COT, el clic en la fila abre el detalle (salvo en checkboxes y celdas editables como `MoneyCell`). El código sigue siendo un `<a>` real, para abrir en otra pestaña y para la accesibilidad.
- **Beneficio:** objetivo de clic más grande, sobre todo en tablet y celular.
- **Esfuerzo:** S · **Prioridad:** Alta

### S4 · "Seleccionar todo" explícito entre páginas y en el celular

- **Qué es:** la guía de migración de la index table pide que seleccionar todo lo que hay en todas las páginas sea un modo explícito, con su propio conteo y consulta en el servidor, y que en el celular el "seleccionar todo" esté en la barra de acciones masivas. Las acciones masivas sirven para tareas que se repiten sobre muchos ítems.
- **Fuente:** [shopify.dev · Migrate Index Table](https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/index-table).
- **Aplicación:** en `PiecesBulkBar`, el texto "Seleccionar las 87 piezas que coinciden con el filtro", con la acción hecha en el servidor por filtro y no por IDs visibles. En el celular, la casilla "Seleccionar todo" dentro de la barra.
- **Beneficio:** enviar o recibir muchas piezas de un taller sin ir página por página.
- **Esfuerzo:** M · **Prioridad:** Media

### S5 · Insignias con tono y progreso (pago y estado general)

- **Qué es:** el badge de Polaris combina un tono (info, success, warning, critical, attention) con un indicador de progreso (incompleto, parcial, completo). En el ejemplo de la tabla de pedidos se ven "Partially paid" con progreso parcial y "Unfulfilled" con progreso incompleto. Los estados van en participio ("Pagado", "Reembolsado").
- **Fuente:** [Polaris · Index table (ejemplo)](https://polaris.shopify.com/examples/index-table-default), [guía del Badge (copia de los docs de Polaris)](https://cdn.jsdelivr.net/npm/@combine-labs/combine-polaris@0.1.12/docs/components/Badge/README.md).
- **Aplicación:** estado de pago (Pendiente ○, Parcial ◐, Pagado ●) y estado general "Parcialmente aprobada" ◐ con el mismo icono de progreso. Así no dependen solo del color (accesibilidad). Revisar que las etiquetas estén en participio.
- **Beneficio:** el avance se lee de un vistazo, también para quien no distingue colores.
- **Esfuerzo:** S · **Prioridad:** Alta

### S6 · Detalle con columna principal y columna lateral

- **Qué es:** patrón "Resource details layout": encabezado de ancho completo con las acciones, columna principal (~2/3) con lo que define el recurso y columna lateral (~1/3) con el contexto. El contenido va en tarjetas que agrupan lo relacionado.
- **Fuente:** [Polaris · Resource details layout](https://polaris.shopify.com/patterns/resource-details-layout), [Polaris · Layout](https://polaris.shopify.com/components/layout).
- **Aplicación:** en el detalle de guía y de pieza, la columna principal lleva piezas, fotos antes/después y la línea de tiempo. La lateral lleva tarjetas de Cliente (con el botón de WhatsApp), Pagos (total, cobrado, saldo), Orden de Shopify (estado de sincronización), Taller y Notas. En el celular, una sola columna con la lateral debajo.
- **Beneficio:** lo operativo queda al centro y lo de consulta a mano. Es el mismo patrón que el equipo ya ve en Shopify.
- **Esfuerzo:** M · **Prioridad:** Alta

### S7 · Comentarios internos en la línea de tiempo, con menciones y adjuntos

- **Qué es:** la Timeline de pedidos, clientes y pedidos preliminares junta el historial con comentarios internos que el cliente no ve. Se puede @mencionar a alguien del equipo (le llega un email, y una notificación push si usa la app), adjuntar archivos (p. ej., una foto del estado del artículo) y editar el comentario propio solo durante 5 minutos. Los pagos aparecen como eventos.
- **Fuente:** [Shopify · Timeline](https://help.shopify.com/en/manual/shopify-admin/timeline), [Shopify · Managing order details](https://help.shopify.com/manual/orders/manage-orders/managing-orders).
- **Aplicación:** en la línea de tiempo de la pieza y de la guía, una caja "Agregar comentario" con @usuario (p. ej., "@logística el taller pide más plazo") y adjuntos que se guardan como fotos de la pieza. Los pagos de Shopify y los cambios de estado salen como eventos en la misma lista.
- **Beneficio:** las coordinaciones dejan de ir por chats personales y quedan en la pieza, auditadas.
- **Esfuerzo:** M (comentarios y adjuntos) · L (menciones con notificación, ver K14) · **Prioridad:** Alta

### S8 · Barra de "Cambios sin guardar"

- **Qué es:** al editar un formulario aparece una barra con "Guardar" y "Descartar". El mensaje es corto: "Cambios sin guardar", o "{Recurso} sin guardar" si es nuevo. Los botones usan verbos solos. Al salir de la página con cambios pendientes se pide confirmación. Se recomienda no tener varios formularios editables a la vez en una página y usar "Editar" con un modal para secciones aparte.
- **Fuente:** [Polaris · Contextual save bar](https://polaris.shopify.com/components/contextual-save-bar), [shopify.dev · Save Bar API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/save-bar-api.md).
- **Aplicación:** en el registro de restauración, el editor de COT y Configuración: barra fija "Cambios sin guardar · Descartar · Guardar" y aviso al salir (`beforeunload` y navegación interna).
- **Beneficio:** no se pierden cotizaciones ni registros largos a medio llenar.
- **Esfuerzo:** S–M · **Prioridad:** Media

### S9 · Reglas para los toasts

- **Qué es:** mensajes de 3 palabras como máximo; una acción solo si también está en otro lugar de la página (p. ej., "Deshacer"); verbos cortos (Deshacer, Reintentar, Ver), nunca "OK" ni "Cerrar"; al menos 10 000 ms de duración por accesibilidad (el ejemplo de la API nueva usa 5000 ms, así que hay discrepancia).
- **Fuente:** [Polaris · Toast](https://polaris.shopify.com/components/deprecated/toast), [shopify.dev · Toast API](https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/toast-api.md).
- **Aplicación:** estandarizar `sonner`: "Piezas enviadas" con la acción "Ver" (que abre el filtro de esas piezas), "Pago registrado", "Mensaje copiado". Los errores de la BD van en un toast con "Reintentar".
- **Beneficio:** mensajes uniformes y legibles.
- **Esfuerzo:** S · **Prioridad:** Media

### S10 · Estados vacíos con una sola acción principal

- **Qué es:** cuando una lista, tabla o gráfico no tiene datos, se muestra una ilustración, un texto y un solo botón principal con verbo fuerte ("Crear pedido", no "Nuevo pedido"), más un botón secundario opcional ("Más información").
- **Fuente:** [Polaris · Empty state](https://polaris.shopify.com/components/empty-state).
- **Aplicación:** las listas sin registros muestran "Registrar restauración", "Crear cotización de WhatsApp" o "Agregar taller". Un filtro sin resultados muestra "Limpiar filtros". En logística sin piezas pendientes: "No hay piezas por enviar".
- **Beneficio:** el primer uso y los filtros vacíos se entienden sin ayuda.
- **Esfuerzo:** S · **Prioridad:** Media

### S11 · Búsqueda global con Ctrl/⌘ + K

- **Qué es:** el buscador del admin se abre con Ctrl/⌘ + K. Muestra las búsquedas recientes (con opción de borrarlas), filtros por tipo (Pedidos, Clientes, Productos, …), 7 resultados como máximo y "Mostrar # más".
- **Fuente:** [Shopify · Searching your Shopify admin](https://help.shopify.com/en/manual/shopify-admin/admin-search).
- **Aplicación:** paleta con `command.tsx` (ya instalado) en el encabezado. Busca `RES-00012`, `RES-00012-3`, `CWA-…`, `COT-…`, nombre, documento o teléfono del cliente. Grupos por tipo, recientes en `localStorage` y respeto de los permisos del rol.
- **Beneficio:** el cliente pregunta "¿cómo va mi pieza?" y se ubica en segundos desde cualquier pantalla.
- **Esfuerzo:** M · **Prioridad:** Alta

### S12 · Atajos de teclado

- **Qué es:** `?` abre la lista de atajos. `S` enfoca la búsqueda y `F` los filtros. Las secuencias de dos teclas (p. ej., `G H`) deben teclearse en menos de un segundo.
- **Fuente:** [Shopify · Keyboard shortcuts](https://help.shopify.com/en/manual/productivity-tools/keyboard-shortcuts) (otros atajos como `A O` o `G H` solo aparecen en [guías de terceros](https://sufio.com/learn/tips/shopify/shopify-keyboard-shortcuts-for-improved-productivity/)).
- **Aplicación:** `?` muestra la ayuda, `/` o `S` enfoca la búsqueda, `N R` abre "Nueva restauración", `N W` "Nueva CWA", `G P` va a Piezas, `G D` al Dashboard, `T`/`K` cambian entre tabla y kanban.
- **Beneficio:** ventas en mostrador trabaja más rápido.
- **Esfuerzo:** S–M · **Prioridad:** Baja

### S13 · "Cosas por hacer" con contadores en el Dashboard

- **Qué es:** la página de inicio del admin tiene "Things to do next", con las tareas abiertas agrupadas por tipo y su número (cobrar un pago, preparar pedidos, procesar devoluciones, revisar pedidos de riesgo).
- **Fuente:** [Shopify Help · Shopify Home](https://help.shopify.com/Shopify/shopify_api_console) (resultado del Help Center sobre la página de inicio).
- **Aplicación:** bloque arriba del dashboard (o en el inicio de cada rol) con contadores clicables que llevan a la vista filtrada. Admin: "Piezas sin precio de venta" (P51), "Órdenes con error de sincronización". Ventas: "Espera respuesta > 3 días", "Listas para entregar", "Saldo por cobrar". Logística: "Por enviar al taller", "En taller > 7 días".
- **Beneficio:** convierte el dashboard en una lista de trabajo y no solo de métricas.
- **Esfuerzo:** S–M (encaja con el Paso 13.2 "accesos rápidos") · **Prioridad:** Alta

### S14 · Etiquetas internas con edición masiva

- **Qué es:** etiquetas libres en pedidos, clientes, productos y pedidos preliminares. El cliente no las ve. Sirven para agrupar, buscar y filtrar, y se agregan o quitan en bloque (también desde el celular en pedidos).
- **Fuente:** [Shopify · Creating and using tags](https://help.shopify.com/en/manual/productivity-tools/using-tags).
- **Aplicación:** etiquetas en guías y clientes ("Corporativo", "Reclamo", "Cliente frecuente", "Pieza de valor") con filtro "Con etiqueta" y la acción masiva "Agregar etiqueta". No reemplazan a los estados.
- **Beneficio:** clasificaciones ad hoc sin tocar el modelo de datos cada vez.
- **Esfuerzo:** M · **Prioridad:** Baja

### S15 · Flujo de "lista para recoger"

- **Qué es:** en el retiro en tienda, el personal verifica cada artículo, avisa al cliente que el pedido está listo y lo marca como entregado cuando lo recoge. Aparte, los pedidos "En espera" (on hold) bloquean la preparación y salen de la lista "Sin preparar".
- **Fuente:** [Shopify · Local pickup for online orders](https://help.shopify.com/manual/sell-in-person/shopify-pos/order-management/local-pickup-for-online-orders), [Shopify · Holding fulfillments](https://help.shopify.com/en/manual/orders/fulfillment/fulfilling-orders/holds).
- **Aplicación:** para las piezas "Lista para entregar", una casilla "Verificada en tienda" (foto "Después" + revisión), el botón "Avisar al cliente" (copia el mensaje o abre `wa.me`, ver K6) que registra la fecha del aviso, y "Entregar". Las piezas en "Espera respuesta cliente" no aparecen en las listas operativas de logística.
- **Beneficio:** se sabe a quién ya se avisó y desde cuándo espera la pieza.
- **Esfuerzo:** S–M · **Prioridad:** Media

### S16 · Impresión de documentos con plantilla y en bloque

- **Qué es:** plantilla de "packing slip" editable con logo y dirección, con vista previa. Se imprimen varios pedidos a la vez: seleccionar → "Imprimir" → "Imprimir packing slips". Hay plantillas de la comunidad para impresoras de etiquetas de 4×6.
- **Fuente:** [Shopify · Customizing packing slips](https://help.shopify.com/en/manual/orders/customize-packing-slips), [Comunidad · plantilla 4×6](https://community.shopify.com/t/customize-your-packing-slip-template-to-use-4x6-inch-format/106496/1).
- **Aplicación:** "Imprimir cargo de recepción" de la guía (cliente, piezas, fotos antes, firma) y "Orden de taller" en bloque desde `/piezas` al enviar al taller (ya hay un botón de impresión en Talleres). Las etiquetas por pieza (`RES-00001-1`) quedaron como mejora futura (P24) y podrían usar este mismo mecanismo.
- **Beneficio:** el cargo en papel sale del sistema y no se llena a mano.
- **Esfuerzo:** M · **Prioridad:** Media

### S17 · Cotización con vencimiento y estado "Vencida"

- **Qué es:** en un pedido preliminar se elige "Pago pendiente" con condiciones: al recibir, a N días o en fecha fija. Si no se paga a tiempo, el pedido pasa a "Overdue". La factura lleva un enlace al checkout.
- **Fuente:** [Shopify · Creating draft orders](https://help.shopify.com/manual/orders/create-order/create-draft), [Changelog · payment terms](https://changelog.shopify.com/posts/send-draft-order-invoices-with-payment-terms).
- **Aplicación:** en `COT-…` y `CWA-…`, el campo "Válida hasta" (p. ej., 15 días), la insignia "Vencida" y el filtro de vencidas. En el saldo de una guía, "Fecha límite de pago" con la insignia de vencido.
- **Beneficio:** cotizaciones viejas con precios desactualizados quedan a la vista, y es fácil hacer seguimiento.
- **Esfuerzo:** S–M · **Prioridad:** Media

### S18 · Edición tipo hoja de cálculo

- **Qué es:** el editor masivo de productos es una vista de hoja de cálculo: se elige qué columnas editar, se escribe en las celdas, se copia y pega, se arrastra un valor a varias filas y se pasa de celda con Tab. _Solo hay fuentes de terceros, que se contradicen sobre si existe Ctrl+Z._
- **Fuente:** [Barn2 · bulk edit products in Shopify](https://barn2.com/blog/bulk-edit-products-shopify/), [Magecomp](https://magecomp.com/blog/shopify-bulk-editor-for-multiple-products/amp).
- **Aplicación:** en la tabla de `/piezas`, que `MoneyCell` (costo y precio) pase a la celda de abajo con Enter o Tab y acepte pegar una columna desde Excel con confirmación previa.
- **Beneficio:** el admin pone precios a 20 piezas en un minuto.
- **Esfuerzo:** M · **Prioridad:** Media

### S19 · Segmentos de clientes

- **Qué es:** los segmentos filtran clientes por etiqueta, número de pedidos, monto gastado y fecha del último pedido.
- **Fuente:** [Shopify · Customer segment filters](https://help.shopify.com/en/manual/customers/customer-segmentation/reference-guide/shopify-segments).
- **Aplicación:** en `/clientes`, filtros por N.º de restauraciones, monto total, última restauración (p. ej., "más de 12 meses") y etiqueta. Exportar CSV para campañas manuales.
- **Beneficio:** identifica a los clientes frecuentes y a los inactivos.
- **Esfuerzo:** M · **Prioridad:** Baja

---

## 2. Kommo CRM

### K1 · Kanban con arrastrar y soltar y zonas de cierre

- **Qué es:** se arrastra el lead a otra etapa para cambiar su estado. Al arrastrar aparecen abajo las zonas "Ganado" y "Perdido". Las etapas tienen colores y el admin las reordena (solo los admins editan pipelines).
- **Fuente:** [Kommo · Move leads through pipeline stages](https://support.kommo.com/docs/move-leads-through-pipeline-stages), [Kommo · Pipelines overview](https://support.kommo.com/docs/pipelines-overview), [Kommo KB · Pipelines](https://www.kommo.com/support/kb/pipelines).
- **Aplicación:** _(arrastre implementado el 2026-10-13; queda como idea las zonas de cierre.)_ En el kanban de piezas, al arrastrar solo se resaltan las columnas válidas (`availableTransitions` del rol), y al soltar se abre `StatusChangeDialog` (nota o taller). Abajo, zonas "Rechazada", "Sin arreglo" y "Anulada", que piden motivo (K11).
- **Beneficio:** el gesto natural de un kanban, sin saltarse las reglas.
- **Esfuerzo:** M · **Prioridad:** Media (depende de la decisión)

### K2 · Ficha con datos a un lado y feed de actividad al otro

- **Qué es:** la ficha del lead tiene dos zonas: los datos del lead (contacto, etapa, etiquetas) y el feed con la historia completa (llamadas, tareas, notas, chats, cambios de etapa). Abajo hay un compositor ("Nota" → otras opciones) y el ícono de ojo filtra qué tipos de evento se ven. _Las fuentes no coinciden en el lado de cada zona._
- **Fuente:** [Kommo KB · Leads](https://www.kommo.com/support/kb/leads/), [Kommo · Lead profile](https://kommo.com/support/kb/lead-profile), [amoCRM · Leads](https://www.amocrm.com/leads/).
- **Aplicación:** junto con S6 y S7, la línea de tiempo del detalle de pieza o guía con filtro por tipo (Estados, Pagos, Fotos, Comentarios, Cambios de datos, Shopify) y compositor abajo.
- **Beneficio:** una sola historia por pieza en lugar de las pestañas Historial y Auditoría por separado.
- **Esfuerzo:** M · **Prioridad:** Alta

### K3 · Tarjeta del kanban configurable

- **Qué es:** en el diseño de la tarjeta se elige si se ve el avatar del contacto y el último mensaje del lead.
- **Fuente:** [Kommo · Customize your lead card layout](https://support.kommo.com/docs/customize-your-lead-card-layout).
- **Aplicación:** la tarjeta de pieza del kanban muestra la miniatura de la foto "Antes" (ya se carga en la tabla), cliente, días en el estado (C5), insignia "Urgente" y la última observación (ya existe). Un interruptor "Tarjetas compactas / con foto".
- **Beneficio:** se reconoce la pieza física por la foto, más rápido que por el código.
- **Esfuerzo:** S · **Prioridad:** Media

### K4 · Tareas y seguimientos con vencimiento

- **Qué es:** tareas con responsable, fecha límite y tipo ("Follow-up", "Meeting" y tipos propios), siempre ligadas a un lead o conversación. Vista de tablero con vencidas, hoy, mañana, esta semana y la próxima, más una lista de pendientes del equipo. Las tareas pueden guardar un resultado al cerrarse (dato visto en una integración de terceros). El estado de las tareas de cada lead se marca con colores.
- **Fuente:** [Kommo · Create and assign tasks](https://support.kommo.com/docs/create-assign-tasks), [Kommo tour · Tasks](https://kommo.com/tour/tasks), [Pluga · campos de tarea](https://pluga.co/en/apps/todoist/integration/kommo/).
- **Aplicación:** "Seguimientos" en pieza, guía y CWA: "Llamar al cliente por la respuesta", "Recoger del taller", "Cobrar saldo". Página "Mis seguimientos" (vencidos / hoy / semana) e indicador en la tarjeta del kanban: sin seguimiento, vencido o al día.
- **Beneficio:** ninguna pieza en "Espera respuesta" queda olvidada.
- **Esfuerzo:** L · **Prioridad:** Alta

### K5 · Automatizaciones por etapa

- **Qué es:** con el "+" debajo de una etapa se agregan disparadores: crear tarea (con condiciones, p. ej., etiqueta VIP; plazo; responsable), cambiar de etapa, enviar webhook, agregar etiquetas o cambiar el responsable.
- **Fuente:** [Kommo · Set up digital pipeline triggers](https://support.kommo.com/docs/set-up-digital-pipeline-triggers), [amoCRM · Pipeline triggers](https://www.amocrm.com/support/kb/pipeline-triggers/).
- **Aplicación:** reglas fijas en código (sin editor visual). Al entrar a "Espera respuesta cliente", crear el seguimiento "Confirmar respuesta" a 2 días. Al entrar a "Interno / en taller", crear "Recoger del taller" con el plazo del taller. Al quedar "Lista para entregar", crear "Avisar al cliente".
- **Beneficio:** los seguimientos se crean solos y el equipo no tiene que acordarse.
- **Esfuerzo:** M (requiere K4) · **Prioridad:** Media

### K6 · Mensaje sugerido al entrar a un estado (versión manual del Salesbot)

- **Qué es:** el Salesbot se activa cuando un lead "se mueve a una etapa" (con retraso opcional) o al crearse en ella, y puede enviar mensajes por WhatsApp (de forma nativa o con widgets de terceros).
- **Fuente:** [Kommo · Salesbot triggers](https://www.kommo.com/support/crm/salesbot-triggers/), [Wazzup · Salesbot y WhatsApp](https://wazzup24.com/help/kommo-en/how-to-write-to-a-client-on-whatsapp-with-salesbot/).
- **Aplicación:** sin envío automático (§11). Tras un cambio de estado, el toast o diálogo ofrece "Copiar mensaje para el cliente" o "Abrir WhatsApp" (`wa.me` con el texto). Plantillas por estado: Aprobada ("Recibimos su aprobación…"), Lista para entregar, Sin arreglo, Observada.
- **Beneficio:** mensajes consistentes y rápidos, sin automatizar lo que está fuera de alcance.
- **Esfuerzo:** S–M · **Prioridad:** Alta

### K7 · Biblioteca de plantillas que se insertan escribiendo

- **Qué es:** hay plantillas generales (respuestas rápidas) y plantillas de WhatsApp aprobadas por Meta (con encabezado, cuerpo, pie y botones). En el chat de la ficha se escriben las primeras letras del nombre de la plantilla y se elige.
- **Fuente:** [Kommo · Create and use chat templates](https://support.kommo.com/docs/create-and-use-chat-templates.md), [Kommo blog · WhatsApp templates](https://www.kommo.com/blog/templates-for-whatsapp-crm/).
- **Aplicación:** en Configuración, plantillas con variables (`{cliente}`, `{codigo}`, `{total}`, `{saldo}`, `{taller_plazo}`) que se usan en K6, en las CWA y en "Avisar al cliente". En el editor de la CWA, escribir `/` muestra la lista.
- **Beneficio:** un solo lugar para el tono de la marca. Las plantillas se cambian sin pasar por el desarrollador.
- **Esfuerzo:** M · **Prioridad:** Media

### K8 · Alerta de cliente sin respuesta

- **Qué es:** la plantilla de Salesbot avisa al equipo cuando un cliente lleva más de N minutos sin respuesta (5 como mínimo, editable).
- **Fuente:** [Kommo · Use Salesbot templates](https://www.kommo.com/support/kb/salesbot-templates).
- **Aplicación:** el mismo concepto en días, en dos direcciones: CWA "cotizada" sin respuesta del cliente después de N días y piezas en "Espera respuesta cliente" después de N días. Resaltado como `WORKSHOP_DAYS_ALERT`, contador en S13 y umbral configurable.
- **Beneficio:** se recuperan ventas que hoy se enfrían.
- **Esfuerzo:** S · **Prioridad:** Alta

### K9 · Bandeja de entrantes: aceptar, rechazar o vincular

- **Qué es:** "Incoming leads" es una etapa gris de espera donde llegan mensajes, chats y formularios antes de ser leads. Cada uno se acepta, se rechaza o (si es chat) se vincula a un lead existente. Los duplicados se marcan con una etiqueta.
- **Fuente:** [Kommo · Handle incoming leads](https://www.kommo.com/support/crm/incoming-leads/), [Kommo dev · Incoming leads](https://developers.kommo.com/reference/incoming-leads).
- **Aplicación:** la CWA ya cumple este papel. Mejoras: en la CWA, el botón "Convertir en restauración" (prellena la guía con cliente y piezas) y "Vincular a cliente existente", que detecta el teléfono repetido (K13).
- **Beneficio:** menos doble digitación entre la CWA y la guía.
- **Esfuerzo:** M · **Prioridad:** Media

### K10 · Campos obligatorios por estado

- **Qué es:** al configurar un campo se marcan las etapas en las que es obligatorio. El lead no pasa a esa etapa hasta que el campo tenga valor (`required_statuses` en la API).
- **Fuente:** [Kommo · Customize fields in lead profiles](https://support.kommo.com/docs/customize-fields-in-lead-profiles).
- **Aplicación:** validación en `StatusChangeDialog` antes de cambiar el estado, con un mensaje que dice qué falta y un enlace para completarlo. Ejemplos: precio de venta antes de "Aprobada" (P51), taller antes de "Interno", costo de servicio al "Recibir del taller", foto "Después" antes de "Entregada".
- **Beneficio:** menos piezas entregadas sin foto o aprobadas sin precio.
- **Esfuerzo:** S–M (reglas en dominio y en la BD) · **Prioridad:** Alta

### K11 · Motivos estructurados y análisis ganado/perdido

- **Qué es:** el informe Win-Loss (Insights) muestra cómo avanzan los leads, cuánto tardan entre etapas y dónde se ganan o se pierden, con filtros por periodo, pipeline, responsable y fuente. _No se encontró documentación de Kommo sobre una lista de "motivos de pérdida"; ese punto se apoya en guías generales de CRM ([ejemplo](https://www.sharecrm.com/glossary/lost-reason/))._
- **Fuente:** [Kommo · Win-Loss statistics](https://support.kommo.com/docs/win-loss-statistics.md), [Kommo · Stats](https://kommo.com/support/kb/stats).
- **Aplicación:** catálogo de motivos (Precio, Plazo, Cliente no responde, Sin arreglo técnico, Se lo llevó, Otro) para Rechazada, Sin arreglo, Anulada y CWA descartada (hoy el motivo de descarte es texto). En el dashboard: conversión CWA → guía y piezas aprobadas vs. cotizadas por origen (oficina/WhatsApp), con los motivos más comunes (el Paso 13.1 ya pide "conversión de cotizaciones de WhatsApp").
- **Beneficio:** saber por qué se pierden trabajos y ajustar precios o plazos.
- **Esfuerzo:** S (catálogo) · M (reporte) · **Prioridad:** Alta

### K12 · Filtros predefinidos de un clic

- **Qué es:** hay dos tipos de filtro: los predefinidos (de un clic, para lo más común) y los personalizados.
- **Fuente:** [Kommo · Filter & search](https://support.kommo.com/docs/filter-search).
- **Aplicación:** chips visibles arriba de `/piezas` y `/restauraciones`: "Urgentes", "Listas para entregar", "Por devolver", "Sin precio", "En taller > 7 días", "Mis piezas". Hoy son opciones dentro del panel de filtros; como chips quedan a un clic. Se complementan con S1.
- **Beneficio:** los filtros más usados quedan a la vista y a un clic.
- **Esfuerzo:** S · **Prioridad:** Alta

### K13 · Control de duplicados y fusión

- **Qué es:** el control de duplicados compara cada lead nuevo con los existentes (por pipeline). Si hay conflicto, actualiza el existente o deja los dos para fusionarlos después. "Buscar duplicados" los muestra de a pares con las opciones Fusionar, Saltar o Cancelar. Los importados no se revisan automáticamente.
- **Fuente:** [Kommo · Find and merge duplicates](https://support.kommo.com/docs/find-and-merge-duplicates), [Kommo · Set up duplicate control](https://support.kommo.com/docs/set-up-duplicate-control).
- **Aplicación:** en el alta de cliente (y en el `ClientPicker`), un aviso "Ya existe un cliente con este teléfono o documento" con el botón "Usar ese". En `/clientes`, "Buscar duplicados" para el admin, sobre todo después de la importación de Shopify (Paso 6.6), que no revisa duplicados por sí sola.
- **Beneficio:** el historial de restauraciones del cliente queda completo en una sola ficha.
- **Esfuerzo:** M (fusionar con Shopify es delicado) · **Prioridad:** Media

### K14 · Centro de notificaciones

- **Qué es:** una burbuja abajo a la izquierda junta los avisos de chats y tareas. En la app móvil llegan push por mensajes de compañeros, tareas asignadas o vencidas y menciones. Cada usuario elige qué eventos recibe y por qué canal en la configuración de su perfil.
- **Fuente:** [Kommo KB · Notification center](https://www.kommo.com/support/kb/notification-center), [Kommo · Manage notifications on mobile](https://support.kommo.com/docs/manage-notifications-on-mobile-setup).
- **Aplicación:** una campana en el encabezado con: menciones (S7), seguimientos vencidos (K4), "pago recibido desde Shopify" (webhook), "pieza volvió del taller", "precio de venta pendiente" (admin). Preferencias por usuario. Push web solo si más adelante hace falta.
- **Beneficio:** cada rol se entera de lo que le toca sin revisar listas.
- **Esfuerzo:** M (en la app) · L (push web) · **Prioridad:** Media

### K15 · Widgets del dashboard creados desde filtros

- **Qué es:** el dashboard tiene widgets por defecto, avanzados y personalizados. Los personalizados se crean desde un filtro (de leads, chats, listas o registro de actividad), se renombran, cambian de presentación y se comparten con todos los usuarios.
- **Fuente:** [Kommo · Manage your dashboard](https://support.kommo.com/docs/manage-your-dashboard.md), [Kommo · Dashboard widgets](https://support.kommo.com/resources/docs/dashboard-widgets).
- **Aplicación:** "Fijar en el dashboard" desde una vista guardada (S1): el widget muestra el conteo de esa vista y lleva a ella.
- **Beneficio:** el dashboard crece según el uso real, sin programar cada métrica.
- **Esfuerzo:** M (requiere S1) · **Prioridad:** Baja

### K16 · Acciones rápidas en el celular

- **Qué es:** en la app móvil se mueven leads de etapa, se editan datos y se agregan notas o tareas desde la ficha. Las acciones masivas y las automatizaciones avanzadas quedan en el escritorio. Un escáner de tarjetas de presentación crea leads desde una foto.
- **Fuente:** [Kommo · App overview](https://support.kommo.com/docs/app-overview), [Kommo · Pipelines (mobile)](https://support.kommo.com/docs/pipelines-mobile).
- **Aplicación:** en el detalle de pieza en el celular, una barra inferior fija con el estado siguiente más probable, "Tomar foto" (`<input capture>` directo a "Antes" o "Después") y "Agregar nota". Las acciones masivas siguen en `PiecesBulkBar` (ya funcionan en el celular).
- **Beneficio:** logística registra fotos y estados desde el taller sin volver a la PC.
- **Esfuerzo:** S–M · **Prioridad:** Media

---

## 3. Ideas combinadas

### C1 · Inicio "Mi día" por rol

- **Combina:** S13 (Things to do next) + K4 (tablero de tareas vencidas, hoy y semana) + S1 (vistas).
- **Aplicación:** la página de inicio de cada rol con tres bloques: contadores accionables, mis seguimientos vencidos y de hoy, y accesos a mis vistas guardadas. Logística aterriza hoy en `/piezas`, que puede mantenerse con este bloque arriba.
- **Esfuerzo:** M · **Prioridad:** Alta

### C2 · Historia unificada de la pieza y de la guía

- **Combina:** S7 (timeline con comentarios, menciones y adjuntos) + K2 (feed filtrable con compositor) + la auditoría existente.
- **Aplicación:** una sola lista cronológica (estados, pagos de Shopify, fotos, comentarios, ediciones con antes → después) con filtro por tipo y caja de comentario. Logística sigue viendo la versión reducida (P42).
- **Esfuerzo:** M–L · **Prioridad:** Alta

### C3 · Pipeline de Cotizaciones de WhatsApp

- **Combina:** K1 (kanban), K8 (alerta sin respuesta), K11 (motivos), K7 (plantillas), S17 (vencimiento).
- **Aplicación:** `/cotizaciones-whatsapp` con vista kanban por estado (Cotizada → Pedida parcial → Pedida / Descartada), días sin respuesta en cada tarjeta, "Vence en N días", plantilla de recordatorio para copiar y motivo obligatorio al descartar.
- **Esfuerzo:** M (reutiliza `ViewToggle` y `kanban-columns`) · **Prioridad:** Media

### C4 · Reglas de salida por estado

- **Combina:** K10 (campos obligatorios) + K5 (tareas automáticas) + K6 (mensaje sugerido) + S9 (toast con acción).
- **Aplicación:** cada transición declara qué exige (campos), qué crea (seguimiento) y qué sugiere (mensaje). Todo se define en un solo lugar del dominio (`piece-transitions`) y se prueba con unit tests.
- **Esfuerzo:** M · **Prioridad:** Media

### C5 · Días en el estado actual con semáforo

- **Combina:** K4 (estado de tareas con color), K8 (alerta de espera) y S5 (tonos de insignia con icono).
- **Aplicación:** generalizar "días en taller" a "días en el estado actual" para todos los estados, con tono neutro, atención o crítico según umbrales configurables (p. ej., Espera respuesta: 3 o 7 días; Lista para entregar: 7 o 15 días). Se ve en la tarjeta del kanban, en la tabla y en el detalle, y se puede ordenar por esa columna.
- **Esfuerzo:** S (hay `last_sent_at` y el historial de estados) · **Prioridad:** Alta

### C6 · Vistas guardadas que alimentan el dashboard y las notificaciones

- **Combina:** S1 (vistas) + K15 (widgets desde filtros) + K14 (notificaciones).
- **Aplicación:** una vista guardada puede fijarse en el dashboard como contador y, opcionalmente, avisar cuando su conteo pase de 0 (p. ej., "Órdenes con error de sincronización").
- **Esfuerzo:** M–L · **Prioridad:** Baja

---

## Fuentes

### Shopify / Polaris

- Polaris · Index filters — https://polaris.shopify.com/components/selection-and-input/index-filters
- Polaris · Index table — https://polaris.shopify.com/components/index-table
- Polaris · Ejemplo de index table (badges de pago y preparación) — https://polaris.shopify.com/examples/index-table-default
- shopify.dev · Migrate Index Table from Polaris React — https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/index-table
- Comunidad Shopify · onClick en filas de IndexTable — https://community.shopify.com/t/how-can-i-add-onclick-functionality-to-indextable-rows/103449
- Polaris · Badge (copia de los docs en jsDelivr) — https://cdn.jsdelivr.net/npm/@combine-labs/combine-polaris@0.1.12/docs/components/Badge/README.md
- Polaris · Resource details layout — https://polaris.shopify.com/patterns/resource-details-layout
- Polaris · Layout — https://polaris.shopify.com/components/layout
- Polaris · Contextual save bar — https://polaris.shopify.com/components/contextual-save-bar
- shopify.dev · Save Bar API — https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/save-bar-api.md
- Polaris · Toast (obsoleto) — https://polaris.shopify.com/components/deprecated/toast
- shopify.dev · Toast API — https://shopify.dev/docs/api/app-home/latest/apis/user-interface-and-interactions/toast-api.md
- Polaris · Empty state — https://polaris.shopify.com/components/empty-state
- Shopify Help · Timeline — https://help.shopify.com/en/manual/shopify-admin/timeline
- Shopify Help · Managing order details — https://help.shopify.com/manual/orders/manage-orders/managing-orders
- Shopify Help · Searching, viewing and printing orders — https://help.shopify.com/manual/orders/search-view-print-orders
- Shopify Changelog · Customize your orders list — https://changelog.shopify.com/posts/customize-your-orders-list-and-get-to-work-faster
- Shopify Help · Keyboard shortcuts — https://help.shopify.com/en/manual/productivity-tools/keyboard-shortcuts
- Sufio · Shopify keyboard shortcuts (terceros) — https://sufio.com/learn/tips/shopify/shopify-keyboard-shortcuts-for-improved-productivity/
- Shopify Help · Searching your Shopify admin — https://help.shopify.com/en/manual/shopify-admin/admin-search
- Shopify Help · Shopify Home ("Things to do next") — https://help.shopify.com/Shopify/shopify_api_console
- Shopify Help · Creating and using tags — https://help.shopify.com/en/manual/productivity-tools/using-tags
- Shopify Help · Local pickup for online orders — https://help.shopify.com/manual/sell-in-person/shopify-pos/order-management/local-pickup-for-online-orders
- Shopify Help · Holding fulfillments — https://help.shopify.com/en/manual/orders/fulfillment/fulfilling-orders/holds
- Shopify Help · Customizing packing slips — https://help.shopify.com/en/manual/orders/customize-packing-slips
- Comunidad Shopify · Plantilla de packing slip 4×6 — https://community.shopify.com/t/customize-your-packing-slip-template-to-use-4x6-inch-format/106496/1
- Shopify Help · Creating draft orders — https://help.shopify.com/manual/orders/create-order/create-draft
- Shopify Changelog · Draft order invoices with payment terms — https://changelog.shopify.com/posts/send-draft-order-invoices-with-payment-terms
- Barn2 · Bulk edit products in Shopify (terceros) — https://barn2.com/blog/bulk-edit-products-shopify/
- Magecomp · Shopify bulk editor (terceros) — https://magecomp.com/blog/shopify-bulk-editor-for-multiple-products/amp
- Shopify Help · Customer segment filters — https://help.shopify.com/en/manual/customers/customer-segmentation/reference-guide/shopify-segments

### Kommo

- Move leads through pipeline stages — https://support.kommo.com/docs/move-leads-through-pipeline-stages
- Pipelines overview — https://support.kommo.com/docs/pipelines-overview
- KB · Pipelines (versión anterior) — https://www.kommo.com/support/kb/pipelines
- KB · Leads — https://www.kommo.com/support/kb/leads/
- Lead profile — https://kommo.com/support/kb/lead-profile
- amoCRM · Leads (producto hermano) — https://www.amocrm.com/leads/
- Customize your lead card layout — https://support.kommo.com/docs/customize-your-lead-card-layout
- Create and assign tasks — https://support.kommo.com/docs/create-assign-tasks
- Tour · Tasks — https://kommo.com/tour/tasks
- Pluga · Integración Kommo (campos de tarea, terceros) — https://pluga.co/en/apps/todoist/integration/kommo/
- Set up digital pipeline triggers — https://support.kommo.com/docs/set-up-digital-pipeline-triggers
- amoCRM · Pipeline triggers — https://www.amocrm.com/support/kb/pipeline-triggers/
- Salesbot triggers — https://www.kommo.com/support/crm/salesbot-triggers/
- Wazzup · Salesbot y WhatsApp (terceros) — https://wazzup24.com/help/kommo-en/how-to-write-to-a-client-on-whatsapp-with-salesbot/
- Use Salesbot templates — https://www.kommo.com/support/kb/salesbot-templates
- Create and use chat templates — https://support.kommo.com/docs/create-and-use-chat-templates.md
- Blog · WhatsApp templates — https://www.kommo.com/blog/templates-for-whatsapp-crm/
- Handle incoming leads — https://www.kommo.com/support/crm/incoming-leads/
- Dev · Incoming leads — https://developers.kommo.com/reference/incoming-leads
- Customize fields in lead profiles — https://support.kommo.com/docs/customize-fields-in-lead-profiles
- Win-Loss statistics — https://support.kommo.com/docs/win-loss-statistics.md
- KB · Stats — https://kommo.com/support/kb/stats
- Filter & search — https://support.kommo.com/docs/filter-search
- Find and merge duplicates — https://support.kommo.com/docs/find-and-merge-duplicates
- Set up duplicate control — https://support.kommo.com/docs/set-up-duplicate-control
- KB · Notification center — https://www.kommo.com/support/kb/notification-center
- Manage notifications on mobile — https://support.kommo.com/docs/manage-notifications-on-mobile-setup
- Manage your dashboard — https://support.kommo.com/docs/manage-your-dashboard.md
- Dashboard widgets — https://support.kommo.com/resources/docs/dashboard-widgets
- App overview (mobile) — https://support.kommo.com/docs/app-overview
- Pipelines (mobile) — https://support.kommo.com/docs/pipelines-mobile
- ShareCRM · Lost reason (referencia general, no es Kommo) — https://www.sharecrm.com/glossary/lost-reason/

### Fuentes que fallaron

- **Ninguna página se pudo abrir directamente.** Al intentar abrir `polaris.shopify.com`, `polaris-react.shopify.com`, `help.shopify.com`, `shopify.dev`, `www.kommo.com` y `support.kommo.com`, la herramienta de descarga respondió `getaddrinfo ENOTFOUND`, y `curl` a través del proxy del entorno respondió `CONNECT 403` (política de red). Todo el contenido sale de los fragmentos y resúmenes del buscador web sobre esas mismas URLs. Conviene revisar los detalles finos en las páginas antes de implementar.
- **No encontrado en las fuentes (no se usó como hecho):** una lista nativa de "motivos de pérdida" en Kommo; los indicadores exactos de la tarjeta del kanban de Kommo (presupuesto, tareas, no leídos); @menciones y adjuntos dentro de la ficha de Kommo; el mapa exacto de la página de pedido del admin de Shopify (se usó el patrón de Polaris "Resource details layout"); la navegación anterior/siguiente entre pedidos de Shopify; documentación oficial de Shopify sobre el editor masivo y las notificaciones push de la app móvil (solo hay terceros, por eso esas ideas no se incluyeron o se marcaron).

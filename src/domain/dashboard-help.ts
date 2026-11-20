/**
 * Explicaciones cortas de cómo se calcula cada métrica del dashboard. Se muestran en el
 * botón de información (ⓘ) junto a la etiqueta. Deben coincidir con las reglas de las
 * funciones `dashboard_*` (supabase/migrations/*_dashboard_metricas.sql).
 */
export const METRIC_HELP = {
  vendido:
    "Suma del importe de las piezas aprobadas en el periodo (por fecha de aprobación), de guías normales. No cuenta piezas anuladas, rechazadas ni sin arreglo.",
  cobrado:
    "Pagos recibidos en el periodo (por fecha de pago) menos los reembolsos de esas mismas fechas. Puede incluir pagos de piezas vendidas en periodos anteriores.",
  saldo:
    "Para cada guía en curso: lo aprobado menos lo ya pagado (nunca menos de 0), sumado. Es una foto de hoy y no cambia con el periodo elegido.",
  ticket:
    "Vendido dividido entre el número de guías que tuvieron al menos una pieza aprobada en el periodo.",
  cumplimiento:
    "Días entre el registro de la pieza y su entrega, solo de las piezas entregadas en el periodo. La mediana es el valor del medio: la mitad tardó menos y la otra mitad más, y no se ve afectada por casos extremos.",
  conversionWhatsapp:
    "Cotizaciones de WhatsApp creadas en el periodo que terminaron en pedido (total o parcial), divididas entre todas las creadas en el periodo.",
  margen:
    "Precio de venta menos el costo de servicio, solo de las piezas vendidas que tienen costo registrado. El porcentaje es ese margen sobre lo vendido de esas mismas piezas.",
  cobranza:
    "Cobrado dividido entre Vendido del periodo. Como lo cobrado va por fecha de pago y lo vendido por fecha de aprobación, puede superar el 100 % (por ejemplo, al cobrar saldos de periodos anteriores).",
  serviciosMasVendidos:
    "Importe vendido de cada servicio. Si una pieza lleva varios servicios, su importe se reparte en partes iguales entre ellos.",
  materialesMasVendidos:
    "Importe vendido de cada material. Si una pieza lleva varios materiales, su importe se reparte en partes iguales entre ellos.",
  aprobacion:
    "Piezas registradas en el periodo que ya fueron aprobadas, divididas entre todas las piezas registradas en el periodo.",
  enCurso:
    "Piezas que hoy no están entregadas ni anuladas, estén donde estén (oficina, taller, etc.). No depende del periodo elegido.",
  montoPedido:
    "Importe de los ítems de cotizaciones de WhatsApp (creadas en el periodo) que se convirtieron en piezas de una guía que sigue viva.",
  piezasPedidas:
    "De los ítems cotizados por WhatsApp en el periodo, cuántos se convirtieron en una pieza de guía (sin contar piezas anuladas, rechazadas o sin arreglo).",
  cot: "Cotizaciones del cotizador creadas en el periodo. El % de aceptación es: aceptadas (incluye facturadas y reembolsadas) entre emitidas (sin contar borradores ni anuladas).",
  clientesConGuias:
    "Clientes distintos que registraron al menos una guía normal en el periodo.",
  recompra:
    "De los clientes que registraron una guía en el periodo, el porcentaje que ya tenía alguna guía registrada antes de que empezara el periodo.",
  diasTaller:
    "Días que pasó en el taller cada pieza que volvió en el periodo, desde el envío hasta su vuelta. Se muestra el promedio y la mediana (el valor del medio).",
  alertaTaller:
    "Piezas que están hoy en el taller y cuyo último envío fue hace al menos este número de días.",
  vendedor:
    "El vendedor de una guía es quien la registró. Vendido y cobrado siguen las mismas reglas del resumen, filtradas por sus guías.",
} as const;

export type MetricHelpKey = keyof typeof METRIC_HELP;

/**
 * Explicación en español de por qué falló una sincronización con Shopify y qué hacer.
 * Shopify responde en inglés (p. ej., «Phone has already been taken») y el outbox
 * guarda ese texto tal cual en `last_error`; se traduce al mostrarlo, así también se
 * explican los errores guardados antes. Varios errores llegan unidos por «; ».
 */

export type SyncErrorExplanation = {
  /** Qué pasó, en palabras simples. */
  problem: string;
  /** Qué hacer para resolverlo. */
  fix: string;
  /** El texto original (para soporte); null si no hay. */
  original: string | null;
};

type Rule = { match: RegExp; problem: string; fix: string };

const RETRY = "Después pulsa «Reintentar».";
const TEMPORARY =
  "Suele ser pasajero: pulsa «Reintentar» en unos minutos. Si se repite durante horas, avisa a soporte.";

const RULES: Rule[] = [
  {
    match: /phone has already been taken/i,
    problem:
      "Ese teléfono ya lo tiene otro cliente en Shopify, y Shopify no deja que dos clientes compartan teléfono.",
    fix: `Busca el número en Shopify (Clientes). Si es la misma persona registrada dos veces, fusiona los dos clientes en el sistema o quítale el teléfono a la ficha que sobra en Shopify. Si es otra persona, corrige el teléfono aquí. ${RETRY}`,
  },
  {
    match: /email has already been taken/i,
    problem:
      "Ese email ya lo tiene otro cliente en Shopify, y Shopify no deja que dos clientes compartan email.",
    fix: `Busca el email en Shopify (Clientes). Si es la misma persona registrada dos veces, fusiona los dos clientes en el sistema o quítale el email a la ficha que sobra en Shopify. Si es otra persona, corrige el email aquí. ${RETRY}`,
  },
  {
    match: /phone is invalid/i,
    problem: "Shopify dice que el teléfono no es válido.",
    fix: `Revisa el número (con el código de país correcto) y corrígelo. ${RETRY}`,
  },
  {
    match: /email (is invalid|contains an invalid domain)/i,
    problem: "Shopify dice que el email no es válido.",
    fix: `Revisa que el email esté bien escrito y corrígelo. ${RETRY}`,
  },
  {
    match: /must have a name, phone number or email/i,
    problem:
      "Shopify necesita al menos un nombre, un teléfono o un email para guardar al cliente.",
    fix: `Completa alguno de esos datos. ${RETRY}`,
  },
  {
    match: /name can't be blank/i,
    problem: "Falta el nombre (o la razón social) que pide Shopify.",
    fix: `Complétalo en el registro. ${RETRY}`,
  },
  {
    match: /external id has already been taken/i,
    problem: "En Shopify ya hay otra empresa con ese RUC.",
    fix: `Busca la empresa por su RUC en Shopify (Clientes → Empresas). Si es la misma empresa duplicada, junta o borra la que sobra en Shopify; si el RUC está mal, corrígelo aquí. ${RETRY}`,
  },
  {
    match: /already a contact of this company/i,
    problem: "Esa persona ya es contacto de la empresa en Shopify.",
    fix: `No hace falta agregarla otra vez: pulsa «Reintentar» y, si se repite, revisa que el contacto no esté dos veces en el sistema.`,
  },
  {
    match: /no role in this company/i,
    problem:
      "El contacto no tiene permiso en Shopify para hacer pedidos a nombre de la empresa.",
    fix: `En Shopify, abre la empresa y dale un rol al contacto (por ejemplo, «Ordering only»). ${RETRY}`,
  },
  {
    match: /customer does not exist/i,
    problem:
      "El cliente vinculado ya no existe en Shopify (probablemente se borró allí).",
    fix: "Revisa en Shopify si se borró por error. Para volver a vincularlo hace falta ayuda de soporte.",
  },
  {
    match: /idempotency key failed/i,
    problem:
      "Shopify rechazó un reembolso que el sistema intentó hacer en la orden y no deja repetir ese mismo intento.",
    fix: "Haz el reembolso a mano en Shopify (en el pedido, «Reembolsar») por la diferencia que falta. Después pulsa «Reintentar»: el sistema verá que ya está hecho y quitará el error.",
  },
  {
    match: /refund amount (is invalid|exceeds)/i,
    problem:
      "Shopify no acepta el monto del reembolso: es mayor que lo cobrado en la orden.",
    fix: `Compara los pagos de la guía con el pedido en Shopify y corrige el que no corresponde. ${RETRY}`,
  },
  {
    match: /order is already paid/i,
    problem: "La orden ya figura como pagada en Shopify.",
    fix: "Revisa si alguien registró el pago directamente en Shopify. Pulsa «Reintentar»: el sistema vuelve a comparar los pagos.",
  },
  {
    match: /transactions exceed the order total/i,
    problem: "Los pagos suman más que el total de la orden en Shopify.",
    fix: `Revisa los pagos y el total de la guía (puede haber un pago repetido). ${RETRY}`,
  },
  {
    match: /no tiene pagos para reembolsar/i,
    problem:
      "No se pudo reembolsar en Shopify porque esa orden no tiene pagos cobrados.",
    fix: `Revisa el pedido en Shopify: si el pago nunca llegó allí, no hace falta reembolsarlo. ${RETRY}`,
  },
  {
    match: /line item .* not found or already fulfilled/i,
    problem:
      "Una pieza ya figura como entregada en Shopify o ya no está en la orden.",
    fix: `Revisa el pedido en Shopify; si alguien lo editó allí, vuelve a dejarlo como en la guía. ${RETRY}`,
  },
  {
    match: /line item .* not found/i,
    problem:
      "Una pieza de la guía ya no está en la orden de Shopify (alguien la editó allí).",
    fix: `Revisa el pedido en Shopify y vuelve a dejarlo como en la guía. ${RETRY}`,
  },
  {
    match: /^No existe en Shopify:/i,
    problem:
      "El registro vinculado ya no existe en Shopify (probablemente se borró allí).",
    fix: "Revisa en Shopify si se borró por error. Para volver a vincularlo hace falta ayuda de soporte.",
  },
  {
    match:
      /error de red|no responde|respondió (429|5\d\d)|throttled|timeout|aún no muestra/i,
    problem:
      "Shopify no respondió a tiempo (conexión o Shopify con problemas).",
    fix: TEMPORARY,
  },
  {
    match: /token|permiso para esta operación|access denied/i,
    problem:
      "El sistema no tiene acceso a Shopify (la conexión de la app venció o le faltan permisos).",
    fix: "Esto no se arregla reintentando: hay que revisar la conexión de la app con Shopify (soporte técnico).",
  },
  {
    match: /empresa aún no está en Shopify/i,
    problem: "La empresa de este contacto todavía no está creada en Shopify.",
    fix: "Primero resuelve el error de la empresa (en su ficha). Después pulsa «Reintentar» aquí.",
  },
  {
    match: /ya no existe/i,
    problem: "El registro se borró en el sistema.",
    fix: "No hace falta hacer nada: ya no hay qué enviar a Shopify.",
  },
];

const GENERIC_FIX =
  "Revisa los datos del registro y pulsa «Reintentar». Si vuelve a fallar, envía este mensaje a soporte.";

export function explainSyncError(
  message: string | null | undefined,
): SyncErrorExplanation {
  const original = message?.trim() || null;
  if (!original) {
    return {
      problem: "Shopify no aceptó el cambio y no explicó el motivo.",
      fix: GENERIC_FIX,
      original: null,
    };
  }
  const problems: string[] = [];
  const fixes: string[] = [];
  for (const part of original.split(/;\s*/).filter(Boolean)) {
    const rule = RULES.find((r) => r.match.test(part));
    const problem = rule
      ? rule.problem
      : `Shopify rechazó el cambio con este mensaje: «${part}».`;
    const fix = rule ? rule.fix : GENERIC_FIX;
    if (!problems.includes(problem)) problems.push(problem);
    if (!fixes.includes(fix)) fixes.push(fix);
  }
  return { problem: problems.join(" "), fix: fixes.join(" "), original };
}

const TIME_ZONE = "America/Lima";

const moneyFormatter = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatMoney(amount: number): string {
  return moneyFormatter.format(amount).replace(/\u00a0/g, " ");
}

export function formatDate(value: Date | string): string {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFormatter.format(new Date(value)).replace(",", "");
}

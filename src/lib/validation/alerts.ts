import { z } from "zod";

import {
  ALERT_KINDS,
  ALERT_TEMPLATE_MAX,
  unknownAlertPlaceholders,
} from "@/domain/alerts";

const alertSettingSchema = z.object({
  kind: z.enum(ALERT_KINDS),
  enabled: z.boolean(),
  template: z
    .string()
    .trim()
    .max(ALERT_TEMPLATE_MAX, `Máximo ${ALERT_TEMPLATE_MAX} caracteres`)
    .superRefine((value, ctx) => {
      const unknown = unknownAlertPlaceholders(value);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `Variables desconocidas: ${unknown.map((v) => `{${v}}`).join(", ")}`,
        });
      }
    }),
  /** Usuarios que la reciben (de los roles que corresponden). */
  recipientIds: z.array(z.guid()),
});

export const alertSettingsSchema = z.object({
  alerts: z.array(alertSettingSchema).length(ALERT_KINDS.length),
});

export type AlertSettingsInput = z.infer<typeof alertSettingsSchema>;

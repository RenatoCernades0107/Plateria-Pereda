-- Sin cambios: esta versión duplicaba, línea por línea, la migración
-- 20261111120100_ubicacion_taller_y_pagos_cotizacion.sql (ubicación y taller de la
-- cotización aprobada, `update_quote_tracking`, las RPC de logística y los pagos de
-- cotización). Al aplicarse las dos en una base nueva, esta fallaba con
-- `type "quote_work_location" already exists`.
--
-- Las dos versiones ya están registradas en la base de datos desplegada, así que ninguna
-- se borra ni se renombra (el historial de migraciones tiene que coincidir). Todo el
-- contenido vive en 20261111120100; esta queda vacía a propósito.
select 1;

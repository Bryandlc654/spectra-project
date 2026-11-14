-- Corrige el esquema de contracts en producción para que coincida con el código:
--  * template_id / freelancer_id / country_id eran NOT NULL: crear un contrato sin
--    plantilla, sin freelancer asignado o sin país fallaba (country_id tiene FK a
--    countries, así que el 0 implícito violaba la clave foránea).
--  * El código usa los estados 'pending' (enviado a firma) y 'expired', que no
--    existían en el ENUM: con sql_mode vacío se guardaban como ''.
ALTER TABLE contracts
  MODIFY COLUMN template_id CHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  MODIFY COLUMN freelancer_id CHAR(36) COLLATE utf8mb4_unicode_ci NULL,
  MODIFY COLUMN country_id INT UNSIGNED NULL,
  MODIFY COLUMN status ENUM('draft','sent','pending','active','expiring','expired','terminated')
    COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft';

-- Contratos que quedaron con estado vacío por el ENUM incompleto: estaban en firma.
UPDATE contracts SET status = 'pending' WHERE status = '';

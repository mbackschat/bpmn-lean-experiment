ALTER TABLE bpmn_platform.definition_schedules
  ADD COLUMN process_locator bytea;

UPDATE bpmn_platform.definition_schedules
SET process_locator = convert_to(
  'bpmn-process-work-v1:' || (
    SELECT string_agg(
      CASE
        WHEN octet BETWEEN 65 AND 90
          OR octet BETWEEN 97 AND 122
          OR octet BETWEEN 48 AND 57
          OR octet IN (33, 39, 40, 41, 42, 45, 46, 95, 126)
          THEN chr(octet)
        ELSE '%' || upper(lpad(to_hex(octet), 2, '0'))
      END,
      '' ORDER BY byte_index
    )
    FROM (
      SELECT
        byte_index,
        get_byte(execution_workflow_id, byte_index) AS octet
      FROM generate_series(
        0,
        octet_length(execution_workflow_id) - 1
      ) AS positions(byte_index)
    ) AS workflow_id_bytes
  ),
  'UTF8'
)
WHERE state = 'started';

DO $migration$
DECLARE
  schedule_identity_constraint text;
BEGIN
  SELECT constraint_name.conname
  INTO schedule_identity_constraint
  FROM pg_constraint AS constraint_name
  WHERE constraint_name.conrelid =
      'bpmn_platform.definition_schedules'::regclass
    AND constraint_name.contype = 'c'
    AND pg_get_constraintdef(constraint_name.oid) LIKE
      '%execution_workflow_id%first_run_id%';

  IF schedule_identity_constraint IS NULL THEN
    RAISE EXCEPTION 'definition Schedule execution-identity constraint not found';
  END IF;

  EXECUTE format(
    'ALTER TABLE bpmn_platform.definition_schedules DROP CONSTRAINT %I',
    schedule_identity_constraint
  );
END
$migration$;

ALTER TABLE bpmn_platform.definition_schedules
  DROP COLUMN execution_workflow_id,
  DROP COLUMN first_run_id,
  ADD CONSTRAINT definition_schedules_process_locator_state CHECK (
    (state = 'started' AND process_locator IS NOT NULL)
    OR (state <> 'started' AND process_locator IS NULL)
  );

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;

DO $migration$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch
  SET epoch = 10
  WHERE singleton = true AND epoch = 9;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows
  FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0010';
  END IF;
END
$migration$;

ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 10);

ALTER TABLE bpmn_platform.confirmed_process_instances
  ADD COLUMN direct_start_command bytea;

UPDATE bpmn_platform.confirmed_process_instances
SET direct_start_command = convert_to('{"initialVariables":[]}', 'UTF8')
WHERE direct_intent_json IS NOT NULL;

ALTER TABLE bpmn_platform.confirmed_process_instances
  ADD CONSTRAINT confirmed_process_instances_direct_start_command CHECK (
    (
      direct_intent_json IS NULL
      AND direct_start_command IS NULL
      AND state = 'confirmed'
    )
    OR (
      direct_intent_json IS NOT NULL
      AND direct_start_command IS NOT NULL
      AND octet_length(direct_start_command) > 0
    )
  );

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;

DO $migration$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch
  SET epoch = 11
  WHERE singleton = true AND epoch = 10;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows
  FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0011';
  END IF;
END
$migration$;

ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 11);

ALTER TABLE bpmn_platform.operate_execution_publications
  DROP CONSTRAINT operate_execution_publications_current_process_status_check,
  ADD CONSTRAINT operate_execution_publications_current_process_status_check CHECK (
    current_process_status IN ('running', 'completed', 'cancelled', 'failed')
  );

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;

DO $migration$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch
  SET epoch = 12
  WHERE singleton = true AND epoch = 11;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows
  FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0012';
  END IF;
END
$migration$;

ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 12);

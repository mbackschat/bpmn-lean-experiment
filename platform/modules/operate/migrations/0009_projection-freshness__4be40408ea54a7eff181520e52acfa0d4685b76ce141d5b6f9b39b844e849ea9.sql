ALTER TABLE bpmn_platform.operate_execution_publications
  ADD COLUMN last_complete_observed_at_epoch_ms bigint CHECK (
    last_complete_observed_at_epoch_ms BETWEEN 0 AND 9007199254740991
  ),
  ADD COLUMN current_process_status text CHECK (
    current_process_status IN ('running', 'completed', 'cancelled')
  );

UPDATE bpmn_platform.operate_execution_publications
SET current_process_status = current_json::jsonb #>> '{state,status}'
WHERE current_json IS NOT NULL;

ALTER TABLE bpmn_platform.operate_execution_publications
  ADD CONSTRAINT operate_execution_current_status_shape CHECK (
    (current_json IS NULL AND current_process_status IS NULL)
    OR (current_json IS NOT NULL AND current_process_status IS NOT NULL)
  );

ALTER TABLE bpmn_platform.operate_flow_node_occurrence_publications
  ADD COLUMN last_complete_observed_at_epoch_ms bigint CHECK (
    last_complete_observed_at_epoch_ms BETWEEN 0 AND 9007199254740991
  );

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;

DO $$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch
  SET epoch = 9
  WHERE singleton = true AND epoch = 8;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows
  FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0009';
  END IF;
END
$$;

ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 9);

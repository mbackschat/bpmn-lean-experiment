-- A Schedule fires one occurrence the engine listed, and its process-instance identity is the engine's, so the
-- activation instant and the platform-chosen workflow-id base are gone. A Timer start may have no resolved duration,
-- and the engine's refusal of an occurrence is a terminal state that keeps the engine's code. The existing
-- `timer_duration_ms > 0` check already admits NULL, and the reconciliation index needs no change: a refused row
-- is listed by `NOT cleanup_complete` exactly like a missed or cancelled one. No row changes, so every existing
-- row satisfies the replaced constraints.
ALTER TABLE bpmn_platform.definition_schedules
  DROP COLUMN activation_at,
  DROP COLUMN configured_workflow_id_base,
  ALTER COLUMN timer_duration_ms DROP NOT NULL,
  ADD COLUMN refusal_code text;

DO $migration$
DECLARE
  replaced_constraints text[];
  replaced_constraint text;
BEGIN
  SELECT array_agg(constraint_name.conname ORDER BY constraint_name.conname)
  INTO replaced_constraints
  FROM pg_constraint AS constraint_name
  WHERE constraint_name.conrelid = 'bpmn_platform.definition_schedules'::regclass
    AND constraint_name.contype = 'c'
    AND (
      pg_get_constraintdef(constraint_name.oid) LIKE '%cleanup_complete%'
      OR pg_get_constraintdef(constraint_name.oid) LIKE '%''creating''::text%'
    );

  IF replaced_constraints IS NULL OR array_length(replaced_constraints, 1) <> 2 THEN
    RAISE EXCEPTION 'definition Schedule state and cleanup constraints not found';
  END IF;

  FOREACH replaced_constraint IN ARRAY replaced_constraints LOOP
    EXECUTE format(
      'ALTER TABLE bpmn_platform.definition_schedules DROP CONSTRAINT %I',
      replaced_constraint
    );
  END LOOP;
END
$migration$;

ALTER TABLE bpmn_platform.definition_schedules
  ADD CONSTRAINT definition_schedules_state_check CHECK (
    state IN (
      'creating', 'creatingHost', 'scheduled', 'cancelling',
      'started', 'refused', 'missed', 'cancelled'
    )
  ),
  ADD CONSTRAINT definition_schedules_cleanup_terminal CHECK (
    state IN ('started', 'refused', 'missed', 'cancelled') OR NOT cleanup_complete
  ),
  ADD CONSTRAINT definition_schedules_refusal_code_state CHECK (
    (state = 'refused' AND refusal_code IS NOT NULL AND length(refusal_code) > 0)
    OR (state <> 'refused' AND refusal_code IS NULL)
  );

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;

DO $migration$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch
  SET epoch = 15
  WHERE singleton = true AND epoch = 14;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows
  FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0015';
  END IF;
END
$migration$;

ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 15);

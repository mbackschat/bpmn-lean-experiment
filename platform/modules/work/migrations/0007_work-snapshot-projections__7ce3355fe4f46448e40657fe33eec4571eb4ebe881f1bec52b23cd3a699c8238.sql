ALTER TABLE bpmn_platform.work_processes
  ADD COLUMN population_ordinal bigint;

WITH ordered AS (
  SELECT
    process_instance_id,
    row_number() OVER (ORDER BY process_instance_id) AS population_ordinal
  FROM bpmn_platform.work_processes
)
UPDATE bpmn_platform.work_processes AS retained
SET population_ordinal = ordered.population_ordinal
FROM ordered
WHERE retained.process_instance_id = ordered.process_instance_id;

ALTER TABLE bpmn_platform.work_processes
  ALTER COLUMN population_ordinal SET NOT NULL,
  ADD CONSTRAINT work_processes_population_ordinal_unique UNIQUE (population_ordinal),
  ADD CONSTRAINT work_processes_population_ordinal_bounds CHECK (
    population_ordinal BETWEEN 1 AND 9007199254740991
  );

CREATE TABLE bpmn_platform.work_snapshot_generations (
  generation bigint PRIMARY KEY CHECK (generation BETWEEN 1 AND 9007199254740991),
  target_population_head bigint NOT NULL CHECK (
    target_population_head BETWEEN 0 AND 9007199254740991
  ),
  materialized_through bigint NOT NULL CHECK (
    materialized_through BETWEEN 0 AND target_population_head
  ),
  succeeded_count bigint NOT NULL CHECK (
    succeeded_count BETWEEN 0 AND target_population_head
  ),
  state text NOT NULL CHECK (state IN ('building', 'completed')),
  completed_at timestamptz,
  observed_after_at timestamptz,
  CONSTRAINT work_snapshot_generation_state_shape CHECK (
    (state = 'building' AND completed_at IS NULL AND observed_after_at IS NULL)
    OR (state = 'completed' AND completed_at IS NOT NULL)
  )
);

CREATE TABLE bpmn_platform.work_snapshot_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  population_head bigint NOT NULL CHECK (population_head BETWEEN 0 AND 9007199254740991),
  next_generation bigint NOT NULL CHECK (next_generation BETWEEN 1 AND 9007199254740991),
  building_generation bigint REFERENCES bpmn_platform.work_snapshot_generations (generation),
  completed_generation bigint REFERENCES bpmn_platform.work_snapshot_generations (generation),
  CONSTRAINT work_snapshot_control_distinct_generations CHECK (
    building_generation IS NULL
    OR completed_generation IS NULL
    OR building_generation <> completed_generation
  )
);

INSERT INTO bpmn_platform.work_snapshot_control (
  singleton, population_head, next_generation, building_generation, completed_generation
)
SELECT true, count(*), 1, NULL, NULL
FROM bpmn_platform.work_processes;

CREATE TABLE bpmn_platform.work_snapshot_generation_items (
  generation bigint NOT NULL REFERENCES bpmn_platform.work_snapshot_generations (generation),
  population_ordinal bigint NOT NULL CHECK (
    population_ordinal BETWEEN 1 AND 9007199254740991
  ),
  process_instance_id bytea NOT NULL CHECK (octet_length(process_instance_id) > 0),
  expected_public_instance_json text NOT NULL CHECK (length(expected_public_instance_json) > 0),
  expected_work_locator bytea NOT NULL CHECK (octet_length(expected_work_locator) > 0),
  expected_observation text NOT NULL CHECK (
    expected_observation IN ('active', 'closed', 'indeterminate')
  ),
  state text NOT NULL CHECK (state IN ('pending', 'succeeded')),
  observed_at timestamptz,
  PRIMARY KEY (generation, population_ordinal),
  UNIQUE (generation, process_instance_id),
  CONSTRAINT work_snapshot_item_state_shape CHECK (
    state = 'pending' OR state = 'succeeded'
  )
);

CREATE INDEX work_snapshot_pending_items_idx
  ON bpmn_platform.work_snapshot_generation_items (
    generation, state, process_instance_id
  );

CREATE TABLE bpmn_platform.work_snapshot_tasks (
  generation bigint NOT NULL,
  process_instance_id bytea NOT NULL CHECK (octet_length(process_instance_id) > 0),
  task_process_instance_id bytea NOT NULL CHECK (octet_length(task_process_instance_id) > 0),
  element_id bytea NOT NULL CHECK (octet_length(element_id) > 0),
  activation bigint NOT NULL CHECK (activation BETWEEN 1 AND 9007199254740991),
  task_json text NOT NULL CHECK (length(task_json) > 0),
  structured_task_json text,
  worklist_priority integer CHECK (worklist_priority BETWEEN 0 AND 100),
  PRIMARY KEY (
    generation,
    process_instance_id,
    task_process_instance_id,
    element_id,
    activation
  ),
  FOREIGN KEY (generation, process_instance_id)
    REFERENCES bpmn_platform.work_snapshot_generation_items (generation, process_instance_id),
  CONSTRAINT work_snapshot_structured_shape CHECK (
    (structured_task_json IS NULL AND worklist_priority IS NULL)
    OR (structured_task_json IS NOT NULL AND worklist_priority IS NOT NULL)
  )
);

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;

DO $$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch
  SET epoch = 7
  WHERE singleton = true AND epoch = 6;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows
  FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0007';
  END IF;
END
$$;

ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 7);

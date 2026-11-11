-- A stored definition version without a row is pending: allocated, but not yet answered by the engine's population.
CREATE TABLE bpmn_platform.definition_engine_registrations (
  process_id bytea NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  state text NOT NULL CHECK (state IN ('registered', 'refused')),
  refusal_code text,
  CHECK (
    (state = 'registered' AND refusal_code IS NULL)
    OR (state = 'refused' AND length(refusal_code) > 0)
  ),
  PRIMARY KEY (process_id, version),
  FOREIGN KEY (process_id, version)
    REFERENCES bpmn_platform.definition_versions (process_id, version)
);

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;

DO $migration$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch
  SET epoch = 14
  WHERE singleton = true AND epoch = 13;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows
  FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0014';
  END IF;
END
$migration$;

ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 14);

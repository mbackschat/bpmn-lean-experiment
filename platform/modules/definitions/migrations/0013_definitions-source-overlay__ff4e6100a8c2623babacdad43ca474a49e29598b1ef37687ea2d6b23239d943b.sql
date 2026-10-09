DO $migration$
DECLARE
  owner_table text;
BEGIN
  FOREACH owner_table IN ARRAY ARRAY['definition_versions', 'definition_schedules', 'message_start_publications'] LOOP
    EXECUTE format('ALTER TABLE bpmn_platform.%I ADD COLUMN source_overlay_id bytea, ADD COLUMN source_overlay_sha256 text REFERENCES bpmn_platform.exact_artifacts (sha256), ADD CONSTRAINT %I CHECK ((source_overlay_id IS NULL AND source_overlay_sha256 IS NULL) OR (source_overlay_id IS NOT NULL AND octet_length(source_overlay_id) > 0 AND source_overlay_sha256 IS NOT NULL AND source_overlay_sha256 ~ ''^[0-9a-f]{64}$''))', owner_table, owner_table || '_source_overlay_identity');
  END LOOP;
END
$migration$;

-- BPD-IDENTITY-01: old public admission allowed no overlay. Preserve canonical key
-- order and all existing identity bytes; jsonb serialization would reorder them.
CREATE FUNCTION pg_temp.add_absent_public_overlay(retained text) RETURNS text
LANGUAGE plpgsql AS $function$
DECLARE
  identity json;
  definition json;
BEGIN
  -- PostgreSQL 18 jsonfuncs.c:get_worker/json_object_keys deescape every string.
  -- BPD-IDENTITY-01 permits NUL in retained bytea identities, so inspect only
  -- structure after syntax validation; persist only the original retained bytes.
  PERFORM retained::json;
  identity := regexp_replace(retained, $escape$\\(["\\/bfnrt]|u[0-9a-fA-F]{4})$escape$, 'x', 'g')::json;
  definition := identity -> 'definition';
  IF json_typeof(identity) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(key ORDER BY key) FROM json_object_keys(identity) AS key) IS DISTINCT FROM ARRAY['definition', 'processInstanceId']
    OR json_typeof(definition) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(key ORDER BY key) FROM json_object_keys(definition) AS key) IS DISTINCT FROM ARRAY['processId', 'semanticProfile', 'source', 'startCapabilities', 'version']
    OR json_typeof(identity -> 'processInstanceId') IS DISTINCT FROM 'string'
    OR json_typeof(definition -> 'processId') IS DISTINCT FROM 'string'
    OR json_typeof(definition -> 'semanticProfile') IS DISTINCT FROM 'string'
    OR json_typeof(definition -> 'version') IS DISTINCT FROM 'number'
    OR json_typeof(definition -> 'source') IS DISTINCT FROM 'object'
    OR json_typeof(definition -> 'startCapabilities') IS DISTINCT FROM 'object'
    OR right(retained, 2) <> '}}'
  THEN
    RAISE EXCEPTION 'unsupported retained public definition snapshot before migration 0013';
  END IF;
  RETURN left(retained, length(retained) - 2) || ',"sourceOverlay":null}}';
END
$function$;

UPDATE bpmn_platform.confirmed_process_instances
SET public_instance_json = pg_temp.add_absent_public_overlay(public_instance_json);
UPDATE bpmn_platform.work_processes
SET public_instance_json = pg_temp.add_absent_public_overlay(public_instance_json);
UPDATE bpmn_platform.work_snapshot_generation_items
SET expected_public_instance_json = pg_temp.add_absent_public_overlay(expected_public_instance_json);
UPDATE bpmn_platform.operate_process_instances
SET public_identity_json = pg_temp.add_absent_public_overlay(public_identity_json);
UPDATE bpmn_platform.operate_incident_snapshot_generation_items
SET expected_public_identity_json = pg_temp.add_absent_public_overlay(expected_public_identity_json);

DROP FUNCTION pg_temp.add_absent_public_overlay(text);

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;
DO $migration$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch SET epoch = 13 WHERE singleton = true AND epoch = 12;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0013';
  END IF;
END
$migration$;
ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 13);

CREATE TABLE bpmn_platform.definition_version_heads (
  process_id bytea PRIMARY KEY,
  next_version bigint NOT NULL CHECK (next_version > 1)
);

CREATE TABLE bpmn_platform.definition_versions (
  process_id bytea NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  source_kind text NOT NULL CHECK (source_kind = 'bpmnSource'),
  source_id bytea NOT NULL,
  source_sha256 text NOT NULL REFERENCES bpmn_platform.exact_artifacts (sha256),
  source_byte_length bigint NOT NULL CHECK (source_byte_length >= 0),
  source_declared_encoding bytea,
  source_decoded_as text CHECK (source_decoded_as IS NULL OR source_decoded_as = 'UTF-8'),
  semantic_profile bytea NOT NULL,
  start_capabilities_json text NOT NULL CHECK (length(start_capabilities_json) > 0),
  human_task_catalog_json text,
  PRIMARY KEY (process_id, version)
);

CREATE TABLE bpmn_platform.definition_diagram_presentations (
  schema_epoch integer NOT NULL CHECK (schema_epoch = 1),
  source_sha256 text NOT NULL REFERENCES bpmn_platform.exact_artifacts (sha256),
  effective_generator_sha256 text NOT NULL CHECK (effective_generator_sha256 ~ '^[0-9a-f]{64}$'),
  diagram_interchange_sha256 text NOT NULL CHECK (diagram_interchange_sha256 ~ '^[0-9a-f]{64}$'),
  presentation_sha256 text NOT NULL CHECK (presentation_sha256 ~ '^[0-9a-f]{64}$'),
  generator_id text NOT NULL CHECK (generator_id = 'bpmn-auto-layout'),
  generator_version text NOT NULL CHECK (generator_version = '1.3.0'),
  diagram_interchange_xml bytea NOT NULL CHECK (octet_length(diagram_interchange_xml) > 0),
  PRIMARY KEY (schema_epoch, source_sha256, effective_generator_sha256)
);

CREATE TABLE bpmn_platform.confirmed_process_instances (
  process_instance_id bytea PRIMARY KEY,
  public_instance_json text NOT NULL CHECK (length(public_instance_json) > 0),
  work_locator bytea NOT NULL CHECK (octet_length(work_locator) > 0),
  direct_intent_json text,
  state text NOT NULL CHECK (
    state IN ('reserved', 'starting', 'indeterminate', 'confirmed', 'integrityFailure')
  ),
  operate_pending boolean NOT NULL,
  work_pending boolean NOT NULL,
  CHECK (state = 'confirmed' OR (NOT operate_pending AND NOT work_pending))
);

CREATE TABLE bpmn_platform.definition_schedules (
  process_id bytea NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  schedule_id bytea NOT NULL,
  source_kind text NOT NULL CHECK (source_kind = 'bpmnSource'),
  source_id bytea NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_byte_length bigint NOT NULL CHECK (source_byte_length >= 0),
  source_declared_encoding bytea,
  source_decoded_as text CHECK (source_decoded_as IS NULL OR source_decoded_as = 'UTF-8'),
  semantic_profile bytea NOT NULL,
  start_capabilities_json text NOT NULL CHECK (length(start_capabilities_json) > 0),
  timer_start_event_id bytea NOT NULL,
  timer_duration_ms bigint NOT NULL CHECK (timer_duration_ms > 0),
  activation_at text NOT NULL,
  due_at text NOT NULL,
  process_instance_id bytea NOT NULL UNIQUE,
  host_schedule_id bytea NOT NULL UNIQUE,
  configured_workflow_id_base bytea NOT NULL UNIQUE,
  state text NOT NULL CHECK (
    state IN ('creating', 'creatingHost', 'scheduled', 'cancelling', 'started', 'missed', 'cancelled')
  ),
  cleanup_complete boolean NOT NULL,
  cancellation_origin text CHECK (
    cancellation_origin IS NULL OR cancellation_origin IN ('creatingHost', 'scheduled')
  ),
  execution_workflow_id bytea,
  first_run_id bytea,
  PRIMARY KEY (process_id, version, schedule_id),
  FOREIGN KEY (process_id, version)
    REFERENCES bpmn_platform.definition_versions (process_id, version),
  CHECK (
    (state = 'cancelling' AND cancellation_origin IS NOT NULL)
    OR (state <> 'cancelling' AND cancellation_origin IS NULL)
  ),
  CHECK (
    (state = 'started' AND execution_workflow_id IS NOT NULL AND first_run_id IS NOT NULL)
    OR (state <> 'started' AND execution_workflow_id IS NULL AND first_run_id IS NULL)
  ),
  CHECK (state IN ('started', 'missed', 'cancelled') OR NOT cleanup_complete)
);

CREATE TABLE bpmn_platform.message_start_publications (
  publication_id bytea PRIMARY KEY,
  process_id bytea NOT NULL,
  version bigint NOT NULL CHECK (version > 0),
  source_kind text NOT NULL CHECK (source_kind = 'bpmnSource'),
  source_id bytea NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_byte_length bigint NOT NULL CHECK (source_byte_length >= 0),
  source_declared_encoding bytea,
  source_decoded_as text CHECK (source_decoded_as IS NULL OR source_decoded_as = 'UTF-8'),
  semantic_profile bytea NOT NULL,
  start_capabilities_json text NOT NULL CHECK (length(start_capabilities_json) > 0),
  message_start_event_id bytea NOT NULL,
  message_interface_id bytea NOT NULL,
  message_interface_operation_id bytea NOT NULL,
  message_id bytea NOT NULL,
  process_instance_id bytea NOT NULL UNIQUE,
  command_id bytea NOT NULL UNIQUE,
  workflow_id bytea NOT NULL UNIQUE,
  intent_protocol bytea NOT NULL,
  intent_sha256 text NOT NULL CHECK (intent_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (
    state IN ('reserved', 'starting', 'accepted', 'indeterminate', 'integrityFailure')
  ),
  FOREIGN KEY (process_id, version)
    REFERENCES bpmn_platform.definition_versions (process_id, version)
);

CREATE INDEX confirmed_process_instances_reconciliation_idx
  ON bpmn_platform.confirmed_process_instances (process_instance_id)
  WHERE state IN ('reserved', 'starting', 'indeterminate')
    OR (state = 'confirmed' AND (operate_pending OR work_pending));

CREATE INDEX definition_schedules_reconciliation_idx
  ON bpmn_platform.definition_schedules (
    process_id, version, schedule_id
  )
  WHERE state IN ('creating', 'creatingHost', 'scheduled', 'cancelling')
    OR NOT cleanup_complete;

CREATE INDEX message_start_publications_reconciliation_idx
  ON bpmn_platform.message_start_publications (publication_id)
  WHERE state IN ('reserved', 'starting', 'indeterminate');

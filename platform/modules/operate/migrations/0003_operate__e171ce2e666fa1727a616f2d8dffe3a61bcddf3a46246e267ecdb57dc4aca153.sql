CREATE TABLE bpmn_platform.operate_process_instances (
  ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY CHECK (
    ordinal > 0 AND ordinal <= 9007199254740991
  ),
  process_instance_id bytea NOT NULL UNIQUE CHECK (octet_length(process_instance_id) > 0),
  process_id bytea NOT NULL CHECK (octet_length(process_id) > 0),
  definition_version bigint NOT NULL CHECK (
    definition_version > 0 AND definition_version <= 9007199254740991
  ),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  public_identity_json text NOT NULL CHECK (length(public_identity_json) > 0),
  process_locator bytea NOT NULL CHECK (octet_length(process_locator) > 0),
  observation text NOT NULL CHECK (observation IN ('active', 'closed', 'indeterminate'))
);

CREATE INDEX operate_process_instances_process_id_ordinal_idx
  ON bpmn_platform.operate_process_instances (process_id, ordinal DESC);

CREATE INDEX operate_process_instances_source_sha256_ordinal_idx
  ON bpmn_platform.operate_process_instances (source_sha256, ordinal DESC);

CREATE INDEX operate_process_instances_version_ordinal_idx
  ON bpmn_platform.operate_process_instances (definition_version, ordinal DESC);

CREATE INDEX operate_process_instances_definition_population_idx
  ON bpmn_platform.operate_process_instances (
    process_id, definition_version, source_sha256, ordinal ASC
  );

CREATE TABLE bpmn_platform.operate_incident_actions (
  action_id bytea PRIMARY KEY CHECK (octet_length(action_id) > 0),
  actor_id bytea NOT NULL CHECK (octet_length(actor_id) > 0),
  hosting_process_instance_id bytea NOT NULL REFERENCES bpmn_platform.operate_process_instances (process_instance_id),
  incident_process_instance_id bytea NOT NULL CHECK (octet_length(incident_process_instance_id) > 0),
  incident_element_id bytea NOT NULL CHECK (octet_length(incident_element_id) > 0),
  incident_activation bigint NOT NULL CHECK (
    incident_activation > 0 AND incident_activation <= 9007199254740991
  ),
  incident_generation integer NOT NULL CHECK (incident_generation = 1),
  action_kind text NOT NULL CHECK (action_kind IN ('retryIncident', 'cancelIncidentProcess')),
  binding_json text NOT NULL CHECK (length(binding_json) > 0),
  state text NOT NULL CHECK (state IN ('reserved', 'submitting', 'committed', 'rejected', 'indeterminate')),
  result_json text
);

CREATE TABLE bpmn_platform.operate_incident_action_audit_source_head (
  singleton boolean PRIMARY KEY CHECK (singleton),
  head bigint NOT NULL CHECK (head >= 0 AND head <= 9007199254740991)
);

INSERT INTO bpmn_platform.operate_incident_action_audit_source_head (singleton, head)
VALUES (true, 0);

CREATE TABLE bpmn_platform.operate_incident_action_audit_outbox (
  ordinal bigint PRIMARY KEY CHECK (ordinal > 0 AND ordinal <= 9007199254740991),
  event_id bytea NOT NULL UNIQUE CHECK (octet_length(event_id) > 0),
  action_id bytea NOT NULL REFERENCES bpmn_platform.operate_incident_actions (action_id),
  action_outcome text NOT NULL CHECK (action_outcome IN ('reserved', 'committed', 'rejected', 'indeterminate')),
  event_json text NOT NULL CHECK (length(event_json) > 0),
  delivered boolean NOT NULL,
  UNIQUE (action_id, action_outcome)
);

CREATE TABLE bpmn_platform.operate_execution_publications (
  process_instance_id bytea PRIMARY KEY REFERENCES bpmn_platform.operate_process_instances (process_instance_id),
  identity_json text NOT NULL CHECK (length(identity_json) > 0),
  status text NOT NULL CHECK (status IN ('healthy', 'gap', 'unavailable')),
  head_revision bigint NOT NULL CHECK (head_revision >= 0 AND head_revision <= 9007199254740991),
  producer_head_revision bigint CHECK (
    producer_head_revision >= head_revision AND producer_head_revision <= 9007199254740991
  ),
  last_logical_time_ms bigint CHECK (
    last_logical_time_ms >= 0 AND last_logical_time_ms <= 9007199254740991
  ),
  control_tokens_json text NOT NULL CHECK (length(control_tokens_json) > 0),
  scopes_json text NOT NULL CHECK (length(scopes_json) > 0),
  current_json text,
  CHECK (
    (head_revision = 0 AND last_logical_time_ms IS NULL)
    OR (head_revision > 0 AND last_logical_time_ms IS NOT NULL)
  )
);

CREATE TABLE bpmn_platform.operate_execution_publication_batches (
  process_instance_id bytea NOT NULL REFERENCES bpmn_platform.operate_execution_publications (process_instance_id),
  from_revision bigint NOT NULL CHECK (from_revision >= 0 AND from_revision <= 9007199254740991),
  through_revision bigint NOT NULL CHECK (
    through_revision > from_revision AND through_revision <= 9007199254740991
  ),
  command_id bytea NOT NULL CHECK (octet_length(command_id) > 0),
  batch_json text NOT NULL CHECK (length(batch_json) > 0),
  PRIMARY KEY (process_instance_id, from_revision),
  UNIQUE (process_instance_id, through_revision)
);

CREATE TABLE bpmn_platform.operate_execution_publication_records (
  process_instance_id bytea NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0 AND revision <= 9007199254740991),
  batch_from_revision bigint NOT NULL CHECK (
    batch_from_revision >= 0 AND batch_from_revision < revision
  ),
  record_json text NOT NULL CHECK (length(record_json) > 0),
  PRIMARY KEY (process_instance_id, revision),
  FOREIGN KEY (process_instance_id, batch_from_revision)
    REFERENCES bpmn_platform.operate_execution_publication_batches (process_instance_id, from_revision)
);

CREATE TABLE bpmn_platform.operate_flow_node_occurrence_publications (
  process_instance_id bytea PRIMARY KEY REFERENCES bpmn_platform.operate_process_instances (process_instance_id),
  identity_json text NOT NULL CHECK (length(identity_json) > 0),
  status text NOT NULL CHECK (status IN ('healthy', 'gap', 'unavailable')),
  head_revision bigint NOT NULL CHECK (head_revision >= 0 AND head_revision <= 9007199254740991),
  producer_head_revision bigint CHECK (
    producer_head_revision >= head_revision AND producer_head_revision <= 9007199254740991
  ),
  last_committed_at_epoch_ms bigint CHECK (
    last_committed_at_epoch_ms >= 0 AND last_committed_at_epoch_ms <= 9007199254740991
  ),
  current_open_json text NOT NULL CHECK (length(current_open_json) > 0),
  CHECK (
    (head_revision = 0 AND last_committed_at_epoch_ms IS NULL)
    OR (head_revision > 0 AND last_committed_at_epoch_ms IS NOT NULL)
  )
);

CREATE TABLE bpmn_platform.operate_flow_node_occurrence_batches (
  process_instance_id bytea NOT NULL REFERENCES bpmn_platform.operate_flow_node_occurrence_publications (process_instance_id),
  from_revision bigint NOT NULL CHECK (from_revision >= 0 AND from_revision <= 9007199254740991),
  through_revision bigint NOT NULL CHECK (
    through_revision > from_revision AND through_revision <= 9007199254740991
  ),
  command_id bytea NOT NULL CHECK (octet_length(command_id) > 0),
  committed_at_epoch_ms bigint NOT NULL CHECK (
    committed_at_epoch_ms >= 0 AND committed_at_epoch_ms <= 9007199254740991
  ),
  batch_json text NOT NULL CHECK (length(batch_json) > 0),
  PRIMARY KEY (process_instance_id, from_revision),
  UNIQUE (process_instance_id, through_revision)
);

CREATE TABLE bpmn_platform.operate_flow_node_occurrences (
  hosting_process_instance_id bytea NOT NULL REFERENCES bpmn_platform.operate_flow_node_occurrence_publications (process_instance_id),
  start_revision bigint NOT NULL CHECK (start_revision > 0 AND start_revision <= 9007199254740991),
  start_index bigint NOT NULL CHECK (start_index >= 0 AND start_index <= 9007199254740991),
  occurrence_json text NOT NULL CHECK (length(occurrence_json) > 0),
  PRIMARY KEY (hosting_process_instance_id, start_revision, start_index)
);

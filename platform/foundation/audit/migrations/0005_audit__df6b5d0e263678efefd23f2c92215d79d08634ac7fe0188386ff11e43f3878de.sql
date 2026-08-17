CREATE TABLE bpmn_platform.audit_work_sink_head (
  singleton boolean PRIMARY KEY CHECK (singleton),
  head bigint NOT NULL CHECK (head BETWEEN 0 AND 9007199254740991)
);

INSERT INTO bpmn_platform.audit_work_sink_head (singleton, head)
VALUES (true, 0);

CREATE TABLE bpmn_platform.audit_work_events (
  ordinal bigint PRIMARY KEY CHECK (ordinal BETWEEN 1 AND 9007199254740991),
  event_id bytea NOT NULL UNIQUE CHECK (octet_length(event_id) > 0),
  actor_id bytea NOT NULL CHECK (octet_length(actor_id) > 0),
  task_process_instance_id bytea NOT NULL CHECK (octet_length(task_process_instance_id) > 0),
  hosting_process_instance_id bytea NOT NULL CHECK (octet_length(hosting_process_instance_id) > 0),
  task_element_id bytea NOT NULL CHECK (octet_length(task_element_id) > 0),
  task_activation bigint NOT NULL CHECK (task_activation BETWEEN 1 AND 9007199254740991),
  action_kind text NOT NULL CHECK (action_kind IN ('claim', 'release', 'completion')),
  action_id bytea NOT NULL CHECK (octet_length(action_id) > 0),
  action_outcome text NOT NULL CHECK (action_outcome IN (
    'claimed', 'idempotent', 'conflict', 'released',
    'reserved', 'committed', 'rejected', 'indeterminate'
  )),
  event_json text NOT NULL CHECK (length(event_json) > 0),
  UNIQUE (action_id, action_outcome)
);

CREATE INDEX audit_work_actor_ordinal_idx
  ON bpmn_platform.audit_work_events (actor_id, ordinal);

CREATE INDEX audit_work_host_ordinal_idx
  ON bpmn_platform.audit_work_events (hosting_process_instance_id, ordinal);

CREATE TABLE bpmn_platform.audit_incident_sink_head (
  singleton boolean PRIMARY KEY CHECK (singleton),
  head bigint NOT NULL CHECK (head BETWEEN 0 AND 9007199254740991)
);

INSERT INTO bpmn_platform.audit_incident_sink_head (singleton, head)
VALUES (true, 0);

CREATE TABLE bpmn_platform.audit_incident_events (
  ordinal bigint PRIMARY KEY CHECK (ordinal BETWEEN 1 AND 9007199254740991),
  event_id bytea NOT NULL UNIQUE CHECK (octet_length(event_id) > 0),
  actor_id bytea NOT NULL CHECK (octet_length(actor_id) > 0),
  hosting_process_instance_id bytea NOT NULL CHECK (octet_length(hosting_process_instance_id) > 0),
  incident_process_instance_id bytea NOT NULL CHECK (octet_length(incident_process_instance_id) > 0),
  incident_element_id bytea NOT NULL CHECK (octet_length(incident_element_id) > 0),
  incident_activation bigint NOT NULL CHECK (incident_activation BETWEEN 1 AND 9007199254740991),
  incident_generation integer NOT NULL CHECK (incident_generation = 1),
  action_kind text NOT NULL CHECK (action_kind IN ('retryIncident', 'cancelIncidentProcess')),
  action_id bytea NOT NULL CHECK (octet_length(action_id) > 0),
  outcome text NOT NULL CHECK (outcome IN ('reserved', 'committed', 'rejected', 'indeterminate')),
  event_json text NOT NULL CHECK (length(event_json) > 0),
  UNIQUE (action_id, outcome)
);

CREATE INDEX audit_incident_actor_ordinal_idx
  ON bpmn_platform.audit_incident_events (actor_id, ordinal);

CREATE INDEX audit_incident_host_ordinal_idx
  ON bpmn_platform.audit_incident_events (hosting_process_instance_id, ordinal);

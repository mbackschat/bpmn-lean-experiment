CREATE TABLE bpmn_platform.work_processes (
  process_instance_id bytea PRIMARY KEY CHECK (octet_length(process_instance_id) > 0),
  public_instance_json text NOT NULL CHECK (length(public_instance_json) > 0),
  work_locator bytea NOT NULL CHECK (octet_length(work_locator) > 0),
  observation text NOT NULL CHECK (observation IN ('active', 'closed', 'indeterminate'))
);

CREATE TABLE bpmn_platform.work_claims (
  hosting_process_instance_id bytea NOT NULL CHECK (octet_length(hosting_process_instance_id) > 0),
  task_process_instance_id bytea NOT NULL CHECK (octet_length(task_process_instance_id) > 0),
  element_id bytea NOT NULL CHECK (octet_length(element_id) > 0),
  activation bigint NOT NULL CHECK (activation BETWEEN 1 AND 9007199254740991),
  claim_generation bigint NOT NULL CHECK (claim_generation BETWEEN 0 AND 9007199254740991),
  actor_id bytea CHECK (actor_id IS NULL OR octet_length(actor_id) > 0),
  PRIMARY KEY (
    hosting_process_instance_id,
    task_process_instance_id,
    element_id,
    activation
  )
);

CREATE TABLE bpmn_platform.work_actions (
  action_id bytea PRIMARY KEY CHECK (octet_length(action_id) > 0),
  action_kind text NOT NULL CHECK (action_kind IN ('claim', 'release')),
  actor_id bytea NOT NULL CHECK (octet_length(actor_id) > 0),
  hosting_process_instance_id bytea NOT NULL CHECK (octet_length(hosting_process_instance_id) > 0),
  task_process_instance_id bytea NOT NULL CHECK (octet_length(task_process_instance_id) > 0),
  element_id bytea NOT NULL CHECK (octet_length(element_id) > 0),
  activation bigint NOT NULL CHECK (activation BETWEEN 1 AND 9007199254740991),
  input_generation bigint NOT NULL CHECK (input_generation BETWEEN 0 AND 9007199254740991),
  result_json text NOT NULL CHECK (length(result_json) > 0)
);

CREATE TABLE bpmn_platform.work_completions (
  action_id bytea PRIMARY KEY CHECK (octet_length(action_id) > 0),
  actor_id bytea NOT NULL CHECK (octet_length(actor_id) > 0),
  hosting_process_instance_id bytea NOT NULL CHECK (octet_length(hosting_process_instance_id) > 0),
  task_process_instance_id bytea NOT NULL CHECK (octet_length(task_process_instance_id) > 0),
  element_id bytea NOT NULL CHECK (octet_length(element_id) > 0),
  activation bigint NOT NULL CHECK (activation BETWEEN 1 AND 9007199254740991),
  claim_generation bigint NOT NULL CHECK (claim_generation BETWEEN 1 AND 9007199254740991),
  binding_json text NOT NULL CHECK (length(binding_json) > 0),
  state text NOT NULL CHECK (
    state IN ('reserved', 'submitting', 'committed', 'rejected', 'indeterminate')
  ),
  result_json text CHECK (result_json IS NULL OR length(result_json) > 0)
);

CREATE UNIQUE INDEX work_completion_active_slot
ON bpmn_platform.work_completions (
  hosting_process_instance_id,
  task_process_instance_id,
  element_id,
  activation,
  claim_generation
)
WHERE state IN ('reserved', 'submitting', 'indeterminate');

CREATE TABLE bpmn_platform.work_audit_source_head (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  head bigint NOT NULL CHECK (head BETWEEN 0 AND 9007199254740991)
);

INSERT INTO bpmn_platform.work_audit_source_head (singleton, head)
VALUES (true, 0);

CREATE TABLE bpmn_platform.work_audit_outbox (
  ordinal bigint PRIMARY KEY CHECK (ordinal BETWEEN 1 AND 9007199254740991),
  event_id bytea NOT NULL UNIQUE CHECK (octet_length(event_id) > 0),
  action_id bytea NOT NULL CHECK (octet_length(action_id) > 0),
  action_outcome text NOT NULL CHECK (
    action_outcome IN (
      'claimed', 'idempotent', 'conflict', 'released',
      'reserved', 'committed', 'rejected', 'indeterminate'
    )
  ),
  event_json text NOT NULL CHECK (length(event_json) > 0),
  delivered boolean NOT NULL,
  UNIQUE (action_id, action_outcome)
);

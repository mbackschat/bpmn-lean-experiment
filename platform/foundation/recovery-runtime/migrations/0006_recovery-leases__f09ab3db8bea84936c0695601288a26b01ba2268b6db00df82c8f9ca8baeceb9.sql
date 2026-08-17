CREATE TABLE bpmn_platform.recovery_leases (
  family text NOT NULL,
  item_key bytea NOT NULL,
  state text NOT NULL,
  lease_token uuid,
  worker_id bytea,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  attempt_count bigint NOT NULL DEFAULT 0,
  failure_code text,
  failure_evidence bytea,
  PRIMARY KEY (family, item_key),
  CONSTRAINT recovery_leases_family_bounds CHECK (
    octet_length(family) BETWEEN 1 AND 128
  ),
  CONSTRAINT recovery_leases_item_key_bounds CHECK (
    octet_length(item_key) BETWEEN 1 AND 4096
  ),
  CONSTRAINT recovery_leases_worker_id_bounds CHECK (
    worker_id IS NULL OR octet_length(worker_id) BETWEEN 1 AND 1024
  ),
  CONSTRAINT recovery_leases_attempt_bounds CHECK (
    attempt_count BETWEEN 0 AND 9007199254740991
  ),
  CONSTRAINT recovery_leases_failure_code_bounds CHECK (
    failure_code IS NULL OR octet_length(failure_code) BETWEEN 1 AND 128
  ),
  CONSTRAINT recovery_leases_failure_evidence_bounds CHECK (
    failure_evidence IS NULL OR octet_length(failure_evidence) BETWEEN 1 AND 4096
  ),
  CONSTRAINT recovery_leases_state_shape CHECK (
    (
      state = 'ready'
      AND lease_token IS NULL
      AND worker_id IS NULL
      AND lease_expires_at IS NULL
      AND next_attempt_at IS NOT NULL
      AND failure_code IS NULL
      AND failure_evidence IS NULL
    )
    OR (
      state = 'leased'
      AND lease_token IS NOT NULL
      AND worker_id IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND next_attempt_at IS NULL
      AND failure_code IS NULL
      AND failure_evidence IS NULL
    )
    OR (
      state = 'failed'
      AND lease_token IS NULL
      AND worker_id IS NULL
      AND lease_expires_at IS NULL
      AND next_attempt_at IS NULL
      AND failure_code IS NOT NULL
      AND failure_evidence IS NOT NULL
    )
  )
);

CREATE INDEX recovery_leases_eligibility_idx
  ON bpmn_platform.recovery_leases (
    family,
    state,
    next_attempt_at,
    lease_expires_at,
    item_key
  );

ALTER TABLE bpmn_platform_meta.schema_epoch
  DROP CONSTRAINT schema_epoch_epoch_check;

DO $$
DECLARE
  updated_rows integer;
  retained_rows integer;
BEGIN
  UPDATE bpmn_platform_meta.schema_epoch
  SET epoch = 6
  WHERE singleton = true AND epoch = 1;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  SELECT count(*) INTO retained_rows
  FROM bpmn_platform_meta.schema_epoch;
  IF updated_rows <> 1 OR retained_rows <> 1 THEN
    RAISE EXCEPTION 'unexpected schema epoch before migration 0006';
  END IF;
END
$$;

ALTER TABLE bpmn_platform_meta.schema_epoch
  ADD CONSTRAINT schema_epoch_epoch_check CHECK (epoch = 6);

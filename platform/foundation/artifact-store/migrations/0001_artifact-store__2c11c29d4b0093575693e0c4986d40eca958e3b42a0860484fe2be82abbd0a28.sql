CREATE SCHEMA IF NOT EXISTS bpmn_platform_meta;
CREATE SCHEMA IF NOT EXISTS bpmn_platform;

CREATE TABLE bpmn_platform_meta.schema_epoch (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  epoch integer NOT NULL CHECK (epoch = 1)
);

INSERT INTO bpmn_platform_meta.schema_epoch (singleton, epoch)
VALUES (true, 1);

CREATE TABLE bpmn_platform.exact_artifacts (
  sha256 text PRIMARY KEY CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  bytes bytea NOT NULL,
  CONSTRAINT exact_artifacts_byte_length_matches
    CHECK (byte_length = octet_length(bytes))
);

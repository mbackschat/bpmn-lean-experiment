CREATE ROLE bpmn_migration
  LOGIN
  PASSWORD 'bpmn-migration-evaluation';

CREATE ROLE bpmn_runtime
  LOGIN
  PASSWORD 'bpmn-runtime-evaluation';

CREATE SCHEMA bpmn_platform AUTHORIZATION bpmn_migration;
CREATE SCHEMA bpmn_platform_meta AUTHORIZATION bpmn_migration;

GRANT CONNECT ON DATABASE bpmn_platform TO bpmn_migration, bpmn_runtime;
GRANT CREATE ON DATABASE bpmn_platform TO bpmn_migration;
GRANT USAGE ON SCHEMA bpmn_platform, bpmn_platform_meta TO bpmn_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE bpmn_migration IN SCHEMA bpmn_platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bpmn_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE bpmn_migration IN SCHEMA bpmn_platform_meta
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bpmn_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE bpmn_migration IN SCHEMA bpmn_platform
  GRANT USAGE, SELECT ON SEQUENCES TO bpmn_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE bpmn_migration IN SCHEMA bpmn_platform_meta
  GRANT USAGE, SELECT ON SEQUENCES TO bpmn_runtime;

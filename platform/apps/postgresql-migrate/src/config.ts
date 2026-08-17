export type PlatformPostgresqlMigrationConfig = Readonly<{
  connectionString: string;
}>;

export class InvalidPlatformPostgresqlMigrationConfigError extends TypeError {
  constructor(reason: string) {
    super(`PLATFORM_POSTGRESQL_MIGRATION_URL ${reason}`);
    this.name = "InvalidPlatformPostgresqlMigrationConfigError";
  }
}

/** Reads the one migration-only credential without retaining the environment object. */
export function readPlatformPostgresqlMigrationConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PlatformPostgresqlMigrationConfig {
  const connectionString: unknown = environment.PLATFORM_POSTGRESQL_MIGRATION_URL;
  if (
    typeof connectionString !== "string" ||
    connectionString.length === 0 ||
    connectionString.trim() !== connectionString
  ) {
    throw new InvalidPlatformPostgresqlMigrationConfigError(
      "must be a nonempty PostgreSQL URL",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new InvalidPlatformPostgresqlMigrationConfigError(
      "must be a valid PostgreSQL URL",
    );
  }
  if (parsed.protocol !== "postgresql:" || parsed.hostname.length === 0) {
    throw new InvalidPlatformPostgresqlMigrationConfigError(
      "must use the postgresql scheme and name a host",
    );
  }

  return Object.freeze({ connectionString });
}

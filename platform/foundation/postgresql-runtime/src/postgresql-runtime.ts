import pg from "pg";

export type PostgresqlRow = Readonly<Record<string, unknown>>;

export type PostgresqlQuery = Readonly<{
  text: string;
  values?: readonly unknown[];
}>;

export type PostgresqlQueryResult<Row extends PostgresqlRow> = Readonly<{
  rows: readonly Row[];
  rowCount: number | null;
}>;

export interface PostgresqlSession {
  query<Row extends PostgresqlRow = PostgresqlRow>(
    query: PostgresqlQuery,
  ): Promise<PostgresqlQueryResult<Row>>;
}

export interface PostgresqlRuntime extends PostgresqlSession {
  transaction<Result>(
    run: (session: PostgresqlSession) => Promise<Result>,
  ): Promise<Result>;
  withDedicatedSession<Result>(
    run: (session: PostgresqlSession) => Promise<Result>,
  ): Promise<Result>;
  databaseClockEpochMs(): Promise<number>;
  close(): Promise<void>;
}

export type PostgresqlRuntimeOptions = Readonly<{
  connectionString: string;
  applicationName: string;
  maxConnections: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  queryTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  idleInTransactionSessionTimeoutMs: number;
}>;

/** Raised before pool creation when a connection bound is absent or unsafe. */
export class InvalidPostgresqlRuntimeOptionsError extends Error {
  readonly option: keyof PostgresqlRuntimeOptions;

  constructor(option: keyof PostgresqlRuntimeOptions, reason: string) {
    super(`invalid PostgreSQL runtime option ${option}: ${reason}`);
    this.name = "InvalidPostgresqlRuntimeOptionsError";
    this.option = option;
  }
}

type DriverQueryResult = Readonly<{
  rows: readonly Record<string, unknown>[];
  rowCount: number | null;
}>;

type PoolClientLike = Readonly<{
  query: (text: string, values?: unknown[]) => Promise<DriverQueryResult>;
  release: () => void;
}>;

export type PostgresqlPoolLike = Readonly<{
  query: (text: string, values?: unknown[]) => Promise<DriverQueryResult>;
  connect: () => Promise<PoolClientLike>;
  end: () => Promise<void>;
}>;

export function createPostgresqlRuntimeWithPool(
  pool: PostgresqlPoolLike,
): PostgresqlRuntime {
  return new PoolBackedPostgresqlRuntime(pool);
}

export function createPostgresqlRuntime(
  options: PostgresqlRuntimeOptions,
): PostgresqlRuntime {
  validateOptions(options);
  return createPostgresqlRuntimeWithPool(
    new pg.Pool({
      connectionString: options.connectionString,
      application_name: options.applicationName,
      max: options.maxConnections,
      connectionTimeoutMillis: options.connectionTimeoutMs,
      idleTimeoutMillis: options.idleTimeoutMs,
      query_timeout: options.queryTimeoutMs,
      statement_timeout: options.statementTimeoutMs,
      lock_timeout: options.lockTimeoutMs,
      idle_in_transaction_session_timeout:
        options.idleInTransactionSessionTimeoutMs,
    }),
  );
}

class PoolBackedPostgresqlRuntime implements PostgresqlRuntime {
  readonly #pool: PostgresqlPoolLike;
  #closePromise: Promise<void> | null = null;

  constructor(pool: PostgresqlPoolLike) {
    this.#pool = pool;
  }

  async query<Row extends PostgresqlRow = PostgresqlRow>(
    query: PostgresqlQuery,
  ): Promise<PostgresqlQueryResult<Row>> {
    return await executeQuery<Row>(this.#pool, query);
  }

  async transaction<Result>(
    run: (session: PostgresqlSession) => Promise<Result>,
  ): Promise<Result> {
    return await this.withDedicatedSession(async (session) => {
      await session.query({ text: "BEGIN ISOLATION LEVEL READ COMMITTED" });
      try {
        const result = await run(session);
        await session.query({ text: "COMMIT" });
        return result;
      } catch (error: unknown) {
        try {
          await session.query({ text: "ROLLBACK" });
        } catch (rollbackError: unknown) {
          throw new AggregateError(
            [error, rollbackError],
            "PostgreSQL transaction and rollback both failed",
          );
        }
        throw error;
      }
    });
  }

  async withDedicatedSession<Result>(
    run: (session: PostgresqlSession) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.#pool.connect();
    try {
      return await run({
        query: async <Row extends PostgresqlRow = PostgresqlRow>(
          query: PostgresqlQuery,
        ): Promise<PostgresqlQueryResult<Row>> =>
          await executeQuery<Row>(client, query),
      });
    } finally {
      client.release();
    }
  }

  async databaseClockEpochMs(): Promise<number> {
    const result = await this.query<
      PostgresqlRow & Readonly<{ epoch_ms: string | number }>
    >({
      text: "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS epoch_ms",
    });
    const rawEpochMs = result.rows[0]?.epoch_ms;
    const epochMs =
      typeof rawEpochMs === "string" && /^(?:0|[1-9][0-9]*)$/u.test(rawEpochMs)
        ? Number(rawEpochMs)
        : rawEpochMs;
    if (typeof epochMs !== "number" || !Number.isSafeInteger(epochMs)) {
      throw new Error("PostgreSQL database clock did not return a safe epoch millisecond");
    }
    return epochMs;
  }

  async close(): Promise<void> {
    this.#closePromise ??= this.#pool.end();
    await this.#closePromise;
  }
}

async function executeQuery<Row extends PostgresqlRow>(
  executor: Pick<PostgresqlPoolLike, "query">,
  query: PostgresqlQuery,
): Promise<PostgresqlQueryResult<Row>> {
  const result = await executor.query(query.text, [...(query.values ?? [])]);
  return {
    rows: result.rows as readonly Row[],
    rowCount: result.rowCount,
  };
}

function validateOptions(options: PostgresqlRuntimeOptions): void {
  validateNonemptyString(options, "connectionString");
  validateNonemptyString(options, "applicationName");
  validateBoundedInteger(options, "maxConnections", 64);
  validateBoundedInteger(options, "connectionTimeoutMs", 2_147_483_647);
  validateBoundedInteger(options, "idleTimeoutMs", 2_147_483_647);
  validateBoundedInteger(options, "queryTimeoutMs", 2_147_483_647);
  validateBoundedInteger(options, "statementTimeoutMs", 2_147_483_647);
  validateBoundedInteger(options, "lockTimeoutMs", 2_147_483_647);
  validateBoundedInteger(
    options,
    "idleInTransactionSessionTimeoutMs",
    2_147_483_647,
  );
}

function validateNonemptyString(
  options: PostgresqlRuntimeOptions,
  option: "connectionString" | "applicationName",
): void {
  if (options[option].trim() === "") {
    throw new InvalidPostgresqlRuntimeOptionsError(option, "must not be empty");
  }
}

function validateBoundedInteger(
  options: PostgresqlRuntimeOptions,
  option: Exclude<keyof PostgresqlRuntimeOptions, "connectionString" | "applicationName">,
  maximum: number,
): void {
  const value = options[option];
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new InvalidPostgresqlRuntimeOptionsError(
      option,
      `must be an integer from 1 through ${maximum}`,
    );
  }
}

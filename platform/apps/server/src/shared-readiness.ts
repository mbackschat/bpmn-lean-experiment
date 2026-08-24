import type {
  PostgresqlRow,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

export const SHARED_PLATFORM_SCHEMA_EPOCH = 11;

type ReadinessRow = PostgresqlRow & Readonly<{
  server_major: unknown;
  epoch_rows: unknown;
  schema_epoch: unknown;
}>;

export type SharedPlatformServerReadinessOptions = Readonly<{
  runtime: Pick<PostgresqlSession, "query">;
  engineRuntime: Readonly<{ ensureConnected(): Promise<void> }>;
}>;

/** Proves bounded shared API dependencies without inspecting domain populations or backlogs. */
export async function checkSharedPlatformServerReadiness(
  options: SharedPlatformServerReadinessOptions,
): Promise<void> {
  const result = await options.runtime.query<ReadinessRow>({
    text: `
      SELECT
        current_setting('server_version_num')::integer / 10000 AS server_major,
        count(*)::integer AS epoch_rows,
        min(epoch)::integer AS schema_epoch
      FROM bpmn_platform_meta.schema_epoch
    `,
  });
  const row = result.rows.length === 1 ? result.rows[0] : undefined;
  if (
    row === undefined ||
    decodeInteger(row.server_major) !== 18 ||
    decodeInteger(row.epoch_rows) !== 1 ||
    decodeInteger(row.schema_epoch) !== SHARED_PLATFORM_SCHEMA_EPOCH
  ) {
    throw new Error("shared platform server readiness contract is not satisfied");
  }
  await options.engineRuntime.ensureConnected();
}

function decodeInteger(value: unknown): number {
  const decoded = typeof value === "string" ? Number(value) : value;
  return Number.isSafeInteger(decoded) ? decoded as number : -1;
}

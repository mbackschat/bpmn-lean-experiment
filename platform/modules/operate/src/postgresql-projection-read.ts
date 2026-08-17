import type { ProjectionRead } from "@bpmn-lean/platform-contracts";

export const PostgresqlProjectionReadKind = Object.freeze({
  Available: "available",
  NotFound: "notFound",
  Unavailable: "unavailable",
} as const);

export type PostgresqlProjectionReadKind =
  typeof PostgresqlProjectionReadKind[keyof typeof PostgresqlProjectionReadKind];

export type PostgresqlProjectionRead<Value> =
  | Readonly<{
      kind: typeof PostgresqlProjectionReadKind.Available;
      read: ProjectionRead<Value>;
    }>
  | Readonly<{ kind: typeof PostgresqlProjectionReadKind.NotFound }>
  | Readonly<{ kind: typeof PostgresqlProjectionReadKind.Unavailable }>;

export function unavailableProjectionRead(): Readonly<{
  kind: typeof PostgresqlProjectionReadKind.Unavailable;
}> {
  return { kind: PostgresqlProjectionReadKind.Unavailable };
}

export function requireProjectionMaximumAge(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("projection maximum age must be a positive safe integer");
  }
  return value;
}

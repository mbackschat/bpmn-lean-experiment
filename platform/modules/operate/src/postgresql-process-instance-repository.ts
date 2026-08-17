import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";
import type {
  PostgresqlRow,
  PostgresqlRuntime,
  PostgresqlSession,
} from "@bpmn-lean/platform-postgresql-runtime";

import {
  ProcessInstanceIdentityIntegrityError,
  ProcessInstanceStoredValueError,
} from "./contracts.js";
import type {
  ProcessInstanceRepository,
  ProcessInstanceRepositoryQuery,
  StoredProcessInstance,
} from "./contracts.js";
import type {
  ConfirmedProcessOperationsPublication,
  OperateProcessObservation,
  OperateProcessRegistration,
} from "./incident-contracts.js";
import {
  requireNonemptyString,
  requireObservation,
  requirePositiveSafeInteger,
  sameJson,
  snapshotConfirmedPublication,
} from "./incident-values.js";
import {
  decodeStoredProcessInstanceIdentity,
  encodePostgresqlByteText,
  encodeProcessInstanceIdentity,
  requirePostgresqlByteText,
  requirePostgresqlSafeInteger,
  requirePostgresqlString,
} from "./process-instance-values.js";

const selectedRegistrationColumns = `
  ordinal,
  process_instance_id,
  process_id,
  definition_version,
  source_sha256,
  public_identity_json,
  process_locator,
  observation,
  population_ordinal
`;

/** Shared PostgreSQL implementation of the exact confirmed-Process registry. */
export class PostgresqlProcessInstanceRepository
  implements ProcessInstanceRepository
{
  readonly #runtime: PostgresqlRuntime;

  constructor(runtime: PostgresqlRuntime) {
    this.#runtime = runtime;
  }

  async recordConfirmed(
    publication: ConfirmedProcessOperationsPublication,
  ): Promise<number>;
  async recordConfirmed(
    session: PostgresqlSession,
    publication: ConfirmedProcessOperationsPublication,
  ): Promise<number>;
  async recordConfirmed(
    publicationOrSession: ConfirmedProcessOperationsPublication | PostgresqlSession,
    publicationValue?: ConfirmedProcessOperationsPublication,
  ): Promise<number> {
    if (publicationValue !== undefined) {
      return await this.#recordConfirmed(
        publicationOrSession as PostgresqlSession,
        snapshotConfirmedPublication(publicationValue),
      );
    }
    const exact = snapshotConfirmedPublication(
      publicationOrSession as ConfirmedProcessOperationsPublication,
    );
    return await this.#runtime.transaction(async (session) =>
      await this.#recordConfirmed(session, exact));
  }

  async #recordConfirmed(
    session: PostgresqlSession,
    exact: ConfirmedProcessOperationsPublication,
  ): Promise<number> {
    const identityJson = encodeProcessInstanceIdentity(exact.instance);
    const processInstanceId = encodePostgresqlByteText(
      exact.instance.processInstanceId,
    );
    const control = await session.query({
      text: `
        SELECT population_head
        FROM bpmn_platform.operate_incident_snapshot_control
        WHERE singleton = true
        FOR UPDATE
      `,
    });
    const populationHead = requireNonnegativeSafeInteger(
      control.rows[0]?.population_head,
      "incident snapshot population head",
    );
    const nextPopulationOrdinal = populationHead + 1;
    if (!Number.isSafeInteger(nextPopulationOrdinal)) {
      throw new ProcessInstanceIdentityIntegrityError(exact.instance.processInstanceId);
    }
    const inserted = await session.query({
      text: `
        INSERT INTO bpmn_platform.operate_process_instances (
          process_instance_id,
          process_id,
          definition_version,
          source_sha256,
          public_identity_json,
          process_locator,
          observation,
          population_ordinal
        ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
        ON CONFLICT (process_instance_id) DO NOTHING
        RETURNING ${selectedRegistrationColumns}
      `,
      values: [
        processInstanceId,
        encodePostgresqlByteText(exact.instance.definition.processId),
        exact.instance.definition.version,
        exact.instance.definition.source.sha256,
        identityJson,
        encodePostgresqlByteText(exact.locator),
        nextPopulationOrdinal,
      ],
    });
    if (inserted.rowCount === 1) {
      const changed = await session.query({
        text: `
          UPDATE bpmn_platform.operate_incident_snapshot_control
          SET population_head = $1
          WHERE singleton = true AND population_head = $2
        `,
        values: [nextPopulationOrdinal, populationHead],
      });
      if (changed.rowCount !== 1) {
        throw new ProcessInstanceIdentityIntegrityError(exact.instance.processInstanceId);
      }
    }
    const row = inserted.rows[0] ?? (await session.query({
      text: `
        SELECT ${selectedRegistrationColumns}
        FROM bpmn_platform.operate_process_instances
        WHERE process_instance_id = $1
      `,
      values: [processInstanceId],
    })).rows[0];
    if (row === undefined) {
      throw new ProcessInstanceIdentityIntegrityError(
        exact.instance.processInstanceId,
      );
    }
    const retained = decodeRegistrationRow(row);
    const retainedPopulationOrdinal = requireNonnegativeSafeInteger(
      row.population_ordinal,
      "incident snapshot population ordinal",
    );
    if (
      !sameJson(retained.instance, exact.instance) ||
      retained.locator !== exact.locator ||
      retainedPopulationOrdinal < 1 ||
      retainedPopulationOrdinal > (
        inserted.rowCount === 1 ? nextPopulationOrdinal : populationHead
      )
    ) {
      throw new ProcessInstanceIdentityIntegrityError(
        exact.instance.processInstanceId,
      );
    }
    return retained.ordinal;
  }

  async getRegistration(
    processInstanceIdValue: string,
  ): Promise<OperateProcessRegistration | null> {
    const processInstanceId = encodePostgresqlByteText(
      requireNonemptyString(processInstanceIdValue, "processInstanceId"),
    );
    const row = (await this.#runtime.query({
      text: `
        SELECT ${selectedRegistrationColumns}
        FROM bpmn_platform.operate_process_instances
        WHERE process_instance_id = $1
      `,
      values: [processInstanceId],
    })).rows[0];
    return row === undefined ? null : decodeRegistrationRow(row);
  }

  async listNonclosed(
    limitValue: number,
  ): Promise<ReadonlyArray<OperateProcessRegistration>> {
    const limit = requirePositiveSafeInteger(limitValue, "limit");
    const result = await this.#runtime.query({
      text: `
        SELECT ${selectedRegistrationColumns}
        FROM bpmn_platform.operate_process_instances
        WHERE observation <> 'closed'
        ORDER BY ordinal ASC
        LIMIT $1
      `,
      values: [limit],
    });
    return result.rows.map(decodeRegistrationRow);
  }

  async listExactDefinitionVersion(
    definitionValue: DeployedDefinitionVersion,
  ): Promise<ReadonlyArray<OperateProcessRegistration>> {
    const definition = snapshotDefinition(definitionValue);
    const result = await this.#runtime.query({
      text: `
        SELECT ${selectedRegistrationColumns}
        FROM bpmn_platform.operate_process_instances
        WHERE process_id = $1
          AND definition_version = $2
          AND source_sha256 = $3
        ORDER BY ordinal ASC
        LIMIT 101
      `,
      values: [
        encodePostgresqlByteText(definition.processId),
        definition.version,
        definition.source.sha256,
      ],
    });
    return result.rows.map((row) => {
      const registration = decodeRegistrationRow(row);
      if (!sameJson(registration.instance.definition, definition)) {
        throw new ProcessInstanceStoredValueError(
          new TypeError("stored Process-instance definition version drifted"),
        );
      }
      return registration;
    });
  }

  async recordObservation(
    processInstanceIdValue: string,
    observationValue: OperateProcessObservation,
  ): Promise<void> {
    const processInstanceIdText = requireNonemptyString(
      processInstanceIdValue,
      "processInstanceId",
    );
    const processInstanceId = encodePostgresqlByteText(processInstanceIdText);
    const observation = requireObservation(observationValue);
    const result = await this.#runtime.query({
      text: `
        UPDATE bpmn_platform.operate_process_instances
        SET observation = CASE
          WHEN observation = 'closed' THEN observation
          ELSE $1
        END
        WHERE process_instance_id = $2
        RETURNING ${selectedRegistrationColumns}
      `,
      values: [observation, processInstanceId],
    });
    if (result.rows[0] === undefined) {
      throw new ProcessInstanceIdentityIntegrityError(processInstanceIdText);
    }
    decodeRegistrationRow(result.rows[0]);
  }

  async search(
    queryValue: ProcessInstanceRepositoryQuery,
  ): Promise<ReadonlyArray<StoredProcessInstance>> {
    const query = snapshotRepositoryQuery(queryValue);
    const result = await this.#runtime.query({
      text: `
        SELECT
          ordinal,
          process_instance_id,
          process_id,
          definition_version,
          source_sha256,
          public_identity_json
        FROM bpmn_platform.operate_process_instances
        WHERE ($1::bytea IS NULL OR process_instance_id = $1)
          AND ($2::bytea IS NULL OR process_id = $2)
          AND ($3::bigint IS NULL OR definition_version = $3)
          AND ($4::text IS NULL OR source_sha256 = $4)
          AND ($5::bigint IS NULL OR ordinal < $5)
        ORDER BY ordinal DESC
        LIMIT $6
      `,
      values: [
        query.processInstanceId === undefined
          ? null
          : encodePostgresqlByteText(query.processInstanceId),
        query.processId === undefined
          ? null
          : encodePostgresqlByteText(query.processId),
        query.version ?? null,
        query.sourceSha256 ?? null,
        query.beforeOrdinal ?? null,
        query.limit,
      ],
    });
    return result.rows.map(decodeIdentityRow);
  }
}

function requireNonnegativeSafeInteger(value: unknown, label: string): number {
  const decoded = typeof value === "bigint"
    ? Number(value)
    : typeof value === "string" && /^[0-9]+$/u.test(value)
    ? Number(value)
    : value;
  if (typeof decoded !== "number" || !Number.isSafeInteger(decoded) || decoded < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return decoded;
}

export function decodePostgresqlOperateRegistration(
  row: PostgresqlRow,
): OperateProcessRegistration {
  return decodeRegistrationRow(row);
}

function decodeRegistrationRow(row: PostgresqlRow): OperateProcessRegistration {
  try {
    const stored = decodeIdentityRow(row);
    return {
      ordinal: stored.ordinal,
      instance: stored.instance,
      locator: requirePostgresqlByteText(row, "process_locator"),
      observation: requireObservation(row.observation),
    };
  } catch (error: unknown) {
    if (error instanceof ProcessInstanceStoredValueError) throw error;
    throw new ProcessInstanceStoredValueError(error);
  }
}

function decodeIdentityRow(row: PostgresqlRow): StoredProcessInstance {
  try {
    const ordinal = requirePostgresqlSafeInteger(row, "ordinal", 1);
    const processInstanceId = requirePostgresqlByteText(
      row,
      "process_instance_id",
    );
    const processId = requirePostgresqlByteText(row, "process_id");
    const definitionVersion = requirePostgresqlSafeInteger(
      row,
      "definition_version",
      1,
    );
    const sourceSha256 = requirePostgresqlString(row, "source_sha256");
    const encoded = requirePostgresqlString(row, "public_identity_json");
    const instance = decodeStoredProcessInstanceIdentity(encoded);
    if (
      instance.processInstanceId !== processInstanceId ||
      instance.definition.processId !== processId ||
      instance.definition.version !== definitionVersion ||
      instance.definition.source.sha256 !== sourceSha256
    ) {
      throw new TypeError("stored Process-instance filter columns disagree");
    }
    return { ordinal, instance };
  } catch (error: unknown) {
    throw new ProcessInstanceStoredValueError(error);
  }
}

function snapshotDefinition(
  definition: DeployedDefinitionVersion,
): DeployedDefinitionVersion {
  return decodeStoredProcessInstanceIdentity(JSON.stringify({
    processInstanceId: "population-snapshot",
    definition,
  })).definition;
}

function snapshotRepositoryQuery(
  query: ProcessInstanceRepositoryQuery,
): ProcessInstanceRepositoryQuery {
  requirePositiveSafeInteger(query.limit, "query.limit");
  if (query.beforeOrdinal !== undefined) {
    requirePositiveSafeInteger(query.beforeOrdinal, "query.beforeOrdinal");
  }
  return {
    ...(query.processInstanceId === undefined
      ? {}
      : {
          processInstanceId: requireNonemptyString(
            query.processInstanceId,
            "query.processInstanceId",
          ),
        }),
    ...(query.processId === undefined
      ? {}
      : { processId: requireNonemptyString(query.processId, "query.processId") }),
    ...(query.version === undefined
      ? {}
      : { version: requirePositiveSafeInteger(query.version, "query.version") }),
    ...(query.sourceSha256 === undefined
      ? {}
      : {
          sourceSha256: requireNonemptyString(
            query.sourceSha256,
            "query.sourceSha256",
          ),
        }),
    ...(query.beforeOrdinal === undefined
      ? {}
      : { beforeOrdinal: query.beforeOrdinal }),
    limit: query.limit,
  };
}

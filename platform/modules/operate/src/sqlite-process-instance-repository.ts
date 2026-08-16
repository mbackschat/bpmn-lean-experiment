import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue, SQLOutputValue } from "node:sqlite";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

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
  encodeProcessInstanceIdentity,
} from "./process-instance-values.js";
import { initializeOperateSchema } from "./sqlite-operate-schema.js";

const defaultBusyTimeoutMs = 5_000;

/** Durable exact confirmed-Process registry and private observation classification. */
export class SqliteProcessInstanceRepository implements ProcessInstanceRepository {
  readonly #database: DatabaseSync;

  constructor(databaseFile: string, busyTimeoutMs: number = defaultBusyTimeoutMs) {
    requirePositiveSafeInteger(busyTimeoutMs, "busyTimeoutMs");
    this.#database = new DatabaseSync(databaseFile);
    this.#database.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    try {
      initializeOperateSchema(this.#database);
    } catch (error: unknown) {
      this.#database.close();
      throw error;
    }
  }

  get isOpen(): boolean {
    return this.#database.isOpen;
  }

  /** Serializes same-ID writers so exact publication bytes converge and drift fails. */
  async recordConfirmed(
    publication: ConfirmedProcessOperationsPublication,
  ): Promise<number> {
    const exact = snapshotConfirmedPublication(publication);
    const encoded = encodeProcessInstanceIdentity(exact.instance);
    return this.#transaction(() => {
      const existing = this.#registrationRow(exact.instance.processInstanceId);
      if (existing !== undefined) {
        const stored = decodeRegistrationRow(existing);
        if (!sameJson(stored.instance, exact.instance) || stored.locator !== exact.locator) {
          throw new ProcessInstanceIdentityIntegrityError(exact.instance.processInstanceId);
        }
        return stored.ordinal;
      }
      const result = this.#database.prepare(`
        INSERT INTO process_instances (
          process_instance_id,
          process_id,
          definition_version,
          source_sha256,
          public_identity_json,
          process_locator,
          observation
        ) VALUES (?, ?, ?, ?, ?, ?, 'active')
      `).run(
        exact.instance.processInstanceId,
        exact.instance.definition.processId,
        exact.instance.definition.version,
        exact.instance.definition.source.sha256,
        encoded,
        exact.locator,
      );
      return requirePositiveSafeInteger(
        result.lastInsertRowid,
        "inserted Process-instance ordinal",
      );
    });
  }

  async getRegistration(
    processInstanceId: string,
  ): Promise<OperateProcessRegistration | null> {
    const row = this.#registrationRow(
      requireNonemptyString(processInstanceId, "processInstanceId"),
    );
    return row === undefined ? null : decodeRegistrationRow(row);
  }

  /** Returns every nonclosed registration plus one overflow sentinel at most. */
  async listNonclosed(
    limit: number,
  ): Promise<ReadonlyArray<OperateProcessRegistration>> {
    requirePositiveSafeInteger(limit, "limit");
    return this.#database.prepare(`
      SELECT
        ordinal,
        process_instance_id,
        process_id,
        definition_version,
        source_sha256,
        public_identity_json,
        process_locator,
        observation
      FROM process_instances
      WHERE observation != 'closed'
      ORDER BY ordinal ASC
      LIMIT ?
    `).all(limit).map(decodeRegistrationRow);
  }

  /** Linearizes the complete bounded exact-version membership in one SQLite read. */
  async listExactDefinitionVersion(
    definition: DeployedDefinitionVersion,
  ): Promise<ReadonlyArray<OperateProcessRegistration>> {
    const exact = snapshotDefinition(definition);
    const rows = this.#database.prepare(`
      SELECT
        ordinal,
        process_instance_id,
        process_id,
        definition_version,
        source_sha256,
        public_identity_json,
        process_locator,
        observation
      FROM process_instances
      WHERE process_id = ?
        AND definition_version = ?
        AND source_sha256 = ?
      ORDER BY ordinal ASC
      LIMIT 101
    `).all(exact.processId, exact.version, exact.source.sha256);
    return rows.map((row) => {
      const registration = decodeRegistrationRow(row);
      if (!sameJson(registration.instance.definition, exact)) {
        throw new ProcessInstanceStoredValueError(
          new TypeError("stored Process-instance definition version drifted"),
        );
      }
      return registration;
    });
  }

  async recordObservation(
    processInstanceId: string,
    observation: OperateProcessObservation,
  ): Promise<void> {
    const exactId = requireNonemptyString(processInstanceId, "processInstanceId");
    const exactObservation = requireObservation(observation);
    const changes = this.#database.prepare(`
      UPDATE process_instances SET observation = ? WHERE process_instance_id = ?
    `).run(exactObservation, exactId).changes;
    if (changes !== 1) {
      throw new ProcessInstanceIdentityIntegrityError(exactId);
    }
  }

  /** Decodes and cross-checks every selected public snapshot before returning it. */
  async search(
    query: ProcessInstanceRepositoryQuery,
  ): Promise<ReadonlyArray<StoredProcessInstance>> {
    requireRepositoryQuery(query);
    const parameters: SQLInputValue[] = [];
    let where = addFilter("", parameters, "process_instance_id", query.processInstanceId);
    where = addFilter(where, parameters, "process_id", query.processId);
    where = addFilter(where, parameters, "definition_version", query.version);
    where = addFilter(where, parameters, "source_sha256", query.sourceSha256);
    if (query.beforeOrdinal !== undefined) {
      where = appendSqlPredicate(where, "ordinal < ?");
      parameters.push(query.beforeOrdinal);
    }
    parameters.push(query.limit);
    return this.#database.prepare(`
      SELECT
        ordinal,
        process_instance_id,
        process_id,
        definition_version,
        source_sha256,
        public_identity_json
      FROM process_instances
      ${where}
      ORDER BY ordinal DESC
      LIMIT ?
    `).all(...parameters).map(decodeIdentityRow);
  }

  close(): void {
    if (this.#database.isOpen) this.#database.close();
  }

  #registrationRow(processInstanceId: string): Record<string, SQLOutputValue> | undefined {
    return this.#database.prepare(`
      SELECT
        ordinal,
        process_instance_id,
        process_id,
        definition_version,
        source_sha256,
        public_identity_json,
        process_locator,
        observation
      FROM process_instances
      WHERE process_instance_id = ?
    `).get(processInstanceId);
  }

  #transaction<T>(run: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.#database.exec("COMMIT");
      return result;
    } catch (error: unknown) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

function snapshotDefinition(
  definition: DeployedDefinitionVersion,
): DeployedDefinitionVersion {
  const instance = decodeStoredProcessInstanceIdentity(JSON.stringify({
    processInstanceId: "population-snapshot",
    definition,
  }));
  return instance.definition;
}

function decodeRegistrationRow(
  row: Record<string, SQLOutputValue>,
): OperateProcessRegistration {
  try {
    const stored = decodeIdentityRow(row);
    return {
      ordinal: stored.ordinal,
      instance: stored.instance,
      locator: requireNonemptyString(row.process_locator, "process_locator"),
      observation: requireObservation(row.observation),
    };
  } catch (error: unknown) {
    if (error instanceof ProcessInstanceStoredValueError) throw error;
    throw new ProcessInstanceStoredValueError(error);
  }
}

function decodeIdentityRow(row: Record<string, SQLOutputValue>): StoredProcessInstance {
  try {
    const ordinal = requirePositiveSafeInteger(row.ordinal, "ordinal");
    const processInstanceId = requireNonemptyString(row.process_instance_id, "process_instance_id");
    const processId = requireNonemptyString(row.process_id, "process_id");
    const definitionVersion = requirePositiveSafeInteger(row.definition_version, "definition_version");
    const sourceSha256 = requireNonemptyString(row.source_sha256, "source_sha256");
    const encoded = requireNonemptyString(row.public_identity_json, "public_identity_json");
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

function addFilter(
  where: string,
  parameters: SQLInputValue[],
  column: string,
  value: string | number | undefined,
): string {
  if (value === undefined) return where;
  parameters.push(value);
  return appendSqlPredicate(where, `${column} = ?`);
}

function appendSqlPredicate(where: string, predicate: string): string {
  return where.length === 0 ? `WHERE ${predicate}` : `${where} AND ${predicate}`;
}

function requireRepositoryQuery(query: ProcessInstanceRepositoryQuery): void {
  requirePositiveSafeInteger(query.limit, "query.limit");
  if (query.beforeOrdinal !== undefined) {
    requirePositiveSafeInteger(query.beforeOrdinal, "query.beforeOrdinal");
  }
}

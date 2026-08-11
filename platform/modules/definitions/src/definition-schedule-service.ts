import {
  DefinitionArtifactIntegrityError,
} from "./contracts.js";
import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionTimerStartCapability,
} from "./contracts.js";
import {
  cloneDefinitionStartCapabilities,
  equalDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import {
  cloneDefinitionMetadata,
} from "./definition-values.js";
import {
  cloneDefinitionReference,
  cloneScheduleReference,
  deriveScheduleDueAt,
  equalDefinitionSource,
  projectDefinitionSchedule,
  requireDefinitionReference,
  requireSameScheduleIntent,
  requireScheduleIdentity,
  requireScheduleReference,
  requireWholeSecondActivation,
} from "./definition-schedule-values.js";
import {
  DefinitionScheduleConflictError,
  DefinitionScheduleHostPhase,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleNotFoundError,
  DefinitionScheduleState,
  DefinitionScheduleValidationError,
} from "./definition-schedule-contracts.js";
import type {
  DefinitionSchedule,
  DefinitionScheduleHostRequest,
  DefinitionScheduleHostResult,
  DefinitionScheduleRecord,
  DefinitionScheduleReference,
  DefinitionScheduleServiceDependencies,
  NewDefinitionScheduleRecord,
  PutDefinitionSchedule,
  PutDefinitionScheduleResult,
} from "./definition-schedule-contracts.js";

type LoadedDefinition = Readonly<{
  definition: DefinitionMetadata;
  bytes: Uint8Array;
}>;

/** Coordinates durable definition schedules without exposing host identities. */
export class DefinitionScheduleService {
  readonly #dependencies: DefinitionScheduleServiceDependencies;

  constructor(dependencies: DefinitionScheduleServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async put(request: PutDefinitionSchedule): Promise<PutDefinitionScheduleResult> {
    const reference = cloneScheduleReference(request);
    requireScheduleReference(reference);
    const activationAt = requireWholeSecondActivation(request.activationAt);
    const previous = this.#dependencies.schedules.get(reference);
    if (previous !== null && previous.activationAt !== activationAt) {
      throw new DefinitionScheduleConflictError(
        "schedule identity is already bound to another activation",
      );
    }
    if (previous === null && Date.parse(activationAt) <= this.#dependencies.now()) {
      throw new DefinitionScheduleValidationError(
        "activationAt must be in the future",
      );
    }

    const loaded = await this.#loadDefinition(reference);
    const timerStart = await this.#validateDefinition(loaded);
    const dueAt = deriveScheduleDueAt(activationAt, timerStart.durationMs);
    const current = this.#dependencies.schedules.get(reference);
    if (previous !== null && current === null) {
      throw new DefinitionScheduleIntegrityError(
        "reserved schedule disappeared during definition validation",
      );
    }
    if (current !== null) {
      requireSameScheduleIntent(current, loaded.definition, timerStart, activationAt, dueAt);
    } else if (Date.parse(activationAt) <= this.#dependencies.now()) {
      throw new DefinitionScheduleValidationError(
        "activationAt must still be in the future after definition validation",
      );
    }
    const reservation = current === null
      ? this.#reserve(reference, loaded.definition, timerStart, activationAt, dueAt)
      : { inserted: false, record: current };
    requireSameScheduleIntent(
      reservation.record,
      loaded.definition,
      timerStart,
      activationAt,
      dueAt,
    );
    const record = await this.#reconcile(reservation.record, loaded.bytes);
    return {
      created: reservation.inserted && record.state !== DefinitionScheduleState.Cancelled,
      schedule: projectDefinitionSchedule(record),
    };
  }

  async get(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionSchedule | null> {
    const selected = cloneScheduleReference(reference);
    requireScheduleReference(selected);
    const record = this.#dependencies.schedules.get(selected);
    return record === null
      ? null
      : projectDefinitionSchedule(await this.#reconcile(record));
  }

  async list(
    reference: DefinitionReference,
  ): Promise<ReadonlyArray<DefinitionSchedule>> {
    const selected = cloneDefinitionReference(reference);
    requireDefinitionReference(selected);
    const schedules = this.#dependencies.schedules.listForDefinition(selected);
    const result: DefinitionSchedule[] = [];
    for (const record of schedules) {
      result.push(projectDefinitionSchedule(await this.#reconcile(record)));
    }
    return result;
  }

  async delete(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionSchedule | null> {
    const selected = cloneScheduleReference(reference);
    requireScheduleReference(selected);
    const requested = this.#dependencies.schedules.requestCancellation(selected);
    if (requested === null) {
      return null;
    }
    const record = await this.#reconcile(requested);
    switch (record.state) {
      case DefinitionScheduleState.Cancelled:
        return projectDefinitionSchedule(record);
      case DefinitionScheduleState.Started:
      case DefinitionScheduleState.Missed:
        throw new DefinitionScheduleConflictError(
          `schedule action already reached ${record.state}`,
        );
      default:
        throw new DefinitionScheduleIntegrityError(
          `cancellation reconciliation stopped in ${record.state}`,
        );
    }
  }

  async reconcileAll(): Promise<void> {
    for (const candidate of this.#dependencies.schedules.listForReconciliation()) {
      const current = this.#dependencies.schedules.get(candidate.reference);
      if (current !== null) {
        await this.#reconcile(current);
      }
    }
  }

  #reserve(
    reference: DefinitionScheduleReference,
    definition: DefinitionMetadata,
    timerStart: DefinitionTimerStartCapability,
    activationAt: string,
    dueAt: string,
  ) {
    const processInstanceId = this.#dependencies.identities.processInstanceId();
    const hostScheduleId = this.#dependencies.identities.hostScheduleId(reference);
    const configuredWorkflowIdBase =
      this.#dependencies.identities.configuredWorkflowIdBase(processInstanceId);
    requireScheduleIdentity(processInstanceId, "processInstanceId");
    requireScheduleIdentity(hostScheduleId, "hostScheduleId");
    requireScheduleIdentity(configuredWorkflowIdBase, "configuredWorkflowIdBase");
    const record: NewDefinitionScheduleRecord = {
      reference,
      definition: cloneDefinitionMetadata(definition),
      timerStart: { ...timerStart },
      activationAt,
      dueAt,
      identity: {
        processInstanceId,
        hostScheduleId,
        configuredWorkflowIdBase,
      },
    };
    return this.#dependencies.schedules.reserve(record);
  }

  async #loadDefinition(reference: DefinitionReference): Promise<LoadedDefinition> {
    const stored = this.#dependencies.definitions.get(reference);
    if (stored === null) {
      throw new DefinitionScheduleNotFoundError(reference);
    }
    const definition = cloneDefinitionMetadata(stored);
    if (
      definition.processId !== reference.processId ||
      definition.version !== reference.version
    ) {
      throw new DefinitionScheduleIntegrityError(
        "definition repository did not preserve the exact version binding",
      );
    }
    const artifact = await this.#dependencies.artifacts.get(definition.source.sha256);
    if (artifact === null) {
      throw new DefinitionArtifactIntegrityError(
        reference,
        definition.source.sha256,
      );
    }
    const bytes = Uint8Array.from(artifact);
    if (bytes.byteLength !== definition.source.byteLength) {
      throw new DefinitionArtifactIntegrityError(
        reference,
        definition.source.sha256,
        { expected: definition.source.byteLength, actual: bytes.byteLength },
      );
    }
    return { definition, bytes };
  }

  async #validateDefinition(
    loaded: LoadedDefinition,
  ): Promise<DefinitionTimerStartCapability> {
    const result = await this.#dependencies.host.validateDefinition({
      bytes: Uint8Array.from(loaded.bytes),
      sourceId: loaded.definition.source.id,
      expectedSha256: loaded.definition.source.sha256,
      semanticProfile: loaded.definition.semanticProfile,
      expectedProcessId: loaded.definition.processId,
    });
    if (result.status === "rejected") {
      throw new DefinitionScheduleIntegrityError(result.evidence);
    }
    const compiledCapabilities = cloneDefinitionStartCapabilities(
      result.startCapabilities,
    );
    if (
      !equalDefinitionSource(result.source, loaded.definition.source) ||
      result.processId !== loaded.definition.processId ||
      result.semanticProfile !== loaded.definition.semanticProfile ||
      !equalDefinitionStartCapabilities(
        compiledCapabilities,
        loaded.definition.startCapabilities,
      )
    ) {
      throw new DefinitionScheduleIntegrityError(
        "compiled definition does not match its exact stored metadata",
      );
    }
    if (compiledCapabilities.timerStarts.length !== 1) {
      throw new DefinitionScheduleValidationError(
        "definition must publish exactly one Timer Start capability",
      );
    }
    const timerStart = compiledCapabilities.timerStarts[0];
    if (timerStart === undefined) {
      throw new DefinitionScheduleIntegrityError("Timer Start capability disappeared");
    }
    return { ...timerStart };
  }

  async #reconcile(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleRecord> {
    switch (record.state) {
      case DefinitionScheduleState.Creating: {
        const dispatched = this.#dependencies.schedules.compareAndSet(
          record.reference,
          DefinitionScheduleState.Creating,
          { state: DefinitionScheduleState.CreatingHost },
        );
        if (dispatched !== null) {
          return await this.#reconcile(dispatched, knownBytes);
        }
        return await this.#reconcileCurrent(record.reference);
      }
      case DefinitionScheduleState.CreatingHost:
        return await this.#reconcileCreatingHost(record, knownBytes);
      case DefinitionScheduleState.Scheduled:
        return await this.#reconcileScheduled(record, knownBytes);
      case DefinitionScheduleState.Cancelling:
        return await this.#reconcileCancelling(record, knownBytes);
      case DefinitionScheduleState.Started:
      case DefinitionScheduleState.Missed:
      case DefinitionScheduleState.Cancelled:
        return await this.#cleanup(record, knownBytes);
      default:
        return assertNever(record.state);
    }
  }

  async #reconcileCreatingHost(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleRecord> {
    const input = await this.#hostInput(record, knownBytes);
    const result = await this.#dependencies.host.createOrCompare(input);
    const current = this.#requireCurrent(record.reference);
    return await this.#applyHostResult(current, result, input, false);
  }

  async #reconcileScheduled(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleRecord> {
    const input = await this.#hostInput(record, knownBytes);
    const result = await this.#dependencies.host.inspect(input);
    return await this.#applyHostResult(
      this.#requireCurrent(record.reference),
      result,
      input,
      false,
    );
  }

  async #reconcileCancelling(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleRecord> {
    const input = await this.#hostInput(record, knownBytes);
    if (record.cancellationOrigin === DefinitionScheduleState.CreatingHost) {
      const created = await this.#dependencies.host.createOrCompare(input);
      if (created.phase !== DefinitionScheduleHostPhase.Pending) {
        return await this.#applyHostResult(
          this.#requireCurrent(record.reference),
          created,
          input,
          false,
        );
      }
      if (created.paused) {
        throw new DefinitionScheduleIntegrityError(
          "create-or-compare unexpectedly returned a paused pending Schedule",
        );
      }
    } else if (record.cancellationOrigin !== DefinitionScheduleState.Scheduled) {
      throw new DefinitionScheduleIntegrityError(
        "cancelling schedule has no legal cancellation origin",
      );
    }
    const inspected = await this.#dependencies.host.pause(input);
    return await this.#applyHostResult(
      this.#requireCurrent(record.reference),
      inspected,
      input,
      true,
    );
  }

  async #applyHostResult(
    record: DefinitionScheduleRecord,
    result: DefinitionScheduleHostResult,
    input: DefinitionScheduleHostRequest,
    paused: boolean,
  ): Promise<DefinitionScheduleRecord> {
    switch (result.phase) {
      case DefinitionScheduleHostPhase.IntegrityFailure:
        throw new DefinitionScheduleIntegrityError(result.evidence);
      case DefinitionScheduleHostPhase.Pending:
        if (result.paused !== paused) {
          throw new DefinitionScheduleIntegrityError(
            paused
              ? "pause-confirmed host result did not remain paused"
              : "ordinary host result was unexpectedly paused",
          );
        }
        if (paused) {
          return await this.#transitionTerminal(
            record,
            DefinitionScheduleState.Cancelled,
            input,
          );
        }
        if (record.state === DefinitionScheduleState.Cancelling) {
          return await this.#reconcileCancelling(record, input.bytes);
        }
        if (record.state === DefinitionScheduleState.CreatingHost) {
          const scheduled = this.#dependencies.schedules.compareAndSet(
            record.reference,
            DefinitionScheduleState.CreatingHost,
            { state: DefinitionScheduleState.Scheduled },
          );
          return scheduled ?? await this.#reconcileCurrent(record.reference);
        }
        if (record.state === DefinitionScheduleState.Scheduled) {
          return record;
        }
        throw new DefinitionScheduleIntegrityError(
          `pending host result is invalid from ${record.state}`,
        );
      case DefinitionScheduleHostPhase.Started:
        requireScheduleIdentity(result.executionWorkflowId, "executionWorkflowId");
        requireScheduleIdentity(result.firstRunId, "firstRunId");
        return await this.#transitionTerminal(
          record,
          DefinitionScheduleState.Started,
          input,
          result.executionWorkflowId,
          result.firstRunId,
        );
      case DefinitionScheduleHostPhase.Missed:
        return await this.#transitionTerminal(
          record,
          DefinitionScheduleState.Missed,
          input,
        );
      default:
        return assertNever(result);
    }
  }

  async #transitionTerminal(
    record: DefinitionScheduleRecord,
    state: typeof DefinitionScheduleState.Started |
      typeof DefinitionScheduleState.Missed |
      typeof DefinitionScheduleState.Cancelled,
    input: DefinitionScheduleHostRequest,
    executionWorkflowId: string | null = null,
    firstRunId: string | null = null,
  ): Promise<DefinitionScheduleRecord> {
    if (
      record.state !== DefinitionScheduleState.CreatingHost &&
      record.state !== DefinitionScheduleState.Scheduled &&
      record.state !== DefinitionScheduleState.Cancelling
    ) {
      if (record.state === state) {
        return await this.#cleanup(record, input.bytes);
      }
      throw new DefinitionScheduleIntegrityError(
        `cannot persist ${state} from ${record.state}`,
      );
    }
    const terminal = this.#dependencies.schedules.compareAndSet(
      record.reference,
      record.state,
      { state, executionWorkflowId, firstRunId },
    );
    if (terminal === null) {
      return await this.#reconcileCurrent(record.reference);
    }
    return await this.#cleanup(terminal, input.bytes);
  }

  async #cleanup(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleRecord> {
    if (record.cleanupComplete) {
      return record;
    }
    if (
      record.state !== DefinitionScheduleState.Started &&
      record.state !== DefinitionScheduleState.Missed &&
      record.state !== DefinitionScheduleState.Cancelled
    ) {
      return record;
    }
    const input = await this.#hostInput(record, knownBytes);
    await this.#dependencies.host.delete(input);
    return this.#dependencies.schedules.markCleanupComplete(
      record.reference,
      record.state,
    ) ?? this.#requireCurrent(record.reference);
  }

  async #hostInput(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleHostRequest> {
    const bytes = knownBytes === undefined
      ? await this.#loadRecordBytes(record)
      : Uint8Array.from(knownBytes);
    return {
      bytes,
      definition: cloneDefinitionMetadata(record.definition),
      timerStart: { ...record.timerStart },
      activationAt: record.activationAt,
      dueAt: record.dueAt,
      processInstanceId: record.identity.processInstanceId,
      hostScheduleId: record.identity.hostScheduleId,
      configuredWorkflowIdBase: record.identity.configuredWorkflowIdBase,
    };
  }

  async #loadRecordBytes(record: DefinitionScheduleRecord): Promise<Uint8Array> {
    const artifact = await this.#dependencies.artifacts.get(
      record.definition.source.sha256,
    );
    if (artifact === null) {
      throw new DefinitionArtifactIntegrityError(
        record.reference,
        record.definition.source.sha256,
      );
    }
    const bytes = Uint8Array.from(artifact);
    if (bytes.byteLength !== record.definition.source.byteLength) {
      throw new DefinitionArtifactIntegrityError(
        record.reference,
        record.definition.source.sha256,
        {
          expected: record.definition.source.byteLength,
          actual: bytes.byteLength,
        },
      );
    }
    return bytes;
  }

  async #reconcileCurrent(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionScheduleRecord> {
    return await this.#reconcile(this.#requireCurrent(reference));
  }

  #requireCurrent(reference: DefinitionScheduleReference): DefinitionScheduleRecord {
    const current = this.#dependencies.schedules.get(reference);
    if (current === null) {
      throw new DefinitionScheduleIntegrityError(
        "schedule disappeared during lifecycle reconciliation",
      );
    }
    return current;
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported definition schedule variant: ${String(value)}`);
}

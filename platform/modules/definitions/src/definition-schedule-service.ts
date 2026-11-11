import { readRetainedDefinitionArtifacts } from "./definition-artifacts.js";
import type { RetainedDefinitionArtifacts } from "./definition-artifacts.js";
import type {
  DefinitionMetadata,
  DefinitionReference,
  DefinitionScheduledTimerStart,
} from "./contracts.js";
import {
  cloneDefinitionStartCapabilities,
  equalDefinitionStartCapabilities,
} from "./definition-capabilities.js";
import {
  cloneDefinitionMetadata,
  equalDefinitionSource,
  equalSourceOverlayIdentity,
} from "./definition-values.js";
import {
  cloneDefinitionReference,
  cloneScheduleReference,
  projectDefinitionSchedule,
  requireCanonicalDueAt,
  requireDefinitionReference,
  requireSameScheduleIntent,
  requireScheduleIdentity,
  requireScheduleReference,
} from "./definition-schedule-values.js";
import {
  DefinitionScheduleConflictError,
  DefinitionScheduleHostPhase,
  DefinitionScheduleIntegrityError,
  DefinitionScheduleNotFoundError,
  DefinitionScheduleState,
  DefinitionScheduleValidationError,
} from "./definition-schedule-contracts.js";
import { toPublicDefinition } from "./definition-public-values.js";
import type {
  DefinitionSchedule,
  DefinitionScheduleHostRequest,
  DefinitionScheduleHostResult,
  DefinitionScheduleOccurrences,
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
  sourceOverlay: RetainedDefinitionArtifacts["sourceOverlay"];
}>;

/** Coordinates durable definition schedules without exposing host identities. */
export class DefinitionScheduleService {
  readonly #dependencies: DefinitionScheduleServiceDependencies;

  constructor(dependencies: DefinitionScheduleServiceDependencies) {
    this.#dependencies = dependencies;
  }

  /**
   * Binds the schedule identity to one occurrence of the version's Timer start, named by its due instant, which must
   * be in the future and one the engine lists; the instance it starts takes the engine's identity.
   */
  async put(request: PutDefinitionSchedule): Promise<PutDefinitionScheduleResult> {
    const reference = cloneScheduleReference(request);
    requireScheduleReference(reference);
    const dueAt = requireCanonicalDueAt(request.dueAt);
    const previous = await this.#dependencies.schedules.get(reference);
    if (previous !== null && previous.dueAt !== dueAt) {
      throw new DefinitionScheduleConflictError(
        "schedule identity is already bound to another occurrence",
      );
    }
    if (previous === null && Date.parse(dueAt) <= this.#dependencies.now()) {
      throw new DefinitionScheduleValidationError("dueAt must be in the future");
    }

    const loaded = await this.#loadDefinition(reference);
    const timerStart = await this.#validateDefinition(loaded);
    const current = await this.#dependencies.schedules.get(reference);
    if (previous !== null && current === null) {
      throw new DefinitionScheduleIntegrityError(
        "reserved schedule disappeared during definition validation",
      );
    }
    if (current !== null) {
      requireSameScheduleIntent(current, loaded.definition, timerStart, dueAt);
    } else if (Date.parse(dueAt) <= this.#dependencies.now()) {
      throw new DefinitionScheduleValidationError(
        "dueAt must still be in the future after definition validation",
      );
    }
    const reservation = current === null
      ? await this.#reserve(reference, loaded, timerStart, dueAt)
      : { inserted: false, record: current };
    requireSameScheduleIntent(reservation.record, loaded.definition, timerStart, dueAt);
    const record = await this.#reconcile(reservation.record, loaded.bytes);
    return {
      created: reservation.inserted && record.state !== DefinitionScheduleState.Cancelled,
      schedule: projectDefinitionSchedule(record),
    };
  }

  /**
   * The engine's occurrences of the version's Timer start due at or after `from` (now when `null`), at most `limit`
   * of them; the version must publish exactly one Timer start.
   */
  async occurrences(
    reference: DefinitionReference,
    from: string | null,
    limit: number,
  ): Promise<DefinitionScheduleOccurrences> {
    const selected = cloneDefinitionReference(reference);
    requireDefinitionReference(selected);
    const first = from === null ? new Date(this.#dependencies.now()).toISOString() : requireCanonicalDueAt(from);
    const loaded = await this.#loadDefinition(selected);
    const timerStart = await this.#validateDefinition(loaded);
    const occurrences = await this.#occurrences(loaded, timerStart, first, limit);
    return {
      definition: cloneDefinitionMetadata(loaded.definition),
      timerStart: { ...timerStart },
      occurrences: occurrences.map((occurrence) => ({ dueAt: occurrence.dueAt })),
    };
  }

  async get(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionSchedule | null> {
    const selected = cloneScheduleReference(reference);
    requireScheduleReference(selected);
    const record = await this.#dependencies.schedules.get(selected);
    return record === null
      ? null
      : projectDefinitionSchedule(await this.#reconcile(record));
  }

  async list(
    reference: DefinitionReference,
  ): Promise<ReadonlyArray<DefinitionSchedule>> {
    const selected = cloneDefinitionReference(reference);
    requireDefinitionReference(selected);
    const schedules = await this.#dependencies.schedules.listForDefinition(selected);
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
    const requested = await this.#dependencies.schedules.requestCancellation(selected);
    if (requested === null) {
      return null;
    }
    const record = await this.#reconcile(requested);
    switch (record.state) {
      case DefinitionScheduleState.Cancelled:
        return projectDefinitionSchedule(record);
      case DefinitionScheduleState.Started:
      case DefinitionScheduleState.Refused:
      case DefinitionScheduleState.Missed:
        throw new DefinitionScheduleConflictError(
          `schedule action already reached ${record.state}`,
        );
      case DefinitionScheduleState.Cancelling:
        // Only a firing the engine has not answered yet leaves cancellation undecided; the action won the race.
        throw new DefinitionScheduleConflictError("schedule action already fired");
      default:
        throw new DefinitionScheduleIntegrityError(
          `cancellation reconciliation stopped in ${record.state}`,
        );
    }
  }

  async reconcileAll(): Promise<void> {
    for (const candidate of await this.#dependencies.schedules.listForReconciliation()) {
      await this.reconcileSchedule(candidate.reference);
    }
  }

  /** Re-reads one exact Schedule identity before performing any host work. */
  async reconcileSchedule(reference: DefinitionScheduleReference): Promise<void> {
    const selected = cloneScheduleReference(reference);
    requireScheduleReference(selected);
    const current = await this.#dependencies.schedules.get(selected);
    if (
      current !== null &&
      !(
        current.state === DefinitionScheduleState.Started &&
        current.cleanupComplete &&
        await this.#dependencies.confirmedInstances.isConfirmed(
          current.identity.processInstanceId,
        )
      )
    ) {
      await this.#reconcile(current);
    }
  }

  /** Reserves the schedule under the engine's identity of the instance the occurrence `dueAt` starts. */
  async #reserve(
    reference: DefinitionScheduleReference,
    loaded: LoadedDefinition,
    timerStart: DefinitionScheduledTimerStart,
    dueAt: string,
  ) {
    const [occurrence] = await this.#occurrences(loaded, timerStart, dueAt, 1);
    if (occurrence?.dueAt !== dueAt) {
      throw new DefinitionScheduleValidationError(
        "dueAt is no occurrence of the definition's Timer Start (timer-occurrence-unknown)",
      );
    }
    const processInstanceId = occurrence.processInstanceId;
    const hostScheduleId = this.#dependencies.identities.hostScheduleId(reference);
    requireScheduleIdentity(processInstanceId, "processInstanceId");
    requireScheduleIdentity(hostScheduleId, "hostScheduleId");
    const record: NewDefinitionScheduleRecord = {
      reference,
      definition: cloneDefinitionMetadata(loaded.definition),
      timerStart: { ...timerStart },
      dueAt,
      identity: { processInstanceId, hostScheduleId },
    };
    return await this.#dependencies.schedules.reserve(record);
  }

  async #occurrences(
    loaded: LoadedDefinition,
    timerStart: DefinitionScheduledTimerStart,
    from: string,
    limit: number,
  ): Promise<ReadonlyArray<Readonly<{ dueAt: string; processInstanceId: string }>>> {
    const result = await this.#dependencies.host.occurrences({
      bytes: Uint8Array.from(loaded.bytes),
      sourceOverlay: loaded.sourceOverlay,
      definition: cloneDefinitionMetadata(loaded.definition),
      timerStart: { ...timerStart },
      from,
      limit,
    });
    switch (result.kind) {
      case "listed":
        return result.occurrences;
      case "refused":
        throw new DefinitionScheduleValidationError(
          `the engine refused the definition version's Timer Start (${result.code})`,
        );
      case "integrityFailure":
        throw new DefinitionScheduleIntegrityError(result.evidence);
      default:
        return assertNever(result);
    }
  }

  async #loadDefinition(reference: DefinitionReference): Promise<LoadedDefinition> {
    const stored = await this.#dependencies.definitions.get(reference);
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
    const retained = await readRetainedDefinitionArtifacts(this.#dependencies.artifacts, definition);
    return { definition, ...retained };
  }

  async #validateDefinition(
    loaded: LoadedDefinition,
  ): Promise<DefinitionScheduledTimerStart> {
    const result = await this.#dependencies.host.validateDefinition({
      bytes: Uint8Array.from(loaded.bytes),
      sourceOverlay: loaded.sourceOverlay,
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
      !equalSourceOverlayIdentity(result.sourceOverlay, loaded.definition.sourceOverlay) ||
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
    return { startEventId: timerStart.startEventId, durationMs: timerStart.durationMs };
  }

  async #reconcile(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleRecord> {
    const reconciled = await this.#reconcileLifecycle(record, knownBytes);
    if (reconciled.state === DefinitionScheduleState.Started) {
      if (reconciled.processLocator === null) {
        throw new DefinitionScheduleIntegrityError(
          "started Schedule has no opaque Process locator",
        );
      }
      await this.#dependencies.confirmedInstances.publishConfirmed({
        instance: {
          processInstanceId: reconciled.identity.processInstanceId,
          definition: toPublicDefinition(reconciled.definition),
        },
        locator: reconciled.processLocator,
      });
    }
    return reconciled;
  }

  async #reconcileLifecycle(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleRecord> {
    switch (record.state) {
      case DefinitionScheduleState.Creating: {
        const dispatched = await this.#dependencies.schedules.compareAndSet(
          record.reference,
          DefinitionScheduleState.Creating,
          { state: DefinitionScheduleState.CreatingHost },
        );
        if (dispatched !== null) {
          return await this.#reconcileLifecycle(dispatched, knownBytes);
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
      case DefinitionScheduleState.Refused:
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
    const current = await this.#requireCurrent(record.reference);
    return await this.#applyHostResult(current, result, input, false);
  }

  async #reconcileScheduled(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleRecord> {
    const input = await this.#hostInput(record, knownBytes);
    const result = await this.#dependencies.host.inspect(input);
    return await this.#applyHostResult(
      await this.#requireCurrent(record.reference),
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
          await this.#requireCurrent(record.reference),
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
      await this.#requireCurrent(record.reference),
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
          const scheduled = await this.#dependencies.schedules.compareAndSet(
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
      case DefinitionScheduleHostPhase.Firing:
        if (result.paused !== paused) {
          throw new DefinitionScheduleIntegrityError(
            "firing host result did not keep the expected paused state",
          );
        }
        // The action won any cancellation; the row keeps its state until the engine answers the firing.
        if (record.state === DefinitionScheduleState.CreatingHost) {
          const scheduled = await this.#dependencies.schedules.compareAndSet(
            record.reference,
            DefinitionScheduleState.CreatingHost,
            { state: DefinitionScheduleState.Scheduled },
          );
          return scheduled ?? await this.#reconcileCurrent(record.reference);
        }
        if (
          record.state === DefinitionScheduleState.Scheduled ||
          record.state === DefinitionScheduleState.Cancelling
        ) {
          return record;
        }
        throw new DefinitionScheduleIntegrityError(
          `firing host result is invalid from ${record.state}`,
        );
      case DefinitionScheduleHostPhase.Started:
        requireScheduleIdentity(result.processLocator, "processLocator");
        if (result.processInstanceId !== record.identity.processInstanceId) {
          throw new DefinitionScheduleIntegrityError(
            "the engine started another instance identity than the occurrence names",
          );
        }
        return await this.#transitionTerminal(
          record,
          DefinitionScheduleState.Started,
          input,
          { processLocator: result.processLocator },
        );
      case DefinitionScheduleHostPhase.Refused:
        requireScheduleIdentity(result.code, "refusal code");
        return await this.#transitionTerminal(
          record,
          DefinitionScheduleState.Refused,
          input,
          { refusalCode: result.code },
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
      typeof DefinitionScheduleState.Refused |
      typeof DefinitionScheduleState.Missed |
      typeof DefinitionScheduleState.Cancelled,
    input: DefinitionScheduleHostRequest,
    outcome: Readonly<{ processLocator?: string; refusalCode?: string }> = {},
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
    const terminal = await this.#dependencies.schedules.compareAndSet(
      record.reference,
      record.state,
      { state, processLocator: outcome.processLocator ?? null, refusalCode: outcome.refusalCode ?? null },
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
      record.state !== DefinitionScheduleState.Refused &&
      record.state !== DefinitionScheduleState.Missed &&
      record.state !== DefinitionScheduleState.Cancelled
    ) {
      return record;
    }
    const input = await this.#hostInput(record, knownBytes);
    await this.#dependencies.host.delete(input);
    return (await this.#dependencies.schedules.markCleanupComplete(
      record.reference,
      record.state,
    )) ?? await this.#requireCurrent(record.reference);
  }

  async #hostInput(
    record: DefinitionScheduleRecord,
    knownBytes?: Uint8Array,
  ): Promise<DefinitionScheduleHostRequest> {
    const retained = knownBytes === undefined || record.definition.sourceOverlay !== null
      ? await readRetainedDefinitionArtifacts(this.#dependencies.artifacts, record.definition)
      : { bytes: Uint8Array.from(knownBytes), sourceOverlay: null };
    return {
      ...retained,
      definition: cloneDefinitionMetadata(record.definition),
      timerStart: { ...record.timerStart },
      dueAt: record.dueAt,
      processInstanceId: record.identity.processInstanceId,
      hostScheduleId: record.identity.hostScheduleId,
    };
  }

  async #reconcileCurrent(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionScheduleRecord> {
    return await this.#reconcileLifecycle(await this.#requireCurrent(reference));
  }

  async #requireCurrent(
    reference: DefinitionScheduleReference,
  ): Promise<DefinitionScheduleRecord> {
    const current = await this.#dependencies.schedules.get(reference);
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

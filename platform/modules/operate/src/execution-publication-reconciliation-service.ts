import {
  ExecutionPublicationResultKind,
  decodeExecutionPublicationResult,
} from "@bpmn-lean/platform-contracts";
import type {
  ExecutionPublicationPage,
} from "@bpmn-lean/platform-contracts";

import type { ProcessInstanceRepository } from "./contracts.js";
import {
  ExecutionPublicationIntegrityError,
  ExecutionPublicationProjectionStatus,
  ExecutionPublicationStoredValueError,
} from "./execution-publication-contracts.js";
import type {
  ExecutionPublicationGateway,
  ExecutionPublicationProjectionImage,
  ExecutionPublicationRepository,
} from "./execution-publication-contracts.js";
import { projectionIdentityFromRegistration } from "./execution-publication-projection.js";
import type { OperateProcessRegistration } from "./incident-contracts.js";

export enum ExecutionPublicationReconciliationKind {
  Available = "available",
  NotFound = "notFound",
  Unavailable = "unavailable",
  Gap = "gap",
}

export type ExecutionPublicationReconciliationResult =
  | Readonly<{
      kind: ExecutionPublicationReconciliationKind.Available;
      projection: ExecutionPublicationProjectionImage;
    }>
  | Readonly<{
      kind:
        | ExecutionPublicationReconciliationKind.NotFound
        | ExecutionPublicationReconciliationKind.Unavailable
        | ExecutionPublicationReconciliationKind.Gap;
    }>;

export type ExecutionPublicationReconciliationServiceOptions = Readonly<{
  registrations: Pick<ProcessInstanceRepository, "getRegistration">;
  publications: ExecutionPublicationRepository;
  gateway: ExecutionPublicationGateway;
  /** How many head pages without a committed state are read before the projection is classified unavailable. */
  currentReadAttempts?: number;
  maxPagesPerReconciliation?: number;
  beforeCurrentReread?: (attempt: number) => Promise<void>;
}>;

/**
 * Pulls only the authoritative cursor suffix and classifies every incomplete result.
 *
 * A head page whose `current` is null means the engine's head moved while it read the state, so the head is re-read
 * a bounded number of times. Exhausting the bound classifies the projection `unavailable`, not `gap`: every retained
 * batch is still a verified prefix and nothing was lost or contradicted, only the state at a moving head could not be
 * confirmed yet, which is the transient condition a later reconciliation resolves without a rebuild. An engine
 * `integrityFailure` (the instance's chain runs another definition or instance) is classified `gap`, like a local
 * integrity failure: the retained prefix cannot be continued from that producer.
 */
export class ExecutionPublicationReconciliationService {
  readonly #options: Required<
    Omit<ExecutionPublicationReconciliationServiceOptions, "beforeCurrentReread">
  > & Pick<ExecutionPublicationReconciliationServiceOptions, "beforeCurrentReread">;

  constructor(options: ExecutionPublicationReconciliationServiceOptions) {
    this.#options = {
      ...options,
      currentReadAttempts: options.currentReadAttempts ?? 3,
      maxPagesPerReconciliation: options.maxPagesPerReconciliation ?? 100,
    };
    requirePositive(this.#options.currentReadAttempts, "currentReadAttempts");
    requirePositive(
      this.#options.maxPagesPerReconciliation,
      "maxPagesPerReconciliation",
    );
  }

  async reconcile(
    processInstanceId: string,
  ): Promise<ExecutionPublicationReconciliationResult> {
    const registration = await this.#options.registrations.getRegistration(processInstanceId);
    if (registration === null) {
      return { kind: ExecutionPublicationReconciliationKind.NotFound };
    }
    let currentReads = 0;
    let pageCount = 0;
    while (pageCount < this.#options.maxPagesPerReconciliation) {
      const prior = await this.#options.publications.get(processInstanceId);
      const afterRevision = prior?.headRevision ?? 0;
      const observed = await this.#observe(registration, afterRevision);
      if (observed.kind === ExecutionPublicationReconciliationKind.Unavailable) {
        await this.#mark(registration, ExecutionPublicationProjectionStatus.Unavailable);
        return observed;
      }
      let result;
      try {
        const identity = projectionIdentityFromRegistration(registration);
        result = decodeExecutionPublicationResult(observed.value, {
          ...identity,
          afterRevision,
          limit: 100,
        });
      } catch (error: unknown) {
        await this.#mark(registration, ExecutionPublicationProjectionStatus.Gap);
        return { kind: ExecutionPublicationReconciliationKind.Gap };
      }
      switch (result.kind) {
        case ExecutionPublicationResultKind.Available: {
          let projection: ExecutionPublicationProjectionImage;
          try {
            projection = await this.#options.publications.applyPage(
              registration,
              result.page,
            );
          } catch (error: unknown) {
            if (
              error instanceof ExecutionPublicationIntegrityError ||
              error instanceof ExecutionPublicationStoredValueError ||
              error instanceof TypeError ||
              error instanceof RangeError
            ) {
              await this.#mark(registration, ExecutionPublicationProjectionStatus.Gap);
              return { kind: ExecutionPublicationReconciliationKind.Gap };
            }
            throw error;
          }
          if (projection.headRevision !== projection.producerHeadRevision) {
            pageCount += 1;
            break;
          }
          if (projection.current !== null) {
            return {
              kind: ExecutionPublicationReconciliationKind.Available,
              projection,
            };
          }
          currentReads += 1;
          if (currentReads >= this.#options.currentReadAttempts) {
            await this.#mark(registration, ExecutionPublicationProjectionStatus.Unavailable);
            return { kind: ExecutionPublicationReconciliationKind.Unavailable };
          }
          await this.#options.beforeCurrentReread?.(currentReads);
          break;
        }
        case ExecutionPublicationResultKind.NotFound:
        case ExecutionPublicationResultKind.Unavailable:
          await this.#mark(registration, ExecutionPublicationProjectionStatus.Unavailable);
          return { kind: ExecutionPublicationReconciliationKind.Unavailable };
        case ExecutionPublicationResultKind.Gap:
        case ExecutionPublicationResultKind.IntegrityFailure:
          await this.#mark(registration, ExecutionPublicationProjectionStatus.Gap);
          return { kind: ExecutionPublicationReconciliationKind.Gap };
      }
    }
    await this.#mark(registration, ExecutionPublicationProjectionStatus.Unavailable);
    return { kind: ExecutionPublicationReconciliationKind.Unavailable };
  }

  async rebuild(
    processInstanceId: string,
  ): Promise<ExecutionPublicationReconciliationResult> {
    const registration = await this.#options.registrations.getRegistration(processInstanceId);
    if (registration === null) {
      return { kind: ExecutionPublicationReconciliationKind.NotFound };
    }
    const pages: ExecutionPublicationPage[] = [];
    let afterRevision = 0;
    let currentReads = 0;
    while (pages.length < this.#options.maxPagesPerReconciliation) {
      const observed = await this.#observe(registration, afterRevision);
      if (observed.kind === ExecutionPublicationReconciliationKind.Unavailable) {
        await this.#mark(registration, ExecutionPublicationProjectionStatus.Unavailable);
        return observed;
      }
      let result;
      try {
        const identity = projectionIdentityFromRegistration(registration);
        result = decodeExecutionPublicationResult(observed.value, {
          ...identity,
          afterRevision,
          limit: 100,
        });
      } catch {
        await this.#mark(registration, ExecutionPublicationProjectionStatus.Gap);
        return { kind: ExecutionPublicationReconciliationKind.Gap };
      }
      switch (result.kind) {
        case ExecutionPublicationResultKind.Available:
          pages.push(result.page);
          afterRevision = result.page.pageThroughRevision;
          if (result.page.pageThroughRevision !== result.page.headRevision) break;
          if (result.page.current === null) {
            currentReads += 1;
            if (currentReads >= this.#options.currentReadAttempts) {
              await this.#mark(registration, ExecutionPublicationProjectionStatus.Unavailable);
              return { kind: ExecutionPublicationReconciliationKind.Unavailable };
            }
            await this.#options.beforeCurrentReread?.(currentReads);
          } else {
            try {
              const projection = await this.#options.publications.replaceFromPages(
                registration,
                pages,
              );
              return {
                kind: ExecutionPublicationReconciliationKind.Available,
                projection,
              };
            } catch (error: unknown) {
              if (
                error instanceof ExecutionPublicationIntegrityError ||
                error instanceof TypeError ||
                error instanceof RangeError
              ) {
                await this.#mark(registration, ExecutionPublicationProjectionStatus.Gap);
                return { kind: ExecutionPublicationReconciliationKind.Gap };
              }
              throw error;
            }
          }
          break;
        case ExecutionPublicationResultKind.NotFound:
        case ExecutionPublicationResultKind.Unavailable:
          await this.#mark(registration, ExecutionPublicationProjectionStatus.Unavailable);
          return { kind: ExecutionPublicationReconciliationKind.Unavailable };
        case ExecutionPublicationResultKind.Gap:
        case ExecutionPublicationResultKind.IntegrityFailure:
          await this.#mark(registration, ExecutionPublicationProjectionStatus.Gap);
          return { kind: ExecutionPublicationReconciliationKind.Gap };
      }
    }
    await this.#mark(registration, ExecutionPublicationProjectionStatus.Unavailable);
    return { kind: ExecutionPublicationReconciliationKind.Unavailable };
  }

  async #observe(
    registration: OperateProcessRegistration,
    afterRevision: number,
  ): Promise<
    | Readonly<{ kind: "observed"; value: unknown }>
    | Readonly<{ kind: ExecutionPublicationReconciliationKind.Unavailable }>
  > {
    const identity = projectionIdentityFromRegistration(registration);
    try {
      return {
        kind: "observed",
        value: await this.#options.gateway.observe({
          locator: registration.locator,
          definition: identity.definition,
          processInstanceId: identity.processInstanceId,
          afterRevision,
          limit: 100,
        }),
      };
    } catch {
      return { kind: ExecutionPublicationReconciliationKind.Unavailable };
    }
  }

  async #mark(
    registration: OperateProcessRegistration,
    status:
      | ExecutionPublicationProjectionStatus.Gap
      | ExecutionPublicationProjectionStatus.Unavailable,
  ): Promise<void> {
    await this.#options.publications.mark(registration, status);
  }
}

function requirePositive(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

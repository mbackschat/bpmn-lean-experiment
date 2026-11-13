/**
 * Starts a process instance as one Workflow chain, submits its inputs as Updates, and reads its queries. Every call
 * addresses the Workflow ID, never a Run ID, so it reaches whichever Run of the chain is current.
 *
 * A refused Update comes back as the kernel's `rejected` outcome with the validator's code; an Update sent to a
 * chain that has ended is `rejected` too, since no instance is running to take it.
 */
import {
  ApplicationFailure,
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
  WorkflowUpdateFailedError,
  type Client,
  type WorkflowHandle,
} from "@temporalio/client";

import { readPages } from "./capacity.js";
import type { PublicationPage } from "./publication.js";
import type { JsonValue } from "./port.js";
import type { ProcessDescription, ProcessHost, StartRequest } from "./process-port.js";
import {
  ResultKind,
  RunKind,
  commandUpdate,
  deliverUpdate,
  effectResultUpdate,
  hostViewQuery,
  observationQuery,
  publicationQuery,
  rejectionType,
  settleUpdate,
  stateQuery,
  timerFireUpdate,
  workflowClosed,
  workflowType,
  type CommandResult,
  type HostSnapshot,
  type ProcessResult,
  type RunProcessArgs,
} from "./protocol.js";
import { assertNever } from "./host-machine.js";

export {
  ResultKind,
  Scheduling,
  workflowType,
  type CommandResult,
  type Halt,
  type HostConfig,
  type HostSnapshot,
  type ProcessResult,
  type RunProcessArgs,
} from "./protocol.js";
export { PageKind, type Batch, type ExecutionTransition, type OccurrenceTransition, type PublicationPage } from "./publication.js";
export type { HostView, JsonValue, OccurrenceId, Requirements, WaitView } from "./port.js";
export type { PopulationHost, ProcessDescription, ProcessHost, StartRequest } from "./process-port.js";
export { ScheduleClient } from "./schedule-client.js";
export { PopulationClient } from "./population-client.js";
export { PopulationRefused, type PopulationResult } from "./population-contract.js";
export { processInstanceWorkflowId, timerFiringWorkflowId } from "./population-address.js";

type ProcessWorkflow = (args: RunProcessArgs) => Promise<ProcessResult>;

/**
 * Submits `stimulus` as `update` to the chain `workflowId`. `updateId`, when given, makes a repeated submission the
 * same Update, answered with its first result within a Run.
 */
export async function submitUpdate(
  client: Client,
  workflowId: string,
  update: typeof commandUpdate,
  stimulus: JsonValue,
  updateId?: string,
): Promise<CommandResult> {
  try {
    return await client.workflow.getHandle<ProcessWorkflow>(workflowId)
      .executeUpdate(update, { args: [stimulus], ...(updateId === undefined ? {} : { updateId }) });
  } catch (error) {
    if (error instanceof WorkflowUpdateFailedError && error.cause instanceof ApplicationFailure &&
        error.cause.type === rejectionType) {
      return { outcome: "rejected", code: error.cause.message, revision: null };
    }
    if (error instanceof WorkflowNotFoundError) return { outcome: "rejected", code: workflowClosed, revision: null };
    throw error;
  }
}

export class ProcessClient implements ProcessHost {
  constructor(private readonly client: Client, private readonly taskQueue: string) {}

  /**
   * Starts the chain and reports the start's verdict. A Workflow ID is one instance for good: a second start under it
   * is `rejected`, whether the first chain still runs or has ended.
   */
  async start(request: StartRequest): Promise<CommandResult> {
    let handle: WorkflowHandle<ProcessWorkflow>;
    try {
      handle = await this.client.workflow.start<ProcessWorkflow>(workflowType, {
        taskQueue: this.taskQueue,
        workflowId: request.workflowId,
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [{
          kind: RunKind.Start,
          program: request.program,
          config: request.config,
          population: request.population ?? null,
          start: request.start,
        }],
        ...(request.memo === undefined ? {} : { memo: request.memo }),
      });
    } catch (error) {
      if (error instanceof WorkflowExecutionAlreadyStartedError) {
        return { outcome: "rejected", code: "workflow-already-started", revision: null };
      }
      throw error;
    }
    const snapshot = await this.hostView(request.workflowId);
    if (snapshot.view !== null && !snapshot.registering) return { outcome: "committed", code: null, revision: snapshot.revision };
    if (snapshot.view !== null) return { outcome: "committed", code: null, revision: await handle.executeUpdate(settleUpdate) };
    const result = await handle.result();
    switch (result.kind) {
      case ResultKind.NotStarted: return { outcome: result.outcome, code: result.code, revision: null };
      case ResultKind.Refused: return { outcome: "unsupported", code: result.code, revision: null };
      case ResultKind.Ended:
      case ResultKind.Halted:
        throw new Error(`Workflow ${request.workflowId} ended as ${result.kind} without a committed start`);
    }
    return assertNever(result);
  }

  command(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    return this.submit(workflowId, commandUpdate, stimulus);
  }

  deliver(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    return this.submit(workflowId, deliverUpdate, stimulus);
  }

  /** Accepted only by a chain started with `Scheduling.External`. */
  timerFire(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    return this.submit(workflowId, timerFireUpdate, stimulus);
  }

  /** Accepted only by a chain started with `Scheduling.External`. */
  effectResult(workflowId: string, stimulus: JsonValue): Promise<CommandResult> {
    return this.submit(workflowId, effectResultUpdate, stimulus);
  }

  async observation(workflowId: string): Promise<JsonValue> {
    const handle = this.handle(workflowId);
    return await readPages((from) => handle.query(observationQuery, from)) as JsonValue;
  }

  /** The chain's encoded kernel state (`stateQuery`); a closed Workflow still answers it. */
  async state(workflowId: string): Promise<JsonValue> {
    const handle = this.handle(workflowId);
    return await readPages((from) => handle.query(stateQuery, from)) as JsonValue;
  }

  async hostView(workflowId: string): Promise<HostSnapshot> {
    const handle = this.handle(workflowId);
    return await readPages((from) => handle.query(hostViewQuery, from)) as HostSnapshot;
  }

  publication(workflowId: string, afterRevision: number, limit = 100): Promise<PublicationPage> {
    return this.handle(workflowId).query(publicationQuery, afterRevision, limit);
  }

  result(workflowId: string): Promise<ProcessResult> {
    return this.handle(workflowId).result();
  }

  async describe(workflowId: string): Promise<ProcessDescription | null> {
    try {
      const description = await this.handle(workflowId).describe();
      return {
        workflowId: description.workflowId,
        workflowType: description.type,
        taskQueue: description.taskQueue,
        running: description.status.name === "RUNNING",
        memo: (description.memo ?? null) as Readonly<Record<string, JsonValue>> | null,
      };
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) return null;
      throw error;
    }
  }

  private handle(workflowId: string): WorkflowHandle<ProcessWorkflow> {
    return this.client.workflow.getHandle<ProcessWorkflow>(workflowId);
  }

  private submit(workflowId: string, update: typeof commandUpdate, stimulus: JsonValue): Promise<CommandResult> {
    return submitUpdate(this.client, workflowId, update, stimulus);
  }
}

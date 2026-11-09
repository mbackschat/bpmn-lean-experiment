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

import type { PublicationPage } from "./publication.js";
import type { JsonValue } from "./port.js";
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
  timerFireUpdate,
  workflowType,
  type CommandResult,
  type HostConfig,
  type HostSnapshot,
  type ProcessResult,
  type RunProcessArgs,
} from "./protocol.js";
import { assertNever } from "./host-machine.js";

export {
  ResultKind,
  Scheduling,
  type CommandResult,
  type Halt,
  type HostConfig,
  type HostSnapshot,
  type ProcessResult,
  type RunProcessArgs,
} from "./protocol.js";
export { PageKind, type Batch, type ExecutionTransition, type OccurrenceTransition, type PublicationPage } from "./publication.js";
export type { DefinitionRef, HostView, JsonValue, OccurrenceId, Requirements, WaitView } from "./port.js";

export interface StartRequest {
  readonly workflowId: string;
  readonly program: JsonValue;
  readonly config: HostConfig;
  /** The start stimulus, in the scenario contract's form. */
  readonly start: JsonValue;
}

type ProcessWorkflow = (args: RunProcessArgs) => Promise<ProcessResult>;

export class ProcessClient {
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
        args: [{ kind: RunKind.Start, program: request.program, config: request.config, start: request.start }],
      });
    } catch (error) {
      if (error instanceof WorkflowExecutionAlreadyStartedError) {
        return { outcome: "rejected", code: "workflow-already-started", revision: null };
      }
      throw error;
    }
    const snapshot = await handle.query(hostViewQuery);
    if (snapshot.view !== null) return { outcome: "committed", code: null, revision: snapshot.revision };
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

  observation(workflowId: string): Promise<JsonValue> {
    return this.handle(workflowId).query(observationQuery);
  }

  hostView(workflowId: string): Promise<HostSnapshot> {
    return this.handle(workflowId).query(hostViewQuery);
  }

  publication(workflowId: string, afterRevision: number, limit = 100): Promise<PublicationPage> {
    return this.handle(workflowId).query(publicationQuery, afterRevision, limit);
  }

  result(workflowId: string): Promise<ProcessResult> {
    return this.handle(workflowId).result();
  }

  private handle(workflowId: string): WorkflowHandle<ProcessWorkflow> {
    return this.client.workflow.getHandle<ProcessWorkflow>(workflowId);
  }

  private async submit(
    workflowId: string,
    update: typeof commandUpdate,
    stimulus: JsonValue,
  ): Promise<CommandResult> {
    try {
      return await this.handle(workflowId).executeUpdate(update, { args: [stimulus] });
    } catch (error) {
      if (error instanceof WorkflowUpdateFailedError && error.cause instanceof ApplicationFailure &&
          error.cause.type === rejectionType) {
        return { outcome: "rejected", code: error.cause.message, revision: null };
      }
      if (error instanceof WorkflowNotFoundError) return { outcome: "rejected", code: "workflow-closed", revision: null };
      throw error;
    }
  }
}

/**
 * The process operations a client of the host uses, as a port: `ProcessClient` realizes it over Temporal and the
 * memory host in process. It imports nothing from the Temporal SDK, so its users type-check without the SDK.
 */
import type { CommandResult, CorrelatedPublication, HostConfig, HostSnapshot, PublicationResult } from "./host-contract.js";
import type { PublicationPage } from "./publication.js";
import type { JsonValue } from "./port.js";

export interface StartRequest {
  readonly workflowId: string;
  readonly program: JsonValue;
  readonly config: HostConfig;
  /** The start stimulus, in the scenario contract's form. */
  readonly start: JsonValue;
  /**
   * The caller's opaque name of the deployed definition the instance runs; correlated publications to it reach the
   * instance's open correlated waits. Absent, only an addressed delivery reaches them.
   */
  readonly correlationScope?: string;
  /** Caller-owned facts about the start, returned verbatim by `describe`; the host never reads them. */
  readonly memo?: Readonly<Record<string, JsonValue>>;
}

/** A chain as Temporal retains it; `running` is false once the chain has ended, however it ended. */
export interface ProcessDescription {
  readonly workflowId: string;
  readonly workflowType: string;
  readonly taskQueue: string;
  readonly running: boolean;
  readonly memo: Readonly<Record<string, JsonValue>> | null;
}

export interface ProcessHost {
  start(request: StartRequest): Promise<CommandResult>;
  command(workflowId: string, stimulus: JsonValue): Promise<CommandResult>;
  deliver(workflowId: string, stimulus: JsonValue): Promise<CommandResult>;
  /** Delivers a correlated publication to the one open correlated wait of its scope that matches it now. */
  publish(publication: CorrelatedPublication): Promise<PublicationResult>;
  observation(workflowId: string): Promise<JsonValue>;
  hostView(workflowId: string): Promise<HostSnapshot>;
  publication(workflowId: string, afterRevision: number, limit?: number): Promise<PublicationPage>;
  /** `null` when Temporal retains no chain under the Workflow ID. */
  describe(workflowId: string): Promise<ProcessDescription | null>;
}

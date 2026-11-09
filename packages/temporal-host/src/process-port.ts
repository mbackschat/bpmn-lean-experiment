/**
 * The process operations a client of the host uses, as a port: `ProcessClient` realizes it over Temporal and the
 * memory host in process. It imports nothing from the Temporal SDK, so its users type-check without the SDK.
 */
import type { CommandResult, HostConfig, HostSnapshot } from "./host-contract.js";
import type { PublicationPage } from "./publication.js";
import type { JsonValue } from "./port.js";

export interface StartRequest {
  readonly workflowId: string;
  readonly program: JsonValue;
  readonly config: HostConfig;
  /** The start stimulus, in the scenario contract's form. */
  readonly start: JsonValue;
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
  observation(workflowId: string): Promise<JsonValue>;
  hostView(workflowId: string): Promise<HostSnapshot>;
  publication(workflowId: string, afterRevision: number, limit?: number): Promise<PublicationPage>;
  /** `null` when Temporal retains no chain under the Workflow ID. */
  describe(workflowId: string): Promise<ProcessDescription | null>;
}

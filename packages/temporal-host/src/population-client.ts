/**
 * A population's client: it registers deployments with the population ingress and submits population commands to it,
 * each by Update-with-Start, so the first call starts the ingress and every later one reaches the running one. A
 * command answered `pending` (the ingress continued as new before it settled) is read back from `populationResult`.
 */
import {
  ApplicationFailure,
  WithStartWorkflowOperation,
  WorkflowUpdateFailedError,
  type Client,
} from "@temporalio/client";

import type { HostConfig } from "./host-contract.js";
import { populationCommandDigest, populationCommandUpdateId, populationIngressWorkflowId } from "./population-address.js";
import {
  populationIngressWorkflowType,
  type CommandAnswer,
  type DeploymentAnswer,
  type DeploymentRequest,
  type PopulationIngressArgs,
} from "./population-contract.js";
import type { JsonValue } from "./port.js";
import { populationBacklogQuery, populationCommandUpdate, populationResultQuery, registerDeploymentUpdate, rejectionType } from "./protocol.js";

type Ingress = (args: PopulationIngressArgs) => Promise<void>;

/** A command the ingress refused before acceptance: the queue was full, or the command is malformed. */
export class PopulationCommandRefused extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PopulationCommandRefused";
  }
}

export class PopulationClient {
  /** `config` is the configuration of the chains the ingress starts for the population's receivers. */
  constructor(
    private readonly client: Client,
    private readonly taskQueue: string,
    private readonly population: string,
    private readonly config: HostConfig,
    private readonly rolloverEvents: number | null = null,
    private readonly pollMs = 200,
  ) {}

  /** How many commands and hand-offs the ingress has queued or in flight. */
  backlog(): Promise<number> {
    return this.client.workflow.getHandle<Ingress>(populationIngressWorkflowId(this.population)).query(populationBacklogQuery);
  }

  registerDeployment(request: DeploymentRequest): Promise<DeploymentAnswer> {
    return this.client.workflow.executeUpdateWithStart(registerDeploymentUpdate, {
      args: [request], startWorkflowOperation: this.start(),
    });
  }

  /** Submit a command in the population scenario contract's form, `kind` its step kind; its answer once it settled. */
  async command(kind: string, command: JsonValue & { readonly commandId: string }): Promise<CommandAnswer> {
    const request = { commandId: command.commandId, kind, command, digest: populationCommandDigest(kind, command) };
    let outcome;
    try {
      outcome = await this.client.workflow.executeUpdateWithStart(populationCommandUpdate, {
        args: [request], updateId: populationCommandUpdateId(request), startWorkflowOperation: this.start(),
      });
    } catch (error) {
      if (error instanceof WorkflowUpdateFailedError && error.cause instanceof ApplicationFailure && error.cause.type === rejectionType) {
        throw new PopulationCommandRefused(error.cause.message);
      }
      throw error;
    }
    if (outcome.kind === "answered") return outcome.answer;
    for (;;) {
      const recorded = await this.result(command.commandId);
      if (recorded.kind === "settled") return recorded.answer;
      if (recorded.kind === "unknown") throw new Error(`population command ${command.commandId} left the ledger unread`);
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
  }

  /** The recorded answer of `commandId`, or whether it is still queued or in flight (`pending`) or unknown. */
  async result(commandId: string): Promise<{ readonly kind: "settled"; readonly answer: CommandAnswer } | { readonly kind: "pending" | "unknown" }> {
    return await this.client.workflow.getHandle<Ingress>(populationIngressWorkflowId(this.population))
      .query(populationResultQuery, commandId) as { readonly kind: "settled"; readonly answer: CommandAnswer } | { readonly kind: "pending" | "unknown" };
  }

  private start(): WithStartWorkflowOperation<Ingress> {
    return new WithStartWorkflowOperation<Ingress>(populationIngressWorkflowType, {
      workflowId: populationIngressWorkflowId(this.population),
      taskQueue: this.taskQueue,
      workflowIdConflictPolicy: "USE_EXISTING",
      args: [{ population: this.population, config: this.config, rolloverEvents: this.rolloverEvents, carried: null }],
    });
  }
}

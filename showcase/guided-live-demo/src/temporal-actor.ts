import {
  CanonicalObservationKind,
  ProcessStatus,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type { StateObservation } from "@bpmn-lean/semantic-core";
import {
  readBpmnProcessTrace,
  readUserTaskDetail,
  submitUserTaskCompletion,
} from "@bpmn-lean/temporal-client";
import {
  HostInteractionResultKind,
  driveHostInteractions,
} from "@bpmn-lean/temporal-runner";
import type {
  HostInteractionPort,
  TemporalWorkflowClient,
} from "@bpmn-lean/temporal-runner";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

import type { GuidedDemoPreparationPort } from "./demo-preparation.ts";
import { DemoScenario } from "./demo-plan.ts";
import type { DemoPlanEntry } from "./demo-plan.ts";

/** Drives only interactions that the committed Product 1 publication exposes. */
export class GuidedDemoTemporalActor implements Pick<GuidedDemoPreparationPort, "drive"> {
  readonly #client: TemporalWorkflowClient;

  constructor(client: TemporalWorkflowClient) {
    this.#client = client;
  }

  async drive(
    entry: DemoPlanEntry,
    instance: PublicProcessInstanceIdentity,
  ): Promise<void> {
    const result = await driveHostInteractions(entry.responses, this.#port(instance));
    if (
      result.kind !== HostInteractionResultKind.Driven ||
      result.submitted !== entry.responses.length
    ) {
      const detail = result.kind === HostInteractionResultKind.Driven
        ? `submitted ${result.submitted} of ${entry.responses.length}`
        : `${result.code}: ${result.evidence}`;
      throw new Error(`Demo actor refused ${entry.scenario}: ${detail}`);
    }
    const state = await this.#readState(instance.processInstanceId);
    requireExactBatchTerminal(entry.scenario, state);
  }

  #port(instance: PublicProcessInstanceIdentity): HostInteractionPort {
    return {
      readState: async () => this.#readState(instance.processInstanceId),
      readUserTaskDetail: async (request) =>
        readUserTaskDetail(this.#client, instance.processInstanceId, request),
      submitCompletion: async (stimulus) =>
        submitUserTaskCompletion(this.#client, instance.processInstanceId, stimulus),
      submitMessage: async () => {
        throw new Error("The guided demo actor has no Message response plan");
      },
      submitCancellation: async () => {
        throw new Error("The guided demo actor has no cancellation response plan");
      },
    };
  }

  async #readState(processInstanceId: string): Promise<StateObservation> {
    const trace = await readBpmnProcessTrace(this.#client, processInstanceId);
    const observation = trace.findLast((candidate) =>
      candidate.kind === CanonicalObservationKind.State
    );
    if (observation?.kind !== CanonicalObservationKind.State) {
      throw new Error(`Process ${processInstanceId} published no committed state`);
    }
    return observation;
  }
}

function requireExactBatchTerminal(
  scenario: DemoPlanEntry["scenario"],
  state: StateObservation,
): void {
  if (
    state.status !== ProcessStatus.Completed ||
    state.openUserTasks.length !== 0 ||
    state.openTimers.length !== 0 ||
    state.openEffects.length !== 0 ||
    state.openIncidents.length !== 0 ||
    state.enabledInteractions.length !== 0 ||
    (state.openMultiInstances ?? []).length !== 0
  ) {
    throw new Error(`Demo ${scenario} did not reach an exact clean terminal state`);
  }
  const output = state.variables.find(({ name }) =>
    name === "DataObjectReference_OutputResults"
  );
  switch (scenario) {
    case DemoScenario.PurchaseOrderReview:
      if (
        state.logicalTimeMs !== 0 ||
        output?.value.kind !== VariableValueKind.StringList ||
        !sameStrings(output.value.value, ["accepted", "flagged", "archived"])
      ) {
        throw new Error("Purchase-order review lost its exact ordered terminal aggregate");
      }
      return;
    case DemoScenario.DeadlineEscalation:
      if (state.logicalTimeMs !== 1_000 || output !== undefined) {
        throw new Error("Deadline escalation did not preserve Timer interruption without partial output");
      }
      return;
    case DemoScenario.ExpenseException:
    case DemoScenario.RetryableIncident:
    case DemoScenario.CancellableIncident:
      throw new Error(`Demo actor must not drive open presenter scenario ${scenario}`);
  }
}

function sameStrings(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

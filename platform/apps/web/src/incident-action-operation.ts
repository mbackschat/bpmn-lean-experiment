import {
  decodeIncidentActionRequest,
} from "@bpmn-lean/platform-contracts";
import type {
  IncidentActionRequest,
  IncidentActionResult,
} from "@bpmn-lean/platform-contracts";

import type { IncidentOperationsApi } from "./incident-operations-api.ts";

export const IncidentActionView = {
  Committed: "committed",
  Indeterminate: "indeterminate",
  RejectedCurrent: "rejectedCurrent",
  RejectedNoLongerCurrent: "rejectedNoLongerCurrent",
} as const;

export type IncidentActionView =
  typeof IncidentActionView[keyof typeof IncidentActionView];

type RetainedAction = Readonly<{
  actionId: string;
  interaction: IncidentActionRequest;
}>;

/** Owns one retry-safe action identity until the server gives a terminal disposition. */
export class IncidentActionOperation {
  readonly #api: Pick<IncidentOperationsApi, "submitAction">;
  #retained: RetainedAction | null = null;

  constructor(api: Pick<IncidentOperationsApi, "submitAction">) {
    this.#api = api;
  }

  get hasRetainedAction(): boolean {
    return this.#retained !== null;
  }

  begin(actionId: string, interaction: IncidentActionRequest): RetainedAction {
    if (this.#retained !== null) {
      throw new Error("An incident action is already pending");
    }
    if (actionId.length === 0) throw new TypeError("actionId must be nonempty");
    const exact = deepFreeze(decodeIncidentActionRequest(structuredClone(interaction)));
    this.#retained = Object.freeze({ actionId, interaction: exact });
    return this.#retained;
  }

  async submit(): Promise<IncidentActionResult> {
    const retained = this.#retained;
    if (retained === null) throw new Error("No incident action is pending");
    const result = await this.#api.submitAction(
      retained.actionId,
      retained.interaction,
    );
    if (result.state === "committed" || result.state === "rejected") {
      this.#retained = null;
    }
    return result;
  }
}

export function incidentActionView(
  result: IncidentActionResult,
  incidentStillPublished: boolean,
): IncidentActionView {
  switch (result.state) {
    case "committed":
      return IncidentActionView.Committed;
    case "indeterminate":
      return IncidentActionView.Indeterminate;
    case "rejected":
      return result.engineResult.kind === "processClosed" || !incidentStillPublished
        ? IncidentActionView.RejectedNoLongerCurrent
        : IncidentActionView.RejectedCurrent;
  }
}

export function retainedIncidentActionLabel(
  kind: IncidentActionRequest["kind"],
): string {
  switch (kind) {
    case "retryIncident":
      return "Submit Retry again";
    case "cancelIncidentProcess":
      return "Submit Cancel Process again";
  }
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

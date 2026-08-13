/** Strict raw-CIB projection for the incident-gated root cancellation profile. */
import { isDeepStrictEqual } from "node:util";

import type {
  StateObservation,
} from "../packages/semantic-core/src/index.ts";
import type {
  EffectJobSnapshot,
  HistoricProcessStateSnapshot,
  IncidentJobSnapshot,
  StateQuerySnapshot,
} from "./contract-cib-evidence.ts";
import {
  projectCibIncidentState,
  serviceTaskIncidentProfileId,
} from "./contract-cib-incident-projection.ts";
import {
  serviceTaskIncidentCancellationProfileId,
} from "./service-task-incident-cancellation-profile-consistency.ts";

const reportCommandId =
  "report-effect-failure-sha256:b6b5077e469b9421ed4a598e4c08fae7c3ce3e31c941fae9733b4c7206a2b345";

const expectedHistoricStates = Object.freeze([
  Object.freeze({ afterCommandId: "start-process", state: "ACTIVE" }),
  Object.freeze({ afterCommandId: reportCommandId, state: "ACTIVE" }),
  Object.freeze({
    afterCommandId: "cancel-incident-process",
    state: "EXTERNALLY_TERMINATED",
  }),
]);

type IncidentStateProjection = Pick<
  StateObservation,
  | "activeWaits"
  | "openEffects"
  | "openIncidents"
  | "enabledInteractions"
>;

export function profileRequiresIncidentSnapshots(profileId: string): boolean {
  return profileId === serviceTaskIncidentProfileId ||
    profileId === serviceTaskIncidentCancellationProfileId;
}

export function profileIsStageOneIncident(profileId: string): boolean {
  return profileId === serviceTaskIncidentProfileId;
}

export function verifyCibIncidentCancellationExecution(
  profileId: string,
  executions: ReadonlyArray<Readonly<{
    schedule: string;
    invocations: number;
    mutations: number;
    initialRetries: number;
    retriesAfterFirstFailure: number | null;
  }>>,
): boolean {
  if (profileId !== serviceTaskIncidentCancellationProfileId) {
    return false;
  }
  const [execution] = executions;
  if (
    executions.length !== 1 ||
    execution?.schedule !== "incidentReportCancel" ||
    execution.invocations !== 3 ||
    execution.mutations !== 1 ||
    execution.initialRetries !== 3 ||
    execution.retriesAfterFirstFailure !== 2
  ) {
    throw new Error(
      "retained CIB cancellation evidence must bind report and cancellation",
    );
  }
  return true;
}

export function verifyCibIncidentCancellationHistory(
  profileId: string,
  stateQueries: ReadonlyArray<StateQuerySnapshot>,
  historicStates: ReadonlyArray<HistoricProcessStateSnapshot> | undefined,
): ReadonlyArray<HistoricProcessStateSnapshot> | undefined {
  if (profileId !== serviceTaskIncidentCancellationProfileId) {
    if (historicStates !== undefined) {
      throw new Error(
        "old profiles must omit raw historic Process-state diagnostics",
      );
    }
    return undefined;
  }
  if (
    historicStates === undefined ||
    !isDeepStrictEqual(historicStates, expectedHistoricStates) ||
    stateQueries.length !== historicStates.length
  ) {
    throw new Error(
      "incident cancellation requires its exact positive historic Process-state sequence",
    );
  }
  for (const [index, snapshot] of stateQueries.entries()) {
    const historic = historicStates[index];
    const expectedCount = index === historicStates.length - 1 ? 0 : 1;
    if (
      historic === undefined ||
      snapshot.afterCommandId !== historic.afterCommandId ||
      snapshot.processInstanceCount !== expectedCount
    ) {
      throw new Error(
        "incident cancellation historic state is not aligned with the live Process query",
      );
    }
  }
  const finalState = stateQueries.at(-1);
  if (!isDeepStrictEqual(finalState?.variables, [{
    name: "preserved",
    value: "before-cancel",
  }])) {
    throw new Error(
      "incident cancellation must positively preserve its committed Process variable",
    );
  }
  return historicStates;
}

export function projectCibIncidentCancellationStatus(
  defaultStatus: StateObservation["status"],
  historicState: HistoricProcessStateSnapshot | undefined,
): StateObservation["status"] {
  if (historicState === undefined) {
    return defaultStatus;
  }
  switch (historicState.state) {
    case "ACTIVE":
      if (defaultStatus !== "running") {
        throw new Error("active historic Process requires one live root");
      }
      return defaultStatus;
    case "EXTERNALLY_TERMINATED":
      if (defaultStatus !== "completed") {
        throw new Error("external termination requires no live root");
      }
      return "cancelled" as StateObservation["status"];
    case "COMPLETED":
      throw new Error(
        "ordinary historic completion cannot establish Process cancellation",
      );
    default: {
      const unsupported: never = historicState.state;
      throw new Error(`unsupported historic Process state: ${unsupported}`);
    }
  }
}

export function projectCibIncidentCancellationState(
  profileId: string,
  instanceId: string,
  effects: EffectJobSnapshot,
  incidents: IncidentJobSnapshot | undefined,
): IncidentStateProjection {
  if (profileId !== serviceTaskIncidentCancellationProfileId) {
    return projectCibIncidentState(
      profileId,
      instanceId,
      effects,
      incidents,
    );
  }
  const projection = projectCibIncidentState(
    serviceTaskIncidentProfileId,
    instanceId,
    effects,
    incidents,
  );
  const [incident] = projection.openIncidents;
  if (incident === undefined) {
    return projection;
  }
  if (
    projection.openIncidents.length !== 1 ||
    projection.enabledInteractions.length !== 1 ||
    projection.enabledInteractions[0]?.kind !== "retryIncident"
  ) {
    throw new Error(
      "incident cancellation requires one exact Retry interaction before Cancel",
    );
  }
  return {
    ...projection,
    enabledInteractions: [
      ...projection.enabledInteractions,
      {
        kind: "cancelIncidentProcess" as Extract<
          StateObservation["enabledInteractions"][number],
          { readonly processInstanceId: string }
        >["kind"],
        processInstanceId: instanceId,
        incidentId: incident.id,
      },
    ],
  };
}

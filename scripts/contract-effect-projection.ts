/**
 * Raw CIB effect-job projection into the neutral canonical effect contract.
 */
import type {
  CanonicalObservation,
  EffectDescriptor,
  StateObservation,
} from "../packages/semantic-core/src/index.ts";
import type {
  EffectJob,
  EffectJobSnapshot,
} from "./contract-artifacts.ts";

export function statesWithEmptyEffectSnapshots(
  trace: ReadonlyArray<CanonicalObservation>,
): ReadonlyArray<EffectJobSnapshot> {
  const snapshots: Array<EffectJobSnapshot> = [];
  let afterCommandId: string | undefined;
  for (const observation of trace) {
    if (observation.kind === "command") {
      afterCommandId = observation.commandId;
    } else if (
      observation.kind === "state" &&
      afterCommandId !== undefined
    ) {
      snapshots.push({ afterCommandId, jobs: [] });
      afterCommandId = undefined;
    }
  }
  return snapshots;
}

export function projectEffectJobs(
  instanceId: string,
  jobs: ReadonlyArray<EffectJob>,
): Pick<StateObservation, "activeWaits" | "openEffects"> {
  const activeWaits: Array<StateObservation["activeWaits"][number]> =
    jobs.map((job) => ({
      elementId: job.elementId,
      kind: "effect" as StateObservation["activeWaits"][number]["kind"],
      multiplicity: 1,
    }));
  const openEffects = jobs.map((job) => ({
    id: {
      processInstanceId: instanceId,
      elementId: job.elementId,
      activation: job.activation,
    },
    descriptor: neutralEffectDescriptor(job),
    arguments: [],
  }));
  return { activeWaits, openEffects };
}

function neutralEffectDescriptor(job: EffectJob): EffectDescriptor {
  switch (job.handler) {
    case "bpmnLeanEffectHandler":
      if (job.protocol === "urn:bpmn-lean:effect:probe-v1") {
        return {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:probe-v1",
        };
      }
      break;
    case "mappedSuccessHandler":
      if (job.protocol === "urn:bpmn-lean:mapped-service-task:v1") {
        return {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation: "urn:bpmn-lean:effect-operation:mapped-success-v1",
        };
      }
      break;
    case "mappedBoundaryErrorHandler":
      if (job.protocol === "urn:bpmn-lean:mapped-service-task:v1") {
        return {
          protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
          operation:
            "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1",
        };
      }
      break;
  }
  throw new Error(
    `unsupported retained CIB effect binding: ${job.protocol} / ${job.handler}`,
  );
}

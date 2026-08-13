import type {
  StateObservation,
} from "../packages/semantic-core/src/contract.ts";
import type {
  EffectJobSnapshot,
  IncidentJob,
  IncidentJobSnapshot,
} from "./contract-cib-evidence.ts";
import { projectEffectJobs } from "./contract-effect-projection.ts";

export const serviceTaskIncidentProfileId =
  "cibseven-2.2.0-service-task-incident-draft";

type IncidentStateProjection = Pick<
  StateObservation,
  | "activeWaits"
  | "openEffects"
  | "openIncidents"
  | "enabledInteractions"
>;

export function projectCibIncidentState(
  profileId: string,
  instanceId: string,
  effects: EffectJobSnapshot,
  incidents: IncidentJobSnapshot | undefined,
): IncidentStateProjection {
  if (profileId !== serviceTaskIncidentProfileId) {
    if (incidents !== undefined) {
      throw new Error("old profile must omit raw incident diagnostics");
    }
    return {
      ...projectEffectJobs(instanceId, effects.jobs),
      openIncidents: [],
      enabledInteractions: [],
    };
  }
  if (
    incidents === undefined ||
    !incidents.createIncidentOnFailedJobEnabled ||
    incidents.afterCommandId !== effects.afterCommandId
  ) {
    throw new Error(
      "incident profile requires aligned enabled raw incident diagnostics",
    );
  }
  if (effects.jobs.length === 0 && incidents.jobs.length === 0) {
    return {
      activeWaits: [],
      openEffects: [],
      openIncidents: [],
      enabledInteractions: [],
    };
  }
  if (effects.jobs.length !== 1 || incidents.jobs.length !== 1) {
    throw new Error("incident profile requires exactly one raw incident job");
  }
  const effectJob = effects.jobs[0];
  const incidentJob = incidents.jobs[0];
  if (effectJob === undefined || incidentJob === undefined) {
    throw new Error("incident profile omitted its raw job partner");
  }
  requireSamePublicJobFacts(effectJob, incidentJob);
  const effectProjection = projectEffectJobs(instanceId, [effectJob]);
  const openEffect = effectProjection.openEffects[0];
  if (openEffect === undefined) {
    throw new Error("incident projection omitted its effect occurrence");
  }
  if (incidentJob.incident === null) {
    if (incidentJob.retries === 0) {
      throw new Error("zero-retry job requires exactly one failed-job incident");
    }
    return {
      ...effectProjection,
      openIncidents: [],
      enabledInteractions: [],
    };
  }
  requireFailedJobIncident(incidentJob);
  const incidentId = { effectId: openEffect.id, generation: 1 } as const;
  return {
    activeWaits: [{
      elementId: openEffect.id.elementId,
      kind: "incident" as StateObservation["activeWaits"][number]["kind"],
      multiplicity: 1,
    }],
    openEffects: [],
    openIncidents: [{
      kind: "effectExecutionFailed",
      id: incidentId,
      effect: openEffect,
    }],
    enabledInteractions: [{
      kind: "retryIncident" as Extract<
        StateObservation["enabledInteractions"][number],
        { readonly incidentId: unknown }
      >["kind"],
      incidentId,
    }],
  };
}

function requireSamePublicJobFacts(
  effect: EffectJobSnapshot["jobs"][number],
  incident: IncidentJob,
): void {
  if (
    effect.elementId !== incident.elementId ||
    effect.retries !== incident.retries ||
    effect.executable !== incident.executable ||
    effect.dueDatePresent !== incident.dueDatePresent
  ) {
    throw new Error("raw effect and incident job facts disagree");
  }
}

function requireFailedJobIncident(job: IncidentJob): void {
  const incident = job.incident;
  if (incident === null) {
    throw new Error("incident partner is absent");
  }
  if (job.retries !== 0 || job.executable) {
    throw new Error("failed-job incident requires one nonexecutable retries-zero job");
  }
  if (incident.configurationJobId !== job.publicJobId) {
    throw new Error("incident configuration job identity does not match its job");
  }
  if (
    incident.type !== "failedJob" ||
    incident.processInstanceId !== job.processInstanceId ||
    incident.elementId !== job.elementId ||
    incident.causeIncidentId !== incident.publicIncidentId ||
    incident.rootCauseIncidentId !== incident.publicIncidentId
  ) {
    throw new Error("raw failed-job incident identity or association is malformed");
  }
}

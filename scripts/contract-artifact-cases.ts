/**
 * Exact scenario registries for retained CIB evidence and normative-only
 * profile validation.
 */
export const artifactCases = Object.freeze([
  Object.freeze({
    scenarioRelativePath:
      "scenarios/user-task-discovery-completion/scenario.json",
    evidenceRelativePath:
      "scenarios/user-task-discovery-completion/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/user-task-discovery-completion/wrong-activation.scenario.json",
    evidenceRelativePath:
      "scenarios/user-task-discovery-completion/wrong-activation.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/user-task-discovery-completion/stale-completion.scenario.json",
    evidenceRelativePath:
      "scenarios/user-task-discovery-completion/stale-completion.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/parallel-fork-join/a-then-b.scenario.json",
    evidenceRelativePath:
      "scenarios/parallel-fork-join/a-then-b.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/parallel-fork-join/b-then-a.scenario.json",
    evidenceRelativePath:
      "scenarios/parallel-fork-join/b-then-a.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/parallel-fork-join/stale-a-while-b-active.scenario.json",
    evidenceRelativePath:
      "scenarios/parallel-fork-join/stale-a-while-b-active.cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/intermediate-catch-timer/scenario.json",
    evidenceRelativePath:
      "scenarios/intermediate-catch-timer/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/service-task-effect/scenario.json",
    evidenceRelativePath:
      "scenarios/service-task-effect/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/create-document-data/scenario.json",
    evidenceRelativePath:
      "scenarios/create-document-data/cibseven-evidence.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/boundary-error/scenario.json",
    evidenceRelativePath:
      "scenarios/boundary-error/cibseven-evidence.json",
  }),
]);

export const normativeArtifactCases = Object.freeze([
  Object.freeze({
    scenarioRelativePath:
      "scenarios/exclusive-gateway-simple-boolean/scenario.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/timer-user-task-composition/scenario.json",
  }),
  Object.freeze({
    scenarioRelativePath:
      "scenarios/intermediate-catch-message/scenario.json",
  }),
]);

export type ArtifactCase = Readonly<{
  scenarioRelativePath: string;
  evidenceRelativePath: string;
}>;

export type NormativeArtifactCase = Readonly<{
  scenarioRelativePath: string;
}>;

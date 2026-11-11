/**
 * Population, transcribed from `Kernel/Population.lean`: mechanisms across process instances
 * ([architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#population)). Every input reaches an instance through
 * `step`; this layer only decides which instance an input goes to. A scenario is one ordered list of stimuli mixing
 * deployments, instance inputs and population commands, each at a logical time. Implemented: deployments with versions
 * per process key and the copies of other deployments' processes they may carry (`deploy`), instances of possibly
 * different deployments, each driven by its own inputs, and Message key correlation with exact-cardinality
 * routing ([specification](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)): a publication addresses one
 * deployment and a Message channel and carries the modeled correlation criteria; the candidates are the open
 * subscriptions of that deployment's instances that `Hooks.correlates` accepts; exactly one is delivered to, while zero
 * or several reject the publication and change no instance. Candidate order never picks a winner. Every other command
 * form is parsed and answered `unsupported population-not-implemented`.
 *
 * A refused deployment, an instance input that does not commit and a delivery a target refuses are results, never
 * harness errors; a candidate whose key cannot be evaluated is no match.
 */
import { assertNever, compareStrings, distinctCount, mergeSort, type Program } from "./il/types.js";
import type { Hooks } from "./hooks.js";
import { FailureTag, type Failure } from "./state.js";
import { step } from "./step.js";
import {
  CommandTag,
  DeploymentOutcomeTag,
  StimulusTag,
  commandIdOf,
  notImplemented,
  type Command,
  type Deployment,
  type DeploymentResult,
  type Instance,
  type LedgerEntry,
  type Refusable,
  type Resolution,
  type Result,
  type Stimulus,
  type StepResult,
} from "./population/contract.js";
import { deploy } from "./population/deploy.js";
import { publish } from "./population/messages.js";

/** What a run has done so far: deployments, instances by script, command results and their ledger, input failures. */
interface Progress {
  readonly registry: readonly Deployment[];
  readonly deployments: readonly DeploymentResult[];
  readonly instances: readonly (readonly [number, Instance])[];
  readonly steps: readonly StepResult[];
  readonly ledger: readonly LedgerEntry[];
  readonly inputFailures: readonly (readonly [string, Failure])[];
}

/** The deploy ordinals of the refused deployments, which no copy may come from. */
function refusedOrdinals(progress: Progress): readonly number[] {
  return progress.deployments.flatMap((deployment) => {
    switch (deployment.outcome.tag) {
      case DeploymentOutcomeTag.Deployed:
        return [];
      case DeploymentOutcomeTag.Refused:
        return [deployment.deploymentId];
    }
    return assertNever(deployment.outcome);
  });
}

/** The deployment an instance input reaches: its instance's, or for a new instance its definition's latest. */
function deploymentFor(progress: Progress, script: number, definitionRef: string): Deployment | null {
  const known = progress.instances.find(([candidate]) => candidate === script)?.[1].deployment;
  if (known !== undefined) return known;
  return progress.registry.filter((deployment) => deployment.definitionRef === definitionRef).at(-1) ?? null;
}

function route(hooks: Hooks, progress: Progress, issued: Command): Refusable<readonly [readonly Instance[], Resolution]> {
  const instances = progress.instances.map(([, instance]) => instance);
  switch (issued.tag) {
    case CommandTag.Publish:
      return publish(hooks, progress.registry, instances, issued.publication);
    case CommandTag.Broadcast:
    case CommandTag.EvaluateConditions:
    case CommandTag.TimerStart:
      return { ok: true, value: [instances, notImplemented] };
  }
  return assertNever(issued);
}

/** Apply one stimulus. A command sees the instances started so far. */
function apply(hooks: Hooks, admission: (program: Program) => string | null, progress: Progress, stimulus: Stimulus): Refusable<Progress> {
  switch (stimulus.tag) {
    case StimulusTag.Deploy: {
      const deploymentId = progress.deployments.length + 1;
      const [result, deployment] = deploy(admission, progress.registry, refusedOrdinals(progress), deploymentId,
        stimulus.definitionRef, stimulus.ref, stimulus.program, stimulus.atMs);
      const registry = deployment === null ? progress.registry : [...progress.registry, deployment];
      return { ok: true, value: { ...progress, registry, deployments: [...progress.deployments, result] } };
    }
    case StimulusTag.DeployRefused: {
      const result: DeploymentResult = {
        deploymentId: progress.deployments.length + 1, definitionRef: stimulus.definitionRef, versions: [],
        outcome: { tag: DeploymentOutcomeTag.Refused, code: stimulus.code },
      };
      return { ok: true, value: { ...progress, deployments: [...progress.deployments, result] } };
    }
    case StimulusTag.Input: {
      const failed = (failure: Failure): Progress =>
        ({ ...progress, inputFailures: [...progress.inputFailures, [stimulus.commandId, failure]] });
      const deployment = deploymentFor(progress, stimulus.script, stimulus.definitionRef);
      if (deployment === null) return { ok: true, value: failed({ tag: FailureTag.Rejected, code: "definition-not-deployed" }) };
      const before = progress.instances.find(([script]) => script === stimulus.script)?.[1].state ?? null;
      const stepped = step(hooks, deployment.program, before, stimulus.input);
      if (!stepped.ok) return { ok: true, value: failed(stepped.failure) };
      const others = progress.instances.filter(([script]) => script !== stimulus.script);
      return { ok: true, value: { ...progress, instances: [...others, [stimulus.script, { deployment, state: stepped.value }]] } };
    }
    case StimulusTag.Command: {
      const answered = route(hooks, progress, stimulus.command);
      if (!answered.ok) return answered;
      const [instances, resolution] = answered.value;
      const commandId = commandIdOf(stimulus.command);
      const result: StepResult = { commandId, ordinal: progress.steps.length + 1, atMs: stimulus.atMs, resolution };
      const scripts = progress.instances.map(([script]) => script);
      return {
        ok: true,
        value: {
          ...progress,
          instances: scripts.flatMap((script, index) => {
            const instance = instances[index];
            return instance === undefined ? [] : [[script, instance] as const];
          }),
          steps: [...progress.steps, result],
          ledger: [...progress.ledger, { commandId, digest: stimulus.digest, result }],
        },
      };
    }
  }
  return assertNever(stimulus);
}

/** Fold the stimuli in order; `admission` is the admission registry a deployment runs. */
export function runStimuli(hooks: Hooks, admission: (program: Program) => string | null, stimuli: readonly Stimulus[]): Refusable<Result> {
  let progress: Progress = { registry: [], deployments: [], instances: [], steps: [], ledger: [], inputFailures: [] };
  for (const stimulus of stimuli) {
    const next = apply(hooks, admission, progress, stimulus);
    if (!next.ok) return next;
    progress = next.value;
  }
  const ids = progress.instances.map(([, instance]) => instance.state.instanceId);
  if (distinctCount(ids) !== ids.length) return { ok: false, error: "instance-id-duplicate" };
  return {
    ok: true,
    value: {
      deployments: progress.deployments,
      steps: progress.steps,
      inputFailures: progress.inputFailures,
      instances: mergeSort(progress.instances.map(([, instance]) => instance), (left, right) =>
        compareStrings(left.state.instanceId, right.state.instanceId) <= 0),
    },
  };
}

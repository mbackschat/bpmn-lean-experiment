/**
 * Population, transcribed from `Kernel/Population.lean`: mechanisms across process instances
 * ([architecture](../../../docs/kernel/ARCHITECTURE-SPEC.md#population)). Every input reaches an instance through
 * `step`; this layer only decides which instance an input goes to. A scenario is one ordered list of stimuli mixing
 * deployments, instance inputs and population commands, each at a logical time. Implemented: deployments with versions
 * per process key and the copies of other deployments' processes they may carry (`deploy`), instances of possibly
 * different deployments, each driven by its own inputs, and Message publications routed with exact cardinality to a
 * waiting subscription, else to a root Message start (`publish`,
 * [specification](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md)). Every command is answered once: the
 * ledger keeps each command's result under the digest of its canonical wire form, so the same command again answers
 * its recorded result and changes nothing, and the same command identifier with other content is
 * `rejected command-content-mismatch` (population contract §7). Timer-start occurrences fire once each while their
 * deployment is current (`timerStart`), Conditional root starts are evaluated over submitted variables, each start that
 * holds starting its own instance (`evaluateConditions`), and Signals are broadcast to every receiver, each its own unit
 * of commitment, the intents a committed start leaves cascading depth-first (`broadcast`).
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
  ResolutionTag,
  StimulusTag,
  commandIdOf,
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
  type TimerOccurrence,
  deploy,
} from "./population/deploy.js";
import { evaluateConditions } from "./population/conditions.js";
import { broadcast, cascadeStarted } from "./population/signals.js";
import { publish } from "./population/messages.js";
import { timerStart } from "./population/timers.js";

// `Kernel/Run/Population.lean` reads the contract through `Kernel/Population.lean`, which imports `Deploy` publicly.
export {
  CommandTag,
  DefinitionSelectorTag,
  DeploymentOutcomeTag,
  FanOutEntryTag,
  MessageAddressTag,
  PublishMode,
  ReceiverTag,
  ResolutionTag,
  StimulusTag,
  type Command,
  type DefinitionSelector,
  type DeploymentRef,
  type DeploymentResult,
  type FanOutEntry,
  type Publication,
  type Receiver,
  type Resolution,
  type Result,
  type Stimulus,
} from "./population/deploy.js";

/**
 * What a run has done so far: deployments, instances, command results and their ledger, the consumed Timer-start
 * occurrences, input failures.
 */
interface Progress {
  readonly registry: readonly Deployment[];
  readonly deployments: readonly DeploymentResult[];
  readonly instances: readonly Instance[];
  readonly steps: readonly StepResult[];
  readonly ledger: readonly LedgerEntry[];
  readonly occurrences: readonly TimerOccurrence[];
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
function deploymentFor(progress: Progress, instanceId: string, definitionRef: string): Deployment | null {
  const known = progress.instances.find((member) => member.state.instanceId === instanceId)?.deployment;
  if (known !== undefined) return known;
  return progress.registry.filter((deployment) => deployment.definitionRef === definitionRef).at(-1) ?? null;
}

function route(
  hooks: Hooks,
  progress: Progress,
  atMs: number,
  issued: Command,
): Refusable<readonly [readonly Instance[], readonly TimerOccurrence[], Resolution]> {
  switch (issued.tag) {
    case CommandTag.Publish: {
      const published = publish(hooks, progress.registry, progress.instances, atMs, issued.publication);
      if (!published.ok) return published;
      const settled = cascadeStarted(hooks, progress.registry, issued.publication.commandId, atMs, ...published.value);
      if (!settled.ok) return settled;
      const [instances, resolution] = settled.value;
      return { ok: true, value: [instances, progress.occurrences, resolution] };
    }
    case CommandTag.TimerStart: {
      const fired = timerStart(hooks, progress.registry, progress.instances, progress.occurrences, atMs, issued.timerStart);
      if (!fired.ok) return fired;
      const [started, occurrences, startedResolution] = fired.value;
      const settled = cascadeStarted(hooks, progress.registry, issued.timerStart.commandId, atMs, started, startedResolution);
      if (!settled.ok) return settled;
      const [instances, resolution] = settled.value;
      return { ok: true, value: [instances, occurrences, resolution] };
    }
    case CommandTag.EvaluateConditions: {
      const evaluated = evaluateConditions(hooks, progress.registry, progress.instances, atMs, issued.evaluation);
      if (!evaluated.ok) return evaluated;
      const [instances, resolution] = evaluated.value;
      return { ok: true, value: [instances, progress.occurrences, resolution] };
    }
    case CommandTag.Broadcast: {
      const sent = broadcast(hooks, progress.registry, progress.instances, atMs, issued.broadcast);
      if (!sent.ok) return sent;
      const [instances, resolution] = sent.value;
      return { ok: true, value: [instances, progress.occurrences, resolution] };
    }
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
      const deployment = deploymentFor(progress, stimulus.instanceId, stimulus.definitionRef);
      if (deployment === null) return { ok: true, value: failed({ tag: FailureTag.Rejected, code: "definition-not-deployed" }) };
      const before = progress.instances.find((member) => member.state.instanceId === stimulus.instanceId)?.state ?? null;
      const stepped = step(hooks, deployment.program, before, stimulus.input);
      if (!stepped.ok) return { ok: true, value: failed(stepped.failure) };
      const others = progress.instances.filter((member) => member.state.instanceId !== stimulus.instanceId);
      return { ok: true, value: { ...progress, instances: [...others, { deployment, state: stepped.value }] } };
    }
    case StimulusTag.Command: {
      const commandId = commandIdOf(stimulus.command);
      const answered = (resolution: Resolution): StepResult =>
        ({ commandId, ordinal: progress.steps.length + 1, atMs: stimulus.atMs, resolution });
      const recorded = progress.ledger.find((entry) => entry.commandId === commandId);
      if (recorded !== undefined) {
        const resolution: Resolution = recorded.digest === stimulus.digest
          ? recorded.result.resolution
          : { tag: ResolutionTag.Rejected, code: "command-content-mismatch" };
        return { ok: true, value: { ...progress, steps: [...progress.steps, answered(resolution)] } };
      }
      const routed = route(hooks, progress, stimulus.atMs, stimulus.command);
      if (!routed.ok) return routed;
      const [instances, occurrences, resolution] = routed.value;
      const result = answered(resolution);
      return {
        ok: true,
        value: {
          ...progress,
          instances,
          occurrences,
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
  let progress: Progress = { registry: [], deployments: [], instances: [], steps: [], ledger: [], occurrences: [], inputFailures: [] };
  for (const stimulus of stimuli) {
    const next = apply(hooks, admission, progress, stimulus);
    if (!next.ok) return next;
    progress = next.value;
  }
  const ids = progress.instances.map((member) => member.state.instanceId);
  if (distinctCount(ids) !== ids.length) return { ok: false, error: "instance-id-duplicate" };
  return {
    ok: true,
    value: {
      deployments: progress.deployments,
      steps: progress.steps,
      inputFailures: progress.inputFailures,
      instances: mergeSort(progress.instances, (left, right) => compareStrings(left.state.instanceId, right.state.instanceId) <= 0),
    },
  };
}

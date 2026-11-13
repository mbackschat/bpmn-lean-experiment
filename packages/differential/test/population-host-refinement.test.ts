/**
 * The hosted population refines the kernel's: every population scenario runs through the ingress driver the Workflows
 * use (`@bpmn-lean/temporal-host` `population.ts`), each action answered in process over kernel states, and answers the
 * kernel population runner's deployments, command resolutions, input cascades, input failures and final instance
 * states exactly. Every receiver steps at its command's time, which the kernel runner also uses. The driver may reach as
 * many receivers per command as the kernel's cascade bound, so a cascade stops where the kernel's does; the host's
 * smaller capacity and its code are the driver's own rule, which `temporal-host/test/population.test.ts` holds.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DeploymentOutcomeTag,
  cascadeBound,
  StimulusTag,
  admit,
  definitionRefFromJson,
  deploy,
  deploymentSourceFromJson,
  failureCode,
  failureName,
  hooks,
  hostView,
  hostViewJson,
  observationJson,
  runPopulation,
  step,
  stimuliOfPopulation,
  type Deployment,
  type FanOutMachine,
  type Program,
  type State,
} from "@bpmn-lean/kernel";
import { firstValueDisagreement } from "@bpmn-lean/differential";
import { Scheduling, canonicalBytes, chainCapacity, type HostView, type JsonValue } from "@bpmn-lean/temporal-host/host";
import { MemoryPopulation, heldChains, populationPort, type PopulationChain } from "@bpmn-lean/temporal-host/memory-host";

import { populationStepDigests } from "./population-digest.ts";
import { populationPrograms } from "./population-programs.ts";
import { DiscoveredKind, discoverScenarios, type PopulationScenarioDocument } from "./scenario-discovery.ts";

type Json = Readonly<Record<string, unknown>>;
const commandKinds = new Set(["publish", "broadcast", "evaluateConditions", "timerStart"]);

/**
 * The ingress argument beside its state, without a continuation or answer bound: the kernel's population has no
 * carried-size bound, and a cascade at its bound settles an answer of 100,001 entries. This follows the receivers, where
 * `cascadeBound` replaces the host's cap. The host's own bounds are witnessed separately: the ingress's continuation
 * bound in `temporal-host/test/capacity.test.ts`, and the chain bounds' refusals of kernel witnesses in
 * `host-capacity-restrictions.ts`.
 */
const refinementFrame = {
  population: "refinement",
  config: { scheduling: Scheduling.External, effectStartToCloseMs: 60_000, historyEventBudget: null },
  rolloverEvents: null,
  continuationBytes: Number.POSITIVE_INFINITY,
  queryBytes: Number.POSITIVE_INFINITY,
};

/** The kernel runner's result document for `document`, recomputed through the hosted driver. */
function hosted(sources: readonly unknown[], document: PopulationScenarioDocument, digests: readonly string[],
  frame: typeof refinementFrame = refinementFrame): JsonValue {
  const scenario = document as unknown as Json;
  const profile = scenario["profile"] as string;
  const declared = (scenario["definitions"] as readonly Json[]).map((resource) =>
    ({ definitionRef: resource["definitionRef"] as string, ref: definitionRefFromJson(resource["bpmn"], profile, "definition") }));
  const steps = scenario["steps"] as readonly Json[];
  const stimuli = stimuliOfPopulation(declared, sources.map((json, index) => deploymentSourceFromJson(json, `source ${String(index)}`)),
    steps, digests, "population");
  const commandSteps = steps.filter((json) => commandKinds.has(json["kind"] as string));
  const chains = new Map<string, PopulationChain<Program, State>>();
  const population = new MemoryPopulation<Program, State, FanOutMachine>(populationPort,
    (program, state) => hostViewJson(hostView(program, state)) as unknown as HostView, cascadeBound, heldChains(chains), frame);
  const registry: Deployment[] = [];
  const refused: number[] = [];
  const deployments: JsonValue[] = [];
  const results: JsonValue[] = [];
  const inputFailures: JsonValue[] = [];
  const inputCascades: JsonValue[] = [];
  const definitionOf = new Map<string, Deployment>();
  const deployed = (deploymentId: number, definitionRef: string, answer: ReturnType<typeof population.deploy>): void => {
    deployments.push("refused" in answer
      ? { deploymentId, definitionRef, versions: [], outcome: { kind: "deploymentRefused", code: answer.refused } }
      : { deploymentId, definitionRef, versions: answer.versions.map(([key, version]) => ({ key, version })), outcome: { kind: "deployed" } });
  };
  let commandIndex = 0;
  for (const stimulus of stimuli) {
    switch (stimulus.tag) {
      case StimulusTag.Deploy: {
        const deploymentId = deployments.length + 1;
        const [result, deployment] = deploy(admit, registry, refused, deploymentId, stimulus.definitionRef, stimulus.ref, stimulus.program, stimulus.atMs);
        const answer = population.deploy(String(deploymentId), stimulus.definitionRef, deployment === null
          ? { refused: result.outcome.tag === DeploymentOutcomeTag.Refused ? result.outcome.code : "" } : deployment.program, stimulus.atMs);
        if (deployment === null) refused.push(deploymentId);
        else registry.push(deployment);
        deployed(deploymentId, stimulus.definitionRef, answer);
        break;
      }
      case StimulusTag.DeployRefused: {
        const deploymentId = deployments.length + 1;
        refused.push(deploymentId);
        deployed(deploymentId, stimulus.definitionRef, population.deploy(String(deploymentId), stimulus.definitionRef, { refused: stimulus.code }, stimulus.atMs));
        break;
      }
      case StimulusTag.Input: {
        const chain = chains.get(stimulus.instanceId);
        const deployment = chain === undefined
          ? registry.filter((candidate) => candidate.definitionRef === stimulus.definitionRef).at(-1)
          : definitionOf.get(stimulus.instanceId);
        if (deployment === undefined) {
          inputFailures.push({ commandId: stimulus.commandId, outcome: "rejected", code: "definition-not-deployed" });
          break;
        }
        const stepped = step(hooks, deployment.program, chain?.state ?? null, stimulus.input);
        if (!stepped.ok) {
          inputFailures.push({ commandId: stimulus.commandId, outcome: failureName(stepped.failure), code: failureCode(stepped.failure) });
          break;
        }
        definitionOf.set(stimulus.instanceId, deployment);
        chains.set(stimulus.instanceId, { deploymentId: deployment.deploymentId, program: deployment.program, state: stepped.value });
        population.committed(stimulus.instanceId, deployment.deploymentId, deployment.program, stepped.value, stimulus.commandId);
        population.run(stepped.value.logicalTimeMs);
        const cascade = population.ingress.ledger.find((entry) =>
          entry.kind === "emit" && entry.workflowId === stimulus.instanceId && entry.commandId === stimulus.commandId);
        if (cascade?.kind === "emit" && Array.isArray(cascade.entries) && cascade.entries.length > 0) {
          inputCascades.push({ commandId: stimulus.commandId, entries: cascade.entries });
        }
        break;
      }
      case StimulusTag.Command: {
        const json = commandSteps[commandIndex];
        commandIndex += 1;
        assert.ok(json !== undefined);
        const { at: _at, ...command } = json;
        const answered = population.command(json["commandId"] as string, json["kind"] as string, command as JsonValue, stimulus.digest, stimulus.atMs);
        assert.ok("answer" in answered, "the ingress refuses no command in a scenario");
        const answer = answered.answer;
        const { atMs, chain, ...rest } = answer as Json;
        // A Message delivery names its chain, which holds the target's instance; nothing else names one.
        const target = (rest["resolution"] as Json)["target"] as Json | undefined;
        assert.equal(chain !== null, target !== undefined && (rest["resolution"] as Json)["kind"] !== "fanOut");
        if (typeof chain === "string") assert.ok(chains.has(chain), `${String(json["commandId"])}: chain ${chain}`);
        results.push({ ...rest, at: atMs } as JsonValue);
        break;
      }
    }
  }
  const processStates = [...chains.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, chain]) => observationJson(chain.program, chain.state) as JsonValue);
  return {
    ...(inputFailures.length === 0 ? {} : { inputFailures }),
    ...(inputCascades.length === 0 ? {} : { inputCascades }),
    kind: "enginePopulationResult",
    scenarioId: scenario["id"] as string,
    deployments,
    steps: results,
    processStates,
  };
}

test("every population scenario answers through the hosted ingress driver exactly as through the kernel's runner", async (t) => {
  let compared = 0;
  for (const scenario of await discoverScenarios()) {
    if (scenario.kind !== DiscoveredKind.PopulationScenario) continue;
    const document = scenario.document;
    const sources = await populationPrograms(scenario.relativePath, document);
    const digests = populationStepDigests(document.steps);
    const expected = JSON.parse(JSON.stringify(runPopulation(sources, document, digests))) as JsonValue;
    const actual = JSON.parse(JSON.stringify(hosted(sources, document, digests))) as JsonValue;
    // The first disagreement only: a whole-result diff of a cascade at the kernel's bound would render megabytes.
    assert.equal(firstValueDisagreement(expected, actual, "result"), null, scenario.relativePath);
    compared += 1;
  }
  assert.ok(compared > 0, "population scenarios were found");
  t.diagnostic(`${String(compared)} population scenarios compared`);
});

// Under the host's own continuation and answer bounds the driver still answers as the kernel does wherever the kernel's
// answers fit the Query bound: the bytes stop only an answer that would not. The margin keeps room for the stop entry
// the fan-out reserves at each receiver (`roomFor` in `temporal-host` `population.ts`).
test("under the host's answer and continuation bounds the driver answers as the kernel wherever the kernel's answers fit", async (t) => {
  const bounded = { ...refinementFrame, continuationBytes: chainCapacity.continuationBytes, queryBytes: chainCapacity.queryBytes };
  const margin = 4_096;
  let compared = 0;
  let beyond = 0;
  for (const scenario of await discoverScenarios()) {
    if (scenario.kind !== DiscoveredKind.PopulationScenario) continue;
    const document = scenario.document;
    const sources = await populationPrograms(scenario.relativePath, document);
    const digests = populationStepDigests(document.steps);
    const expected = JSON.parse(JSON.stringify(runPopulation(sources, document, digests))) as Json;
    const answers = [...(expected["steps"] as readonly JsonValue[]), ...((expected["inputCascades"] ?? []) as readonly JsonValue[])];
    if (answers.some((answer) => canonicalBytes({ kind: "settled", answer }) > chainCapacity.queryBytes - margin)) {
      beyond += 1;
      continue;
    }
    const actual = JSON.parse(JSON.stringify(hosted(sources, document, digests, bounded))) as JsonValue;
    assert.equal(firstValueDisagreement(expected as JsonValue, actual, "result"), null, scenario.relativePath);
    compared += 1;
  }
  assert.ok(compared > 0 && beyond > 0, "scenarios on both sides of the bound were found");
  t.diagnostic(`${String(compared)} population scenarios compared under the host's bounds, ${String(beyond)} beyond them`);
});

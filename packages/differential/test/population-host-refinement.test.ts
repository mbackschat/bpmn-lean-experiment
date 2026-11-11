/**
 * The hosted population refines the kernel's: every population scenario runs through the ingress driver the Workflows
 * use (`@bpmn-lean/temporal-host` `population.ts`), each action answered in process over kernel states, and answers the
 * kernel population runner's deployments, command resolutions, input cascades, input failures and final instance
 * states exactly. Every receiver steps at its command's time, which the kernel runner also uses.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DeploymentOutcomeTag,
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
  type Program,
  type State,
} from "@bpmn-lean/kernel";
import type { HostView, JsonValue } from "@bpmn-lean/temporal-host/host";
import { MemoryPopulation, populationPort } from "@bpmn-lean/temporal-host/memory-host";

import { populationStepDigests } from "./population-digest.ts";
import { populationPrograms } from "./population-programs.ts";
import { DiscoveredKind, discoverScenarios, type PopulationScenarioDocument } from "./scenario-discovery.ts";

type Json = Readonly<Record<string, unknown>>;
const commandKinds = new Set(["publish", "broadcast", "evaluateConditions", "timerStart"]);

/** The kernel runner's result document for `document`, recomputed through the hosted driver. */
function hosted(sources: readonly unknown[], document: PopulationScenarioDocument, digests: readonly string[]): JsonValue {
  const scenario = document as unknown as Json;
  const profile = scenario["profile"] as string;
  const declared = (scenario["definitions"] as readonly Json[]).map((resource) =>
    ({ definitionRef: resource["definitionRef"] as string, ref: definitionRefFromJson(resource["bpmn"], profile, "definition") }));
  const steps = scenario["steps"] as readonly Json[];
  const stimuli = stimuliOfPopulation(declared, sources.map((json, index) => deploymentSourceFromJson(json, `source ${String(index)}`)),
    steps, digests, "population");
  const commandSteps = steps.filter((json) => commandKinds.has(json["kind"] as string));
  const population = new MemoryPopulation<Program, State>(populationPort,
    (program, state) => hostViewJson(hostView(program, state)) as unknown as HostView);
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
        const chain = population.chains.get(stimulus.instanceId);
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
        const answer = population.command(json["commandId"] as string, json["kind"] as string, command as JsonValue, stimulus.digest, stimulus.atMs);
        assert.ok(answer !== null, "the queue never fills in a scenario");
        const { atMs, ...rest } = answer as Json;
        results.push({ ...rest, at: atMs } as JsonValue);
        break;
      }
    }
  }
  const processStates = [...population.chains.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
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
    assert.deepEqual(actual, expected, scenario.relativePath);
    compared += 1;
  }
  assert.ok(compared > 0, "population scenarios were found");
  t.diagnostic(`${String(compared)} population scenarios compared`);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inlineWaitIdentityLookups, leanHeader } from "./lean-source-analysis.ts";

const scan = (source: string) => inlineWaitIdentityLookups("Fixture.lean", source);

test("inline wait keys retain scalar, occurrence, wrapper, and typed lookup variants", () => {
  for (const predicate of [
    "fun wait => decide (wait.processInstanceId = id.processInstanceId && wait.elementId.value = id.elementId.value && wait.activation = id.activation)",
    "fun candidate => decide (candidate.processInstanceId = instanceId) && decide (candidate.task.id = taskId) && decide (candidate.activation = activation)",
    "fun candidate => decide (candidate.processInstanceId = id.processInstanceId && candidate.task.id = ⟨id.elementId.value⟩ && candidate.activation = id.activation)",
    "fun renamed : MessageWait => renamed.processInstanceId == identity.processInstanceId && renamed.elementId.value == identity.elementId.value && renamed.activation == identity.activation",
    "fun deadline => decide (deadline.processInstanceId = id.processInstanceId ∧ deadline.elementId = id.elementId ∧ deadline.activation = id.activation)",
    "fun timer => timer.activation == id.activation && timer.processInstanceId == id.processInstanceId && timer.elementId.value == id.elementId.value",
    "fun wait => id.processInstanceId == wait.processInstanceId && id.elementId.value == wait.elementId.value && id.activation == wait.activation",
    "fun (wait : TimerWait) => wait.processInstanceId == id.processInstanceId && wait.elementId.value == id.elementId.value && wait.activation == id.activation",
    "fun incident => incident.wait.processInstanceId == id.processInstanceId && incident.wait.elementId.value == id.elementId.value && incident.wait.activation == id.activation",
  ]) {
    assert.equal(scan(`def selected := state.waits.filter (${predicate})`).length, 1, predicate);
  }
});

test("masked prose and literals cannot introduce or conceal a complete inline key", () => {
  const predicate = "fun timer => timer.processInstanceId == id.processInstanceId && timer.elementId.value == id.elementId.value && timer.activation == id.activation";
  assert.deepEqual(scan(`/- ${predicate} -/\ndef text := "${predicate}"\n-- ${predicate}`), []);
  assert.equal(scan(`def selected := state.timerWaits.find? ${predicate.replace("&&", "&& /- nested /- comment -/ -/")}`).length, 1);
});

test("named matchers and different owner, definition, or partial keys remain distinct", () => {
  for (const source of [
    "def selected := state.timerWaits.find? (timerIdNamesWait id)",
    "def selected := state.waits.filter (taskIdNamesWait id)",
    "def selected := state.waits.filter fun wait => wait.owner == root",
    "def selected := state.timerWaits.filter fun wait => wait.elementId == element",
    "def selected := state.timerWaits.filter fun wait => wait.processInstanceId == id.processInstanceId && wait.activation == id.activation",
  ]) assert.deepEqual(scan(source), []);
});

test("both JSON runners consume the same observation encoder", () => {
  for (const runner of ["SemanticProcessJsonMain", "EnginePopulationScenarioJsonMain"]) {
    const source = readFileSync(`BpmnSemantics/${runner}.lean`, "utf8");
    assert.ok(leanHeader(source).imports.some(({ module }) => module === "BpmnSemantics.SemanticProcessJson.Observation"));
    assert.doesNotMatch(source, /^(?:private\s+)?def\s+(?:stateObservationJson|processStatusJson|waitKindJson|enabledInteractionJson)\b/mu);
  }
});

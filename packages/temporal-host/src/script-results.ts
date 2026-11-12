/**
 * A scenario with its Script Tasks' recorded results, the differential's single source of a Script's result
 * ([script semantics](../../../docs/kernel/semantics/SCRIPT-SEMANTICS-SPEC.md#witness-plan)): Lean never evaluates
 * JavaScript, so the host evaluator computes each result once and every kernel target takes it as the same input.
 *
 * The run follows the kernel runner's rule: an input that commits opens the next, a rejected one that is not last is
 * passed over, and any other outcome ends it. After each committed input, every open Script effect the scenario has
 * not yet been answered for (by occurrence and failure count) is evaluated over its committed arguments, and its
 * result becomes an `effectResult` input right after, named `script-result:<element>:<activation>:<failures>`, so a
 * result opening another Script is answered in turn. Inputs after the run ends are kept as written.
 */
import { kernelPort } from "./kernel-port.js";
import { EffectResultKind, type EffectResult, type JsonValue } from "./port.js";
import { evaluateScript, type ScriptOptions } from "./script-handler.js";

type Stimulus = { readonly [key: string]: JsonValue };

function outcomeJson(result: EffectResult): JsonValue {
  switch (result.kind) {
    case EffectResultKind.Success:
      return { kind: "success", outputs: result.outputs.map(({ name, value }) => ({ name, value })) };
    case EffectResultKind.BusinessFailure:
      return { kind: "businessFailure", code: result.code, message: result.message, outputs: result.outputs.map(({ name, value }) => ({ name, value })) };
    case EffectResultKind.TechnicalFailure:
      return { kind: "technicalFailure" };
    case EffectResultKind.Unsupported:
      return { kind: "unsupported", code: result.code };
  }
}

/** The scenario with each Script's result inserted; one whose run opens no Script effect keeps its inputs. */
export function withScriptResults(programJson: JsonValue, scenarioJson: JsonValue, options: ScriptOptions): JsonValue {
  const program = kernelPort.decodeProgram(programJson);
  const scenario = scenarioJson as { readonly stimuli: readonly Stimulus[] };
  const pending = [...scenario.stimuli];
  const stimuli: Stimulus[] = [];
  const answered = new Set<string>();
  let state: Parameters<typeof kernelPort.encodeState>[0] | null = null;
  let running = kernelPort.admit(program) === null;
  while (pending.length > 0) {
    const stimulus = pending.shift()!;
    stimuli.push(stimulus);
    if (!running) continue;
    const step = kernelPort.step(program, state, kernelPort.decodeStimulus(stimulus).input);
    if (!step.committed) {
      running = step.rejected && pending.length > 0;
      continue;
    }
    state = step.state;
    const results: Stimulus[] = [];
    for (const wait of kernelPort.hostView(program, state).openWaits) {
      const script = wait.effect === undefined ? null : kernelPort.scriptOf(program, wait);
      if (wait.effect === undefined || script === null) continue;
      const commandId = `script-result:${wait.id.elementId}:${String(wait.id.activation)}:${String(wait.effect.failures)}`;
      const key = JSON.stringify([wait.id.processInstanceId, commandId]);
      if (answered.has(key)) continue;
      answered.add(key);
      const result = evaluateScript({ key: commandId, occurrence: wait.id, script, context: wait.effect.arguments }, options);
      results.push({
        kind: "effectResult", commandId,
        occurrence: { processInstanceId: wait.id.processInstanceId, elementId: wait.id.elementId, activation: wait.id.activation },
        outcome: outcomeJson(result),
      });
    }
    pending.unshift(...results);
  }
  return { ...scenario, stimuli } as JsonValue;
}

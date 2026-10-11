import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PARALLEL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID as profile, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";
import { source, prepareSource, overlayDocument } from "./sequential-scope-source-fixture.ts";

type OutputMappingShape = "single" | "distinct" | "shared";
type OutputMappingCommandInput = Readonly<{
  shape: OutputMappingShape; program: SemanticProcessProgram; start: StartProcessStimulus;
}>;

/** Source-derived PMIS inputs retain multiple output targets without constructing a runtime state. */
export async function parallelOutputMappingCommandInputs(): Promise<readonly OutputMappingCommandInput[]> {
  const { importBpmnGraph } = await import(new URL("../dist/moddle-adapter.js", import.meta.url).href
  ) as typeof import("../src/moddle-adapter.ts");
  const { compileParallelScopeSource } = await import(new URL("../dist/multi-instance-scope-source-compiler.js", import.meta.url).href
  ) as typeof import("../src/multi-instance-scope-source-compiler.ts");
  const { lowerCheckedProcess } = await import(new URL("../dist/semantic-process-lowering.js", import.meta.url).href
  ) as typeof import("../src/semantic-process-lowering.ts");
  const baseline = prepareSource(await readFile(source, "utf8")).replace('isSequential="true"', 'isSequential="false"');
  const output = '<camunda:outputParameter name="decision">${result}</camunda:outputParameter>';
  assert.equal(baseline.split(output).length, 2);
  const inputs: OutputMappingCommandInput[] = [];
  for (const shape of ["single", "distinct", "shared"] as const) {
    // SBT-RESULT-01 requires a submitted result even when a same-named input was captured at arming.
    const captured = shape === "distinct" ? '<camunda:inputParameter name="summaryResult">argument-only</camunda:inputParameter>' : "";
    const additional = shape === "single" ? "" : `<camunda:outputParameter name="summary">\${${shape === "distinct" ? "summaryResult" : "result"}}</camunda:outputParameter>`;
    const xml = baseline.replace(output, captured + output + additional);
    const imported = await importBpmnGraph(xml, 5000);
    assert.deepEqual(imported.warnings, []);
    const compiled = compileParallelScopeSource(imported.rootElement, { kind: "bpmnSource", id: `parallel-output-${shape}`,
      sha256: createHash("sha256").update(xml).digest("hex"), byteLength: Buffer.byteLength(xml),
      declaredEncoding: "UTF-8", decodedAs: "UTF-8" },
    { identity: { id: "parallel-output-bindings", sha256: "1".repeat(64) }, semanticProfile: profile,
      inertAttributes: [], effectBindings: overlayDocument.effectBindings });
    assert.deepEqual(compiled.diagnostics, []);
    assert.ok(compiled.checkedProcess);
    const program = lowerCheckedProcess(compiled.checkedProcess);
    inputs.push({ shape, program, start: { kind: StimulusKind.StartProcess, commandId: "start",
      processId: program.processId, instanceId: "invoices", initialVariables: [
        { name: "items", value: { kind: VariableValueKind.StringList, value: ["same-invoice", "same-invoice"] } },
      ] } });
  }
  return inputs;
}

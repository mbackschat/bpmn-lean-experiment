import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { isWellFormedSemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { source, prepareSource, sourceOverlay, profile } from "./sequential-scope-source-fixture.ts";

/** Exact source compilation preserves Service output declarations without constructing states or expected results. */
export async function sequentialOutputMappingSources() {
  const baseline = prepareSource(await readFile(source, "utf8"));
  const output = '<camunda:outputParameter name="decision">${result}</camunda:outputParameter>';
  assert.equal(baseline.split(output).length, 2);
  return Promise.all((["single", "distinct", "shared"] as const).map(async shape => {
    // SBT-RESULT-01 requires submitted results even when a same-named input was captured at arming.
    const captured = shape === "distinct" ? '<camunda:inputParameter name="summaryResult">argument-only</camunda:inputParameter>' : "";
    const additional = shape === "single" ? "" : `<camunda:outputParameter name="summary">\${${shape === "distinct" ? "summaryResult" : "result"}}</camunda:outputParameter>`;
    const bytes = baseline.replace(output, captured + output + additional);
    const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(bytes), sourceId: `sequential-output-${shape}`,
      expectedSha256: undefined, semanticProfile: profile, sourceOverlay: sourceOverlay(),
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 5000 } });
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted, JSON.stringify(compiled.diagnostics));
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error(`source rejected: ${shape}`);
    assert.deepEqual(compiled.copyExactBytes(), new TextEncoder().encode(bytes));
    assert.equal(isWellFormedSemanticProcessProgram(compiled.semanticProcess), true);
    return { shape, bytes, program: compiled.semanticProcess, checkedProcess: compiled.checkedProcess };
  }));
}

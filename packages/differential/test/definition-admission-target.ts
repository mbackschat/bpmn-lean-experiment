import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

import type { CheckedProcess, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { parseWireJson } from "../../../scripts/strict-json.ts";
import { runLeanDriver } from "./semantic-differential-targets.ts";

export type DefinitionAdmissionInput = Readonly<{
  scenarioId: string;
  checkedProcess: CheckedProcess;
  semanticProcess: SemanticProcessProgram;
}>;
export type DefinitionAdmissionResult = Readonly<{
  scenarioId: string;
  checkedWellFormed: boolean;
  programWellFormed: boolean;
  programProfileCapabilitiesValid: boolean;
}>;

/** Reads independent gates from answer-free inputs; callers own their expected vectors. */
export async function readDefinitionAdmissionVectors(
  inputPath: string,
  inputs: ReadonlyArray<DefinitionAdmissionInput>,
): Promise<ReadonlyArray<DefinitionAdmissionResult>> {
  assert.ok(inputs.length > 0, "admission batch needs a positive control and separating inputs");
  await writeFile(inputPath, `${inputs.map(input => JSON.stringify(input)).join("\n")}\n`);
  const execution = await runLeanDriver("BpmnSemantics/DefinitionAdmissionJsonMain.lean", [inputPath], inputs.length);
  const records = execution.stdout.split("\n").filter(line => line.length > 0).map(line => parseWireJson<DefinitionAdmissionResult>(line, "Lean admission result"));
  assert.deepEqual(records.map(record => record.scenarioId), inputs.map(input => input.scenarioId));
  return records;
}

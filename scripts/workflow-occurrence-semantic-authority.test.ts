import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const workflowOccurrenceRoot = path.join(
  repositoryRoot,
  "packages/temporal-adapter/workflow/src",
);

const forbiddenSemanticInterpretation = [
  "SemanticOperationKind",
  "SemanticTransitionKind",
  "StimulusKind",
  "EffectExecutionResultKind",
  "program.operations",
  "program.operationScopes",
  "program.definitionScopes",
  "transition.kind",
  "operation.kind",
  "stimulus.kind",
] as const;

test("keeps exhaustive flow-node lifecycle interpretation out of Workflow", async () => {
  assert.deepEqual(await workflowOccurrenceAuthorityFindings(), []);
});

test("rejects operation, stimulus, and Program-topology lifecycle reconstruction", () => {
  assert.deepEqual(
    occurrenceSourceFindings(
      "flow-node-occurrence-publication-substitute.ts",
      [
        "switch (record.transition.kind) {}",
        "switch (operation.kind) {}",
        "switch (stimulus.kind) {}",
        "program.operations.filter(() => true);",
      ].join("\n"),
    ),
    [
      "flow-node-occurrence-publication-substitute.ts: program.operations",
      "flow-node-occurrence-publication-substitute.ts: transition.kind",
      "flow-node-occurrence-publication-substitute.ts: operation.kind",
      "flow-node-occurrence-publication-substitute.ts: stimulus.kind",
    ],
  );
});

async function workflowOccurrenceAuthorityFindings(): Promise<string[]> {
  const files = (await readdir(workflowOccurrenceRoot))
    .filter((file) =>
      file.startsWith("flow-node-occurrence-publication-") &&
      file.endsWith(".ts")
    )
    .sort();
  const findings: string[] = [];
  for (const file of files) {
    const relativePath = path.posix.join(
      "packages/temporal-adapter/workflow/src",
      file,
    );
    findings.push(...occurrenceSourceFindings(
      relativePath,
      await readFile(path.join(workflowOccurrenceRoot, file), "utf8"),
    ));
  }
  return findings;
}

function occurrenceSourceFindings(
  relativePath: string,
  source: string,
): string[] {
  return forbiddenSemanticInterpretation.flatMap((fragment) =>
    source.includes(fragment) ? [`${relativePath}: ${fragment}`] : []
  );
}

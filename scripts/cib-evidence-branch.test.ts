import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

// Evidence commits ea7614306 and f73639625 changed what the corpus map records per model without regenerating it, so the
// corpus guard failed from them on; 043190d3a and 86c66a097 repaired the same lag by hand.
test("the evidence branch regenerates the corpus map after writing the evidence and commits both together", async () => {
  const workflow = await readFile(path.join(projectRoot, ".github/workflows/cib-evidence-branch.yml"), "utf8");
  const at = (needle: string): number => {
    const index = workflow.indexOf(needle);
    assert.notEqual(index, -1, `the workflow contains ${needle}`);
    return index;
  };
  const install = at("node scripts/cib-evidence-shards.ts install");
  const build = at("run: ./scripts/pnpm.sh run build:differential\n");
  const render = at("run: ./scripts/pnpm.sh run render:corpus-map\n");
  const commit = at("git commit -m");
  assert.ok(install < build && build < render && render < commit, "install evidence, build, render, then commit");
  assert.match(workflow, /git add scenarios model-corpus\/EXECUTABLE-MODEL-CORPUS-MAP\.md model-corpus\/retained-model-capabilities\.json\n/u);
  assert.match(workflow, /\.\/scripts\/setup-external-sources\.sh verify\n\s+\.\/scripts\/setup-external-sources\.sh research cibseven\/cibseven uniba-dsg\/betsy\n/u,
    "the corpus reads the pinned external models the integration lane provisions");
  assert.match(workflow, /BPMN_EXTERNAL_ROOT=[^\n]*pwd\)[^\n]*>> "\$GITHUB_ENV"/u);
  const renderStep = workflow.slice(render - 200, render + 60);
  assert.doesNotMatch(renderStep, /\|\||continue-on-error|if: always\(\)/u, "a failing renderer fails the workflow");
  assert.doesNotMatch(workflow, /continue-on-error/u);
  assert.match(workflow, /^ {4}timeout-minutes: 10$/mu, "the delivery job keeps its 10-minute limit");
});

/**
 * Writes the engine deployment of `compose.yaml` (the `x-engine-deployment` anchor the platform API and recovery Worker
 * read) from the repository's profile catalog, so a profile that selects a relation never leaves the evaluation
 * distribution behind. The anchor went stale by hand three times (`21093ec91`, `2b3614f1d`, PR #71's first run), each
 * caught only by `evaluation-distribution.platform-test.ts`, which still verifies the complete output.
 *
 * `node scripts/compose-engine-deployment.ts` exits 1 when the anchor differs; `--write` rewrites it.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { showcaseEngineDeployment } from "../showcase/engine-deployment.ts";

const composePath = new URL("../compose.yaml", import.meta.url);
const anchor = /^x-engine-deployment: &engine-deployment '[^'\n]+'$/mu;

/** `compose` with its engine deployment anchor holding the current profile catalog. */
export function withCurrentEngineDeployment(compose: string): string {
  if (!anchor.test(compose)) throw new Error("compose.yaml must define the engine deployment once, as a YAML anchor");
  const line = `x-engine-deployment: &engine-deployment '${JSON.stringify(showcaseEngineDeployment())}'`;
  return compose.replace(anchor, line);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const compose = readFileSync(composePath, "utf8");
  const current = withCurrentEngineDeployment(compose);
  if (process.argv.includes("--write")) {
    writeFileSync(composePath, current);
  } else if (current !== compose) {
    process.stderr.write("compose.yaml's engine deployment is stale: run node scripts/compose-engine-deployment.ts --write\n");
    process.exit(1);
  }
}

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const replace = process.argv.includes("--replace");

const cases = [
  {
    name: "create-document",
    legacyEvidence:
      "adoption/a12/legacy/source-tree/scenarios/create-document-data/cibseven-evidence.json",
    currentScenario: "adoption/a12/current/create-document/scenario.json",
    currentProfile:
      "profiles/cibseven-2.0.0-mapped-success-service-task-draft/profile.json",
    currentEvidence:
      "adoption/a12/current/create-document/cibseven-evidence.json",
  },
  {
    name: "boundary-error",
    legacyEvidence:
      "adoption/a12/legacy/source-tree/scenarios/boundary-error/cibseven-evidence.json",
    currentScenario: "adoption/a12/current/boundary-error/scenario.json",
    currentProfile:
      "profiles/cibseven-2.0.0-mapped-boundary-error-service-task-draft/profile.json",
    currentEvidence:
      "adoption/a12/current/boundary-error/cibseven-evidence.json",
  },
] as const;

for (const evidenceCase of cases) {
  const [legacyBytes, scenarioBytes, profileBytes] = await Promise.all([
    readRelative(evidenceCase.legacyEvidence),
    readRelative(evidenceCase.currentScenario),
    readRelative(evidenceCase.currentProfile),
  ]);
  const legacy = JSON.parse(legacyBytes.toString("utf8")) as Record<string, unknown>;
  const scenario = JSON.parse(scenarioBytes.toString("utf8")) as {
    readonly id: string;
    readonly profile: string;
  };
  const expected = Buffer.from(`${JSON.stringify({
    ...legacy,
    scenario: { id: scenario.id, sha256: sha256(scenarioBytes) },
    profile: { id: scenario.profile, sha256: sha256(profileBytes) },
  }, null, 2)}\n`);
  const target = path.join(projectRoot, evidenceCase.currentEvidence);
  if (replace) {
    await writeFile(target, expected);
    console.log(`A12_ADOPTION_EVIDENCE_REPLACED case=${evidenceCase.name}`);
    continue;
  }
  const actual = await readFile(target);
  if (!actual.equals(expected)) {
    throw new Error(
      `${evidenceCase.currentEvidence} is stale; run node scripts/replace-a12-adoption-evidence.ts --replace`,
    );
  }
}

if (!replace) {
  console.log(`A12_ADOPTION_EVIDENCE_OK cases=${cases.length}`);
}

function readRelative(relativePath: string): Promise<Buffer> {
  return readFile(path.join(projectRoot, relativePath));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

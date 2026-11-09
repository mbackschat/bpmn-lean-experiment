/**
 * The scenario artifact sets, discovered from `scenarios/` rather than listed (guard 14 of the kernel rewrite proposal:
 * scenarios are discovered from directories and counts are derived, never written).
 *
 * A scenario file is `scenario.json` or `<name>.scenario.json`; its retained CIB evidence, when it has any, is the
 * sibling file with `scenario.json` replaced by `cibseven-evidence.json`. A scenario with evidence is a CIB artifact case;
 * one without is a normative case. Most normative cases bind a normative profile; a cumulative CIB profile grown with
 * standards-only schedules also appears there, provided a CIB artifact case still binds it.
 * `capsule-roundtrip.ts` holds the other direction: every evidence file and profile is reached from a scenario.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareCanonicalStrings } from "./strict-json.ts";

export type ArtifactCase = Readonly<{
  scenarioRelativePath: string;
  evidenceRelativePath: string;
}>;

export type NormativeArtifactCase = Readonly<{
  scenarioRelativePath: string;
}>;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/** The evidence path a scenario path pairs with, whether or not that file exists. */
export function evidenceRelativePathFor(scenarioRelativePath: string): string {
  return scenarioRelativePath.replace(/scenario\.json$/u, "cibseven-evidence.json");
}

function discoveredScenarioRelativePaths(): ReadonlyArray<string> {
  const entries = readdirSync(path.join(projectRoot, "scenarios"), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && (entry.name === "scenario.json" || entry.name.endsWith(".scenario.json")))
    .map((entry) =>
      path.posix.join("scenarios", path.relative(path.join(projectRoot, "scenarios"), entry.parentPath).split(path.sep).join("/"), entry.name))
    .sort(compareCanonicalStrings);
}

const scenarioRelativePaths = discoveredScenarioRelativePaths();

export const artifactCases: ReadonlyArray<ArtifactCase> = Object.freeze(
  scenarioRelativePaths
    .filter((scenarioRelativePath) => existsSync(path.join(projectRoot, evidenceRelativePathFor(scenarioRelativePath))))
    .map((scenarioRelativePath) => Object.freeze({
      scenarioRelativePath,
      evidenceRelativePath: evidenceRelativePathFor(scenarioRelativePath),
    })),
);

export const normativeArtifactCases: ReadonlyArray<NormativeArtifactCase> = Object.freeze(
  scenarioRelativePaths
    .filter((scenarioRelativePath) => !existsSync(path.join(projectRoot, evidenceRelativePathFor(scenarioRelativePath))))
    .map((scenarioRelativePath) => Object.freeze({ scenarioRelativePath })),
);

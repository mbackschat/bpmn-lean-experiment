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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareCanonicalStrings, parseStrictJson } from "./strict-json.ts";

export type ArtifactCase = Readonly<{
  scenarioRelativePath: string;
  evidenceRelativePath: string;
}>;

export type NormativeArtifactCase = Readonly<{
  scenarioRelativePath: string;
}>;

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

/**
 * Witnesses of open coverage rows: answer-free scenarios whose CIB answer is fixed before the row's code (PLAN order
 * gate). They claim no capability, so the claim guards (the kernel codec's reading of their values, the executable
 * capability catalog, corpus claiming) skip them while every mechanical guard still applies; a row's track moves its
 * witnesses into `scenarios/` when the row closes.
 */
export const openRowScenarioRoot = "scenarios/open-rows/";
export const openRowOwnersRelativePath = `${openRowScenarioRoot}owners.json`;

/** The coverage rows each directory under `scenarios/open-rows/` witnesses, from the machine-owned `owners.json`. */
export function readOpenRowOwners(root: string = projectRoot): ReadonlyMap<string, ReadonlyArray<string>> {
  const owners = parseStrictJson<Record<string, ReadonlyArray<string>>>(
    readFileSync(path.join(root, openRowOwnersRelativePath), "utf8"), openRowOwnersRelativePath);
  return new Map(Object.entries(owners));
}

export const isOpenRowWitness = (scenarioRelativePath: string): boolean =>
  scenarioRelativePath.startsWith(openRowScenarioRoot);

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

/**
 * Every scenario whose profile names a CIB oracle and whose provenance names a CIB revision, with or without evidence
 * yet: the set an evidence production run covers, since a profile that claims an oracle claims it for each scenario it
 * binds. A `not-applicable` revision declares a standards-only schedule with no CIB counterpart.
 */
export const oracleEvidenceCases: ReadonlyArray<ArtifactCase> = Object.freeze(
  scenarioRelativePaths
    .filter((scenarioRelativePath) => {
      const scenario = JSON.parse(readFileSync(path.join(projectRoot, scenarioRelativePath), "utf8")) as
        { profile: string; provenance: { cibRevision: string } };
      if (scenario.provenance.cibRevision === "not-applicable") return false;
      const profile = JSON.parse(readFileSync(path.join(projectRoot, "profiles", scenario.profile, "profile.json"), "utf8")) as
        { oracle?: unknown };
      return profile.oracle !== undefined;
    })
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

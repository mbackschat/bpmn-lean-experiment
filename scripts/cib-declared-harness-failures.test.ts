import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { declaredCibHarnessFailures } from "./cib-declared-harness-failures.ts";
import { populationEvidenceCases } from "./cibseven-population-evidence.ts";
import { oracleEvidenceCases } from "./contract-artifact-cases.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("declares only scenarios the CIB replay runs, none of which retains evidence", () => {
  const cases = [...oracleEvidenceCases, ...populationEvidenceCases(projectRoot)];
  for (const scenarioRelativePath of declaredCibHarnessFailures.keys()) {
    const artifactCase = cases.find((candidate) => candidate.scenarioRelativePath === scenarioRelativePath);
    assert.ok(artifactCase !== undefined, `${scenarioRelativePath} is no case of the CIB replay`);
    assert.equal(
      existsSync(path.join(projectRoot, artifactCase.evidenceRelativePath)),
      false,
      `${scenarioRelativePath} is declared unanswerable but retains CIB evidence`,
    );
  }
});

test("names an existing register entry or a rule in an existing source file for every declared failure", () => {
  const register = readFileSync(path.join(projectRoot, "docs/CIB-BPMN-RELATION-REGISTER.md"), "utf8");
  for (const [scenarioRelativePath, declaration] of declaredCibHarnessFailures) {
    if (declaration.kind === "register") {
      assert.match(register, new RegExp(`^### ${declaration.entry}[ :]`, "mu"), `${scenarioRelativePath}: ${declaration.entry}`);
    } else if (declaration.kind === "protocol") {
      const [file, symbol] = declaration.rule.split("#");
      assert.ok(symbol !== undefined && symbol.length > 0, `${scenarioRelativePath}: ${declaration.rule} names no symbol`);
      assert.match(
        readFileSync(path.join(projectRoot, file!), "utf8"),
        new RegExp(`\\b${symbol}\\b`, "u"),
        `${scenarioRelativePath}: ${declaration.rule}`,
      );
    }
  }
});

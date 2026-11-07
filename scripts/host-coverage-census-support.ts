import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The declaration scanner shared by the host-coverage censuses of the Activity host
 * (docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#new-guard-the-host-coverage-census) and the scope host
 * (docs/capsules/SCOPE-HOST-FLOW-LISTS-PROPOSAL.md#host-coverage-census-extended).
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export type Declaration = Readonly<{ path: string; name: string; body: string }>;

export const leanWildcard = /\|\s*_\s*(=>|,)|\|\s*_\s*$/mu;

export function read(relativePath: string): string {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function trackedFiles(...roots: string[]): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...roots], {
    cwd: projectRoot,
    encoding: "utf8",
  }).split("\n").filter((file) => file.length > 0).sort();
}

/** Column-zero declarations; a Lean body runs to the next column-zero line that is not a continuation. */
export function leanDeclarations(file: string, source: string): Declaration[] {
  const start = /^(?:@\[[^\]]*\]\s*)?(?:(?:private|protected|noncomputable|partial|public)\s+)*(def|theorem|abbrev|instance)\s+([^\s(:]+)/u;
  const declarations: Array<{ path: string; name: string; kind: string; lines: string[] }> = [];
  let current: (typeof declarations)[number] | null = null;
  for (const line of source.split("\n")) {
    const match = line.match(start);
    if (match !== null) {
      current = { path: file, name: match[2] ?? "", kind: match[1] ?? "", lines: [] };
      declarations.push(current);
    } else if (line.length > 0 && !/^\s/u.test(line) && !line.startsWith("--")) {
      current = null;
    }
    current?.lines.push(line);
  }
  return declarations.filter(({ kind }) => kind !== "theorem")
    .map(({ path: declarationPath, name, lines }) => ({ path: declarationPath, name, body: lines.join("\n") }));
}

/** Column-zero functions; a body runs to its column-zero closing brace. */
export function typeScriptDeclarations(file: string, source: string): Declaration[] {
  const start = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/u;
  const declarations: Array<{ path: string; name: string; lines: string[] }> = [];
  let current: (typeof declarations)[number] | null = null;
  for (const line of source.split("\n")) {
    const match = line.match(start);
    if (match !== null) {
      current = { path: file, name: match[1] ?? "", lines: [] };
      declarations.push(current);
    }
    current?.lines.push(line);
    if (current !== null && line.startsWith("}")) current = null;
  }
  return declarations.map(({ path: declarationPath, name, lines }) => ({ path: declarationPath, name, body: lines.join("\n") }));
}

/** Every production Lean declaration outside experiments, conformance checks and fixtures. */
export function leanProductionDeclarations(): Declaration[] {
  return trackedFiles("BpmnSemantics")
    .filter((file) => file.endsWith(".lean") && !file.includes("/Experiments/") &&
      !/Conformance|Fixtures/u.test(path.basename(file)))
    .flatMap((file) => leanDeclarations(file, read(file)));
}

/** Every production TypeScript function of the packages and the platform contracts. */
export function typeScriptProductionDeclarations(): Declaration[] {
  return trackedFiles("packages", "platform/contracts/src")
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts") && !file.includes("/test/") &&
      !file.includes("/dist/"))
    .flatMap((file) => typeScriptDeclarations(file, read(file)));
}

/** A TypeScript reader that may skip a kind: one without an exhaustiveness assertion. */
export function nonExhaustive(declaration: Declaration): boolean {
  return !/assertNever\w*\(/u.test(declaration.body);
}

export const key = ({ path: declarationPath, name }: Readonly<{ path: string; name: string }>): string =>
  `${declarationPath}::${name}`;

/** The declaration a site names, found by its last name component. */
export function siteDeclaration(site: Readonly<{ path: string; name: string }>): Declaration | undefined {
  const source = read(site.path);
  const declarations = site.path.endsWith(".lean") ? leanDeclarations(site.path, source) : typeScriptDeclarations(site.path, source);
  return declarations.find(({ name }) => name === site.name || name.endsWith(`.${site.name}`));
}

/** The digest of each named `SemanticOperation` constructor's declaration text in the Lean contract. */
export function leanConstructorDigests(selected: (name: string, text: string) => boolean): Record<string, string> {
  const source = read("BpmnSemantics/SemanticProcessContract.lean");
  const digests: Record<string, string> = {};
  const start = source.indexOf("inductive SemanticOperation where");
  const constructorBlock = source.slice(start, source.indexOf("\n\n", start));
  for (const match of constructorBlock.matchAll(/^  \| (\w+)\b[^\n]*(?:\n {6,}[^\n]*)*/gmu)) {
    const name = match[1] ?? "";
    if (selected(name, match[0])) {
      digests[`constructor ${name}`] = createHash("sha256").update(match[0]).digest("hex");
    }
  }
  return digests;
}

/** The digest of a column-zero Lean structure in the contract, through its indented fields. */
export function leanStructureDigest(name: string): string | null {
  const match = read("BpmnSemantics/SemanticProcessContract.lean")
    .match(new RegExp(`^structure ${name} where\\n(?: {2,}[^\\n]*\\n)*`, "mu"));
  return match === null ? null : createHash("sha256").update(match[0]).digest("hex");
}

/** Entries of a reviewed allowlist whose declaration left its population. */
export function staleEntries(allowlist: Readonly<Record<string, string>>, population: ReadonlyArray<Declaration>): string[] {
  const live = new Set(population.map(key));
  return Object.keys(allowlist).filter((entry) => !live.has(entry));
}

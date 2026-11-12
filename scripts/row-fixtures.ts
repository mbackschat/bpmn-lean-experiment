/**
 * The row fixtures of guard 21 (docs/kernel/ARCHITECTURE-SPEC.md#guardrails-against-degradation), generated.
 *
 * `packages/kernel/test/fixtures/rows/sources.json` names, for every row the traceability map gives a fixture, the BPMN
 * source whose IL is that row's fixture: a source a discovered scenario binds, read with that scenario's profile, overlay
 * and decisions, or a model of `models/` read with no overlay. Each source is lowered by the reader path the kernel oracle
 * uses (`readSourceFor`, `readCaseSource`), never by a second lowering, and written in the kernel codec's canonical
 * encoding, which the generator checks the reader's output already is.
 *
 * `node scripts/row-fixtures.ts --write` regenerates the fixtures; `--check` fails on a stale, missing or extra one.
 * `packages/differential/test/row-fixtures.integration-test.ts` runs the check in the oracle's lane, so the guard
 * verifies the generator's complete output. Both need the built packages (`pnpm build:differential`).
 *
 * The hand-written host-function kernel fixtures take their programs' options from the same place: `--write` sets each
 * program's options to the ones its `identity.profile` selects, as a read source's are, and `--check` fails on a fixture
 * whose options are stale, so a relation a profile gains reaches them (#110). Their expected answers stay hand-checked.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { KernelJson } from "../packages/bpmn-source/src/index.ts";

import { canonicalKernelProgram, profileKernelOptions, readCaseSource } from "../packages/differential/test/kernel-program.ts";
import { readSourceFor, type SourceDefinition } from "../packages/differential/test/scenario-discovery.ts";
import { traceabilityEntries } from "./kernel-guards-refusal.ts";
import { compareCanonicalStrings, parseWireJson } from "./strict-json.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export const rowFixtureDirectory = "packages/kernel/test/fixtures/rows";
export const hostFunctionFixtureDirectory = "packages/kernel/test/fixtures/host-functions";
const manifestName = "sources.json";
const modelDirectory = "models";

export type RowSource = Readonly<{
  /** The scenario that binds `source`, or `null` for a model of `models/` no scenario binds. */
  scenario: string | null;
  source: string;
  profile: string;
  /** The DMN resources a model of `models/` deploys with; a scenario binds its own. */
  decisions?: ReadonlyArray<string>;
  /** Why this source carries the row, where the choice needed judgment. */
  note?: string;
}>;

type ScenarioDocument = Readonly<{
  profile: string;
  bpmn?: SourceDefinition;
  definitions?: ReadonlyArray<Readonly<{ bpmn: SourceDefinition }>>;
}>;

/** The manifest, one entry per row. */
export function readRowSources(root: string = projectRoot): ReadonlyMap<string, RowSource> {
  const manifest = parseWireJson<Record<string, RowSource>>(
    readFileSync(path.join(root, rowFixtureDirectory, manifestName), "utf8"), manifestName);
  return new Map(Object.entries(manifest));
}

async function lower(row: string, entry: RowSource): Promise<KernelJson> {
  if (entry.scenario === null) {
    if (!entry.source.startsWith(`${rowFixtureDirectory}/${modelDirectory}/`)) {
      throw new Error(`${row}: a source no scenario binds lives in ${rowFixtureDirectory}/${modelDirectory}/`);
    }
    const bound = (relativePath: string) => {
      const bytes = readFileSync(path.join(projectRoot, relativePath));
      return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
    };
    const decisions = (entry.decisions ?? []).map(bound);
    const read = await readCaseSource({ relativePath: entry.source, ...bound(entry.source), overlay: null, decisions }, entry.profile);
    if (read.kind === "refused") throw new Error(`${row}: the reader refuses ${entry.source}: ${read.code}`);
    return read.program;
  }
  const document = parseWireJson<ScenarioDocument>(readFileSync(path.join(projectRoot, entry.scenario), "utf8"), entry.scenario);
  if (entry.decisions !== undefined) throw new Error(`${row}: a scenario binds its own decisions`);
  if (document.profile !== entry.profile) throw new Error(`${row}: ${entry.scenario} binds profile ${document.profile}`);
  const sources = document.bpmn === undefined ? (document.definitions ?? []).map(({ bpmn }) => bpmn) : [document.bpmn];
  const source = sources.find(({ relativePath }) => relativePath === entry.source);
  if (source === undefined) throw new Error(`${row}: ${entry.scenario} binds no source ${entry.source}`);
  const read = await readSourceFor(entry.scenario, source, entry.profile);
  if (read.kind === "refused") throw new Error(`${row}: the reader refuses ${entry.source}: ${read.code}`);
  return read.program;
}

/** `value` with every object's keys in code-unit order, so a comparison ignores construction order. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort(compareCanonicalStrings)
    .map((key) => [key, sortedKeys((value as Record<string, unknown>)[key])]));
}

/** The fixture text of one lowered program: the codec's canonical encoding, which must equal the reader's output. */
function fixtureText(row: string, program: KernelJson): string {
  const decoded = canonicalKernelProgram(program);
  if (!decoded.ok) throw new Error(`${row}: the reader's program does not decode: ${decoded.refusal}`);
  const canonical = decoded.value;
  if (JSON.stringify(sortedKeys(canonical)) !== JSON.stringify(sortedKeys(program))) {
    throw new Error(`${row}: the reader's program is not in the codec's canonical encoding`);
  }
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

/** Fixture file name to text, for every row the traceability map gives a fixture; the manifest must name exactly those rows. */
export async function generateRowFixtures(root: string = projectRoot): Promise<ReadonlyMap<string, string>> {
  const sources = readRowSources(root);
  const fixtures = new Map<string, string>();
  const rows = new Set<string>();
  for (const [row, { fixture }] of traceabilityEntries(root)) {
    if (fixture === "n/a") continue;
    rows.add(row);
    const entry = sources.get(row);
    if (entry === undefined) throw new Error(`${row}: ${manifestName} names no source`);
    fixtures.set(fixture, fixtureText(row, await lower(row, entry)));
  }
  const extra = [...sources.keys()].filter((row) => !rows.has(row));
  if (extra.length > 0) throw new Error(`${manifestName} names rows with no fixture: ${extra.join(", ")}`);
  return fixtures;
}

/** How `directory` departs from the `expected` fixtures: a stale, missing or extra fixture file. */
export function rowFixtureDrift(expected: ReadonlyMap<string, string>, directory: string): string[] {
  const present = existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name !== manifestName).map(({ name }) => name)
    : [];
  return [
    ...[...expected].flatMap(([name, text]) => {
      const file = path.join(directory, name);
      if (!existsSync(file)) return [`${name} is missing`];
      return readFileSync(file, "utf8") === text ? [] : [`${name} is stale`];
    }),
    ...present.filter((name) => !expected.has(name)).map((name) => `${name} is not generated`),
  ].sort(compareCanonicalStrings);
}

type HostFunctionFixture = Readonly<{
  entry: string;
  input: unknown;
  programs: ReadonlyArray<Readonly<{ identity: Readonly<{ profile: string }>; options: unknown }>>;
}>;

/**
 * File name to text of every host-function fixture in `directory`, each program's options replaced by the ones its
 * profile in `root` selects, in the fixtures' layout: one line per program.
 */
export function generateHostFunctionFixtures(
  root: string = projectRoot, directory: string = path.join(root, hostFunctionFixtureDirectory),
): ReadonlyMap<string, string> {
  const names = readdirSync(directory).filter((name) => name.endsWith(".kernel-fixture.json")).sort(compareCanonicalStrings);
  return new Map(names.map((name) => {
    const { entry, input, programs } = parseWireJson<HostFunctionFixture>(readFileSync(path.join(directory, name), "utf8"), name);
    const lines = programs.map((program) => `    ${JSON.stringify({ ...program, options: profileKernelOptions(program.identity.profile, root) })}`);
    const text = `{\n  "entry": ${JSON.stringify(entry)},\n  "input": ${JSON.stringify(input)},\n  "programs": [\n${lines.join(",\n")}\n  ]\n}\n`;
    return [name, text] as const;
  }));
}

/** The host-function fixtures in `directory` whose text is not `expected`'s. */
export function hostFunctionFixtureDrift(expected: ReadonlyMap<string, string>, directory: string): string[] {
  return [...expected].filter(([name, text]) => readFileSync(path.join(directory, name), "utf8") !== text)
    .map(([name]) => `${name} is stale`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") throw new TypeError("usage: node scripts/row-fixtures.ts --write|--check");
  const expected = await generateRowFixtures();
  const directory = path.join(projectRoot, rowFixtureDirectory);
  const hostFunctions = generateHostFunctionFixtures();
  const hostDirectory = path.join(projectRoot, hostFunctionFixtureDirectory);
  if (mode === "--write") {
    for (const [name, text] of expected) writeFileSync(path.join(directory, name), text);
    for (const [name, text] of hostFunctions) writeFileSync(path.join(hostDirectory, name), text);
  } else {
    const drift = [...rowFixtureDrift(expected, directory), ...hostFunctionFixtureDrift(hostFunctions, hostDirectory)];
    for (const line of drift) process.stderr.write(`${line}\n`);
    process.exitCode = drift.length === 0 ? 0 : 1;
  }
}

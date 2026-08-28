import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanMarkdownAnchors } from "./markdown-link-lexer.ts";

const SourcePaths = {
  Ledger: "docs/BPMN-REQUIREMENT-LEDGER.md",
  Testing: "docs/TESTING-SPEC.md",
} as const;

const Sections = {
  Ledger: "Process Execution mechanism-family map",
  Testing: "Mechanism-maturity classifications",
} as const;

const Classifications = {
  InvariantCoverage: ["open", "slice-local", "reusable"],
  ActivityOccurrenceAdoption: ["not-applicable", "open", "slice-local", "shared"],
  MultipleEnabledClosure: ["not-reachable", "open", "rejected", "order-invariant", "explicit-choice", "mixed"],
  CompositionEvidence: ["open", "profile-local", "reusable", "mixed"],
} as const;

export type MechanismMaturitySources = Readonly<{
  ledger: string;
  testing: string;
}>;

type DimensionCell = Readonly<{
  classification: string;
  evidence: string;
  owner: string;
}>;

export type MechanismMaturityRow = Readonly<{
  familyId: string;
  familyDisposition: string;
  mechanismObligation: string;
  invariantCoverage: DimensionCell;
  activityOccurrenceAdoption: DimensionCell;
  multipleEnabledClosure: DimensionCell;
  compositionEvidence: DimensionCell;
}>;

export type MechanismMaturityAssessment = Readonly<{
  findings: ReadonlyArray<string>;
  rows: ReadonlyArray<MechanismMaturityRow>;
}>;

export type MechanismMaturityVector = Readonly<{
  schemaVersion: 1;
  kind: "non-conformance-mechanism-maturity";
  sources: Readonly<{
    familyMap: string;
    invariantCoverage: string;
    activityOccurrenceAdoption: string;
    multipleEnabledClosure: string;
    compositionEvidence: string;
  }>;
  families: ReadonlyArray<MechanismMaturityRow>;
}>;

type Table = Readonly<{
  headers: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<string>>;
}>;

type ParsedClassifications = Readonly<{
  entries: ReadonlyMap<string, Readonly<{
    invariantCoverage: DimensionCell;
    activityOccurrenceAdoption: DimensionCell;
    multipleEnabledClosure: DimensionCell;
    compositionEvidence: DimensionCell;
  }>>;
  ids: ReadonlySet<string>;
  findings: ReadonlyArray<string>;
}>;

function section(markdown: string, heading: string): string | null {
  const lines = markdown.split("\n");
  const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;
  const start = lines.findIndex((line) => headingPattern.exec(line)?.[2] === heading);
  if (start === -1) return null;
  const level = headingPattern.exec(lines[start] ?? "")?.[1]?.length ?? 0;
  const endOffset = lines.slice(start + 1).findIndex((line) => {
    const match = headingPattern.exec(line);
    return match !== null && (match[1]?.length ?? 0) <= level;
  });
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join("\n");
}

function tableCells(line: string): ReadonlyArray<string> {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
}

function tableInSection(markdown: string, heading: string, expectedHeaders: ReadonlyArray<string>): Table | null {
  const source = section(markdown, heading);
  if (source === null) return null;
  const lines = source.split("\n");
  const headerIndex = lines.findIndex((line) => {
    const cells = tableCells(line);
    return cells.length === expectedHeaders.length && cells.every((cell, index) => cell === expectedHeaders[index]);
  });
  if (headerIndex === -1) return null;
  const separator = tableCells(lines[headerIndex + 1] ?? "");
  if (separator.length !== expectedHeaders.length || separator.some((cell) => !/^:?-{3,}:?$/u.test(cell))) return null;
  const contiguousRows: Array<ReadonlyArray<string>> = [];
  for (const cells of lines.slice(headerIndex + 2).map(tableCells)) {
    if (cells.length === 0) break;
    contiguousRows.push(cells);
  }
  return { headers: expectedHeaders, rows: contiguousRows };
}

function familyId(cell: string): string | null {
  return /^`(BPMN-MECH-[A-Z0-9-]+)`$/u.exec(cell)?.[1] ?? null;
}

function normalizedEvidence(owner: string, destination: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/iu.test(destination) || destination.startsWith("//")) return null;
  const hashIndex = destination.indexOf("#");
  if (hashIndex === -1 || hashIndex === destination.length - 1) return null;
  const targetPart = decodeURIComponent(destination.slice(0, hashIndex));
  const fragment = decodeURIComponent(destination.slice(hashIndex + 1));
  const target = targetPart === ""
    ? owner
    : path.posix.normalize(path.posix.join(path.posix.dirname(owner), targetPart));
  if (path.posix.isAbsolute(target) || target === ".." || target.startsWith("../")) return null;
  return `${target}#${fragment}`;
}

function parsedCell(
  cell: string,
  owner: string,
  family: string,
  dimensionName: string,
  allowed: ReadonlyArray<string>,
): Readonly<{ value: DimensionCell | null; findings: ReadonlyArray<string> }> {
  const match = /^`([^`]+)`\s+\[[^\]]+\]\(([^)]+)\)$/u.exec(cell);
  const classification = /^`([^`]+)`/u.exec(cell)?.[1];
  const findings: string[] = [];
  if (classification === undefined || !allowed.includes(classification)) {
    findings.push(`invalid ${dimensionName} classification ${classification ?? "missing"} for ${family}`);
  }
  const evidence = match === null ? null : normalizedEvidence(owner, match[2] ?? "");
  if (evidence === null) findings.push(`${dimensionName} for ${family} has no explicit evidence link`);
  return classification === undefined || !allowed.includes(classification) || evidence === null
    ? { value: null, findings }
    : { value: { classification, evidence, owner }, findings };
}

function parseLedger(markdown: string): Readonly<{
  rows: ReadonlyArray<Readonly<{ familyId: string; familyDisposition: string; mechanismObligation: string }>>;
  findings: ReadonlyArray<string>;
}> {
  const table = tableInSection(markdown, Sections.Ledger, [
    "Family ID",
    "Normative source and machine-readable anchors",
    "Reusable mechanism obligation",
    "Depends on or is co-defined with",
    "Family disposition",
    "Closed reviewed slice",
  ]);
  if (table === null) return { rows: [], findings: ["missing mechanism-family map table"] };
  const findings: string[] = [];
  const seen = new Set<string>();
  const rows = table.rows.flatMap((cells) => {
    const id = familyId(cells[0] ?? "");
    if (id === null || cells.length !== 6) {
      findings.push("malformed mechanism-family map row");
      return [];
    }
    if (seen.has(id)) findings.push(`duplicate mechanism-family row for ${id}`);
    seen.add(id);
    const disposition = /^`([^`]+)`$/u.exec(cells[4] ?? "")?.[1];
    if (disposition === undefined) findings.push(`malformed family disposition for ${id}`);
    return disposition === undefined
      ? []
      : [{ familyId: id, familyDisposition: disposition, mechanismObligation: cells[2] ?? "" }];
  });
  return { rows, findings };
}

function parseClassifications(markdown: string): ParsedClassifications {
  const table = tableInSection(markdown, Sections.Testing, [
    "Family ID",
    "Invariant coverage",
    "Activity occurrence adoption",
    "Multiple-enabled closure",
    "Composition evidence",
  ]);
  if (table === null) {
    return { entries: new Map(), ids: new Set(), findings: ["missing mechanism-maturity classification table"] };
  }
  const ids = new Set<string>();
  const findings: string[] = [];
  const firstRows = new Map<string, ReadonlyArray<string>>();
  for (const cells of table.rows) {
    const id = familyId(cells[0] ?? "");
    if (id === null || cells.length !== 5) {
      findings.push("malformed mechanism-maturity classification row");
      continue;
    }
    if (ids.has(id)) findings.push(`duplicate mechanism-maturity classification for ${id}`);
    ids.add(id);
    if (!firstRows.has(id)) firstRows.set(id, cells);
  }
  const entries = new Map<string, Readonly<{
    invariantCoverage: DimensionCell;
    activityOccurrenceAdoption: DimensionCell;
    multipleEnabledClosure: DimensionCell;
    compositionEvidence: DimensionCell;
  }>>();
  for (const [id, cells] of firstRows) {
    const invariant = parsedCell(cells[1] ?? "", SourcePaths.Testing, id, "invariant coverage", Classifications.InvariantCoverage);
    const activity = parsedCell(cells[2] ?? "", SourcePaths.Testing, id, "activity occurrence adoption", Classifications.ActivityOccurrenceAdoption);
    const multiple = parsedCell(cells[3] ?? "", SourcePaths.Testing, id, "multiple-enabled closure", Classifications.MultipleEnabledClosure);
    const composition = parsedCell(cells[4] ?? "", SourcePaths.Testing, id, "composition evidence", Classifications.CompositionEvidence);
    findings.push(...invariant.findings, ...activity.findings, ...multiple.findings, ...composition.findings);
    if (invariant.value !== null && activity.value !== null && multiple.value !== null && composition.value !== null) {
      entries.set(id, {
        invariantCoverage: invariant.value,
        activityOccurrenceAdoption: activity.value,
        multipleEnabledClosure: multiple.value,
        compositionEvidence: composition.value,
      });
    }
  }
  return { entries, ids, findings };
}

function completenessFindings(
  familyIds: ReadonlySet<string>,
  classifiedIds: ReadonlySet<string>,
  label: string,
): ReadonlyArray<string> {
  const findings: string[] = [];
  for (const id of familyIds) if (!classifiedIds.has(id)) findings.push(`missing ${label} classification for ${id}`);
  for (const id of classifiedIds) if (!familyIds.has(id)) findings.push(`stale ${label} classification for ${id}`);
  return findings;
}

export function assessMechanismMaturitySources(sources: MechanismMaturitySources): MechanismMaturityAssessment {
  const ledger = parseLedger(sources.ledger);
  const classifications = parseClassifications(sources.testing);
  const familyIds = new Set(ledger.rows.map(({ familyId: id }) => id));
  const findings = [
    ...ledger.findings,
    ...classifications.findings,
    ...completenessFindings(familyIds, classifications.ids, "mechanism-maturity"),
  ];
  if (findings.length > 0) return { findings, rows: [] };
  const rows = ledger.rows.map((family) => ({ ...family, ...classifications.entries.get(family.familyId)! }));
  return { findings: [], rows };
}

function evidenceTarget(evidence: string): Readonly<{ path: string; fragment: string }> {
  const separator = evidence.indexOf("#");
  return { path: evidence.slice(0, separator), fragment: evidence.slice(separator + 1) };
}

async function evidenceFindings(projectRoot: string, rows: ReadonlyArray<MechanismMaturityRow>): Promise<ReadonlyArray<string>> {
  const cells = rows.flatMap((row) => [
    [row.familyId, "invariant coverage", row.invariantCoverage] as const,
    [row.familyId, "activity occurrence adoption", row.activityOccurrenceAdoption] as const,
    [row.familyId, "multiple-enabled closure", row.multipleEnabledClosure] as const,
    [row.familyId, "composition evidence", row.compositionEvidence] as const,
  ]);
  const markdownByPath = new Map<string, string>();
  const findings: string[] = [];
  for (const [family, dimension, cell] of cells) {
    const target = evidenceTarget(cell.evidence);
    try {
      const markdown = markdownByPath.get(target.path) ?? await readFile(path.join(projectRoot, target.path), "utf8");
      markdownByPath.set(target.path, markdown);
      if (!scanMarkdownAnchors(markdown).some(({ name }) => name === target.fragment)) {
        findings.push(`${dimension} evidence for ${family} has no target anchor: ${cell.evidence}`);
      }
    } catch {
      findings.push(`${dimension} evidence for ${family} has no target document: ${cell.evidence}`);
    }
  }
  return findings;
}

export async function loadMechanismMaturityVector(projectRoot: string): Promise<MechanismMaturityVector> {
  const [ledger, testing] = await Promise.all([
    readFile(path.join(projectRoot, SourcePaths.Ledger), "utf8"),
    readFile(path.join(projectRoot, SourcePaths.Testing), "utf8"),
  ]);
  const assessment = assessMechanismMaturitySources({ ledger, testing });
  const findings = assessment.findings.length === 0
    ? await evidenceFindings(projectRoot, assessment.rows)
    : assessment.findings;
  if (findings.length > 0) throw new Error(`Mechanism maturity evidence is invalid:\n${findings.map((finding) => `- ${finding}`).join("\n")}`);
  return {
    schemaVersion: 1,
    kind: "non-conformance-mechanism-maturity",
    sources: {
      familyMap: SourcePaths.Ledger,
      invariantCoverage: SourcePaths.Testing,
      activityOccurrenceAdoption: SourcePaths.Testing,
      multipleEnabledClosure: SourcePaths.Testing,
      compositionEvidence: SourcePaths.Testing,
    },
    families: assessment.rows,
  };
}

export function renderMechanismMaturityVector(vector: MechanismMaturityVector): string {
  return `${JSON.stringify(vector, null, 2)}\n`;
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  try {
    process.stdout.write(renderMechanismMaturityVector(await loadMechanismMaturityVector(projectRoot)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

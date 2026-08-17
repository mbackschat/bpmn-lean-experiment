import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { compareExactStrings, sha256 } from "./semantic-review-text.ts";

export const DOCUMENT_MIGRATION_MATRIX_FORMAT = "document-migration-matrix/v1" as const;
export const DOCUMENT_MIGRATION_SOURCE_PATHS = Object.freeze([
  "docs/PLAN.md",
  "docs/IMPLEMENTATION-MAP.md",
] as const);

const commitPattern = /^[0-9a-f]{40}$/u;
const digestPattern = /^[0-9a-f]{64}$/u;

export type DocumentUnitIdentity = Readonly<{
  path: string;
  owningHeading: string;
  ordinal: number;
  sha256: string;
}>;

export type DocumentUnit = DocumentUnitIdentity & Readonly<{ text: string }>;

type DestinationDisposition = Readonly<{
  kind: "destination";
  target: DocumentUnitIdentity;
}>;

type DuplicateDisposition = Readonly<{
  kind: "duplicate";
  ownerPath: string;
  rationale: string;
}>;

type HistoryDisposition = Readonly<{
  kind: "history";
  rationale: string;
}>;

type MatrixDisposition = DestinationDisposition | DuplicateDisposition | HistoryDisposition;

type MatrixRow = Readonly<{
  source: DocumentUnitIdentity;
  disposition: MatrixDisposition;
}>;

export type NormalizedDocumentMigrationMatrix = Readonly<{
  format: typeof DOCUMENT_MIGRATION_MATRIX_FORMAT;
  baseline: string;
  target: string;
  sourcePaths: typeof DOCUMENT_MIGRATION_SOURCE_PATHS;
  rows: ReadonlyArray<Readonly<{
    source: DocumentUnit;
    disposition:
      | Readonly<{ kind: "destination"; target: DocumentUnit; changed: boolean }>
      | DuplicateDisposition
      | HistoryDisposition;
  }>>;
}>;

export type DocumentMigrationDiagnostic = Readonly<{
  source: DocumentUnitIdentity;
  disposition: "changed" | "duplicate" | "history";
  target?: DocumentUnitIdentity;
  ownerPath?: string;
  rationale?: string;
}>;

export type ValidatedDocumentMigrationMatrix = Readonly<{
  exactBytesSha256: string;
  normalized: NormalizedDocumentMigrationMatrix;
  diagnostics: Readonly<{
    changed: ReadonlyArray<DocumentMigrationDiagnostic>;
    deleted: ReadonlyArray<DocumentMigrationDiagnostic>;
  }>;
}>;

export type DocumentMigrationMatrixLoadInput = Readonly<{
  repositoryRoot: string;
  matrixPath: string;
  baseline: string;
  target: string;
}>;

function assertRepositoryPath(value: string, label: string): void {
  if (
    value.length === 0 ||
    path.isAbsolute(value) ||
    value.includes("\\") ||
    path.posix.normalize(value) !== value ||
    value === ".." ||
    value.startsWith("../") ||
    value.includes("/../")
  ) {
    throw new Error(`${label} must be a canonical repository-relative path`);
  }
}

function gitText(repositoryRoot: string, arguments_: ReadonlyArray<string>): string {
  const result = spawnSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function exactCommit(repositoryRoot: string, revision: string, label: string): string {
  if (!commitPattern.test(revision)) {
    throw new Error(`${label} must be a full lowercase commit hash`);
  }
  const resolved = gitText(repositoryRoot, ["rev-parse", "--verify", `${revision}^{commit}`]).trim();
  if (resolved !== revision) {
    throw new Error(`${label} must resolve to its exact commit`);
  }
  return resolved;
}

function gitDocument(repositoryRoot: string, revision: string, filePath: string): string {
  assertRepositoryPath(filePath, "document path");
  return gitText(repositoryRoot, ["show", `${revision}:${filePath}`]);
}

function headingOwner(stack: ReadonlyArray<string | undefined>): string {
  const headings = stack.filter((heading): heading is string => heading !== undefined);
  return headings.length === 0 ? "<document>" : headings.join(" > ");
}

function headingAt(line: string): Readonly<{ level: number; text: string }> | undefined {
  const match = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u.exec(line);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { level: match[1].length, text: match[2] };
}

function isListItem(line: string): boolean {
  return /^\s*(?:[-+*]|\d+[.)])[ \t]+\S/u.test(line);
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/u.test(line);
}

function isTableDelimiter(line: string): boolean {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/u.test(line);
}

function fenceMarker(line: string): string | undefined {
  return /^\s*(`{3,}|~{3,})/u.exec(line)?.[1]?.[0];
}

/** Extracts only claim-bearing Markdown blocks; headings and structural delimiters own or separate units. */
export function extractDocumentUnits(filePath: string, document: string): ReadonlyArray<DocumentUnit> {
  assertRepositoryPath(filePath, "document path");
  const lines = document.split("\n");
  const headings: Array<string | undefined> = [];
  const units: DocumentUnit[] = [];
  let index = 0;
  let ordinal = 1;
  let openFence: string | undefined;

  const addUnit = (text: string): void => {
    units.push({
      path: filePath,
      owningHeading: headingOwner(headings),
      ordinal,
      sha256: sha256(text),
      text,
    });
    ordinal += 1;
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const marker = fenceMarker(line);
    if (openFence !== undefined) {
      if (marker === openFence) openFence = undefined;
      index += 1;
      continue;
    }
    if (marker !== undefined) {
      openFence = marker;
      index += 1;
      continue;
    }
    const heading = headingAt(line);
    if (heading !== undefined) {
      headings.length = heading.level - 1;
      headings[heading.level - 1] = heading.text;
      index += 1;
      continue;
    }
    if (line.trim().length === 0 || isTableDelimiter(line) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
      index += 1;
      continue;
    }
    if (isTableRow(line)) {
      addUnit(line);
      index += 1;
      continue;
    }

    const block: string[] = [line];
    const list = isListItem(line);
    index += 1;
    while (index < lines.length) {
      const candidate = lines[index] ?? "";
      if (
        candidate.trim().length === 0 ||
        headingAt(candidate) !== undefined ||
        fenceMarker(candidate) !== undefined ||
        isTableRow(candidate) ||
        isTableDelimiter(candidate) ||
        (list && isListItem(candidate)) ||
        (!list && isListItem(candidate))
      ) break;
      block.push(candidate);
      index += 1;
    }
    addUnit(block.join("\n"));
  }
  return units;
}

export function deriveDocumentUnits(
  repositoryRoot: string,
  revision: string,
  sourcePaths: ReadonlyArray<string>,
): ReadonlyArray<DocumentUnit> {
  exactCommit(repositoryRoot, revision, "document revision");
  return sourcePaths.flatMap((filePath) =>
    extractDocumentUnits(filePath, gitDocument(repositoryRoot, revision, filePath)));
}

function assertPlainRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must not have a custom prototype`);
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new Error(`${label} must not contain accessors`);
    }
  }
}

function assertExactKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>, label: string): void {
  const actual = Object.keys(value).sort(compareExactStrings);
  const expected = [...keys].sort(compareExactStrings);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} needs exactly ${expected.join(", ")}`);
  }
}

function parseIdentity(value: unknown, label: string): DocumentUnitIdentity {
  assertPlainRecord(value, label);
  assertExactKeys(value, ["path", "owningHeading", "ordinal", "sha256"], label);
  const { path: filePath, owningHeading, ordinal, sha256: digest } = value;
  if (typeof filePath !== "string" || typeof owningHeading !== "string" || typeof digest !== "string") {
    throw new Error(`${label} path, owningHeading, and sha256 must be strings`);
  }
  assertRepositoryPath(filePath, `${label} path`);
  if (owningHeading.length === 0 || !Number.isSafeInteger(ordinal) || (ordinal as number) < 1 || !digestPattern.test(digest)) {
    throw new Error(`${label} needs a heading, positive ordinal, and lowercase SHA-256`);
  }
  return { path: filePath, owningHeading, ordinal: ordinal as number, sha256: digest };
}

function parseNonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function parseDisposition(value: unknown, label: string): MatrixDisposition {
  assertPlainRecord(value, label);
  const kind = value.kind;
  switch (kind) {
    case "destination":
      assertExactKeys(value, ["kind", "target"], label);
      return { kind, target: parseIdentity(value.target, `${label} target`) };
    case "duplicate": {
      assertExactKeys(value, ["kind", "ownerPath", "rationale"], label);
      const ownerPath = parseNonemptyString(value.ownerPath, `${label} ownerPath`);
      assertRepositoryPath(ownerPath, `${label} ownerPath`);
      return { kind, ownerPath, rationale: parseNonemptyString(value.rationale, `${label} rationale`) };
    }
    case "history":
      assertExactKeys(value, ["kind", "rationale"], label);
      return { kind, rationale: parseNonemptyString(value.rationale, `${label} rationale`) };
    default:
      throw new Error(`${label} has unknown disposition kind`);
  }
}

function parseMatrix(value: unknown): Readonly<{
  format: typeof DOCUMENT_MIGRATION_MATRIX_FORMAT;
  baseline: string;
  target: string;
  sourcePaths: typeof DOCUMENT_MIGRATION_SOURCE_PATHS;
  rows: ReadonlyArray<MatrixRow>;
}> {
  assertPlainRecord(value, "migration matrix");
  assertExactKeys(value, ["format", "baseline", "target", "sourcePaths", "rows"], "migration matrix");
  if (value.format !== DOCUMENT_MIGRATION_MATRIX_FORMAT) throw new Error("migration matrix has unknown format");
  if (typeof value.baseline !== "string" || typeof value.target !== "string") {
    throw new Error("migration matrix commits must be strings");
  }
  if (!Array.isArray(value.sourcePaths) || value.sourcePaths.length !== DOCUMENT_MIGRATION_SOURCE_PATHS.length || value.sourcePaths.some((candidate, index) => candidate !== DOCUMENT_MIGRATION_SOURCE_PATHS[index])) {
    throw new Error("migration matrix sourcePaths must be the exact registered source paths");
  }
  if (!Array.isArray(value.rows)) throw new Error("migration matrix rows must be an array");
  const rows = value.rows.map((row, index): MatrixRow => {
    assertPlainRecord(row, `migration matrix row ${index + 1}`);
    assertExactKeys(row, ["source", "disposition"], `migration matrix row ${index + 1}`);
    return {
      source: parseIdentity(row.source, `migration matrix row ${index + 1} source`),
      disposition: parseDisposition(row.disposition, `migration matrix row ${index + 1} disposition`),
    };
  });
  return {
    format: DOCUMENT_MIGRATION_MATRIX_FORMAT,
    baseline: value.baseline,
    target: value.target,
    sourcePaths: DOCUMENT_MIGRATION_SOURCE_PATHS,
    rows,
  };
}

function identityKey(identity: DocumentUnitIdentity): string {
  return `${identity.path}\u0000${identity.owningHeading}\u0000${identity.ordinal}\u0000${identity.sha256}`;
}

function assertTargetPathExists(repositoryRoot: string, target: string, filePath: string): void {
  gitDocument(repositoryRoot, target, filePath);
}

/** Loads exact bytes, independently re-derives both commits, and closes every baseline claim once. */
export function loadDocumentMigrationMatrix(input: DocumentMigrationMatrixLoadInput): ValidatedDocumentMigrationMatrix {
  const baseline = exactCommit(input.repositoryRoot, input.baseline, "expected baseline");
  const target = exactCommit(input.repositoryRoot, input.target, "expected target");
  const exactBytes = readFileSync(input.matrixPath);
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(exactBytes));
  } catch (error: unknown) {
    throw new Error(`migration matrix must be valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const matrix = parseMatrix(parsedValue);
  if (matrix.baseline !== baseline || matrix.target !== target) {
    throw new Error("migration matrix baseline and target must equal the requested commits");
  }

  const baselineUnits = deriveDocumentUnits(input.repositoryRoot, baseline, DOCUMENT_MIGRATION_SOURCE_PATHS);
  const baselineByKey = new Map(baselineUnits.map((unit) => [identityKey(unit), unit]));
  const rowBySource = new Map<string, MatrixRow>();
  for (const row of matrix.rows) {
    if (!DOCUMENT_MIGRATION_SOURCE_PATHS.includes(row.source.path as (typeof DOCUMENT_MIGRATION_SOURCE_PATHS)[number])) {
      throw new Error(`migration matrix source uses unknown path ${row.source.path}`);
    }
    const key = identityKey(row.source);
    if (!baselineByKey.has(key)) throw new Error("migration matrix source unit does not resolve at baseline");
    if (rowBySource.has(key)) throw new Error("migration matrix repeats a baseline source unit");
    rowBySource.set(key, row);
  }
  const missing = baselineUnits.filter((unit) => !rowBySource.has(identityKey(unit)));
  if (missing.length > 0) {
    throw new Error(`migration matrix omits ${missing.length} baseline source unit(s)`);
  }

  const targetUnitsByPath = new Map<string, ReadonlyArray<DocumentUnit>>();
  const targetUnit = (identity: DocumentUnitIdentity): DocumentUnit => {
    let units = targetUnitsByPath.get(identity.path);
    if (units === undefined) {
      units = deriveDocumentUnits(input.repositoryRoot, target, [identity.path]);
      targetUnitsByPath.set(identity.path, units);
    }
    const resolved = units.find((unit) => identityKey(unit) === identityKey(identity));
    if (resolved === undefined) throw new Error("migration matrix destination unit does not resolve at target");
    return resolved;
  };

  const changed: DocumentMigrationDiagnostic[] = [];
  const deleted: DocumentMigrationDiagnostic[] = [];
  const normalizedRows = baselineUnits.map((source) => {
    const row = rowBySource.get(identityKey(source));
    if (row === undefined) throw new Error("migration matrix lost a validated source row");
    switch (row.disposition.kind) {
      case "destination": {
        const destination = targetUnit(row.disposition.target);
        const isChanged = destination.text !== source.text;
        if (!isChanged && destination.sha256 !== source.sha256) {
          throw new Error("byte-identical destination has inconsistent SHA-256");
        }
        if (isChanged) changed.push({ source: row.source, disposition: "changed", target: row.disposition.target });
        return { source, disposition: { kind: "destination" as const, target: destination, changed: isChanged } };
      }
      case "duplicate":
        assertTargetPathExists(input.repositoryRoot, target, row.disposition.ownerPath);
        deleted.push({ source: row.source, disposition: "duplicate", ownerPath: row.disposition.ownerPath, rationale: row.disposition.rationale });
        return { source, disposition: row.disposition };
      case "history":
        deleted.push({ source: row.source, disposition: "history", rationale: row.disposition.rationale });
        return { source, disposition: row.disposition };
    }
  });

  return {
    exactBytesSha256: sha256(exactBytes),
    normalized: {
      format: DOCUMENT_MIGRATION_MATRIX_FORMAT,
      baseline,
      target,
      sourcePaths: DOCUMENT_MIGRATION_SOURCE_PATHS,
      rows: normalizedRows,
    },
    diagnostics: { changed, deleted },
  };
}

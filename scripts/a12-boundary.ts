import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";

export const externalCreateDocumentSha256 =
  "77d1c5c5f0d5ffb901e5a1cdad463fd6cb7c8c89e8b762540b2f22548711564a";

type BoundaryFile = {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly symlinkTarget?: string;
};

const dependencyManifestNames = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pom.xml",
]);

const inspectedExtensions = new Set([
  ".bpmn",
  ".cjs",
  ".gradle",
  ".java",
  ".js",
  ".json",
  ".kt",
  ".kts",
  ".lean",
  ".mjs",
  ".properties",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".xml",
  ".yaml",
  ".yml",
]);

const lowerSemanticRoots = [
  "BpmnSemantics/",
  "packages/semantic-core/",
  "packages/temporal-adapter/",
];

const productDecisionRoots = [
  "BpmnSemantics/",
  "contracts/",
  "examples/",
  "packages/",
  "profiles/",
  "runners/cibseven/",
  "scenarios/",
];

const productDecisionEntryFiles = new Set([
  "BpmnSemantics.lean",
  "scripts/contract-artifacts.ts",
]);

const optionalAdoptionRoots = [
  "adoption/a12/",
  "packages/bpmn-source/calibration/",
];

const legacyProductDecisionInventoryPath =
  "adoption/a12/legacy/product-decision-inventory.json";
const legacySourceTarget =
  "02330ad0f980a5fc282cc0aa93600a9632b86c3e";
const legacyProductRoots = [
  "BpmnSemantics.lean",
  "BpmnSemantics",
  "contracts",
  "examples",
  "packages",
  "profiles",
  "runners/cibseven",
  "scenarios",
] as const;
const legacyCatalogEntryFiles = ["scripts/contract-artifacts.ts"] as const;
const legacyBusinessValueFiles = [
  "examples/temporal-mvp/boundary-error.json",
  "examples/temporal-mvp/create-document-data.json",
  "scenarios/boundary-error/cibseven-evidence.json",
  "scenarios/boundary-error/scenario.json",
  "scenarios/create-document-data/cibseven-evidence.json",
  "scenarios/create-document-data/scenario.json",
] as const;
const legacyDecisionMarker = [
  "A12",
  "a12",
  "CreateDocument",
  "createDocument",
  "CreateRelationship",
  "createRelationship",
  "LinkLimitReached",
  "linkLimitReached",
  "documentModel",
  "MyDocument",
  "myDocument",
  "newDoc",
  "RelationshipModel",
  "relationshipModel",
  "relationshipLink",
  "newLink",
  "ExpectedUserTaskAfterBPMNError",
  "scenarios/create-document-data",
  "scenarios/boundary-error",
].join("|");
const legacyDecisionToken = new RegExp(
  [
    "(?<![A-Za-z0-9])(?:[A-Za-z0-9_:/.-]*(?:A12|CreateDocument|createDocument|CreateRelationship|createRelationship|LinkLimitReached|linkLimitReached|documentModelName|MyDocumentModel|myDocumentReference|newDocRef|RelationshipModel|relationshipModel|relationshipLinkId|newLinkId|ExpectedUserTaskAfterBPMNError)[A-Za-z0-9_:/.-]*)(?![A-Za-z0-9])",
    "(?<![A-Za-z0-9])(?:(?:a12|[A-Za-z0-9_:/.-]*[.:/_-]a12)[A-Za-z0-9_:/.-]*)(?![A-Za-z0-9])",
    "scenarios/(?:create-document-data|boundary-error)",
  ].join("|"),
  "gu",
);

type LegacyProductDecisionInventory = Readonly<{
  kind: "a12LegacyProductDecisionInventory";
  sourceTarget: string;
  decisions: ReadonlyArray<string>;
}>;

function parseLegacyProductDecisionInventory(
  source: string,
): LegacyProductDecisionInventory {
  const value = JSON.parse(source) as unknown;
  const decisions =
    typeof value === "object" &&
      value !== null &&
      "decisions" in value &&
      Array.isArray(value.decisions)
      ? value.decisions
      : null;
  if (
    typeof value !== "object" ||
    value === null ||
    !("kind" in value) ||
    value.kind !== "a12LegacyProductDecisionInventory" ||
    !("sourceTarget" in value) ||
    value.sourceTarget !== legacySourceTarget ||
    decisions === null ||
    decisions.some(
      (decision) => typeof decision !== "string" || decision.length === 0,
    ) ||
    new Set(decisions).size !== decisions.length ||
    decisions.some(
      (decision, index) => index > 0 && decisions[index - 1] >= decision,
    )
  ) {
    throw new TypeError(
      `${legacyProductDecisionInventoryPath} is not the canonical immutable decision inventory`,
    );
  }
  return value as LegacyProductDecisionInventory;
}

const legacyProductDecisionInventory = parseLegacyProductDecisionInventory(
  await readFile(
    new URL("../adoption/a12/legacy/product-decision-inventory.json", import.meta.url),
    "utf8",
  ),
);
const legacyProductDecisions = legacyProductDecisionInventory.decisions;

const downstreamBeanIdentities = [
  "createDocumentDelegate",
  "createRelationshipLinkDelegate",
  "deleteRelationshipLinkDelegate",
  "exportDocumentDelegate",
  "relinkDocumentDelegate",
  "sendEmailDelegate",
  "setDocumentFieldDelegate",
  "setStatusDelegate",
  "syncAvailableFieldsDelegate",
];

const a12SourceHeaderPatterns = [
  new RegExp(
    ["SPDX-License-Identifier:", "\\s*EUPL-1\\.2"].join(""),
    "iu",
  ),
  new RegExp(
    ["This source file is part of the mgm ", "A12 Platform"].join(""),
    "iu",
  ),
  new RegExp(
    ["European Union Public Licen[cs]e,", "\\s*version 1\\.2"].join(""),
    "iu",
  ),
];

function isDependencyManifest(relativePath: string): boolean {
  const basename = path.posix.basename(relativePath);
  return (
    dependencyManifestNames.has(basename) ||
    basename.endsWith(".gradle") ||
    basename.endsWith(".gradle.kts")
  );
}

function isInspectedFile(relativePath: string): boolean {
  return (
    isDependencyManifest(relativePath) ||
    inspectedExtensions.has(path.posix.extname(relativePath))
  );
}

function containsA12SourceHeader(source: string): boolean {
  return a12SourceHeaderPatterns.some((pattern) => pattern.test(source));
}

function containsA12Coordinate(source: string): boolean {
  return (
    /@com\.mgmtp\.a12(?:[./-]|\b)/u.test(source) ||
    /\bcom\.mgmtp\.a12(?:[.:/-]|\b)/u.test(source)
  );
}

function isLowerSemanticFile(relativePath: string): boolean {
  return lowerSemanticRoots.some((root) => relativePath.startsWith(root));
}

function isProductDecisionFile(
  relativePath: string,
  entryClosure: ReadonlySet<string>,
): boolean {
  return (
    entryClosure.has(relativePath) ||
    productDecisionRoots.some((root) => relativePath.startsWith(root))
  ) &&
    !optionalAdoptionRoots.some((root) => relativePath.startsWith(root));
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function assessA12Boundary(
  files: ReadonlyArray<BoundaryFile>,
): ReadonlyArray<string> {
  const violations: string[] = [];
  const productEntryClosure = currentProductEntryClosure(files);

  for (const file of files) {
    const source = Buffer.from(file.bytes).toString("utf8");

    if (
      path.posix.extname(file.path) !== ".md" &&
      containsA12SourceHeader(source)
    ) {
      violations.push(`${file.path}: A12/EUPL source header`);
    }
    if (isDependencyManifest(file.path) && containsA12Coordinate(source)) {
      violations.push(`${file.path}: A12 package or build coordinate`);
    }
    if (
      file.path.endsWith(".bpmn") &&
      sha256(file.bytes) === externalCreateDocumentSha256
    ) {
      violations.push(
        `${file.path}: exact external A12 CreateDocument fixture bytes`,
      );
    }
    if (
      file.symlinkTarget !== undefined &&
      /(?:a12-workflows|a12-full-stack)/u.test(file.symlinkTarget)
    ) {
      violations.push(`${file.path}: link into an external A12 checkout`);
    }
    if (isLowerSemanticFile(file.path)) {
      for (const beanIdentity of downstreamBeanIdentities) {
        if (source.includes(beanIdentity)) {
          violations.push(
            `${file.path}: downstream A12 bean identity ${beanIdentity}`,
          );
        }
      }
    }
    if (isProductDecisionFile(file.path, productEntryClosure)) {
      if (source.includes("adoption/a12")) {
        violations.push(
          `${file.path}: product dependency on the optional A12 adoption root`,
        );
      }
      for (const decision of legacyProductDecisions) {
        if (source.includes(decision)) {
          violations.push(
            `${file.path}: legacy A12 product decision ${decision}`,
          );
        }
      }
    }
  }

  return violations.sort();
}

export async function verifyLegacyProductDecisionInventory(
  projectRoot: string,
): Promise<void> {
  const inventory = parseLegacyProductDecisionInventory(
    await readFile(
      path.join(projectRoot, legacyProductDecisionInventoryPath),
      "utf8",
    ),
  );
  const derived = await deriveLegacyProductDecisions(projectRoot);
  if (
    inventory.decisions.length !== derived.length ||
    inventory.decisions.some((decision, index) => decision !== derived[index])
  ) {
    throw new Error(
      `${legacyProductDecisionInventoryPath} differs from the inventory derived at ${legacySourceTarget}`,
    );
  }
}

export function deriveLegacyProductDecisions(
  projectRoot: string,
): Promise<ReadonlyArray<string>> {
  return deriveLegacyDecisionInputs(projectRoot).then(
    ({ catalogPaths, businessValues }) =>
      execGit(projectRoot, [
        "grep",
        "-h",
        "-I",
        "-E",
        legacyDecisionMarker,
        legacySourceTarget,
        "--",
        ...legacyProductRoots,
        ...catalogPaths,
      ]).then((stdout) => {
        const matches = stdout.match(legacyDecisionToken) ?? [];
        return [
          ...new Set([
            ...matches.map((value) =>
              value.replace(/^\.\.\.(?=[A-Za-z])/u, "").replace(/:+$/u, "")
            ),
            ...businessValues,
          ]),
        ].sort();
      }),
  ).catch((error: unknown) => {
    throw new Error(
      `cannot derive ${legacyProductDecisionInventoryPath} at ${legacySourceTarget}`,
      { cause: error },
    );
  });
}

async function deriveLegacyDecisionInputs(
  projectRoot: string,
): Promise<Readonly<{
  catalogPaths: ReadonlyArray<string>;
  businessValues: ReadonlyArray<string>;
}>> {
  const baselinePaths = new Set(
    (await execGit(projectRoot, [
      "ls-tree",
      "-r",
      "--name-only",
      legacySourceTarget,
    ])).split("\n").filter(Boolean),
  );
  const catalogPaths = await deriveLegacyImportClosure(
    projectRoot,
    baselinePaths,
  );
  const businessValues = new Set<string>();
  for (const relativePath of legacyBusinessValueFiles) {
    const value = JSON.parse(await legacyFile(projectRoot, relativePath));
    collectTypedStringValues(value, businessValues);
  }
  return { catalogPaths, businessValues: [...businessValues].sort() };
}

async function deriveLegacyImportClosure(
  projectRoot: string,
  baselinePaths: ReadonlySet<string>,
): Promise<ReadonlyArray<string>> {
  const visited = new Set<string>();
  const pending: string[] = [...legacyCatalogEntryFiles];
  while (pending.length > 0) {
    const relativePath = pending.pop();
    if (relativePath === undefined || visited.has(relativePath)) {
      continue;
    }
    visited.add(relativePath);
    const source = await legacyFile(projectRoot, relativePath);
    for (const match of source.matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu,
    )) {
      const specifier = match[1];
      if (specifier === undefined || !specifier.startsWith(".")) {
        continue;
      }
      const resolved = resolveRelativeModule(
        relativePath,
        specifier,
        baselinePaths,
      );
      if (resolved !== null && !visited.has(resolved)) {
        pending.push(resolved);
      }
    }
  }
  return [...visited].sort();
}

function collectTypedStringValues(
  value: unknown,
  found: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTypedStringValues(item, found);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record["kind"] === "string" && typeof record["value"] === "string") {
    found.add(record["value"]);
  }
  for (const item of Object.values(record)) {
    collectTypedStringValues(item, found);
  }
}

function currentProductEntryClosure(
  files: ReadonlyArray<BoundaryFile>,
): ReadonlySet<string> {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const visited = new Set<string>();
  const pending = [...productDecisionEntryFiles];
  while (pending.length > 0) {
    const relativePath = pending.pop();
    if (relativePath === undefined || visited.has(relativePath)) {
      continue;
    }
    visited.add(relativePath);
    const file = byPath.get(relativePath);
    if (file === undefined || !relativePath.endsWith(".ts")) {
      continue;
    }
    const source = Buffer.from(file.bytes).toString("utf8");
    for (const match of source.matchAll(
      /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu,
    )) {
      const specifier = match[1];
      if (specifier === undefined || !specifier.startsWith(".")) {
        continue;
      }
      const resolved = resolveRelativeModule(
        relativePath,
        specifier,
        new Set(byPath.keys()),
      );
      if (resolved !== null && !visited.has(resolved)) {
        pending.push(resolved);
      }
    }
  }
  return visited;
}

function resolveRelativeModule(
  ownerPath: string,
  specifier: string,
  availablePaths: ReadonlySet<string>,
): string | null {
  const joined = path.posix.normalize(
    path.posix.join(path.posix.dirname(ownerPath), specifier),
  );
  const candidates = [
    joined,
    joined.replace(/\.js$/u, ".ts"),
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}.json`,
    `${joined}/index.ts`,
  ];
  return candidates.find((candidate) => availablePaths.has(candidate)) ?? null;
}

function legacyFile(
  projectRoot: string,
  relativePath: string,
): Promise<string> {
  return execGit(projectRoot, [
    "show",
    `${legacySourceTarget}:${relativePath}`,
  ]);
}

function execGit(
  projectRoot: string,
  args: ReadonlyArray<string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      { cwd: projectRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => error === null ? resolve(stdout) : reject(error),
    );
  });
}

function repositoryPaths(projectRoot: string): Promise<ReadonlyArray<string>> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        cwd: projectRoot,
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(
          Buffer.from(stdout)
            .toString("utf8")
            .split("\0")
            .filter(Boolean)
            .sort(),
        );
      },
    );
  });
}

export async function repositoryBoundaryFiles(
  projectRoot: string,
): Promise<ReadonlyArray<BoundaryFile>> {
  const files = await Promise.all(
    (await repositoryPaths(projectRoot)).map((relativePath) =>
      readBoundaryFile(projectRoot, relativePath)
    ),
  );
  return files.filter((file): file is BoundaryFile => file !== null);
}

async function readBoundaryFile(
  projectRoot: string,
  relativePath: string,
): Promise<BoundaryFile | null> {
  const absolutePath = path.join(projectRoot, relativePath);
  try {
    const fileStatus = await lstat(absolutePath);
    if (fileStatus.isSymbolicLink()) {
      return {
        path: relativePath,
        bytes: Buffer.alloc(0),
        symlinkTarget: await readlink(absolutePath),
      };
    }
    return isInspectedFile(relativePath)
      ? { path: relativePath, bytes: await readFile(absolutePath) }
      : null;
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

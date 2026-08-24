import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const engineRoots = [
  "packages",
  "BpmnSemantics",
  "runners",
  "profiles",
  "scenarios",
  "contracts",
] as const;
const productTwoRoots = ["platform", "showcase"] as const;
const repositoryRoots = [...engineRoots, ...productTwoRoots] as const;
const projectSourceExtension = /\.(?:cts|java|mts|tsx?)$/u;
const engineGatewayRoot = "platform/foundation/engine-gateway";
const neutralPackageRoots = ["packages/contract-types"] as const;

export type ProjectSource = {
  readonly path: string;
  readonly source: string;
};

export type PackageRootMap = ReadonlyMap<string, string>;

export type PlatformBoundaryAssessmentOptions = {
  readonly allowedEngineImports?: ReadonlySet<string>;
  readonly packageRoots?: PackageRootMap;
};

export type RepositoryProductBoundary = {
  readonly packageRoots: PackageRootMap;
  readonly sources: ReadonlyArray<ProjectSource>;
};

type Token = {
  readonly kind: "identifier" | "punctuation" | "string";
  readonly text: string;
};

function decodedEscape(source: string, offset: number): {
  readonly character: string;
  readonly nextOffset: number;
} {
  const escaped = source[offset];
  if (escaped === "x") {
    const digits = source.slice(offset + 1, offset + 3);
    return /^[0-9a-f]{2}$/iu.test(digits)
      ? { character: String.fromCodePoint(Number.parseInt(digits, 16)), nextOffset: offset + 3 }
      : { character: escaped, nextOffset: offset + 1 };
  }
  if (escaped === "u") {
    if (source[offset + 1] === "{") {
      const close = source.indexOf("}", offset + 2);
      const digits = close === -1 ? "" : source.slice(offset + 2, close);
      return /^[0-9a-f]{1,6}$/iu.test(digits)
        ? { character: String.fromCodePoint(Number.parseInt(digits, 16)), nextOffset: close + 1 }
        : { character: escaped, nextOffset: offset + 1 };
    }
    const digits = source.slice(offset + 1, offset + 5);
    return /^[0-9a-f]{4}$/iu.test(digits)
      ? { character: String.fromCodePoint(Number.parseInt(digits, 16)), nextOffset: offset + 5 }
      : { character: escaped, nextOffset: offset + 1 };
  }
  const simpleEscapes: Readonly<Record<string, string>> = {
    "0": "\0",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
  };
  return {
    character: simpleEscapes[escaped ?? ""] ?? escaped ?? "",
    nextOffset: offset + 1,
  };
}

/**
 * Lexes only the tokens needed to recognize module references. Comments, quoted fixture text,
 * regular expressions, and template text are skipped; executable template interpolations remain
 * code, so a dynamic import inside one cannot bypass the boundary.
 */
function moduleTokens(source: string): Token[] {
  const tokens: Token[] = [];
  let offset = 0;

  const skipQuoted = (quote: "\"" | "'"): string => {
    let value = "";
    offset += 1;
    while (offset < source.length) {
      const character = source[offset];
      if (character === quote) {
        offset += 1;
        return value;
      }
      if (character === "\\") {
        const decoded = decodedEscape(source, offset + 1);
        value += decoded.character;
        offset = decoded.nextOffset;
      } else {
        value += character;
        offset += 1;
      }
    }
    return value;
  };

  const regexMayStartAfter = (): boolean => {
    const previous = tokens.at(-1);
    return previous === undefined ||
      (previous.kind === "punctuation" && /^(?:[({[,:;=!?]|=>)$/u.test(previous.text)) ||
      (previous.kind === "identifier" && /^(?:case|return|throw|yield)$/u.test(previous.text));
  };

  const skipRegex = (): void => {
    offset += 1;
    let inCharacterClass = false;
    while (offset < source.length) {
      const character = source[offset];
      if (character === "\\") {
        offset += 2;
      } else if (character === "[") {
        inCharacterClass = true;
        offset += 1;
      } else if (character === "]") {
        inCharacterClass = false;
        offset += 1;
      } else if (character === "/" && !inCharacterClass) {
        offset += 1;
        while (/[a-z]/iu.test(source[offset] ?? "")) {
          offset += 1;
        }
        return;
      } else {
        offset += 1;
      }
    }
  };

  const scanCode = (stopAtTemplateBrace = false): void => {
    let braceDepth = 0;
    while (offset < source.length) {
      const character = source[offset];
      if (stopAtTemplateBrace && character === "}" && braceDepth === 0) {
        offset += 1;
        return;
      }
      if (/\s/u.test(character ?? "")) {
        offset += 1;
      } else if (source.startsWith("//", offset)) {
        const lineEnd = source.indexOf("\n", offset + 2);
        offset = lineEnd === -1 ? source.length : lineEnd + 1;
      } else if (source.startsWith("/*", offset)) {
        const commentEnd = source.indexOf("*/", offset + 2);
        offset = commentEnd === -1 ? source.length : commentEnd + 2;
      } else if (character === "\"" || character === "'") {
        tokens.push({ kind: "string", text: skipQuoted(character) });
      } else if (character === "`") {
        offset += 1;
        while (offset < source.length) {
          if (source[offset] === "\\") {
            offset += 2;
          } else if (source[offset] === "`") {
            offset += 1;
            break;
          } else if (source.startsWith("${", offset)) {
            offset += 2;
            scanCode(true);
          } else {
            offset += 1;
          }
        }
      } else if (character === "/" && regexMayStartAfter()) {
        skipRegex();
      } else if (/[A-Za-z_$]/u.test(character ?? "")) {
        const start = offset;
        offset += 1;
        while (/[A-Za-z0-9_$]/u.test(source[offset] ?? "")) {
          offset += 1;
        }
        tokens.push({ kind: "identifier", text: source.slice(start, offset) });
      } else {
        if (character === "{") {
          braceDepth += 1;
        } else if (character === "}" && braceDepth > 0) {
          braceDepth -= 1;
        }
        const punctuation = source.startsWith("=>", offset) ? "=>" : character ?? "";
        tokens.push({ kind: "punctuation", text: punctuation });
        offset += punctuation.length;
      }
    }
  };

  scanCode();
  return tokens;
}

function typeScriptModuleSpecifiers(tokens: ReadonlyArray<Token>): string[] {
  const specifiers: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = tokens[index - 1];
    if (token?.kind !== "identifier" || previous?.text === ".") {
      continue;
    }
    if (token.text === "require" && tokens[index + 1]?.text === "(" && tokens[index + 2]?.kind === "string") {
      specifiers.push(tokens[index + 2]?.text ?? "");
      continue;
    }
    if (token.text !== "import" && token.text !== "export") {
      continue;
    }
    if (tokens[index + 1]?.kind === "string") {
      specifiers.push(tokens[index + 1]?.text ?? "");
      continue;
    }
    if (token.text === "import" && tokens[index + 1]?.text === "(" && tokens[index + 2]?.kind === "string") {
      specifiers.push(tokens[index + 2]?.text ?? "");
      continue;
    }
    for (let cursor = index + 1; cursor < tokens.length && tokens[cursor]?.text !== ";"; cursor += 1) {
      if (tokens[cursor]?.text === "from" && tokens[cursor + 1]?.kind === "string") {
        specifiers.push(tokens[cursor + 1]?.text ?? "");
        break;
      }
      if (tokens[cursor]?.text === "=" && tokens[cursor + 1]?.text === "require" && tokens[cursor + 3]?.kind === "string") {
        specifiers.push(tokens[cursor + 3]?.text ?? "");
        break;
      }
    }
  }
  return specifiers;
}

/** Extracts executable TypeScript module references while ignoring comments and literal fixtures. */
export function typeScriptModuleSpecifiersFromSource(source: string): ReadonlyArray<string> {
  return typeScriptModuleSpecifiers(moduleTokens(source));
}

function javaModuleSpecifiers(tokens: ReadonlyArray<Token>): string[] {
  const specifiers: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.text !== "import") {
      continue;
    }
    const parts: string[] = [];
    for (let cursor = index + 1; cursor < tokens.length && tokens[cursor]?.text !== ";"; cursor += 1) {
      const text = tokens[cursor]?.text;
      if (text !== undefined && text !== "static") {
        parts.push(text);
      }
    }
    const specifier = parts.join("").replace(/\.\*$/u, "");
    if (specifier.length > 0) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

function isWithinRoot(relativePath: string, roots: ReadonlyArray<string>): boolean {
  return roots.some((root) => relativePath === root || relativePath.startsWith(`${root}/`));
}

function packageTarget(specifier: string, packageRoots: PackageRootMap): string | null {
  const packageName = [...packageRoots.keys()]
    .filter((candidate) => specifier === candidate || specifier.startsWith(`${candidate}/`))
    .sort((left, right) => right.length - left.length)[0];
  if (packageName === undefined) {
    return null;
  }
  const packageRoot = packageRoots.get(packageName);
  if (packageRoot === undefined) {
    return null;
  }
  const subpath = specifier.slice(packageName.length).replace(/^\//u, "");
  return subpath.length === 0 ? packageRoot : path.posix.join(packageRoot, subpath);
}

function projectTarget(sourcePath: string, specifier: string, packageRoots: PackageRootMap): string | null {
  const normalizedSpecifier = specifier.replaceAll("\\", "/");
  if (normalizedSpecifier.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), normalizedSpecifier));
  }
  const mappedPackageTarget = packageTarget(normalizedSpecifier, packageRoots);
  if (mappedPackageTarget !== null) {
    return mappedPackageTarget;
  }
  const slashRoot = repositoryRoots.find(
    (root) => normalizedSpecifier === root || normalizedSpecifier.startsWith(`${root}/`),
  );
  if (slashRoot !== undefined) {
    return normalizedSpecifier;
  }
  const dottedRoot = repositoryRoots.find(
    (root) => normalizedSpecifier === root || normalizedSpecifier.startsWith(`${root}.`),
  );
  return dottedRoot === undefined ? null : normalizedSpecifier.replaceAll(".", "/");
}

function temporalHistoryModule(specifier: string): boolean {
  const normalized = specifier.toLowerCase();
  return /^@temporalio\/proto(?:\/|$)/u.test(normalized) ||
    normalized.includes("temporal.api.history") ||
    /temporal[^\n]*(?:^|[./_-])(?:event[._/-]?)?history(?:$|[./_-])/u.test(normalized);
}

const temporalHistoryApiNames = new Set([
  "fetchHistory",
  "getWorkflowExecutionHistory",
  "GetWorkflowExecutionHistoryRequest",
  "GetWorkflowExecutionHistoryResponse",
  "HistoryEvent",
  "WorkflowExecutionHistory",
]);

const approvedTemporalHistoryEvidencePaths = new Set([
  "showcase/m2-definition-scheduling/test/m2-definition-scheduling.test.ts",
  "showcase/m2-message-start-ingress/test/m2-message-start-ingress.test.ts",
  "showcase/m2-process-instance-search/test/m2-process-instance-search.test.ts",
  "showcase/m3-human-work/test/m3-human-work.test.ts",
  "showcase/m4-incident-operations/test/temporal-evidence.ts",
  "showcase/mue-preview-alpha/test/temporal-evidence.ts",
]);

function isApprovedTemporalHistoryEvidence(relativePath: string, apiName: string): boolean {
  return apiName === "fetchHistory" &&
    approvedTemporalHistoryEvidencePaths.has(relativePath);
}

const PlatformOwnerKind = {
  ServerApplication: "serverApplication",
  Web: "web",
  Contracts: "contracts",
  Foundation: "foundation",
  Module: "module",
  UiKit: "uiKit",
  Worker: "worker",
} as const;

type PlatformOwnerKind = (typeof PlatformOwnerKind)[keyof typeof PlatformOwnerKind];

type PlatformOwner = {
  readonly kind: PlatformOwnerKind;
  readonly root: string;
};

function platformOwner(relativePath: string): PlatformOwner | null {
  const normalized = relativePath.replaceAll("\\", "/");
  const fixedOwners = [
    { kind: PlatformOwnerKind.ServerApplication, root: "platform/apps/server" },
    { kind: PlatformOwnerKind.ServerApplication, root: "platform/apps/postgresql-migrate" },
    { kind: PlatformOwnerKind.ServerApplication, root: "platform/apps/recovery-worker" },
    { kind: PlatformOwnerKind.Web, root: "platform/apps/web" },
    { kind: PlatformOwnerKind.Contracts, root: "platform/contracts" },
    { kind: PlatformOwnerKind.UiKit, root: "platform/ui-kit" },
  ] as const;
  const fixed = fixedOwners.find(({ root }) => isWithinRoot(normalized, [root]));
  if (fixed !== undefined) {
    return fixed;
  }

  const parts = normalized.split("/");
  const family = parts[1];
  const name = parts[2];
  if (name === undefined || name.length === 0) {
    return null;
  }
  switch (family) {
    case "foundation":
      return { kind: PlatformOwnerKind.Foundation, root: `platform/foundation/${name}` };
    case "modules":
      return { kind: PlatformOwnerKind.Module, root: `platform/modules/${name}` };
    case "workers":
      return { kind: PlatformOwnerKind.Worker, root: `platform/workers/${name}` };
    default:
      return null;
  }
}

function platformDependencyAllowed(source: PlatformOwner, target: PlatformOwner): boolean {
  switch (source.kind) {
    case PlatformOwnerKind.ServerApplication:
      return (target.kind === PlatformOwnerKind.ServerApplication && target.root === source.root) ||
        target.kind === PlatformOwnerKind.Module ||
        target.kind === PlatformOwnerKind.Foundation ||
        target.kind === PlatformOwnerKind.Contracts;
    case PlatformOwnerKind.Web:
      return target.kind === PlatformOwnerKind.Web ||
        target.kind === PlatformOwnerKind.Contracts ||
        target.kind === PlatformOwnerKind.UiKit;
    case PlatformOwnerKind.Contracts:
      return target.kind === PlatformOwnerKind.Contracts;
    case PlatformOwnerKind.Foundation:
      return target.kind === PlatformOwnerKind.Foundation ||
        target.kind === PlatformOwnerKind.Contracts;
    case PlatformOwnerKind.Module:
      return target.kind === PlatformOwnerKind.Contracts ||
        target.kind === PlatformOwnerKind.Foundation ||
        (target.kind === PlatformOwnerKind.Module && target.root === source.root);
    case PlatformOwnerKind.UiKit:
      return target.kind === PlatformOwnerKind.UiKit ||
        target.kind === PlatformOwnerKind.Contracts;
    case PlatformOwnerKind.Worker:
      return target.kind === PlatformOwnerKind.Contracts ||
        (target.kind === PlatformOwnerKind.Worker && target.root === source.root);
    default: {
      const exhaustive: never = source.kind;
      return exhaustive;
    }
  }
}

/** Returns every repository and platform dependency-boundary violation in stable order. */
export function assessPlatformProductBoundary(
  sources: ReadonlyArray<ProjectSource>,
  options: PlatformBoundaryAssessmentOptions = {},
): string[] {
  const allowedEngineImports = options.allowedEngineImports ?? new Set<string>();
  const packageRoots = options.packageRoots ?? new Map<string, string>();
  const findings = new Set<string>();
  for (const input of sources) {
    const relativePath = input.path.replaceAll("\\", "/").replace(/^\.\//u, "");
    const isEngine = isWithinRoot(relativePath, engineRoots);
    const isProductTwo = isWithinRoot(relativePath, productTwoRoots);
    const isShowcase = isWithinRoot(relativePath, ["showcase"]);
    const isEngineGateway = isWithinRoot(relativePath, [engineGatewayRoot]);
    const sourcePlatformOwner = relativePath.startsWith("platform/")
      ? platformOwner(relativePath)
      : null;
    if (!isEngine && !isProductTwo) {
      continue;
    }
    if (relativePath.startsWith("platform/") && sourcePlatformOwner === null) {
      findings.add(`${relativePath}: source outside an approved platform owner`);
    }
    if (relativePath.startsWith("runners/juel/")) {
      findings.add(`${relativePath}: production JUEL Worker belongs under platform/workers, not runners/juel`);
    }
    const tokens = moduleTokens(input.source);
    const specifiers = relativePath.endsWith(".java")
      ? javaModuleSpecifiers(tokens)
      : typeScriptModuleSpecifiers(tokens);
    for (const specifier of specifiers) {
      const target = projectTarget(relativePath, specifier, packageRoots);
      if (isEngine && target !== null && isWithinRoot(target, productTwoRoots)) {
        findings.add(`${relativePath}: engine import of product-2 module ${specifier}`);
      }
      if (isProductTwo) {
        const approvedEngineImport = allowedEngineImports.has(specifier);
        const neutralImport = target !== null &&
          isWithinRoot(target, neutralPackageRoots);
        const publicShowcaseEngineImport = isShowcase &&
          packageRoots.has(specifier) &&
          target !== null &&
          isWithinRoot(target, engineRoots);
        const packageInternal = specifier.startsWith("@bpmn-lean/") &&
          (target === null || isWithinRoot(target, engineRoots)) &&
          !neutralImport &&
          !approvedEngineImport &&
          !publicShowcaseEngineImport;
        const publicEngineOutsideGateway = approvedEngineImport && !isEngineGateway;
        const relativeInternal = target !== null &&
          isWithinRoot(target, engineRoots) &&
          !neutralImport &&
          !approvedEngineImport &&
          !publicShowcaseEngineImport;
        if (packageInternal || relativeInternal) {
          findings.add(`${relativePath}: engine internal import ${specifier}`);
        }
        if (publicEngineOutsideGateway) {
          findings.add(`${relativePath}: public engine import outside engine gateway ${specifier}`);
        }
        if (
          relativePath.startsWith("platform/") &&
          target !== null &&
          isWithinRoot(target, ["showcase"])
        ) {
          findings.add(`${relativePath}: production import of showcase evidence ${specifier}`);
        }
        if (
          sourcePlatformOwner !== null &&
          target !== null &&
          target.startsWith("platform/")
        ) {
          const targetPlatformOwner = platformOwner(target);
          if (
            targetPlatformOwner === null ||
            !platformDependencyAllowed(sourcePlatformOwner, targetPlatformOwner)
          ) {
            findings.add(`${relativePath}: disallowed platform dependency ${specifier}`);
          }
        }
        if (temporalHistoryModule(specifier)) {
          findings.add(`${relativePath}: Temporal Event History module import ${specifier}`);
        }
      }
    }
    if (isProductTwo) {
      for (const token of tokens) {
        if (
          token.kind === "identifier" &&
          temporalHistoryApiNames.has(token.text) &&
          !isApprovedTemporalHistoryEvidence(relativePath, token.text)
        ) {
          findings.add(`${relativePath}: Temporal Event History API reference ${token.text}`);
        }
      }
    }
  }
  return [...findings].sort();
}

/**
 * Builds the exact package-name-to-repository-root mapping used by import assessment. Invalid JSON,
 * non-string names, and duplicate names fail closed because omitting an alias would create a bypass.
 */
export function packageRootsFromManifests(manifests: ReadonlyArray<ProjectSource>): PackageRootMap {
  const packageRoots = new Map<string, string>();
  const packageManifests = new Map<string, string>();
  for (const manifest of manifests) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(manifest.source) as unknown;
    } catch {
      throw new Error(`${manifest.path}: malformed package.json`);
    }
    if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error(`${manifest.path}: package.json must contain an object`);
    }
    const name = (decoded as { readonly name?: unknown }).name;
    if (name === undefined || name === "") {
      continue;
    }
    if (typeof name !== "string") {
      throw new Error(`${manifest.path}: package name must be a string`);
    }
    const previousManifest = packageManifests.get(name);
    if (previousManifest !== undefined) {
      throw new Error(`${manifest.path}: duplicate package name ${name} also declared by ${previousManifest}`);
    }
    packageRoots.set(name, path.posix.dirname(manifest.path.replaceAll("\\", "/")));
    packageManifests.set(name, manifest.path);
  }
  return packageRoots;
}

function repositoryPaths(root: string): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root },
  );
  return output.toString("utf8")
    .split("\0")
    .filter((relativePath) =>
      relativePath.length > 0 &&
      isWithinRoot(relativePath.replaceAll("\\", "/"), repositoryRoots) &&
      existsSync(path.join(root, relativePath)),
    );
}

async function readProjectFiles(root: string, relativePaths: ReadonlyArray<string>): Promise<ProjectSource[]> {
  return Promise.all(relativePaths.map(async (relativePath) => ({
    path: relativePath,
    source: await readFile(path.join(root, relativePath), "utf8"),
  })));
}

/** Discovers tracked and nonignored pending sources and package manifests under declared product roots. */
export async function repositoryProductBoundary(root: string): Promise<RepositoryProductBoundary> {
  const relativePaths = repositoryPaths(root);
  const sources = await readProjectFiles(
    root,
    relativePaths.filter((relativePath) => projectSourceExtension.test(relativePath)),
  );
  const manifests = await readProjectFiles(
    root,
    relativePaths.filter((relativePath) => path.posix.basename(relativePath) === "package.json"),
  );
  return {
    packageRoots: packageRootsFromManifests(manifests),
    sources,
  };
}

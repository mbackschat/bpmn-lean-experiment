import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const engineRoots = [
  "packages",
  "BpmnSemantics",
  "runners",
  "profiles",
  "scenarios",
  "contracts",
] as const;
const productTwoRoots = ["platform", "showcase"] as const;
const projectSourceExtension = /\.(?:cts|java|mts|tsx?)$/u;
const emptyEngineImportAllowlist = new Set<string>();
const engineGatewayRoot = "platform/foundation/engine-gateway";

type ProjectSource = {
  readonly path: string;
  readonly source: string;
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

function projectTarget(sourcePath: string, specifier: string): string | null {
  const normalizedSpecifier = specifier.replaceAll("\\", "/");
  if (normalizedSpecifier.startsWith(".")) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), normalizedSpecifier));
  }
  const slashRoot = [...engineRoots, ...productTwoRoots].find(
    (root) => normalizedSpecifier === root || normalizedSpecifier.startsWith(`${root}/`),
  );
  if (slashRoot !== undefined) {
    return normalizedSpecifier;
  }
  const dottedRoot = [...engineRoots, ...productTwoRoots].find(
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

const PlatformOwnerKind = {
  Server: "server",
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
    { kind: PlatformOwnerKind.Server, root: "platform/apps/server" },
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
    case PlatformOwnerKind.Server:
      return target.kind === PlatformOwnerKind.Server ||
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

function assessPlatformProductBoundary(
  sources: ReadonlyArray<ProjectSource>,
  allowedEngineImports: ReadonlySet<string> = emptyEngineImportAllowlist,
): string[] {
  const findings = new Set<string>();
  for (const input of sources) {
    const relativePath = input.path.replaceAll("\\", "/").replace(/^\.\//u, "");
    const isEngine = isWithinRoot(relativePath, engineRoots);
    const isProductTwo = isWithinRoot(relativePath, productTwoRoots);
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
      const target = projectTarget(relativePath, specifier);
      if (isEngine && target !== null && isWithinRoot(target, productTwoRoots)) {
        findings.add(`${relativePath}: engine import of product-2 module ${specifier}`);
      }
      if (isProductTwo) {
        const packageInternal = specifier.startsWith("@bpmn-lean/") && !allowedEngineImports.has(specifier);
        const publicEngineOutsideGateway = specifier.startsWith("@bpmn-lean/") &&
          allowedEngineImports.has(specifier) &&
          !isEngineGateway;
        const relativeInternal = target !== null && isWithinRoot(target, engineRoots);
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
        if (token.kind === "identifier" && temporalHistoryApiNames.has(token.text)) {
          findings.add(`${relativePath}: Temporal Event History API reference ${token.text}`);
        }
      }
    }
  }
  return [...findings].sort();
}

async function repositoryProductSources(root: string): Promise<ReadonlyArray<ProjectSource>> {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root },
  );
  const relativePaths = output.toString("utf8")
    .split("\0")
    .filter((relativePath) =>
      relativePath.length > 0 &&
      projectSourceExtension.test(relativePath) &&
      isWithinRoot(relativePath.replaceAll("\\", "/"), [...engineRoots, ...productTwoRoots]) &&
      existsSync(path.join(root, relativePath)),
    );
  return Promise.all(relativePaths.map(async (relativePath) => ({
    path: relativePath,
    source: await readFile(path.join(root, relativePath), "utf8"),
  })));
}

test("rejects every product-boundary regression class", () => {
  assert.deepEqual(
    assessPlatformProductBoundary([
      {
        path: "platform/modules/definitions/src/upload.ts",
        source: 'import { compile } from "@bpmn-lean/bpmn-source/src/compile.js";',
      },
      {
        path: "packages/semantic-core/src/escape.ts",
        source: 'import { upload } from "../../../platform/modules/definitions/src/upload.js";',
      },
      {
        path: "platform/modules/operate/src/history.ts",
        source: 'import { WorkflowExecutionHistory } from "@temporalio/client";',
      },
      {
        path: "platform/apps/server/src/server.ts",
        source: 'import { helper } from "../../../../showcase/m1-definition-deployment/src/helper.js";',
      },
      {
        path: "platform/apps/web/src/definitions.ts",
        source: 'import { deploy } from "../../../modules/definitions/src/deploy.js";',
      },
      {
        path: "platform/foundation/projection-runtime/src/definitions.ts",
        source: 'import { project } from "../../../modules/definitions/src/project.js";',
      },
      {
        path: "platform/modules/definitions/src/operate.ts",
        source: 'import { retry } from "../../operate/src/retry.js";',
      },
      {
        path: "platform/contracts/src/compile.ts",
        source: 'import { compile } from "../../foundation/engine-gateway/src/compile.js";',
      },
      {
        path: "platform/workers/juel-evaluator/src/definitions.ts",
        source: 'import { deploy } from "../../../modules/definitions/src/deploy.js";',
      },
      {
        path: "platform/misc/src/orphan.ts",
        source: "export const orphan = true;",
      },
      {
        path: "runners/juel/src/worker.ts",
        source: "export class JuelWorker {}",
      },
    ]),
    [
      "packages/semantic-core/src/escape.ts: engine import of product-2 module ../../../platform/modules/definitions/src/upload.js",
      "platform/apps/server/src/server.ts: production import of showcase evidence ../../../../showcase/m1-definition-deployment/src/helper.js",
      "platform/apps/web/src/definitions.ts: disallowed platform dependency ../../../modules/definitions/src/deploy.js",
      "platform/contracts/src/compile.ts: disallowed platform dependency ../../foundation/engine-gateway/src/compile.js",
      "platform/foundation/projection-runtime/src/definitions.ts: disallowed platform dependency ../../../modules/definitions/src/project.js",
      "platform/misc/src/orphan.ts: source outside an approved platform owner",
      "platform/modules/definitions/src/operate.ts: disallowed platform dependency ../../operate/src/retry.js",
      "platform/modules/definitions/src/upload.ts: engine internal import @bpmn-lean/bpmn-source/src/compile.js",
      "platform/modules/operate/src/history.ts: Temporal Event History API reference WorkflowExecutionHistory",
      "platform/workers/juel-evaluator/src/definitions.ts: disallowed platform dependency ../../../modules/definitions/src/deploy.js",
      "runners/juel/src/worker.ts: production JUEL Worker belongs under platform/workers, not runners/juel",
    ],
  );
});

test("permits only an explicitly named narrow engine entry point", () => {
  const gatewaySource = {
    path: "platform/foundation/engine-gateway/src/compile.ts",
    source: 'import { compile } from "@bpmn-lean/bpmn-source/platform";',
  } as const;
  assert.deepEqual(assessPlatformProductBoundary([gatewaySource]), [
    "platform/foundation/engine-gateway/src/compile.ts: engine internal import @bpmn-lean/bpmn-source/platform",
  ]);
  assert.deepEqual(
    assessPlatformProductBoundary(
      [gatewaySource],
      new Set(["@bpmn-lean/bpmn-source/platform"]),
    ),
    [],
  );
  assert.deepEqual(
    assessPlatformProductBoundary(
      [{
        path: "platform/workers/juel-evaluator/src/worker.ts",
        source: gatewaySource.source,
      }],
      new Set(["@bpmn-lean/bpmn-source/platform"]),
    ),
    [
      "platform/workers/juel-evaluator/src/worker.ts: public engine import outside engine gateway @bpmn-lean/bpmn-source/platform",
    ],
  );
});

test("distinguishes fixture text from executable imports", () => {
  assert.deepEqual(
    assessPlatformProductBoundary([
      {
        path: "packages/semantic-core/test/boundary-fixture.test.ts",
        source: [
          'const fixture = \'import x from "../../../platform/hidden.js";\';',
          '// import x from "../../../platform/comment.js";',
          'const matcher = /import\\s+"platform\\/regex"/u;',
          'const actual = `${await import("../../../platform/actual.js")}`;',
        ].join("\n"),
      },
    ]),
    [
      "packages/semantic-core/test/boundary-fixture.test.ts: engine import of product-2 module ../../../platform/actual.js",
    ],
  );
});

test("keeps tracked and pending sources inside the product boundary", async () => {
  assert.deepEqual(
    assessPlatformProductBoundary(await repositoryProductSources(projectRoot)),
    [],
  );
});

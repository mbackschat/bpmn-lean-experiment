import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { API } from "typescript/unstable/sync";
import * as ast from "typescript/unstable/ast";
import type {
  Expression,
  Node,
  ObjectLiteralExpression,
  SourceFile,
} from "typescript/unstable/ast";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const temporalClientTsconfig = path.join(
  projectRoot,
  "packages/temporal-adapter/client/tsconfig.json",
);
const workflowChainPatchOwner =
  "packages/temporal-adapter/workflow/src/workflow-implementation.ts";
const workflowChainPatchIdentityOwner =
  "packages/temporal-adapter/protocol/src/workflow-continuation.ts";
const processCorrelationPatchIdentityOwner =
  "packages/temporal-adapter/protocol/src/process-correlation-registration.ts";
const productionProcessStartSites = [
  {
    owner: "packages/temporal-adapter/client/src/definition-schedule-client.ts",
    kind: "scheduled",
    workflowType: "temporalDefinitionScheduleWorkflowType",
    hostInput: "temporalDefinitionScheduleInitialHostInput()",
  },
  {
    owner: "packages/temporal-adapter/client/src/definition-start-client.ts",
    kind: "direct",
    workflowType: "bpmnProcessWorkflowType",
    hostInput: "snapshot.hostInput",
  },
  {
    owner: "packages/temporal-adapter/client/src/message-start-client.ts",
    kind: "direct",
    workflowType: "bpmnProcessWorkflowType",
    hostInput: "snapshot.hostInput",
  },
  {
    owner: "packages/temporal-adapter/client/src/process-client.ts",
    kind: "direct",
    workflowType: "bpmnProcessWorkflowType",
    hostInput: "productionBpmnWorkflowInitialHostInput()",
  },
] as const;

const productionProcessHostInputProducers = [
  {
    owner: "packages/temporal-adapter/client/src/definition-schedule-client.ts",
    producer:
      "temporalDefinitionScheduleInitialHostInput=productionBpmnWorkflowInitialHostInput",
  },
  {
    owner: "packages/temporal-adapter/client/src/definition-start-client.ts",
    producer: "hostInput=productionBpmnWorkflowInitialHostInput()",
  },
  {
    owner: "packages/temporal-adapter/client/src/message-start-client.ts",
    producer: "hostInput=productionBpmnWorkflowInitialHostInput()",
  },
] as const;

const productionProcessStartHostArgumentMutations = [
  {
    owner: "packages/temporal-adapter/client/src/definition-schedule-client.ts",
    hostArgument: "            temporalDefinitionScheduleInitialHostInput(),\n",
  },
  {
    owner: "packages/temporal-adapter/client/src/definition-start-client.ts",
    hostArgument: ", snapshot.hostInput",
  },
  {
    owner: "packages/temporal-adapter/client/src/message-start-client.ts",
    hostArgument: ", snapshot.hostInput",
  },
  {
    owner: "packages/temporal-adapter/client/src/process-client.ts",
    hostArgument: "          productionBpmnWorkflowInitialHostInput(),\n",
  },
] as const;

type ProductionProcessStartSite = Readonly<{
  owner: string;
  kind: "direct" | "scheduled";
  workflowType: string;
  hostInput: string;
}>;

const temporalSourceRoots = [
  "packages/temporal-adapter/client/src",
  "packages/temporal-adapter/protocol/src",
  "packages/temporal-adapter/runner/src",
  "packages/temporal-adapter/testkit/src",
  "packages/temporal-adapter/worker/src",
  "packages/temporal-adapter/workflow/src",
];

const activeSourceRoots = [
  "BpmnSemantics",
  "packages/bpmn-source/src",
  "packages/bpmn-source/test",
  "packages/differential/src",
  "packages/differential/test",
  "packages/semantic-core/src",
  "packages/semantic-core/test",
  ...temporalSourceRoots,
  "packages/temporal-adapter/testkit/test",
  "runners/cibseven/src",
];

const maintainedReadmes = [
  "README.md",
  "packages/bpmn-source/README.md",
  "packages/differential/README.md",
  "packages/semantic-core/README.md",
  "packages/temporal-adapter/README.md",
  "runners/cibseven/README.md",
  "contracts/README.md",
];

const retiredOperationName = ["term", "inate"].join("");

/**
 * Vocabulary a replace-in-place change retired from the product surface.
 *
 * Unlike `prohibitedSourceFragments`, these are checked in maintained documentation as well as
 * active source, because the recurring escape is prose that keeps describing a removed identifier
 * or a deleted example file long after the code changed. Fragments are split so this guard does not
 * match its own list.
 */
const retiredProductVocabulary = [
  ["dummy", "UserTask"].join(""),
  ["DummyUserTask", "Response"].join(""),
  ["DummyUserTask", "Actor"].join(""),
  ["DummyUserTask", "RefusalCode"].join(""),
  ["Actor", "Refused"].join(""),
  ["CompletionNot", "Committed"].join(""),
  ["temporal-mvp/accep", "ted.json"].join(""),
];

const prohibitedSourceFragments = [
  ["schema", "Version"].join(""),
  ["traceSchema", "Version"].join(""),
  ["m0", "-sequential-user-task"].join(""),
  ["m1", "-user-task"].join(""),
  ["bpmn-source-sequential-user-task", "@0."].join(""),
  ["SequentialUserTask", "ExecutableIr"].join(""),
  ["BpmnExecutable", "IrKind"].join(""),
  ["bpmn-source", "-sequential-user-task"].join(""),
  ["hasSupported", "ExecutionSurface"].join(""),
  ["hasSequential", "ExecutionSurface"].join(""),
  ["hasTimer", "ExecutionSurface"].join(""),
  ["hasEffect", "ExecutionSurface"].join(""),
  ["hasBoundaryError", "ExecutionSurface"].join(""),
  ["hasBalancedParallel", "ExecutionSurface"].join(""),
];

const permittedRetiredDocumentationContexts = new Map([
  [
    "docs/PROFILE-PARAMETERIZED-ADMISSION-SPEC.md",
    "replaced `terminate` with `reachNoneEnd` plus synthetic `completeScope`",
  ],
]);

async function sourceFiles(
  relativeRoot: string,
): Promise<ReadonlyArray<string>> {
  const absoluteRoot = path.join(projectRoot, relativeRoot);
  const entries = await readdir(absoluteRoot, { withFileTypes: true });
  const nested = await Promise.all(
    entries.flatMap((entry) => {
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory()) {
        return [sourceFiles(relativePath)];
      }
      return entry.isFile()
        ? [Promise.resolve<ReadonlyArray<string>>([relativePath])]
        : [];
    }),
  );
  return nested.flat();
}

function retiredSourceFindings(
  relativePath: string,
  source: string,
): string[] {
  return source.split("\n").flatMap((line, index) => {
    const hasRetiredWireLiteral = new RegExp(
      `(["'])${retiredOperationName}\\1`,
      "u",
    ).test(line);
    const hasRetiredLeanContractVariant =
      relativePath === "BpmnSemantics/SemanticProcessContract.lean" &&
      /^\s*\|\s*terminate(?:\s|\()/u.test(line);
    if (!hasRetiredWireLiteral && !hasRetiredLeanContractVariant) {
      return [];
    }
    return [`${relativePath}:${index + 1}: ${retiredOperationName}`];
  });
}

function retiredDocumentationFindings(
  relativePath: string,
  source: string,
): string[] {
  const marker = `\`${retiredOperationName}\``;
  const permittedContext =
    permittedRetiredDocumentationContexts.get(relativePath);
  return source.split("\n").flatMap((line, index) => {
    const occurrences = line.split(marker).length - 1;
    if (occurrences === 0) {
      return [];
    }
    return occurrences === 1 && permittedContext !== undefined &&
        line.includes(permittedContext)
      ? []
      : [`${relativePath}:${index + 1}: ${marker}`];
  });
}

test("keeps active code and maintained documentation on one replace-in-place pre-release contract", async () => {
  const files = (await Promise.all(activeSourceRoots.map(sourceFiles))).flat();
  const findings: string[] = [];

  for (const relativePath of files) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    for (const fragment of prohibitedSourceFragments) {
      if (source.includes(fragment)) {
        findings.push(`${relativePath}: ${fragment}`);
      }
    }
  }

  const retiredOperationFiles = [
    ...files,
    ...await sourceFiles("contracts/schemas"),
  ];
  for (const relativePath of retiredOperationFiles) {
    findings.push(...retiredSourceFindings(
      relativePath,
      await readFile(path.join(projectRoot, relativePath), "utf8"),
    ));
  }

  const documentationFiles = (await sourceFiles("docs")).filter(
    (relativePath) =>
      relativePath.endsWith(".md") &&
      !relativePath.startsWith(path.join("docs", "archived") + path.sep),
  );
  for (const relativePath of documentationFiles) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    findings.push(...retiredDocumentationFindings(relativePath, source));
  }

  // Retired product vocabulary is a documentation defect as much as a source defect: a reader
  // following a deleted example filename or a removed configuration field is misled either way.
  const vocabularyFiles = [
    ...files,
    ...documentationFiles,
    ...maintainedReadmes,
  ];
  for (const relativePath of vocabularyFiles) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    for (const fragment of retiredProductVocabulary) {
      if (source.includes(fragment)) {
        findings.push(`${relativePath}: ${fragment}`);
      }
    }
  }

  assert.deepEqual(findings, []);
});

test("distinguishes the retired terminate wire operation from Terminate End", () => {
  assert.deepEqual(
    retiredSourceFindings("fixture.ts", 'const operation = { kind: "terminate" };'),
    ["fixture.ts:1: terminate"],
  );
  assert.deepEqual(
    retiredSourceFindings(
      "BpmnSemantics/SemanticProcessContract.lean",
      "  | terminate (id : OperationId)",
    ),
    ["BpmnSemantics/SemanticProcessContract.lean:1: terminate"],
  );
  assert.deepEqual(
    retiredSourceFindings(
      "BpmnSemantics/SemanticProcess/TerminateEnd.lean",
      "  | terminate (before : RuntimeState)\nconst kind = 'terminateScope'",
    ),
    [],
  );
});

test("starts every cached ephemeral server through the owner that creates its cache", async () => {
  // A cached ephemeral executable needs its download directory to exist first.
  // The owner creates it, so a second configuration site would reintroduce a
  // gate that passes only where an earlier run left the cache behind.
  const executableMarker = ["cached", "-download"].join("");
  const owner = path.join(
    "packages/temporal-adapter/testkit/src",
    "ephemeral-server.ts",
  );
  const scanRoots = [
    ...activeSourceRoots,
    "packages/bpmn-source/calibration",
    "packages/temporal-adapter/testkit/calibration",
    "scripts",
  ];
  const files = (await Promise.all(scanRoots.map(sourceFiles))).flat();
  const configurationSites: string[] = [];

  for (const relativePath of files) {
    if (relativePath === owner) {
      continue;
    }
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    if (source.includes(executableMarker)) {
      configurationSites.push(relativePath);
    }
  }

  assert.deepEqual(
    configurationSites,
    [],
    `only ${owner} may configure a cached ephemeral server executable`,
  );
  const ownerSource = await readFile(path.join(projectRoot, owner), "utf8");
  assert.match(
    ownerSource,
    /mkdir\([^)]*\{\s*recursive:\s*true\s*\}/u,
    `${owner} must create the download directory before starting a server`,
  );
});

test("keeps pre-release Temporal replay evidence and patch enrollment exact", async () => {
  const temporalTestFiles = await sourceFiles("packages/temporal-adapter/testkit/test");
  assert.deepEqual(
    temporalTestFiles.filter((relativePath) =>
      relativePath.endsWith([".history", ".json"].join("")),
    ),
    [],
  );

  const temporalSources = (
    await Promise.all(temporalSourceRoots.map(sourceFiles))
  ).flat();
  const patchedWorkflowSources: string[] = [];
  for (const relativePath of temporalSources) {
    const source = await readFile(
      path.join(projectRoot, relativePath),
      "utf8",
    );
    if (source.includes(["patch", "ed("].join(""))) {
      patchedWorkflowSources.push(relativePath);
    }
  }
  assert.deepEqual(patchedWorkflowSources, [workflowChainPatchOwner]);

  const patchOwnerSource = await readFile(
    path.join(projectRoot, workflowChainPatchOwner),
    "utf8",
  );
  assert.equal(
    patchOwnerSource.match(/\bpatched\(/gu)?.length,
    2,
    "only the reviewed Workflow-chain and Process-correlation patches may enroll",
  );
  assert.match(
    patchOwnerSource,
    /hostInput !== undefined &&\s+patched\(bpmnWorkflowChainPatchId\)/u,
    "ordinary two-argument starts must not enroll in the checkpoint patch branch",
  );
  assert.match(
    patchOwnerSource,
    /workflowChainPatchActive &&\s+patched\(bpmnProcessCorrelationRegistrationPatchId\)/u,
    "Process correlation registration must enroll only inside the Workflow-chain branch",
  );

  const patchIdentitySource = await readFile(
    path.join(projectRoot, workflowChainPatchIdentityOwner),
    "utf8",
  );
  assert.match(
    patchIdentitySource,
    /export const bpmnWorkflowChainPatchId = "bpmn-workflow-chain-v1" as const;/u,
    "the reviewed Workflow-chain patch identity must remain stable",
  );

  const processCorrelationPatchIdentitySource = await readFile(
    path.join(projectRoot, processCorrelationPatchIdentityOwner),
    "utf8",
  );
  assert.match(
    processCorrelationPatchIdentitySource,
    /export const bpmnProcessCorrelationRegistrationPatchId =\s+"bpmn-process-correlation-registration-v1";/u,
    "the reviewed Process-correlation patch identity must remain stable",
  );
});

test("enrolls every production Process start constructor in Workflow-chain hosting", () => {
  const api = new API({ cwd: projectRoot });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [temporalClientTsconfig] });
    assertProductionProcessStartConstructors(projectClientSources(snapshot));
    snapshot.dispose();
  } finally {
    api.close();
  }
});

test("rejects every production Process start when its Workflow-chain host argument is deleted", async () => {
  for (const mutationCase of productionProcessStartHostArgumentMutations) {
    const ownerPath = path.join(projectRoot, mutationCase.owner);
    const original = await readFile(ownerPath, "utf8");
    const mutation = original.replace(mutationCase.hostArgument, "");
    assert.notEqual(
      mutation,
      original,
      `${mutationCase.owner} host-argument mutation matched nothing`,
    );

    const api = new API({
      cwd: projectRoot,
      fs: {
        readFile(fileName) {
          return path.resolve(fileName) === ownerPath ? mutation : undefined;
        },
      },
    });
    try {
      const snapshot = api.updateSnapshot({ openProjects: [temporalClientTsconfig] });
      assert.throws(
        () => assertProductionProcessStartConstructors(projectClientSources(snapshot)),
        /production Process start constructor inventory/u,
        mutationCase.owner,
      );
      snapshot.dispose();
    } finally {
      api.close();
    }
  }
});

function projectClientSources(
  snapshot: ReturnType<API["updateSnapshot"]>,
): ReadonlyMap<string, SourceFile> {
  const project = snapshot.getProjects().find((candidate) =>
    path.resolve(candidate.configFileName) === temporalClientTsconfig
  );
  assert.ok(project, "the Temporal client TypeScript project must be loaded");
  const clientSourceRoot = path.join(
    projectRoot,
    "packages/temporal-adapter/client/src",
  );
  return new Map(project.program.getSourceFileNames().flatMap((fileName) => {
    const sourceRelativePath = path.relative(clientSourceRoot, fileName);
    if (
      sourceRelativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(sourceRelativePath) ||
      !sourceRelativePath.endsWith(".ts") ||
      sourceRelativePath.endsWith(".d.ts")
    ) {
      return [];
    }
    const relativePath = path.relative(projectRoot, fileName);
    const file = project.program.getSourceFile(fileName);
    return file === undefined ? [] : [[relativePath, file] as const];
  }));
}

function assertProductionProcessStartConstructors(
  clientSources: ReadonlyMap<string, SourceFile>,
): void {
  const actualSites: ProductionProcessStartSite[] = [];
  const actualProducers: Array<{ owner: string; producer: string }> = [];
  for (const [relativePath, file] of clientSources) {
    collectProductionProcessStartSites(relativePath, file, actualSites);
    collectProductionHostInputProducers(relativePath, file, actualProducers);
  }
  actualSites.sort(compareProductionInventoryEntry);
  actualProducers.sort(compareProductionInventoryEntry);
  assert.deepEqual(
    actualSites,
    [...productionProcessStartSites],
    "production Process start constructor inventory must bind every actual start to its Workflow-chain host argument",
  );
  assert.deepEqual(
    actualProducers,
    [...productionProcessHostInputProducers],
    "production Process start host-input producer inventory must remain content-bound",
  );
}

function collectProductionProcessStartSites(
  owner: string,
  file: SourceFile,
  sites: ProductionProcessStartSite[],
): void {
  const workflowTypes = identifierAliases(file, "bpmnProcessWorkflowType");
  visit(file, (node) => {
    if (ast.isCallExpression(node) && isStartMethod(node.expression)) {
      const workflowType = compactExpression(node.arguments[0], file);
      const options = unwrapObjectLiteral(node.arguments[1]);
      if (workflowTypes.has(workflowType) && options !== undefined) {
        sites.push({
          owner,
          kind: "direct",
          workflowType,
          hostInput: thirdWorkflowArgument(options, file),
        });
      }
    }
    if (!ast.isObjectLiteralExpression(node)) return;
    const type = objectProperty(node, "type");
    const workflowType = compactExpression(
      objectProperty(node, "workflowType"),
      file,
    );
    if (
      type === undefined ||
      !ast.isStringLiteral(type) ||
      type.text !== "startWorkflow" ||
      !workflowTypes.has(workflowType)
    ) {
      return;
    }
    sites.push({
      owner,
      kind: "scheduled",
      workflowType,
      hostInput: thirdWorkflowArgument(node, file),
    });
  });
}

function identifierAliases(file: SourceFile, root: string): ReadonlySet<string> {
  const aliases = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    visit(file, (node) => {
      if (!ast.isVariableDeclaration(node)) return;
      const name = identifierText(node.name);
      const initializer = compactExpression(node.initializer, file);
      if (name !== undefined && aliases.has(initializer) && !aliases.has(name)) {
        aliases.add(name);
        changed = true;
      }
    });
  }
  return aliases;
}

function isStartMethod(expression: Expression): boolean {
  return ast.isPropertyAccessExpression(expression) &&
    identifierText(expression.name) === "start";
}

function collectProductionHostInputProducers(
  owner: string,
  file: SourceFile,
  producers: Array<{ owner: string; producer: string }>,
): void {
  visit(file, (node) => {
    if (
      ast.isVariableDeclaration(node) &&
      identifierText(node.name) === "temporalDefinitionScheduleInitialHostInput" &&
      compactExpression(node.initializer, file) ===
        "productionBpmnWorkflowInitialHostInput"
    ) {
      producers.push({
        owner,
        producer:
          "temporalDefinitionScheduleInitialHostInput=productionBpmnWorkflowInitialHostInput",
      });
    }
    if (
      ast.isPropertyAssignment(node) &&
      propertyName(node.name) === "hostInput" &&
      compactExpression(node.initializer, file) ===
        "productionBpmnWorkflowInitialHostInput()"
    ) {
      producers.push({
        owner,
        producer: "hostInput=productionBpmnWorkflowInitialHostInput()",
      });
    }
  });
}

function thirdWorkflowArgument(
  options: ObjectLiteralExpression,
  file: SourceFile,
): string {
  const arguments_ = objectProperty(options, "args");
  return arguments_ !== undefined && ast.isArrayLiteralExpression(arguments_)
    ? compactExpression(arguments_.elements[2], file)
    : "<missing>";
}

function objectProperty(
  object: ObjectLiteralExpression,
  name: string,
): Expression | undefined {
  const matches = object.properties.filter((property) =>
    ast.isPropertyAssignment(property) && propertyName(property.name) === name
  );
  assert.ok(matches.length <= 1, `object repeats ${name}`);
  const match = matches[0];
  return match !== undefined && ast.isPropertyAssignment(match)
    ? match.initializer
    : undefined;
}

function unwrapObjectLiteral(
  expression: Expression | undefined,
): ObjectLiteralExpression | undefined {
  if (expression === undefined) return undefined;
  if (
    ast.isParenthesizedExpression(expression) ||
    ast.isAsExpression(expression) ||
    ast.isSatisfiesExpression(expression)
  ) {
    return unwrapObjectLiteral(expression.expression);
  }
  return ast.isObjectLiteralExpression(expression) ? expression : undefined;
}

function compactExpression(
  expression: Node | undefined,
  file: SourceFile,
): string {
  return expression?.getText(file).replaceAll(/\s/gu, "") ?? "<missing>";
}

function identifierText(node: Node | undefined): string | undefined {
  return node !== undefined && ast.isIdentifier(node) ? node.text : undefined;
}

function propertyName(node: Node): string | undefined {
  return ast.isIdentifier(node) || ast.isStringLiteral(node)
    ? node.text
    : undefined;
}

function visit(node: Node, inspect: (candidate: Node) => void): void {
  inspect(node);
  node.forEachChild((child) => visit(child, inspect));
}

function compareProductionInventoryEntry(
  left: Readonly<{ owner: string }>,
  right: Readonly<{ owner: string }>,
): number {
  return left.owner < right.owner ? -1 : left.owner > right.owner ? 1 : 0;
}

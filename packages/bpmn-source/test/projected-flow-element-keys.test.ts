/**
 * Structural guard for the one flow-element key inventory.
 *
 * The runtime matrix is the closed profile/type contract. The TypeScript AST is the oracle for
 * ownership: every top-level projector predicate must name exactly one inventory entry, and a
 * restored private literal list must fail before the live sources are accepted.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { API } from "typescript/unstable/sync";
import * as ast from "typescript/unstable/ast";
import type { Node, SourceFile } from "typescript/unstable/ast";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sourceRoot = path.join(projectRoot, "packages/bpmn-source/src");
const tsconfig = path.join(projectRoot, "packages/bpmn-source/tsconfig.json");

type ConsumerSite = Readonly<{
  source: string;
  anchor: string;
  elementName: string;
  shape: string;
}>;

type MatrixEntry = readonly [string, string, readonly string[]];

const consumers = [
  { source: "checked-element-projection.ts", anchor: "projectCheckedSequenceFlows", elementName: "flow", shape: "StandardSequenceFlow" },
  { source: "checked-element-projection.ts", anchor: "classifyGateway", elementName: "element", shape: "ParallelGateway" },
  { source: "checked-element-projection.ts", anchor: "projectExclusiveMerge", elementName: "element", shape: "ExclusiveOrInclusiveGateway" },
  { source: "checked-element-projection.ts", anchor: "projectServiceTask", elementName: "element", shape: "GenericServiceTask" },
  { source: "configured-task-source.ts", anchor: "projectConfiguredTask", elementName: "element", shape: "ConfiguredTask" },
  { source: "checked-element-projection.ts", anchor: "isExactPt1sTimerEvent", elementName: "element", shape: "IntermediateCatchEvent" },
  { source: "checked-element-projection.ts", anchor: "isPlainFlowNode", elementName: "element", shape: "PlainNode" },
  { source: "checked-element-projection.ts", anchor: "projectUserTaskMetadata", elementName: "element", shape: "UserTaskMetadata" },
  { source: "checked-element-projection.ts", anchor: "isProjectableEmbeddedSubProcess", elementName: "element", shape: "EmbeddedSubProcess" },
  { source: "event-based-gateway-source.ts", anchor: "projectEventBasedGateway", elementName: "element", shape: "EventBasedGateway" },
  { source: "inclusive-gateway-source.ts", anchor: "projectInclusiveGateway", elementName: "element", shape: "ExclusiveOrInclusiveGateway" },
  { source: "intermediate-catch-message-source.ts", anchor: "projectIntermediateCatchMessage", elementName: "element", shape: "IntermediateCatchEvent" },
  { source: "message-start-event-source.ts", anchor: "projectMessageStartEvent", elementName: "element", shape: "MessageStartEvent" },
  { source: "timer-start-event-source.ts", anchor: "projectTimerStartEvent", elementName: "element", shape: "TimerStartEvent" },
  { source: "receive-task-source.ts", anchor: "projectReceiveTask", elementName: "element", shape: "ReceiveTask" },
  { source: "simple-boolean-exclusive-gateway-source.ts", anchor: "projectExclusiveGateway", elementName: "element", shape: "ExclusiveOrInclusiveGateway" },
  { source: "subprocess-error-source.ts", anchor: "projectErrorEndEvent", elementName: "element", shape: "ErrorEndEvent" },
  { source: "terminate-end-event-source.ts", anchor: "projectTerminateEndEvent", elementName: "element", shape: "TerminateEndEvent" },
  { source: "subprocess-error-source.ts", anchor: "projectBoundaryErrorEvent", elementName: "element", shape: "BoundaryEvent" },
  { source: "timer-boundary-event-source.ts", anchor: "projectTimerBoundaryEvent", elementName: "element", shape: "BoundaryEvent" },
  { source: "mapped-service-task-source.ts", anchor: "projectMappedSuccessServiceTask", elementName: "value", shape: "MappedSuccessServiceTask" },
  { source: "mapped-service-task-source.ts", anchor: "projectMappedBoundaryServiceTask", elementName: "value", shape: "MappedBoundaryServiceTask" },
  { source: "mapped-service-task-source.ts", anchor: "projectPlainNode", elementName: "value", shape: "PlainNode" },
  { source: "mapped-service-task-source.ts", anchor: "projectMappedBoundaryIdentityNode", elementName: "value", shape: "MappedBoundaryIdentityNode" },
  { source: "mapped-service-task-source.ts", anchor: "projectMappedSuccessSequenceFlows", elementName: "flow", shape: "MappedSuccessSequenceFlow" },
  { source: "mapped-service-task-source.ts", anchor: "projectMappedBoundarySequenceFlows", elementName: "flow", shape: "MappedBoundarySequenceFlow" },
  { source: "mapped-boundary-error-service-task-source.ts", anchor: "projectBoundaryRoute", elementName: "boundary", shape: "MappedBoundaryEvent" },
  { source: "mapped-boundary-error-service-task-source.ts", anchor: "projectUserTask", elementName: "value", shape: "PlainNode" },
  { source: "call-activity-source.ts", anchor: "resolveCalledProcessId", elementName: "call", shape: "CallActivity" },
  { source: "call-activity-source.ts", anchor: "projectSequenceFlows", elementName: "flow", shape: "StandardSequenceFlow" },
  { source: "call-activity-source.ts", anchor: "isPlainNode", elementName: "element", shape: "PlainNode" },
] as const satisfies ReadonlyArray<ConsumerSite>;

const inventoryCases = [
  ["genericShapes", "startEventType", ["PlainNode", "MessageStartEvent", "TimerStartEvent"]],
  ["genericShapes", "userTaskType", ["PlainNode"]],
  ["genericShapes", "endEventType", ["PlainNode", "ErrorEndEvent", "TerminateEndEvent"]],
  ["genericShapes", "subProcessType", ["EmbeddedSubProcess"]],
  ["genericShapes", "sequenceFlowType", ["StandardSequenceFlow"]],
  ["genericShapes", "serviceTaskType", ["GenericServiceTask"]],
  ["genericShapes", "taskType", ["ConfiguredTask"]],
  ["genericShapes", "parallelGatewayType", ["ParallelGateway"]],
  ["genericShapes", "exclusiveGatewayType", ["ExclusiveOrInclusiveGateway"]],
  ["genericShapes", "inclusiveGatewayType", ["ExclusiveOrInclusiveGateway"]],
  ["genericShapes", "eventBasedGatewayType", ["EventBasedGateway"]],
  ["genericShapes", "intermediateCatchEventType", ["IntermediateCatchEvent"]],
  ["genericShapes", "receiveTaskType", ["ReceiveTask"]],
  ["genericShapes", "boundaryEventType", ["BoundaryEvent"]],
  ["mappedSuccessShapes", "startEventType", ["PlainNode"]],
  ["mappedSuccessShapes", "endEventType", ["PlainNode"]],
  ["mappedSuccessShapes", "serviceTaskType", ["MappedSuccessServiceTask"]],
  ["mappedSuccessShapes", "sequenceFlowType", ["MappedSuccessSequenceFlow"]],
  ["mappedBoundaryShapes", "startEventType", ["MappedBoundaryIdentityNode"]],
  ["mappedBoundaryShapes", "endEventType", ["MappedBoundaryIdentityNode"]],
  ["mappedBoundaryShapes", "userTaskType", ["PlainNode"]],
  ["mappedBoundaryShapes", "serviceTaskType", ["MappedBoundaryServiceTask"]],
  ["mappedBoundaryShapes", "boundaryEventType", ["MappedBoundaryEvent"]],
  ["mappedBoundaryShapes", "sequenceFlowType", ["MappedBoundarySequenceFlow"]],
  ["callActivityShapes", "startEventType", ["PlainNode"]],
  ["callActivityShapes", "userTaskType", ["PlainNode"]],
  ["callActivityShapes", "endEventType", ["PlainNode"]],
  ["callActivityShapes", "callActivityType", ["CallActivity"]],
  ["callActivityShapes", "sequenceFlowType", ["StandardSequenceFlow"]],
  ["userTaskMetadataShapes", "startEventType", ["PlainNode", "MessageStartEvent", "TimerStartEvent"]],
  ["userTaskMetadataShapes", "userTaskType", ["UserTaskMetadata"]],
  ["userTaskMetadataShapes", "endEventType", ["PlainNode", "ErrorEndEvent", "TerminateEndEvent"]],
  ["userTaskMetadataShapes", "subProcessType", ["EmbeddedSubProcess"]],
  ["userTaskMetadataShapes", "sequenceFlowType", ["StandardSequenceFlow"]],
  ["userTaskMetadataShapes", "serviceTaskType", ["GenericServiceTask"]],
  ["userTaskMetadataShapes", "taskType", ["ConfiguredTask"]],
  ["userTaskMetadataShapes", "parallelGatewayType", ["ParallelGateway"]],
  ["userTaskMetadataShapes", "exclusiveGatewayType", ["ExclusiveOrInclusiveGateway"]],
  ["userTaskMetadataShapes", "inclusiveGatewayType", ["ExclusiveOrInclusiveGateway"]],
  ["userTaskMetadataShapes", "eventBasedGatewayType", ["EventBasedGateway"]],
  ["userTaskMetadataShapes", "intermediateCatchEventType", ["IntermediateCatchEvent"]],
  ["userTaskMetadataShapes", "receiveTaskType", ["ReceiveTask"]],
  ["userTaskMetadataShapes", "boundaryEventType", ["BoundaryEvent"]],
] as const;

test("rejects a restored private list before accepting the inventory and every live consumer", async () => {
  const inclusivePath = path.join(sourceRoot, "inclusive-gateway-source.ts");
  const original = await readFile(inclusivePath, "utf8");
  const mutation = original.replace(
    "hasOnlyProjectedFlowElementKeys(\n    element,\n    ProjectedFlowElementShape.ExclusiveOrInclusiveGateway,\n  )",
    'hasOnlyModelledKeys(element, ["$type", "id", "name", "gatewayDirection", "default"])',
  );
  assert.notEqual(mutation, original, "the seeded private-list mutation matched nothing");

  const liveApi = new API({ cwd: projectRoot });
  try {
    const live = liveApi.updateSnapshot({ openProjects: [tsconfig] });
    const files = projectSourceFiles(live);
    assertInventoryOwnership(files);
    assertConsumerOwnership(files);
    live.dispose();
  } finally {
    liveApi.close();
  }

  let overriddenReads = 0;
  const mutatedApi = new API({
    cwd: projectRoot,
    fs: {
      readFile(fileName) {
        if (path.resolve(fileName) === inclusivePath) {
          overriddenReads += 1;
          return mutation;
        }
        return undefined;
      },
    },
  });
  try {
    const mutated = mutatedApi.updateSnapshot({ openProjects: [tsconfig] });
    assert.ok(overriddenReads > 0, "the in-memory source override must be read");
    assert.throws(
      () => assertConsumerOwnership(projectSourceFiles(mutated)),
      /private top-level key list/,
    );
    mutated.dispose();
  } finally {
    mutatedApi.close();
  }
});

test("rejects a pre-classification inventory consumer outside the closed site table", async () => {
  const scopedPath = path.join(sourceRoot, "scoped-flow-elements.ts");
  const original = await readFile(scopedPath, "utf8");
  const mutation = original.replace(
    "function isOrdinaryEmbeddedSubProcess(element: ElementRecord): boolean {\n  return ",
    "function isOrdinaryEmbeddedSubProcess(element: ElementRecord): boolean {\n" +
      "  return hasOnlyProjectedFlowElementKeys(\n" +
      "    element,\n" +
      "    ProjectedFlowElementShape.EmbeddedSubProcess,\n" +
      "  ) &&\n    ",
  );
  assert.notEqual(mutation, original, "the pre-classification mutation matched nothing");

  const api = new API({
    cwd: projectRoot,
    fs: {
      readFile(fileName) {
        return path.resolve(fileName) === scopedPath ? mutation : undefined;
      },
    },
  });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [tsconfig] });
    assert.throws(
      () => assertConsumerOwnership(projectSourceFiles(snapshot)),
      /unregistered inventory consumer/,
    );
    snapshot.dispose();
  } finally {
    api.close();
  }
});

function projectSourceFiles(
  snapshot: ReturnType<API["updateSnapshot"]>,
): ReadonlyMap<string, SourceFile> {
  const project = snapshot.getProjects().find((candidate) =>
    path.resolve(candidate.configFileName) === tsconfig
  );
  assert.ok(project, "the BPMN source TypeScript project must be loaded");
  const productionFiles = project.program.getSourceFileNames().flatMap((fileName) => {
    const source = path.relative(sourceRoot, fileName);
    const file = project.program.getSourceFile(fileName);
    return source.startsWith(`..${path.sep}`) || path.isAbsolute(source) ||
        !source.endsWith(".ts") || file === undefined
      ? []
      : [[source, file] as const];
  });
  assert.ok(productionFiles.length > 0, "the production source set must not be empty");
  return new Map(productionFiles);
}

function assertInventoryOwnership(files: ReadonlyMap<string, SourceFile>): void {
  const file = files.get("projected-flow-element-keys.ts");
  assert.ok(file, "the projected flow-element key owner must be loaded");
  const shapeObject = frozenObject(variableInitializer(file, "ProjectedFlowElementShape"));
  const shapeMembers = shapeObject.properties.map(propertyName);
  assert.ok(shapeMembers.every((member) => member !== undefined));

  const keyObject = frozenObject(variableInitializer(file, "projectedFlowElementKeys"));
  const inventoryMembers = keyObject.properties.map((property) => {
    assert.ok(ast.isPropertyAssignment(property));
    assert.ok(ast.isComputedPropertyName(property.name));
    assert.ok(ast.isPropertyAccessExpression(property.name.expression));
    assert.equal(identifierText(property.name.expression.expression), "ProjectedFlowElementShape");
    const member = identifierText(property.name.expression.name);
    const keys = frozenArray(property.initializer).elements.map(stringText);
    assert.ok(member, "each inventory entry must name one exported shape");
    assert.ok(keys.every((key) => key !== undefined), member);
    assert.ok(keys.includes("$type"), member);
    assert.equal(new Set(keys).size, keys.length, member);
    return member;
  });
  assert.deepEqual([...inventoryMembers].sort(), [...shapeMembers].sort());

  const actualCases = [...new Set(inventoryCases.map(([owner]) => owner))]
    .flatMap((owner) =>
      [...shapeCases(file, owner)].map(([type, shapes]) =>
        [owner, type, shapes] as const
      )
    );
  const uniqueActual = new Map(actualCases.map((entry) =>
    [`${entry[0]}/${entry[1]}`, entry]
  ));
  assert.deepEqual(
    [...uniqueActual.values()].sort(compareMatrixEntry),
    [...inventoryCases].sort(compareMatrixEntry),
  );
  assert.deepEqual(profileDispatch(file), {
    Generic: "genericShapes",
    MappedSuccessServiceTask: "mappedSuccessShapes",
    MappedBoundaryErrorServiceTask: "mappedBoundaryShapes",
    CallActivity: "callActivityShapes",
    UserTaskMetadata: "userTaskMetadataShapes",
  });
}

function variableInitializer(file: SourceFile, name: string): Node {
  for (const statement of file.statements) {
    if (!ast.isVariableStatement(statement)) {
      continue;
    }
    const declaration = statement.declarationList.declarations.find((candidate) =>
      identifierText(candidate.name) === name
    );
    if (declaration?.initializer !== undefined) {
      return declaration.initializer;
    }
  }
  throw new Error(`${name} must be a top-level variable with an initializer`);
}

function frozenObject(node: Node): ast.ObjectLiteralExpression {
  const call = unwrapExpression(node);
  assert.ok(ast.isCallExpression(call));
  assert.ok(ast.isPropertyAccessExpression(call.expression));
  assert.equal(identifierText(call.expression.expression), "Object");
  assert.equal(identifierText(call.expression.name), "freeze");
  const argument = unwrapExpression(call.arguments[0]);
  assert.ok(ast.isObjectLiteralExpression(argument));
  return argument;
}

function frozenArray(node: Node): ast.ArrayLiteralExpression {
  const call = unwrapExpression(node);
  assert.ok(ast.isCallExpression(call));
  assert.ok(ast.isPropertyAccessExpression(call.expression));
  assert.equal(identifierText(call.expression.expression), "Object");
  assert.equal(identifierText(call.expression.name), "freeze");
  const argument = unwrapExpression(call.arguments[0]);
  assert.ok(ast.isArrayLiteralExpression(argument));
  return argument;
}

function unwrapExpression(node: Node | undefined): Node {
  assert.ok(node, "an expression must be present");
  if (
    ast.isAsExpression(node) ||
    ast.isSatisfiesExpression(node) ||
    ast.isParenthesizedExpression(node)
  ) {
    return unwrapExpression(node.expression);
  }
  return node;
}

function propertyName(property: Node): string {
  assert.ok(ast.isPropertyAssignment(property));
  const name = identifierText(property.name) ?? stringText(property.name);
  assert.ok(name, "an inventory object property must have a static name");
  return name;
}

function stringText(node: Node | undefined): string {
  assert.ok(node && ast.isStringLiteral(node), "an inventory key must be a string literal");
  return node.text;
}

function shapeCases(
  file: SourceFile,
  owner: string,
): ReadonlyMap<string, ReadonlyArray<string>> {
  const declaration = requiredFunction(file, owner);
  const statement = firstNode(declaration, ast.isSwitchStatement);
  assert.ok(statement, `${owner} must contain a closed type switch`);
  const matrix = new Map<string, ReadonlyArray<string>>();
  const pendingTypes: string[] = [];
  for (const clause of statement.caseBlock.clauses) {
    if (ast.isCaseClause(clause)) {
      assert.ok(ast.isPropertyAccessExpression(clause.expression));
      const type = identifierText(clause.expression.name);
      assert.ok(type);
      pendingTypes.push(type);
    }
    const returned = clause.statements.find(ast.isReturnStatement);
    if (returned === undefined) {
      continue;
    }
    if (ast.isDefaultClause(clause)) {
      assert.equal(identifierText(returned.expression), "undefined");
      continue;
    }
    const value = unwrapExpression(returned.expression);
    assert.ok(ast.isArrayLiteralExpression(value));
    const shapes = value.elements.map((element) => {
      assert.ok(ast.isPropertyAccessExpression(element));
      assert.equal(identifierText(element.expression), "ProjectedFlowElementShape");
      const shape = identifierText(element.name);
      assert.ok(shape);
      return shape;
    });
    for (const type of pendingTypes.splice(0)) {
      matrix.set(type, shapes);
    }
  }
  assert.equal(pendingTypes.length, 0, `${owner} contains an unowned fallthrough case`);
  return matrix;
}

function profileDispatch(file: SourceFile): Readonly<Record<string, string>> {
  const declaration = requiredFunction(file, "projectedFlowElementShapes");
  const statement = firstNode(declaration, ast.isSwitchStatement);
  assert.ok(statement);
  return Object.fromEntries(statement.caseBlock.clauses.flatMap((clause) => {
    if (!ast.isCaseClause(clause)) {
      return [];
    }
    assert.ok(ast.isPropertyAccessExpression(clause.expression));
    const profile = identifierText(clause.expression.name);
    const returned = clause.statements.find(ast.isReturnStatement);
    const call = unwrapExpression(returned?.expression);
    assert.ok(profile && ast.isCallExpression(call));
    const owner = identifierText(call.expression);
    assert.ok(owner);
    return [[profile, owner]];
  }));
}

function requiredFunction(file: SourceFile, name: string): Node {
  const declaration = topLevelFunctions(file).find((candidate) =>
    functionName(candidate) === name
  );
  assert.ok(declaration, `${name} must be a top-level function`);
  return declaration;
}

function firstNode<T extends Node>(
  root: Node,
  predicate: (node: Node) => node is T,
): T | undefined {
  let found: T | undefined;
  visit(root, (candidate) => {
    if (found === undefined && predicate(candidate)) {
      found = candidate;
    }
  });
  return found;
}

function compareMatrixEntry(left: MatrixEntry, right: MatrixEntry): number {
  return `${left[0]}/${left[1]}`.localeCompare(`${right[0]}/${right[1]}`);
}

function assertConsumerOwnership(files: ReadonlyMap<string, SourceFile>): void {
  for (const site of consumers) {
    const file = files.get(site.source);
    assert.ok(file, site.source);
    const declaration = topLevelFunctions(file).find((candidate) =>
      functionName(candidate) === site.anchor
    );
    assert.ok(declaration, `${site.source}#${site.anchor} must exist`);
    const privateLists = callsNamed(declaration, "hasOnlyModelledKeys").filter((call) =>
      identifierText(call.arguments[0]) === site.elementName &&
      call.arguments[1] !== undefined &&
      ast.isArrayLiteralExpression(call.arguments[1])
    );
    if (privateLists.length > 0) {
      throw new Error(`${site.source}#${site.anchor} contains a private top-level key list`);
    }
    const calls = inventoryCalls(declaration);
    assert.equal(calls.length, 1, `${site.source}#${site.anchor} must use one inventory predicate`);
    assert.equal(
      inventoryShape(calls[0]),
      site.shape,
      `${site.source}#${site.anchor} must use its registered inventory entry`,
    );
  }

  const expectedSites = new Set(consumers.map(siteKey));
  const actualSites = new Set<string>();
  for (const [source, file] of files) {
    for (const declaration of topLevelFunctions(file)) {
      if (inventoryCalls(declaration).length > 0) {
        actualSites.add(`${source}#${functionName(declaration)}`);
      }
    }
  }
  const unexpectedSites = [...actualSites].filter((site) => !expectedSites.has(site));
  assert.deepEqual(
    unexpectedSites,
    [],
    `unregistered inventory consumer: ${unexpectedSites.join(", ")}`,
  );
  assert.deepEqual([...actualSites].sort(), [...expectedSites].sort());

  const consumedShapes = new Set(consumers.map(({ shape }) => shape));
  const owner = files.get("projected-flow-element-keys.ts");
  assert.ok(owner);
  const declaredShapes = frozenObject(
    variableInitializer(owner, "ProjectedFlowElementShape"),
  ).properties.map(propertyName);
  assert.deepEqual(
    [...consumedShapes].sort(),
    [...declaredShapes].sort(),
  );
}

function topLevelFunctions(file: SourceFile): ReadonlyArray<Node> {
  return file.statements.filter(ast.isFunctionDeclaration);
}

function functionName(node: Node): string {
  return ast.isFunctionDeclaration(node) ? identifierText(node.name) ?? "" : "";
}

function inventoryCalls(node: Node): ReadonlyArray<ast.CallExpression> {
  return callsNamed(node, "hasOnlyProjectedFlowElementKeys");
}

function callsNamed(node: Node, name: string): ReadonlyArray<ast.CallExpression> {
  const calls: ast.CallExpression[] = [];
  visit(node, (candidate) => {
    if (
      ast.isCallExpression(candidate) &&
      identifierText(candidate.expression) === name
    ) {
      calls.push(candidate);
    }
  });
  return calls;
}

function visit(node: Node, action: (candidate: Node) => void): void {
  action(node);
  node.forEachChild((child) => {
    visit(child, action);
    return undefined;
  });
}

function inventoryShape(call: ast.CallExpression | undefined): string | undefined {
  const argument = call?.arguments[1];
  return argument !== undefined && ast.isPropertyAccessExpression(argument) &&
      identifierText(argument.expression) === "ProjectedFlowElementShape"
    ? identifierText(argument.name)
    : undefined;
}

function identifierText(node: Node | undefined): string | undefined {
  return node !== undefined && ast.isIdentifier(node) ? node.text : undefined;
}

function siteKey({ source, anchor }: ConsumerSite): string {
  return `${source}#${anchor}`;
}

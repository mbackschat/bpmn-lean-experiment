import {
  CheckedProcessKind,
  compareCanonicalStrings,
  type SourceOverlayIdentity,
} from "@bpmn-lean/semantic-core";
import {
  locateContainedElements,
  orderedElementDiagnostics,
} from "./admission-diagnostics.js";
import {
  projectCheckedNodes,
  projectCheckedSequenceFlows,
} from "./checked-element-projection.js";
import { isAdmittedCheckedProcess } from "./checked-process-admission.js";
import {
  BpmnSourceDiagnosticCode,
  type BpmnSourceIdentity,
  type CheckedCompilationProjection,
} from "./contracts.js";
import {
  parallelMultiInstanceSourceConfig,
  readExactParallelMultiInstanceSource,
} from "./parallel-multi-instance-source-reader.js";
import {
  foreignAttributeRejections,
} from "./preserved-element-classification.js";
import { definitionScopeId } from "./scoped-flow-elements.js";

export function compileParallelMultiInstanceCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  sourceOverlay: SourceOverlayIdentity | null,
): CheckedCompilationProjection {
  const config = parallelMultiInstanceSourceConfig;
  const exact = readExactParallelMultiInstanceSource(rootElement, config);
  if (exact === undefined) {
    return unsupported(
      "Parallel Multi-Instance source must match the reviewed ItemDefinition, data-association, User Task, completion-condition, and lifetime-Timer shape exactly.",
    );
  }
  const foreignAttributes = foreignAttributeRejections(
    exact.definitions,
    locateContainedElements(exact.definitions),
    new Set(),
  );
  if (foreignAttributes.length > 0) {
    return {
      checkedProcess: undefined,
      diagnostics: orderedElementDiagnostics(foreignAttributes),
    };
  }
  const sequenceFlows = projectCheckedSequenceFlows(
    exact.sequenceFlows,
    exact.definitions.expressionLanguage,
    undefined,
  );
  const ordinaryNodes = sequenceFlows === undefined
    ? undefined
    : projectCheckedNodes(
        exact.ordinaryNodes,
        sequenceFlows,
        exact.definitions,
        {
          process: exact.process,
          messageArtifacts: undefined,
          errorArtifact: undefined,
        },
        undefined,
        undefined,
        config.semanticProfile,
      );
  if (sequenceFlows === undefined || ordinaryNodes === undefined) {
    return unsupported(
      "Every ordinary control node and Sequence Flow must retain the exact plain shape and resolved references.",
    );
  }
  const nodes = [...ordinaryNodes, exact.multiInstanceNode].sort(compareIds);
  const scopeId = definitionScopeId(config.processId);
  const definitionScopes = [{
    id: scopeId,
    parentScopeId: null,
    originElementId: config.processId,
  }];
  const nodeScopes = nodes.map(({ id }) => ({ nodeId: id, scopeId }));
  const flows = [...sequenceFlows].sort(compareIds);
  const sequenceFlowScopes = flows.map(({ id }) => ({
    sequenceFlowId: id,
    scopeId,
  }));
  const graph = {
    processId: config.processId,
    definitionScopes,
    nodeScopes,
    sequenceFlowScopes,
    nodes,
    flows,
  };
  if (!isAdmittedCheckedProcess(
    graph,
    exact.definitions.expressionLanguage,
    config.semanticProfile,
  )) {
    return unsupported(
      "Parallel Multi-Instance control and lifetime-Timer routes must satisfy the selected acyclic graph.",
    );
  }
  return {
    checkedProcess: {
      kind: CheckedProcessKind.CheckedProcess,
      identity: {
        semanticProfile: config.semanticProfile,
        sourceId: source.id,
        sourceSha256: source.sha256,
        sourceOverlay,
      },
      processId: config.processId,
      definitionScopes,
      nodeScopes,
      sequenceFlowScopes,
      nodes,
      sequenceFlows: graph.flows,
    },
    diagnostics: [],
  };
}

function compareIds(
  left: Readonly<{ id: string }>,
  right: Readonly<{ id: string }>,
): number {
  return compareCanonicalStrings(left.id, right.id);
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return {
    checkedProcess: undefined,
    diagnostics: [{
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      element: null,
      evidence,
    }],
  };
}

import { CheckedNodeKind, SemanticProfileId } from "@bpmn-lean/semantic-core";
import { compileCheckedProcess } from "./checked-process-compiler.js";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type { BpmnSourceIdentity, CheckedCompilationProjection } from "./contracts.js";
import { selectMappedServiceTaskSourcePolicy } from "./mapped-service-task-source-policy.js";
import {
  exactForeignAttributeRejections, foreignAttributeConsumingTypes, foreignAttributeRejections,
} from "./preserved-element-classification.js";
import { projectSerialBusinessServiceTask } from "./serial-business-task-source.js";
import type { AdmittedSourceOverlay } from "./source-overlay.js";

const camunda = "http://camunda.org/schema/1.0/bpmn";
const semanticProfile = SemanticProfileId.EmbeddedSubProcessCompletion;

/**
 * CSE-ADMIT-01 reader of the embedded completion profile. Without an overlay the model compiles exactly as before, through
 * the generic scoped compiler. With one, Service Tasks bind their handlers through the serial business-task binding of
 * `CIB-EXT-0015`, the only foreign attributes admitted are their delegate and async-before markers, and the model must
 * contain a Service Task, because the overlay is admitted exactly when it binds one.
 */
export function compileEmbeddedScopeSource(
  root: unknown,
  source: BpmnSourceIdentity,
  overlay: AdmittedSourceOverlay | null,
): CheckedCompilationProjection {
  if (overlay === null) {
    return compileCheckedProcess(root, source, semanticProfile, (definitions, located) =>
      foreignAttributeRejections(definitions, located, foreignAttributeConsumingTypes(semanticProfile)), null);
  }
  const selection = selectMappedServiceTaskSourcePolicy(semanticProfile, overlay);
  if (selection.policy === null) return unsupported(selection.rejection);
  const { policy } = selection;
  if (policy.sourceOverlay === null) return unsupported("A Service Task binding requires the selected overlay.");
  const compiled = compileCheckedProcess(root, source, semanticProfile,
    (definitions, located) => exactForeignAttributeRejections(definitions, located, (type, namespace, name) =>
      type === "bpmn:ServiceTask" && namespace === camunda && (name === "delegateExpression" || name === "asyncBefore")),
    { sourceOverlay: policy.sourceOverlay,
      project: (element, definitions) => projectSerialBusinessServiceTask(element, definitions, policy) });
  return compiled.checkedProcess !== undefined &&
      !compiled.checkedProcess.nodes.some(({ kind }) => kind === CheckedNodeKind.ServiceTask)
    ? unsupported("A source overlay is admitted only for a model with a Service Task.")
    : compiled;
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return { checkedProcess: undefined, diagnostics: [{ code: BpmnSourceDiagnosticCode.UnsupportedModel, element: null, evidence }] };
}

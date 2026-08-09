import {
  EffectOperation,
  EffectProtocol,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";
import type { SourceOverlayIdentity } from "@bpmn-lean/semantic-core";

import type {
  AdmittedSourceOverlay,
  SourceEffectBinding,
  SourceInertAttribute,
} from "./source-overlay.js";

export type MappedServiceTaskSourcePolicy = Readonly<{
  sourceOverlay: SourceOverlayIdentity | null;
  effectBindings: ReadonlyArray<SourceEffectBinding>;
  inertAttributes: ReadonlyArray<SourceInertAttribute>;
}>;

export type SourcePolicySelection =
  | Readonly<{ policy: MappedServiceTaskSourcePolicy; rejection: null }>
  | Readonly<{ policy: null; rejection: string }>;

const mappedSuccessBinding: SourceEffectBinding = Object.freeze({
  source: Object.freeze({
    implementation: null,
    delegateExpression: "${mappedSuccessHandler}",
  }),
  descriptor: Object.freeze({
    protocol: EffectProtocol.Activity,
    operation: EffectOperation.MappedSuccess,
  }),
});

const mappedBoundaryErrorBinding: SourceEffectBinding = Object.freeze({
  source: Object.freeze({
    implementation: "urn:bpmn-lean:effect-binding:mapped-boundary-error:v1",
    delegateExpression: "#{mappedBoundaryErrorHandler}",
  }),
  descriptor: Object.freeze({
    protocol: EffectProtocol.Activity,
    operation: EffectOperation.MappedBoundaryError,
  }),
});

export function selectMappedServiceTaskSourcePolicy(
  semanticProfile: string,
  overlay: AdmittedSourceOverlay | null,
): SourcePolicySelection {
  const builtIn = builtInBinding(semanticProfile);
  if (builtIn === undefined) {
    return overlay === null
      ? rejected("The selected profile has no mapped Service Task source policy.")
      : rejected("The selected profile does not admit a source overlay.");
  }
  if (overlay === null) {
    return {
      policy: Object.freeze({
        sourceOverlay: null,
        effectBindings: Object.freeze([builtIn]),
        inertAttributes: Object.freeze([]),
      }),
      rejection: null,
    };
  }
  if (overlay.semanticProfile !== semanticProfile) {
    return rejected("The source overlay semanticProfile does not equal the selected profile.");
  }
  if (overlay.effectBindings.some(({ descriptor }) =>
    !sameDescriptor(descriptor, builtIn.descriptor)
  )) {
    return rejected(
      "A source overlay descriptor is outside the selected profile-owned allowlist.",
    );
  }
  const bindings = [builtIn, ...overlay.effectBindings];
  if (hasDuplicateSourceBinding(bindings)) {
    return rejected("Source overlay bindings must be exact and distinct.");
  }
  return {
    policy: Object.freeze({
      sourceOverlay: overlay.identity,
      effectBindings: Object.freeze(bindings),
      inertAttributes: overlay.inertAttributes,
    }),
    rejection: null,
  };
}

export function selectedEffectBinding(
  policy: MappedServiceTaskSourcePolicy,
  implementation: unknown,
  delegateExpression: unknown,
): SourceEffectBinding | undefined {
  return policy.effectBindings.find(({ source }) =>
    source.implementation === implementation &&
    source.delegateExpression === delegateExpression
  );
}

export function admitsInertAttribute(
  policy: MappedServiceTaskSourcePolicy,
  elementType: unknown,
  namespaceUri: string,
  localName: string,
): boolean {
  return typeof elementType === "string" && policy.inertAttributes.some(
    (attribute) =>
      attribute.elementType === elementType &&
      attribute.expandedName.namespaceUri === namespaceUri &&
      attribute.expandedName.localName === localName,
  );
}

function builtInBinding(
  semanticProfile: string,
): SourceEffectBinding | undefined {
  switch (semanticProfile) {
    case SemanticProfileId.MappedSuccessServiceTask:
      return mappedSuccessBinding;
    case SemanticProfileId.MappedBoundaryErrorServiceTask:
      return mappedBoundaryErrorBinding;
    default:
      return undefined;
  }
}

function sameDescriptor(
  left: SourceEffectBinding["descriptor"],
  right: SourceEffectBinding["descriptor"],
): boolean {
  return left.protocol === right.protocol && left.operation === right.operation;
}

function hasDuplicateSourceBinding(
  bindings: ReadonlyArray<SourceEffectBinding>,
): boolean {
  return bindings.some((candidate, index) =>
    bindings.some((other, otherIndex) =>
      otherIndex < index &&
      other.source.implementation === candidate.source.implementation &&
      other.source.delegateExpression === candidate.source.delegateExpression
    )
  );
}

function rejected(rejection: string): SourcePolicySelection {
  return { policy: null, rejection };
}

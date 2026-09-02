/**
 * Value shapes that the checked BPMN graph and the Semantic Process IL both carry unchanged.
 *
 * A lowering step rewrites topology, not these values: a message channel, an effect descriptor, a
 * variable mapping, and a Simple Boolean expression mean the same thing on either side of it. They
 * live here so neither contract owns a shape the other must restate, and so a change to one of them
 * cannot silently fork between checked source and the program lowered from it.
 */
import type { DeepReadonly } from "./deep-readonly.js";

/** One scope a definition declares, identical in the checked graph and in the program. */
export type DefinitionScope = DeepReadonly<{
  id: string;
  parentScopeId: string | null;
  originElementId: string;
}>;

/** The BPMN Error a throw raises and a handler catches, by definition and element identity. */
export type ErrorReference = DeepReadonly<{
  errorDefinitionId: string;
  errorElementId: string;
  code: string;
}>;

export enum MappingExpressionKind {
  StringLiteral = "stringLiteral",
  LocalVariable = "localVariable",
}

export type MappingExpression =
  | DeepReadonly<{
      kind: MappingExpressionKind.StringLiteral;
      value: string;
    }>
  | DeepReadonly<{
      kind: MappingExpressionKind.LocalVariable;
      name: string;
    }>;

export type VariableMapping = DeepReadonly<{
  target: string;
  expression: MappingExpression;
}>;
export const EffectProtocol = {
  Activity: "urn:bpmn-lean:effect-protocol:activity-v1",
} as const;

export const EffectOperation = {
  Probe: "urn:bpmn-lean:effect-operation:probe-v1",
  MappedSuccess: "urn:bpmn-lean:effect-operation:mapped-success-v1",
  MappedBoundaryError:
    "urn:bpmn-lean:effect-operation:mapped-boundary-error-v1",
  CompensationSingleEffect:
    "urn:bpmn-lean:effect-operation:compensation-single-effect-v1",
} as const;

export type EffectDescriptor = DeepReadonly<{
  protocol: string;
  operation: string;
}>;

export const SimpleBooleanExpressionLanguage =
  "urn:bpmn-lean:expression:simple-boolean:v1";

export enum SimpleBooleanExpressionKind {
  Literal = "literal",
  IsPresent = "isPresent",
  IsNull = "isNull",
  StringEquals = "stringEquals",
}

export type SimpleBooleanExpression =
  | DeepReadonly<{
      kind: SimpleBooleanExpressionKind.Literal;
      value: boolean;
    }>
  | DeepReadonly<{
      kind: SimpleBooleanExpressionKind.IsPresent;
      variable: string;
    }>
  | DeepReadonly<{
      kind: SimpleBooleanExpressionKind.IsNull;
      variable: string;
    }>
  | DeepReadonly<{
      kind: SimpleBooleanExpressionKind.StringEquals;
      variable: string;
      value: string;
    }>;
export const MessageChannelKind = {
  OperationMessage: "operationMessage",
  DirectMessage: "directMessage",
} as const;

export type MessageChannelKind =
  typeof MessageChannelKind[keyof typeof MessageChannelKind];

export type MessageChannel = DeepReadonly<
  | {
      kind: typeof MessageChannelKind.OperationMessage;
      interfaceId: string;
      interfaceOperationId: string;
      messageId: string;
    }
  | {
      kind: typeof MessageChannelKind.DirectMessage;
      messageId: string;
    }
>;

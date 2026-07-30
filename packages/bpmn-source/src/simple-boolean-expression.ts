import {
  SimpleBooleanExpressionKind,
} from "@bpmn-lean/semantic-core";
import type {
  SimpleBooleanExpression,
} from "@bpmn-lean/semantic-core";
import {
  isWellFormedWireString,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/u;
const maxExpressionBytes = 256;
const maxStringValueBytes = 128;

/** Parses exactly the immutable Simple Boolean v1 source language. */
export function parseSimpleBooleanExpression(
  source: string,
): SimpleBooleanExpression | undefined {
  if (
    !isWellFormedWireString(source) ||
    utf8ByteLength(source) > maxExpressionBytes
  ) {
    return undefined;
  }
  switch (source) {
    case "true":
      return {
        kind: SimpleBooleanExpressionKind.Literal,
        value: true,
      };
    case "false":
      return {
        kind: SimpleBooleanExpressionKind.Literal,
        value: false,
      };
    default:
      break;
  }

  const present = readSingleArgument(source, "isPresent");
  if (present !== undefined && isVariableName(present)) {
    return {
      kind: SimpleBooleanExpressionKind.IsPresent,
      variable: present,
    };
  }
  const nullCheck = readSingleArgument(source, "isNull");
  if (nullCheck !== undefined && isVariableName(nullCheck)) {
    return {
      kind: SimpleBooleanExpressionKind.IsNull,
      variable: nullCheck,
    };
  }
  return parseStringEquals(source);
}

function parseStringEquals(
  source: string,
): SimpleBooleanExpression | undefined {
  const prefix = "stringEquals(";
  if (!source.startsWith(prefix) || !source.endsWith(")")) {
    return undefined;
  }
  const arguments_ = source.slice(prefix.length, -1);
  const separator = arguments_.indexOf(",");
  if (separator <= 0) {
    return undefined;
  }
  const variable = arguments_.slice(0, separator);
  const token = arguments_.slice(separator + 1);
  if (!isVariableName(variable)) {
    return undefined;
  }
  const value = parseCanonicalJsonString(token);
  if (
    value === undefined ||
    utf8ByteLength(value) > maxStringValueBytes
  ) {
    return undefined;
  }
  return {
    kind: SimpleBooleanExpressionKind.StringEquals,
    variable,
    value,
  };
}

function parseCanonicalJsonString(token: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(token);
  } catch {
    return undefined;
  }
  return (
      typeof parsed === "string" &&
      isWellFormedWireString(parsed) &&
      JSON.stringify(parsed) === token
    )
    ? parsed
    : undefined;
}

function readSingleArgument(
  source: string,
  functionName: string,
): string | undefined {
  const prefix = `${functionName}(`;
  return source.startsWith(prefix) && source.endsWith(")")
    ? source.slice(prefix.length, -1)
    : undefined;
}

function isVariableName(value: string): boolean {
  return identifierPattern.test(value);
}

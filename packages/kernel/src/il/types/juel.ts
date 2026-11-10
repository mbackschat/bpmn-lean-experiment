/**
 * The JUEL node table, transcribed from `Kernel/IL/Types/Juel.lean`: the reader's meaning-preserving parse of one JUEL
 * text at the Core level ([expression semantics](../../../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#il-shape-and-placement)).
 * Part of `il/types.ts`, which re-exports it.
 */

/** EL 2.2 binary operators at the pinned grammar (`Parser.java` `or` to `mul`). */
export enum JuelBinary {
  Or = "or",
  And = "and",
  Eq = "eq",
  Ne = "ne",
  Lt = "lt",
  Gt = "gt",
  Le = "le",
  Ge = "ge",
  Add = "add",
  Sub = "sub",
  Mul = "mul",
  Div = "div",
  Mod = "mod",
}

export enum JuelUnary {
  Not = "not",
  Neg = "neg",
  Empty = "empty",
}

/**
 * The closed read-only method list of the Core level, each a Java method name; the member values are the Java names, so
 * the codecs decode a call target through this enum's own wire names.
 */
export enum JuelMethod {
  Length = "length",
  IsEmpty = "isEmpty",
  Size = "size",
  Equals = "equals",
  Contains = "contains",
  StartsWith = "startsWith",
  EndsWith = "endsWith",
  IndexOf = "indexOf",
  LastIndexOf = "lastIndexOf",
  Substring = "substring",
  ToUpperCase = "toUpperCase",
  ToLowerCase = "toLowerCase",
  Trim = "trim",
  Concat = "concat",
  Replace = "replace",
  Get = "get",
  ContainsKey = "containsKey",
  ContainsValue = "containsValue",
}

/** `JuelMethod.admits`: the argument counts a listed method has an overload for; any other count is an unlisted call. */
export const juelMethodCounts: Readonly<Record<JuelMethod, readonly number[]>> = {
  [JuelMethod.Length]: [0],
  [JuelMethod.IsEmpty]: [0],
  [JuelMethod.Size]: [0],
  [JuelMethod.ToUpperCase]: [0],
  [JuelMethod.ToLowerCase]: [0],
  [JuelMethod.Trim]: [0],
  [JuelMethod.Equals]: [1],
  [JuelMethod.Contains]: [1],
  [JuelMethod.StartsWith]: [1],
  [JuelMethod.EndsWith]: [1],
  [JuelMethod.IndexOf]: [1],
  [JuelMethod.LastIndexOf]: [1],
  [JuelMethod.Concat]: [1],
  [JuelMethod.Get]: [1],
  [JuelMethod.ContainsKey]: [1],
  [JuelMethod.ContainsValue]: [1],
  [JuelMethod.Substring]: [1, 2],
  [JuelMethod.Replace]: [2],
};

export enum JuelCallTag {
  Listed = "listed",
  Other = "other",
}

/** A method call's target: a listed method, or another name, which admission refuses (`expression.juel.method`). */
export type JuelCall =
  | { readonly tag: JuelCallTag.Listed; readonly method: JuelMethod }
  | { readonly tag: JuelCallTag.Other; readonly name: string };

export enum JuelNodeTag {
  Text = "text",
  Composite = "composite",
  Null = "null",
  Bool = "bool",
  Integer = "integer",
  Float = "float",
  StringLiteral = "stringLiteral",
  Identifier = "identifier",
  Function = "function",
  Dot = "dot",
  Bracket = "bracket",
  Call = "call",
  ComputedCall = "computedCall",
  Unary = "unary",
  Binary = "binary",
  Choice = "choice",
}

/** A function call `qualifier:name(args)`, which the Core level refuses whole. */
export type JuelFunctionNode = { readonly qualifier: string | null; readonly name: string; readonly args: readonly number[] };
/** A method call on `receiver` by a written name. */
export type JuelCallNode = { readonly receiver: number; readonly target: JuelCall; readonly args: readonly number[] };
/** A method call whose name is computed (`receiver[name](args)`), which the Core level refuses. */
export type JuelComputedCallNode = { readonly receiver: number; readonly name: number; readonly args: readonly number[] };
export type JuelBinaryNode = { readonly op: JuelBinary; readonly left: number; readonly right: number };
export type JuelChoiceNode = { readonly condition: number; readonly whenTrue: number; readonly whenFalse: number };

/** One node of a parsed JUEL text; a child is the index of an earlier node, and the root is the last. */
export type JuelNode =
  | { readonly tag: JuelNodeTag.Text; readonly value: string }
  | { readonly tag: JuelNodeTag.Composite; readonly parts: readonly number[] }
  | { readonly tag: JuelNodeTag.Null }
  | { readonly tag: JuelNodeTag.Bool; readonly value: boolean }
  | { readonly tag: JuelNodeTag.Integer; readonly digits: string }
  | { readonly tag: JuelNodeTag.Float; readonly lexeme: string }
  | { readonly tag: JuelNodeTag.StringLiteral; readonly value: string }
  | { readonly tag: JuelNodeTag.Identifier; readonly name: string }
  | { readonly tag: JuelNodeTag.Function; readonly payload: JuelFunctionNode }
  | { readonly tag: JuelNodeTag.Dot; readonly base: number; readonly property: string }
  | { readonly tag: JuelNodeTag.Bracket; readonly base: number; readonly property: number }
  | { readonly tag: JuelNodeTag.Call; readonly payload: JuelCallNode }
  | { readonly tag: JuelNodeTag.ComputedCall; readonly payload: JuelComputedCallNode }
  | { readonly tag: JuelNodeTag.Unary; readonly op: JuelUnary; readonly operand: number }
  | { readonly tag: JuelNodeTag.Binary; readonly payload: JuelBinaryNode }
  | { readonly tag: JuelNodeTag.Choice; readonly payload: JuelChoiceNode };

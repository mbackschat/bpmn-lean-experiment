/**
 * Decision codecs, transcribed from `Kernel/IL/Codec/Decision.lean`: the DMN decision tables' wire form
 * (`il/types/decision.ts`), Lean's derived encoding except a FEEL number, whose coefficient travels as decimal text.
 */
import { assertNever } from "../types.js";
import {
  CollectAggregator, Comparison, DecisionLogicTag, FeelLiteralTag, HitPolicy, InputEntryTag, InputExpressionTag,
  OutputEntryTag, TypeRefTag, UnaryTestTag, type DecisionResource, type FeelLiteral, type InputEntry, type InputExpression,
  type OutputEntry, type TypeRef, type UnaryTest, type DecisionLogic,
} from "../types/decision.js";
import {
  accept, bool, inductive, leanToInt, list, mapDecoded, members, nat, objVal, objValD, option, refuse, string, struct,
  type Codec,
} from "./value.js";

// The DMN decision tables, in `Kernel.IL.Types.Decision` declaration order.

const typeRef = inductive<TypeRef>("TypeRef", {
  [TypeRefTag.String]: {},
  [TypeRefTag.Integer]: {},
  [TypeRefTag.Boolean]: {},
  [TypeRefTag.Foreign]: { name: string },
});

/** `Kernel.Codec.feelLiteralFromJson`: a number's coefficient travels as decimal text, as a `decimal` value's does. */
const feelLiteral: Codec<FeelLiteral> = {
  decode: (json) => {
    if (json === FeelLiteralTag.Null) return accept<FeelLiteral>({ tag: FeelLiteralTag.Null });
    const bool_ = objVal(json, FeelLiteralTag.Bool);
    if (bool_.ok) return mapDecoded(bool.decode(objValD(bool_.value, "value")), (value) => ({ tag: FeelLiteralTag.Bool, value }));
    const string_ = objVal(json, FeelLiteralTag.String);
    if (string_.ok) return mapDecoded(string.decode(objValD(string_.value, "value")), (value) => ({ tag: FeelLiteralTag.String, value }));
    const number = objVal(json, FeelLiteralTag.Number);
    if (!number.ok) return number;
    const coefficient = string.decode(objValD(number.value, "coefficient"));
    if (!coefficient.ok) return coefficient;
    const parsed = leanToInt(coefficient.value);
    if (parsed === null) return refuse(`invalid number coefficient ${coefficient.value}`);
    return mapDecoded(nat.decode(objValD(number.value, "scale")), (scale) => ({ tag: FeelLiteralTag.Number, coefficient: parsed, scale }));
  },
  encode: (value) => {
    switch (value.tag) {
      case FeelLiteralTag.Null:
        return FeelLiteralTag.Null;
      case FeelLiteralTag.Bool:
        return { [FeelLiteralTag.Bool]: { value: value.value } };
      case FeelLiteralTag.Number:
        return { [FeelLiteralTag.Number]: { coefficient: value.coefficient.toString(), scale: value.scale } };
      case FeelLiteralTag.String:
        return { [FeelLiteralTag.String]: { value: value.value } };
    }
    return assertNever(value);
  },
};

const unaryTest = inductive<UnaryTest>("UnaryTest", {
  [UnaryTestTag.Literal]: { value: feelLiteral },
  [UnaryTestTag.Compare]: { operator: members("Comparison", Comparison), bound: feelLiteral },
  [UnaryTestTag.Interval]: {
    value: struct("Interval", { low: feelLiteral, lowClosed: bool, high: feelLiteral, highClosed: bool }),
  },
});

const foreignText = struct("ForeignText", { language: option(string), text: string });

const inputEntry = inductive<InputEntry>("InputEntry", {
  [InputEntryTag.Any]: {},
  [InputEntryTag.Tests]: { value: struct("TestList", { negated: bool, first: unaryTest, rest: list(unaryTest) }) },
  [InputEntryTag.Foreign]: { value: foreignText },
});

const outputEntry = inductive<OutputEntry>("OutputEntry", {
  [OutputEntryTag.Literal]: { value: feelLiteral },
  [OutputEntryTag.Blank]: {},
  [OutputEntryTag.Foreign]: { value: foreignText },
});

const inputExpression = inductive<InputExpression>("InputExpression", {
  [InputExpressionTag.Variable]: { name: string },
  [InputExpressionTag.Foreign]: { value: foreignText },
});

const decisionLogic = inductive<DecisionLogic>("DecisionLogic", {
  [DecisionLogicTag.Table]: {
    value: struct("DecisionTable", {
      hitPolicy: members("HitPolicy", HitPolicy),
      aggregation: option(members("CollectAggregator", CollectAggregator)),
      inputs: list(struct("DecisionInput", { expression: inputExpression, typeRef: option(typeRef) })),
      outputs: list(struct("DecisionOutput", { name: option(string), typeRef: option(typeRef) })),
      rules: list(struct("DecisionRule", { id: string, inputs: list(inputEntry), outputs: list(outputEntry) })),
    }),
  },
  [DecisionLogicTag.Foreign]: { element: string },
});

export const decisionResource = struct<DecisionResource>("DecisionResource", {
  sourceSha256: string,
  namespace: string,
  expressionLanguage: option(string),
  decisions: list(struct("Decision", { id: string, logic: decisionLogic, requires: list(string) })),
});

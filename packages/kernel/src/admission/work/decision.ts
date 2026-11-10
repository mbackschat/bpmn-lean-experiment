/**
 * Admission of Business Rule Tasks and the DMN decision tables they name, transcribed from
 * `Kernel/Admission/Work/Decision.lean`: the admitted subset of
 * [decision semantics](../../../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md) items 1 to 4. A Business Rule
 * Task names a carried decision literally with the latest binding, no tenant and a result variable other than CIB's
 * transient `decisionResult`; DMN 1.3 resources in FEEL are admitted whole, as CIB deploys and validates every resource
 * in its deployment; each decision is one table with a selected hit policy, typed bare-name inputs, named outputs and
 * entries in the FEEL unary-test subset whose kinds agree with their `typeRef`s. A refusal carries a stable code.
 */
import {
  BusinessRuleTask, CallBindingTag, MappingDialect, ValueSourceTag, assertNever, firstOf, programDecision, withinJavaInt, type Envelope,
  type Program, type RuleWork,
} from "../../il/types.js";
import {
  DecisionLogicTag,
  FeelLiteralTag,
  HitPolicy,
  InputEntryTag,
  InputExpressionTag,
  OutputEntryTag,
  TypeRefTag,
  UnaryTestTag,
  significantDigits,
  type Decision,
  type DecisionInput,
  type DecisionOutput,
  type DecisionResource,
  type DecisionRule,
  type DecisionTable,
  type FeelLiteral,
  type InputEntry,
  type OutputEntry,
  type TypeRef,
  type UnaryTest,
} from "../../il/types/decision.js";

/**
 * The DMN 1.3 model namespace (`DmnModelConstants.java:22-37`) and its FEEL namespace, the `expressionLanguage` CIB
 * reads as FEEL (`DmnExpressionTransformHelper.java:58-78`).
 */
const dmn13 = "https://www.omg.org/spec/DMN/20191111/MODEL/";
const feel13 = "https://www.omg.org/spec/DMN/20191111/FEEL/";

/** Item 4: a number in the portable domain, exact both as a Decimal128 and as a binary64. */
function portableNumber(coefficient: bigint, scale: number): boolean {
  return significantDigits(coefficient) <= 15 && scale <= 9;
}

function typeRef(ref: TypeRef): string | null {
  switch (ref.tag) {
    case TypeRefTag.String:
    case TypeRefTag.Integer:
    case TypeRefTag.Boolean:
      return null;
    case TypeRefTag.Foreign:
      return "decision.typeRef";
  }
  return assertNever(ref);
}

/**
 * A literal a test of an input with `ref` may name (item 3): numbers under `integer`, Strings under `string`, `true`
 * and `false` under `boolean`, `null` under every one.
 */
function testLiteral(ref: TypeRef, literal: FeelLiteral): string | null {
  const kindOf = (admitted: TypeRefTag): string | null => {
    switch (ref.tag) {
      case TypeRefTag.Foreign:
        return "decision.typeRef";
      case TypeRefTag.String:
      case TypeRefTag.Integer:
      case TypeRefTag.Boolean:
        return ref.tag === admitted ? null : "decision.testKind";
    }
    return assertNever(ref);
  };
  switch (literal.tag) {
    case FeelLiteralTag.Null:
      return null;
    case FeelLiteralTag.Number:
      return kindOf(TypeRefTag.Integer) ?? (portableNumber(literal.coefficient, literal.scale) ? null : "decision.number");
    case FeelLiteralTag.String:
      return kindOf(TypeRefTag.String);
    case FeelLiteralTag.Bool:
      return kindOf(TypeRefTag.Boolean);
  }
  return assertNever(literal);
}

/** A number bound, the only one a comparison or an interval has in the grammar; under `integer` only. */
function bound(ref: TypeRef, literal: FeelLiteral): string | null {
  switch (literal.tag) {
    case FeelLiteralTag.Number:
      return testLiteral(ref, literal);
    case FeelLiteralTag.Null:
    case FeelLiteralTag.String:
    case FeelLiteralTag.Bool:
      return "decision.testKind";
  }
  return assertNever(literal);
}

function unaryTest(ref: TypeRef, test: UnaryTest): string | null {
  switch (test.tag) {
    case UnaryTestTag.Literal:
      return testLiteral(ref, test.value);
    case UnaryTestTag.Compare:
      return bound(ref, test.bound);
    case UnaryTestTag.Interval:
      return bound(ref, test.value.low) ?? bound(ref, test.value.high);
  }
  return assertNever(test);
}

function inputEntry(ref: TypeRef, entry: InputEntry): string | null {
  switch (entry.tag) {
    case InputEntryTag.Any:
      return null;
    case InputEntryTag.Tests:
      return firstOf([entry.value.first, ...entry.value.rest], (test) => unaryTest(ref, test));
    case InputEntryTag.Foreign:
      return "decision.feel";
  }
  return assertNever(entry);
}

/** A number output is an `int`, and only under `integer` or `string` (item 3). */
function numberOutput(ref: TypeRef | null, coefficient: bigint, scale: number): string | null {
  if (scale !== 0 || !withinJavaInt(coefficient) || ref === null) return "decision.number";
  switch (ref.tag) {
    case TypeRefTag.Integer:
    case TypeRefTag.String:
      return null;
    case TypeRefTag.Boolean:
      return "decision.number";
    case TypeRefTag.Foreign:
      return "decision.typeRef";
  }
  return assertNever(ref);
}

/**
 * An output entry is a non-blank literal; a number is an `int` and only under `integer` or `string`, since CIB holds an
 * untyped number as a `Long` or `Double` and `boolean` refuses every number (item 3).
 */
function outputEntry(ref: TypeRef | null, entry: OutputEntry): string | null {
  switch (entry.tag) {
    case OutputEntryTag.Blank:
      return "decision.blankOutput";
    case OutputEntryTag.Foreign:
      return "decision.feel";
    case OutputEntryTag.Literal:
      return literalOutput(ref, entry.value);
  }
  return assertNever(entry);
}

function literalOutput(ref: TypeRef | null, literal: FeelLiteral): string | null {
  switch (literal.tag) {
    case FeelLiteralTag.Number:
      return numberOutput(ref, literal.coefficient, literal.scale);
    case FeelLiteralTag.Null:
    case FeelLiteralTag.Bool:
    case FeelLiteralTag.String:
      return null;
  }
  return assertNever(literal);
}

function input(entry: DecisionInput): string | null {
  switch (entry.expression.tag) {
    case InputExpressionTag.Foreign:
      return "decision.inputExpression";
    case InputExpressionTag.Variable:
      return entry.typeRef === null ? "decision.inputType" : typeRef(entry.typeRef);
  }
  return assertNever(entry.expression);
}

/**
 * Two or more outputs each need a unique name (`DefaultDmnTransform.java:300-315`); the kernel names every entry, so a
 * single output needs one too (item 3).
 */
function declaredOutputs(declared: readonly DecisionOutput[]): string | null {
  const names = declared.flatMap((output) => (output.name === null ? [] : [output.name]));
  if (names.length !== declared.length || new Set(names).size !== names.length) return "decision.outputName";
  return firstOf(declared, (output) => (output.typeRef === null ? null : typeRef(output.typeRef)));
}

/**
 * CIB refuses a rule whose entries do not match the table's inputs and outputs one to one at deployment
 * (`DefaultDmnTransform`), as the DMN 1.3 XSD's cardinalities do within the declared types.
 */
function rule(table: DecisionTable, entry: DecisionRule): string | null {
  if (entry.inputs.length !== table.inputs.length || entry.outputs.length !== table.outputs.length) return "decision.schema";
  return firstOf(table.inputs.map((declared, index) => [declared, entry.inputs[index]!] as const),
    ([declared, test]) => (declared.typeRef === null ? null : inputEntry(declared.typeRef, test))) ??
    firstOf(table.outputs.map((declared, index) => [declared, entry.outputs[index]!] as const),
      ([declared, value]) => outputEntry(declared.typeRef, value));
}

/** PRIORITY and OUTPUT ORDER have no CIB handler and an aggregator is not selected (`DefaultHitPolicyHandlerRegistry.java:34-42`). */
function hitPolicy(table: DecisionTable): string | null {
  if (table.aggregation !== null) return "decision.hitPolicy";
  switch (table.hitPolicy) {
    case HitPolicy.Unique:
    case HitPolicy.First:
    case HitPolicy.Any:
    case HitPolicy.RuleOrder:
    case HitPolicy.Collect:
      return null;
    case HitPolicy.Priority:
    case HitPolicy.OutputOrder:
      return "decision.hitPolicy";
  }
  return assertNever(table.hitPolicy);
}

function decision(entry: Decision): string | null {
  if (entry.requires.length > 0) return "decision.requirements";
  switch (entry.logic.tag) {
    case DecisionLogicTag.Foreign:
      return "decision.logic";
    case DecisionLogicTag.Table: {
      const table = entry.logic.value;
      return hitPolicy(table) ?? firstOf(table.inputs, input) ?? declaredOutputs(table.outputs) ?? firstOf(table.rules, (each) => rule(table, each));
    }
  }
  return assertNever(entry.logic);
}

function resource(entry: DecisionResource): string | null {
  if (entry.namespace !== dmn13) return "decision.namespace";
  if (entry.expressionLanguage !== null && entry.expressionLanguage !== feel13) return "decision.expressionLanguage";
  return firstOf(entry.decisions, decision);
}

/** Every resource the program carries, whole, and decision ids unique across them. */
export function resources(program: Program): string | null {
  const ids = program.decisionResources.flatMap((entry) => entry.decisions).map((entry) => entry.id);
  return firstOf(program.decisionResources, resource) ?? (new Set(ids).size !== ids.length ? "decision.duplicateId" : null);
}

/**
 * Item 1: a profile that selects decision tables (CIB-EXT-0032), since BPMN 2.0.2 §10.3.3 leaves a Business Rule Task's
 * rule engine open; inputs and outputs only as `camunda:inputOutput` parameters, since CIB runs no Data Association
 * on a decision task and the decision semantics give a DataOutput no source; a literal `decisionRef` the program
 * carries, the latest binding, no tenant, and a result variable CIB does not write onto the task's transient
 * `decisionResult` local (`DecisionEvaluationUtil.java:79-87`).
 */
export function task(program: Program, work: RuleWork, envelope: Envelope): string | null {
  if (program.options.businessRuleTask === BusinessRuleTask.Refused) return "work.rule";
  if ([...envelope.inputs, ...envelope.outputs].some((mapping) => mapping.dialect === MappingDialect.DataAssociation)) {
    return "work.rule.dataAssociation";
  }
  switch (work.decision.tag) {
    case ValueSourceTag.Expression:
      return "work.rule.decisionExpression";
    case ValueSourceTag.Literal:
      return binding(work) ?? (work.tenant !== null ? "work.rule.tenant"
        : work.resultVariable === "decisionResult" ? "work.rule.resultVariable"
        : programDecision(program, work.decision.value) === null ? "work.rule.decisionMissing"
        : null);
  }
  return assertNever(work.decision);
}

function binding(work: RuleWork): string | null {
  switch (work.binding.tag) {
    case CallBindingTag.Latest:
      return null;
    case CallBindingTag.Deployment:
    case CallBindingTag.Version:
    case CallBindingTag.VersionTag:
      return "work.rule.binding";
  }
  return assertNever(work.binding);
}

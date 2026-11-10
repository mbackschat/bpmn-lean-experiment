module

public import Kernel.IL.Types

/-! # Admission of Business Rule Tasks and the DMN decision tables they name

The admitted subset of [decision semantics](../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md) items 1 to 4:
a Business Rule Task naming a carried decision literally with the latest binding, no tenant and a result variable other
than CIB's transient `decisionResult`; DMN 1.3 resources in FEEL, admitted whole as CIB deploys and validates every
resource in its deployment; one decision table per decision, with a selected hit policy, typed bare-name inputs, named
outputs and entries in the FEEL unary-test subset whose kinds agree with their `typeRef`s. A refusal carries a stable
code.
-/

public section

namespace Kernel.Admission.Work.Decision

/-- The DMN 1.3 model namespace (`DmnModelConstants.java:22-37`) and its FEEL namespace, the `expressionLanguage` CIB
reads as FEEL (`DmnExpressionTransformHelper.java:58-78`). -/
def dmn13 : String := "https://www.omg.org/spec/DMN/20191111/MODEL/"
def feel13 : String := "https://www.omg.org/spec/DMN/20191111/FEEL/"

/-- Item 4: a number in the portable domain, exact both as a Decimal128 and as a binary64. -/
def portableNumber (coefficient : Int) (scale : Nat) : Bool :=
  significantDigits coefficient ≤ 15 && scale ≤ 9

def typeRef : TypeRef → Option String
  | .string => none
  | .integer => none
  | .boolean => none
  | .foreign _ => some "decision.typeRef"

/-- A literal a test of an input with `typeRef` may name (item 3): numbers under `integer`, Strings under `string`,
`true` and `false` under `boolean`, `null` under every one. -/
def testLiteral (typeRef : TypeRef) : FeelLiteral → Option String
  | .null => none
  | .number coefficient scale =>
    match typeRef with
    | .integer => if portableNumber coefficient scale then none else some "decision.number"
    | .string => some "decision.testKind"
    | .boolean => some "decision.testKind"
    | .foreign _ => some "decision.typeRef"
  | .string _ =>
    match typeRef with
    | .string => none
    | .integer => some "decision.testKind"
    | .boolean => some "decision.testKind"
    | .foreign _ => some "decision.typeRef"
  | .bool _ =>
    match typeRef with
    | .boolean => none
    | .integer => some "decision.testKind"
    | .string => some "decision.testKind"
    | .foreign _ => some "decision.typeRef"

/-- A number bound, the only one a comparison or an interval has in the grammar; under `integer` only. -/
def bound (typeRef : TypeRef) : FeelLiteral → Option String
  | .number coefficient scale => testLiteral typeRef (.number coefficient scale)
  | .null => some "decision.testKind"
  | .string _ => some "decision.testKind"
  | .bool _ => some "decision.testKind"

def unaryTest (typeRef : TypeRef) : UnaryTest → Option String
  | .literal value => testLiteral typeRef value
  | .compare _ value => bound typeRef value
  | .interval range => bound typeRef range.low <|> bound typeRef range.high

def inputEntry (typeRef : TypeRef) : InputEntry → Option String
  | .any => none
  | .tests list => (list.first :: list.rest).findSome? (unaryTest typeRef)
  | .foreign _ => some "decision.feel"

/-- An output entry is a non-blank literal; a number is an `int` and only under `integer` or `string`, since CIB holds
an untyped number as a `Long` or `Double` and `boolean` refuses every number (item 3). -/
def outputEntry (typeRef : Option TypeRef) : OutputEntry → Option String
  | .blank => some "decision.blankOutput"
  | .foreign _ => some "decision.feel"
  | .literal (.number coefficient scale) =>
    if scale != 0 || !withinJavaInt coefficient then some "decision.number"
    else
      match typeRef with
      | some .integer => none
      | some .string => none
      | some .boolean => some "decision.number"
      | some (.foreign _) => some "decision.typeRef"
      | none => some "decision.number"
  | .literal .null => none
  | .literal (.bool _) => none
  | .literal (.string _) => none

def input (entry : DecisionInput) : Option String :=
  match entry.expression, entry.typeRef with
  | .foreign _, _ => some "decision.inputExpression"
  | .variable _, none => some "decision.inputType"
  | .variable _, some declared => typeRef declared

/-- Two or more outputs each need a unique name (`DefaultDmnTransform.java:300-315`); the kernel names every entry, so
a single output needs one too (item 3). -/
def outputs (declared : List DecisionOutput) : Option String :=
  let names := declared.filterMap (·.name)
  if names.length != declared.length || names.eraseDups.length != names.length then some "decision.outputName"
  else declared.findSome? fun output => output.typeRef.bind typeRef

/-- CIB refuses a rule whose entries do not match the table's inputs and outputs one to one at deployment
(`DefaultDmnTransform`), as the DMN 1.3 XSD's cardinalities do within the declared types. -/
def rule (table : DecisionTable) (entry : DecisionRule) : Option String :=
  if entry.inputs.length != table.inputs.length || entry.outputs.length != table.outputs.length then some "decision.schema"
  else
    ((table.inputs.zip entry.inputs).findSome? fun (declared, test) => declared.typeRef.bind fun ref => inputEntry ref test) <|>
      ((table.outputs.zip entry.outputs).findSome? fun (declared, value) => outputEntry declared.typeRef value)

/-- PRIORITY and OUTPUT ORDER have no CIB handler and an aggregator is not selected (`DefaultHitPolicyHandlerRegistry
.java:34-42`). -/
def hitPolicy (table : DecisionTable) : Option String :=
  if table.aggregation.isSome then some "decision.hitPolicy"
  else
    match table.hitPolicy with
    | .unique => none
    | .first => none
    | .any => none
    | .ruleOrder => none
    | .collect => none
    | .priority => some "decision.hitPolicy"
    | .outputOrder => some "decision.hitPolicy"

def decision (entry : Decision) : Option String :=
  if !entry.requires.isEmpty then some "decision.requirements"
  else
    match entry.logic with
    | .foreign _ => some "decision.logic"
    | .table table =>
      hitPolicy table <|> table.inputs.findSome? input <|> outputs table.outputs <|> table.rules.findSome? (rule table)

def resource (entry : DecisionResource) : Option String :=
  if entry.«namespace» != dmn13 then some "decision.namespace"
  else if entry.expressionLanguage.any (· != feel13) then some "decision.expressionLanguage"
  else entry.decisions.findSome? decision

/-- Every resource the program carries, whole, and decision ids unique across them. -/
def resources (program : Program) : Option String :=
  let ids := (program.decisionResources.flatMap (·.decisions)).map (·.id)
  program.decisionResources.findSome? resource <|>
    (if ids.eraseDups.length != ids.length then some "decision.duplicateId" else none)

/-- Item 1: a literal `decisionRef` the program carries, the latest binding, no tenant, and a result variable CIB does
not write onto the task's transient `decisionResult` local (`DecisionEvaluationUtil.java:79-87`). -/
def task (program : Program) (work : RuleWork) : Option String :=
  match work.decision with
  | .expression _ => some "work.rule.decisionExpression"
  | .literal key =>
    let binding : Option String :=
      match work.binding with
      | .latest => none
      | .deployment => some "work.rule.binding"
      | .version _ => some "work.rule.binding"
      | .versionTag _ => some "work.rule.binding"
    binding <|>
      (if work.tenant.isSome then some "work.rule.tenant"
       else if work.resultVariable == some "decisionResult" then some "work.rule.resultVariable"
       else if (program.decision? key).isNone then some "work.rule.decisionMissing"
       else none)

end Kernel.Admission.Work.Decision

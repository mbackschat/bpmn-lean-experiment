module

public import Kernel.Hooks

/-! # Decision: DMN decision tables, a sub-feature of Work

`Kernel.Feature.Work` reaches it only through its own hooks record (`Kernel.Feature.Work.WorkHooks.runDecision`), which
`Kernel.Registry` fills, since features never import each other (ARCHITECTURE-SPEC "Modules and build shape"). A
Business Rule Task whose `camunda:decisionRef` names a decision the program carries evaluates that decision table
when its occurrence begins and completes in the same step
([decision semantics](../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md#5-evaluation)), in CIB's three passes
(`DecisionTableEvaluationHandler.java:101-161`): every input is read and converted, every rule is tested, every
matching rule's outputs are converted, and only then does the hit policy select. The mapped result is written by the
nearest-owner rule from the task's scope occurrence, before the task leaves, so its outgoing conditions read it
(`DecisionEvaluationUtil.java:79-87`). Every refusal of `Kernel.Admission.Work.Decision` reaches a site here only as an
`unsupported` code of the same name.
-/

public section

namespace Kernel.Feature.Decision

/-- Item 8: every decision failure takes the stimulus' evaluation-failure outcome, which `Step` derives from a
rollback (EXPRESSION-SEMANTICS-SPEC, failure outcomes per stimulus). -/
def failed : Failure := .rolledBack "decision-failed"

/-- CIB's `typeRef` transformers for the values the kernel holds (item 7, `DmnTypeDefinitionImpl.java:41-58`): null is
never converted; a value whose Java form the kernel does not decide is `unsupported`. -/
def convert (typeRef : TypeRef) (value : Value) : Except Failure Value :=
  match typeRef, value with
  | _, .null => .ok .null
  | .integer, .int n => if withinJavaInt n then .ok (.int n) else .error failed
  | .integer, .decimal coefficient scale =>
    -- dynamic-only: CIB reads a Number through `doubleValue`, exact only up to 15 significant digits
    if significantDigits coefficient > 15 then .error (.unsupported "decision-conversion-range")
    else if coefficient % (10 : Int) ^ scale != 0 then .error failed
    else
      let n := coefficient / (10 : Int) ^ scale
      if withinJavaInt n then .ok (.int n) else .error failed
  | .integer, .string text =>
    -- dynamic-only: `Integer.parseInt` reads Unicode decimal digits the kernel does not decide
    if !isAscii text then .error (.unsupported "decision-conversion-text")
    -- `Integer.parseInt` (`IntegerDataTypeTransformer.java:42`)
    else match parseJavaInt? text with
      | some n => .ok (.int n)
      | none => .error failed
  | .integer, .bool _ => .error failed
  | .boolean, .bool value => .ok (.bool value)
  | .boolean, .string text =>
    -- dynamic-only: `equalsIgnoreCase` folds non-ASCII letters (`ſ` as `s`), which the kernel does not decide
    if !isAscii text then .error (.unsupported "decision-conversion-text")
    else
      let folded := text.map Char.toLower
      if folded == "true" then .ok (.bool true) else if folded == "false" then .ok (.bool false) else .error failed
  | .boolean, .int _ => .error failed
  | .boolean, .decimal _ _ => .error failed
  | .string, .string text => .ok (.string text)
  | .string, .bool value => .ok (.string (if value then "true" else "false"))
  | .string, .int n => .ok (.string (toString n))
  -- dynamic-only: `String.valueOf` of a BigDecimal is a Java text form the kernel does not decide
  | .string, .decimal _ _ => .error (.unsupported "decision-conversion-kind")
  | _, .list _ => .error (.unsupported "decision-input-kind") -- dynamic-only: a collection is the run's data
  | _, .map _ => .error (.unsupported "decision-input-kind") -- dynamic-only: a collection is the run's data
  | _, .stringList _ => .error (.unsupported "decision-input-kind") -- dynamic-only: a collection is the run's data
  | .foreign _, _ => .error (.unsupported "decision-type-ref")

/-- An input's value: the visible binding nearest its scope occurrence, converted by its `typeRef`. An absent variable
reads as null, as `feel-scala` resolves an unknown name to null (`NO_VARIABLE_FOUND` is a suppressed failure since
1.17, pinned `1.19.3`). -/
def readInput (variables : List (String × Value)) (input : DecisionInput) : Except Failure Value :=
  match input.expression, input.typeRef with
  | .variable name, some typeRef => convert typeRef (((variables.find? (·.1 == name)).map (·.2)).getD .null)
  | .variable _, none => .error (.unsupported "decision-input-type")
  | .foreign _, _ => .error (.unsupported "decision-input-expression")

/-- A literal as the value FEEL yields: a whole number within `int` is a Java integral number. -/
def literalValue : FeelLiteral → Except Failure Value
  | .null => .ok .null
  | .bool value => .ok (.bool value)
  | .string value => .ok (.string value)
  | .number coefficient scale =>
    if scale == 0 && withinJavaInt coefficient then .ok (.int coefficient) else .error (.unsupported "decision-number")

/-- `coefficient × 10^-scale` against an integer: the sign of the difference. -/
def compareNumber (value : Int) (coefficient : Int) (scale : Nat) : Ordering :=
  compare (value * (10 : Int) ^ scale) coefficient

/-- Three-valued FEEL comparison of a converted input with a literal: `none` is null. -/
def ordering (value : Value) (bound : FeelLiteral) : Option Ordering :=
  match value, bound with
  | .int n, .number coefficient scale => some (compareNumber n coefficient scale)
  | _, _ => none

def satisfies (operator : Comparison) (order : Ordering) : Bool :=
  match operator with
  | .lt => order == .lt
  | .le => order != .gt
  | .gt => order == .gt
  | .ge => order != .lt

/-- Item 5: equality against null is two-valued (`null` matches only null), a comparison or interval against null is
null, and a literal compares by value with an input of its kind, which admission makes the only kind
(`decision.testKind`). -/
def test (value : Value) : UnaryTest → Option Bool
  | .literal .null => some (match value with | .null => true | _ => false)
  | .literal literal =>
    match value, literal with
    | .null, _ => some false
    | .int _, .number _ _ => (ordering value literal).map (· == .eq)
    | .string text, .string expected => some (text == expected)
    | .bool flag, .bool expected => some (flag == expected)
    | _, _ => some false
  | .compare operator bound => (ordering value bound).map (satisfies operator)
  | .interval range =>
    match ordering value range.low, ordering value range.high with
    | some low, some high =>
      some ((if range.lowClosed then low != .lt else low == .gt) && (if range.highClosed then high != .gt else high == .lt))
    | _, _ => none

/-- A test list is the three-valued disjunction of its tests; `not` swaps true and false and keeps null. -/
def entryHolds (value : Value) : InputEntry → Except Failure Bool
  | .any => .ok true
  | .foreign _ => .error (.unsupported "decision-feel")
  | .tests list =>
    let results := (list.first :: list.rest).map (test value)
    let disjunction : Option Bool :=
      if results.any (· == some true) then some true else if results.any (·.isNone) then none else some false
    .ok (if list.negated then disjunction.map (!·) == some true else disjunction == some true)

/-- A rule matches only when every input entry is true. -/
def ruleMatches (values : List Value) (rule : DecisionRule) : Except Failure Bool := do
  let held ← (values.zip rule.inputs).mapM fun (value, entry) => entryHolds value entry
  .ok (held.all id)

/-- One matching rule's entry map, each output entry converted by its output's `typeRef`, in output order. -/
def ruleEntries (outputs : List DecisionOutput) (rule : DecisionRule) : Except Failure (List (String × Value)) :=
  (outputs.zip rule.outputs).mapM fun (output, entry) => do
    let literal ← match entry with
      | .literal value => literalValue value
      | .blank => .error (.unsupported "decision-blank-output")
      | .foreign _ => .error (.unsupported "decision-feel")
    let value ← match output.typeRef with
      | some typeRef => convert typeRef literal
      | none => .ok literal
    .ok ((output.name.getD ""), value)

/-- Value equality as CIB's typed values compare (`DmnEvaluatedOutputImpl.java:69-80`), over the kinds an output
holds. -/
def sameValue : Value → Value → Bool
  | .null, .null => true
  | .bool left, .bool right => left == right
  | .int left, .int right => left == right
  | .string left, .string right => left == right
  | _, _ => false

def sameEntries (left right : List (String × Value)) : Bool :=
  left.length == right.length && (left.zip right).all fun (l, r) => l.1 == r.1 && sameValue l.2 r.2

/-- Item 5: the hit policy over every matching rule's entry map, in rule order. -/
def applyHitPolicy (table : DecisionTable) (results : List (List (String × Value))) :
    Except Failure (List (List (String × Value))) :=
  match table.aggregation, table.hitPolicy, results with
  | some _, _, _ => .error (.unsupported "decision-hit-policy")
  | none, .unique, _ :: _ :: _ => .error failed
  | none, .unique, _ => .ok results
  | none, .first, first :: _ => .ok [first]
  | none, .first, [] => .ok []
  | none, .any, first :: rest => if rest.all (sameEntries first) then .ok [first] else .error failed
  | none, .any, [] => .ok []
  | none, .ruleOrder, _ => .ok results
  | none, .collect, _ => .ok results
  | none, .priority, _ => .error (.unsupported "decision-hit-policy")
  | none, .outputOrder, _ => .error (.unsupported "decision-hit-policy")

/-- The selected entry maps of `table` against the variables visible from the task's scope occurrence. -/
def tableResults (table : DecisionTable) (variables : List (String × Value)) :
    Except Failure (List (List (String × Value))) := do
  let values ← table.inputs.mapM (readInput variables)
  let matching ← table.rules.filterM (ruleMatches values)
  applyHitPolicy table (← matching.mapM (ruleEntries table.outputs))

/-- A Map value in the Data semantics' key order; CIB's entry maps are `HashMap`s, whose order is no fact. -/
def entryMap (entries : List (String × Value)) : Value :=
  .map (entries.mergeSort fun left right => decide (left.1 ≤ right.1))

/-- The mapper CIB applies to the result (`SingleEntryDecisionResultMapper`, `SingleResultDecisionResultMapper`,
`CollectEntriesDecisionResultMapper`, `ResultListDecisionTableResultMapper`, `DmnDecisionResultImpl.java:51-105`). -/
def mapResult (mapping : DecisionResultMapping) (results : List (List (String × Value))) : Except Failure Value :=
  match mapping, results with
  | .singleEntry, [] => .ok .null
  | .singleEntry, [[(_, value)]] => .ok value
  | .singleEntry, _ => .error failed
  | .singleResult, [] => .ok .null
  | .singleResult, [entries] => .ok (entryMap entries)
  | .singleResult, _ => .error failed
  | .collectEntries, _ =>
    if ((results.flatMap (·.map (·.1))).eraseDups).length > 1 then .error failed
    else .ok (.list (results.flatMap (·.map (·.2))))
  | .resultList, _ => .ok (.list (results.map entryMap))

/-- The writes a Business Rule Task's decision makes: `(resultVariable, mapped value)`, or none without a result
variable, since CIB applies no mapper then and its `decisionResult` is transient (`DecisionEvaluationUtil.java:79-87`).
-/
def runDecision (program : Program) (work : RuleWork) (variables : List (String × Value)) :
    Except Failure (List (String × Value)) := do
  let some key := work.decision.literal? | .error (.unsupported "work-rule-decision-expression")
  let some decision := program.decision? key | .error (.unsupported "work-rule-decision-missing")
  let .table table := decision.logic | .error (.unsupported "decision-logic")
  let results ← tableResults table variables
  match work.resultVariable with
  | none => .ok []
  | some name => .ok [(name, ← mapResult work.resultMapping results)]

end Kernel.Feature.Decision

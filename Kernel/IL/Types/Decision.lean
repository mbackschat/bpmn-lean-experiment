module

/-! # DMN decision tables

The reader's meaning-preserving read of the DMN 1.3 resources a program carries, for the Business Rule Tasks that name
their decisions ([decision semantics](../../../docs/kernel/semantics/DECISION-SEMANTICS-SPEC.md#il-shape-proposed-kernel-shape-hunk)).
Every field outside the admitted subset stays in the shape and `Kernel.Admission.Decision` refuses it with a stable
code, so a later level widens admission without reinterpreting an accepted model. Part of `Kernel.IL.Types`, which
re-exports it.
-/

public section

namespace Kernel

/-- A `typeRef` CIB matches ignoring case (`DefaultDataTypeTransformerRegistry.java:41-61`); the reader keeps every
spelling but the three lower-case names as `foreign`, which admission refuses (`decision.typeRef`). -/
inductive TypeRef where
  | string | integer | boolean
  | foreign (name : String)
  deriving Repr

inductive Comparison where
  -- guard-exception(3): FEEL unary-test comparisons (decision semantics item 4), a separate expression language from JUEL's operators.
  | lt | le | gt | ge
  deriving Repr

/-- A FEEL literal of the unary-test subset. A number is `coefficient × 10^-scale`, exactly as written. -/
inductive FeelLiteral where
  | null
  | bool (value : Bool)
  | number (coefficient : Int) (scale : Nat)
  | string (value : String)
  deriving Repr

structure Interval where
  low : FeelLiteral
  lowClosed : Bool
  high : FeelLiteral
  highClosed : Bool
  deriving Repr

inductive UnaryTest where
  | literal (value : FeelLiteral)
  | compare (operator : Comparison) (bound : FeelLiteral)
  | interval (value : Interval)
  deriving Repr

/-- A list of unary tests, never empty, optionally negated as a whole (`not(...)`). -/
structure TestList where
  negated : Bool
  first : UnaryTest
  rest : List UnaryTest := []
  deriving Repr

/-- A text outside the subset's grammar, with the element-level `expressionLanguage` it names, if any. -/
structure ForeignText where
  language : Option String
  text : String
  deriving Repr

inductive InputEntry where
  | any
  | tests (value : TestList)
  | foreign (value : ForeignText)
  deriving Repr

inductive OutputEntry where
  | literal (value : FeelLiteral)
  | blank
  | foreign (value : ForeignText)
  deriving Repr

inductive InputExpression where
  | variable (name : String)
  | foreign (value : ForeignText)
  deriving Repr

structure DecisionInput where
  expression : InputExpression
  typeRef : Option TypeRef
  deriving Repr

structure DecisionOutput where
  name : Option String
  typeRef : Option TypeRef
  deriving Repr

structure DecisionRule where
  id : String
  inputs : List InputEntry
  outputs : List OutputEntry
  deriving Repr

inductive HitPolicy where
  | unique | first | any | ruleOrder | collect
  | priority | outputOrder
  deriving Repr

inductive CollectAggregator where
  | sum | min | max | count
  deriving Repr

structure DecisionTable where
  hitPolicy : HitPolicy := .unique
  aggregation : Option CollectAggregator := none
  inputs : List DecisionInput
  outputs : List DecisionOutput
  rules : List DecisionRule
  deriving Repr

inductive DecisionLogic where
  | table (value : DecisionTable)
  | foreign (element : String)
  deriving Repr

/-- `requires` lists the decisions its information requirements name. -/
structure Decision where
  id : String
  logic : DecisionLogic
  requires : List String := []
  deriving Repr

/-- One DMN resource the program carries, bound by its exact bytes. -/
structure DecisionResource where
  sourceSha256 : String
  «namespace» : String
  expressionLanguage : Option String := none
  decisions : List Decision
  deriving Repr

/-- Java `int` (`Integer.MIN_VALUE` to `Integer.MAX_VALUE`), the carrier of a DMN `integer` value
(`IntegerDataTypeTransformer.java:32-44`). -/
def withinJavaInt (value : Int) : Bool := decide (-2147483648 ≤ value) && decide (value ≤ 2147483647)

/-- The significant digits of `coefficient`, trailing zeros dropped: at most 15 is exact both as a Decimal128 and as a
Java `double` (DECISION-SEMANTICS-SPEC item 4). -/
def significantDigits (coefficient : Int) : Nat :=
  max ((toString coefficient.natAbs).toList.reverse.dropWhile (· == '0')).length 1

end Kernel

module

public import Kernel.IL.Types.Juel

/-! # Values and expressions

The data values a program carries and the expressions that read and produce them: literals, the Simple Boolean
subset, variable reads, JUEL node tables and foreign text, plus the value sources and mappings built on them. Part of
`Kernel.IL.Types`, which re-exports it.
-/

public section

namespace Kernel

/-- A typed data value, as the scenario contract's `variableValue` carries it. -/
inductive Value where
  | null
  | bool (value : Bool)
  | int (value : Int)
  | decimal (coefficient : Int) (scale : Nat)
  | string (value : String)
  | stringList (items : List String)
  | list (items : List Value)
  | map (entries : List (String × Value))
  deriving Repr, Inhabited

/-- The Simple Boolean subset, evaluated inside the kernel
([decision](../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md)). -/
inductive SimpleBoolean where
  | literal (value : Bool)
  | isPresent (name : String)
  | isNull (name : String)
  | stringEquals (name value : String)
  deriving DecidableEq, Repr

/-- An expression. `literal`, `simpleBoolean`, `variable` and `juel` are evaluated by the kernel, `juel` only under
`Evaluator.juel`; admission refuses `foreign`, a text the reader could not read. -/
inductive Expression where
  | literal (value : Value)
  | simpleBoolean (body : SimpleBoolean)
  | variable (name : String)
  | juel (nodes : List JuelNode)
  | foreign (language source : String)
  deriving Repr

/-- A configuration value given either literally or by an expression. -/
inductive ValueSource where
  | literal (value : String)
  | expression (body : Expression)
  deriving Repr

/-- Which syntax wrote a mapping, which settles what an unset source means: an unavailable Data Input
(BPMN 2.0.2 §10.4.2), an unresolved `camunda:inputParameter`, `outputParameter` or `camunda:in`/`out`
`sourceExpression` expression, or a `camunda:in`/`out` `source` copy that reads null (CIB-EXT-0021). -/
inductive MappingDialect where
  | dataAssociation
  | ioParameter
  | callVariable
  deriving DecidableEq, Repr

/-- `target := source`, evaluated in the scope the owning element names. -/
structure Mapping where
  target : String
  source : Expression
  dialect : MappingDialect := .dataAssociation
  deriving Repr

/-- A `camunda:script` value of a structured parameter (`BpmnParseUtil.java:224-239`): its `scriptFormat`, its inline
text, `none` when absent, and the `resource` it names instead, as `ScriptWork` carries a Script Task's. -/
structure ParameterScript where
  format : String
  source : Option String := none
  resource : Option String := none
  deriving Repr

/-- A `camunda:map` entry: its `key` attribute's text and the index of the node holding its value. -/
structure ParameterEntry where
  key : String
  value : Nat
  deriving Repr

/-- One node of a structured parameter value, the value provider CIB parses (`BpmnParseUtil.java:152-222`): a flat table
in post-order, each child the index of an earlier node, the root last. A `value` is a text leaf read as a scalar
parameter's text is (`Mapping.source`); list items and map entries keep document order. -/
inductive ParameterNode where
  | value (body : Expression)
  | list (items : List Nat)
  | map (entries : List ParameterEntry)
  | script (payload : ParameterScript)
  deriving Repr

/-- A `camunda:inputParameter` or `outputParameter` whose value is a `camunda:list`, `map` or `script`, beside the
scalar ones its direction's mappings carry: `position` is the index among those mappings before which it runs, in
document order (`BpmnParseUtil.java:89-110`). Admission refuses every one (`mapping.structuredParameter`). -/
structure StructuredParameter where
  target : String
  position : Nat
  nodes : List ParameterNode
  deriving Repr

end Kernel

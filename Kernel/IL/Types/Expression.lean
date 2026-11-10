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

end Kernel

module

/-! # Variable mapping declarations

A mapping target and its source expression, shared by Activity and scope parameters and by Call
`camunda:in`/`camunda:out` copies. Owning them below the Call data contract lets a Call interface
carry mappings without the checked-definition contract importing anything above it.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

inductive MappingExpression where
  | stringLiteral (value : String)
  | localVariable (name : String)
  | enclosingVariable (name : String)
  deriving Repr, DecidableEq

structure VariableMapping where
  target : String
  expression : MappingExpression
  deriving Repr, DecidableEq

end BpmnSemantics.SemanticProcess

module

public import Kernel.IL.Types.Expression

/-! # Messages and effects

The correlation, Message and effect records that Triggers, Throws and Work share. Part of `Kernel.IL.Types`, which
re-exports it.
-/

public section

namespace Kernel

structure CorrelationCriterion where
  key : String
  value : Expression
  deriving Repr

/-- `messageRef` is the BPMN Message's identifier, `none` for an unspecified Message (a Receive Task without
`messageRef`, which only its waiting occurrence addresses); `name` is that Message's `name` (BPMN 2.0.2 Table 8.48),
`none` when it has none; `interfaceRef` and `operationRef` name the Operation that carries it, when the model gives
one; `itemRef` is the identifier of the ItemDefinition the Message carries, which a Data Output that receives it must
be equivalent to (§10.4.1, §10.5.1). -/
structure MessageTrigger where
  messageRef : Option String
  name : Option ValueSource
  correlation : List CorrelationCriterion := []
  interfaceRef : Option String := none
  operationRef : Option String := none
  itemRef : Option String := none
  deriving Repr

/-- A Data Output an Activity or Event declares: its identifier, which its Data Output Association reads, and the
identifier of its `itemSubjectRef` ItemDefinition (BPMN 2.0.2 §10.4.1). -/
structure DataOutputDecl where
  id : String
  itemRef : Option String := none
  deriving Repr

structure EffectBinding where
  protocol : String
  operation : String
  deriving DecidableEq, Repr

end Kernel

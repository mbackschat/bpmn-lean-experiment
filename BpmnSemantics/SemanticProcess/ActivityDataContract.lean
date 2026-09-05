/-! # Activity data contract

Task-neutral carriers for direct BPMN Data Input and Data Output Associations.
-/

namespace BpmnSemantics.SemanticProcess

/-- The reusable value one direct BPMN Data Input Association contributes to an Activity.

Task-neutral, because Clause 10.4.2's direct copy is a property of the association rather than of the
Activity that owns it. `sourcePropertyId` and `targetDataInputId` are exact source identities and are
what readiness and copying resolve; `targetDataInputName` is carried for presentation only, so two
Properties sharing a label cannot collide. -/
structure DirectActivityDataInput where
  associationId : String
  sourcePropertyId : String
  targetDataInputId : String
  targetDataInputName : Option String
  deriving Repr, DecidableEq

/-- The reusable value one direct BPMN Data Output Association contributes to an Activity.

Task-neutral for the same reason as its input sibling. The direction is the mirror: the
Activity-owned `sourceDataOutputId` is the association's source and the Process
`targetPropertyId` is its target, so a reader that only renamed the input fields would have the
write running backwards. `sourceDataOutputName` is carried for presentation only. -/
structure DirectActivityDataOutput where
  associationId : String
  sourceDataOutputId : String
  sourceDataOutputName : Option String
  targetPropertyId : String
  deriving Repr, DecidableEq

end BpmnSemantics.SemanticProcess

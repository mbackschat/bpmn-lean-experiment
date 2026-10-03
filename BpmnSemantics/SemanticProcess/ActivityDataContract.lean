/-! # Activity data contract

Task-neutral typed endpoints for direct BPMN Data Input and Data Output Associations.
-/

namespace BpmnSemantics.SemanticProcess

inductive ActivityDataInputSource where
  | property (propertyId : String)
  | processDataInput (dataInputId : String)
  deriving Repr, DecidableEq

inductive ActivityDataOutputTarget where
  | property (propertyId : String)
  | processDataOutput (dataOutputId : String)
  deriving Repr, DecidableEq

/-- Exact declaration identity for global identity validation; the endpoint arm retains its meaning. -/
def ActivityDataInputSource.id : ActivityDataInputSource → String
  | .property id | .processDataInput id => id

def ActivityDataOutputTarget.id : ActivityDataOutputTarget → String
  | .property id | .processDataOutput id => id

/-- Direct copy reads the typed containing-Process endpoint and fills this Activity's input ID.
The optional name is descriptive and never participates in matching (BPMN 2.0.2 Clause 10.4.2). -/
structure DirectActivityDataInput where
  associationId : String
  source : ActivityDataInputSource
  targetDataInputId : String
  targetDataInputName : Option String
  deriving Repr, DecidableEq

/-- The Activity output identifies the submitted field; the typed target alone determines where its
value is written. Process output ports remain separate from Properties (CDATA-OUTPUT-01). -/
structure DirectActivityDataOutput where
  associationId : String
  sourceDataOutputId : String
  sourceDataOutputName : Option String
  target : ActivityDataOutputTarget
  deriving Repr, DecidableEq

end BpmnSemantics.SemanticProcess

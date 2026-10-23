module

public import BpmnSemantics.SemanticProcess.ActivityDataContract
public import BpmnSemantics.SemanticProcess.VariableMappingContract

/-! # Call data interface declarations

The scalar arm retains distinct Call and callable owners, ports, sets and associations under
CDATA-MATCH-01. Its source contract excludes collections, ItemDefinitions, DataStates, optional and
while-executing members, and set pairing. Names are descriptive and never establish correspondence.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

structure ScalarIoPort where
  id : String
  name : Option String
  deriving Repr, DecidableEq

structure ScalarIoInputSet where
  id : String
  name : Option String
  dataInputRefs : List String
  deriving Repr, DecidableEq

structure ScalarIoOutputSet where
  id : String
  name : Option String
  dataOutputRefs : List String
  deriving Repr, DecidableEq

structure ScalarIoSpecification where
  ownerId : String
  id : String
  input : ScalarIoPort
  output : ScalarIoPort
  inputSet : ScalarIoInputSet
  outputSet : ScalarIoOutputSet
  deriving Repr, DecidableEq

structure ScalarCallData where
  callerProperties : List String
  call : ScalarIoSpecification
  called : ScalarIoSpecification
  directInput : DirectActivityDataInput
  directOutput : DirectActivityDataOutput
  deriving Repr, DecidableEq

/-- `variableMappings` holds CIB `camunda:in`/`camunda:out` copies in document order, the order CIB
evaluates them in (CVM-IN-01, CVM-OUT-01). -/
inductive CallDataInterface where
  | empty
  | scalar (data : ScalarCallData)
  | variableMappings (inputs outputs : List VariableMapping)
  deriving Repr, DecidableEq

def scalarIoDeclarationIds (io : ScalarIoSpecification) : List String :=
  [io.ownerId, io.id, io.input.id, io.output.id, io.inputSet.id, io.outputSet.id]

def scalarIoSetsMatchPorts (io : ScalarIoSpecification) : Bool :=
  io.inputSet.dataInputRefs = [io.input.id] &&
    io.outputSet.dataOutputRefs = [io.output.id]

/-- CIB's `filterVariables` drops these Call outputs, so admitting one would promise a write CIB never makes. -/
def reservedCallOutputTargets : List String :=
  ["nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"]

def callMappingLimit : Nat := 8

/-- CVM-ADMIT-01's structural part: inputs read an enclosing name, outputs a called-local name, each
direction with distinct nonempty targets. Name syntax and resolution belong to the hosting profile. -/
def variableMappingsValid (inputs outputs : List VariableMapping) : Bool :=
  !inputs.isEmpty && inputs.length ≤ callMappingLimit && outputs.length ≤ callMappingLimit &&
    inputs.all (fun mapping => mapping.target != "" && match mapping.expression with
      | .enclosingVariable name => name != ""
      | _ => false) &&
    outputs.all (fun mapping => mapping.target != "" && !reservedCallOutputTargets.contains mapping.target &&
      match mapping.expression with
      | .localVariable name => name != ""
      | _ => false) &&
    decide (inputs.map (·.target)).Nodup && decide (outputs.map (·.target)).Nodup

def callDataInterfaceValid (data : CallDataInterface) (callId calledProcessId : String) : Bool :=
  match data with
  | .empty => true
  | .variableMappings inputs outputs => variableMappingsValid inputs outputs
  | .scalar data =>
      match data.directInput.source, data.directOutput.target with
      | .property source, .property target =>
          let ids := data.callerProperties ++ scalarIoDeclarationIds data.call ++
            scalarIoDeclarationIds data.called ++
            [data.directInput.associationId, data.directOutput.associationId]
          data.call.ownerId = callId && data.called.ownerId = calledProcessId &&
            scalarIoSetsMatchPorts data.call && scalarIoSetsMatchPorts data.called &&
            source ≠ target && data.callerProperties.contains source &&
            data.callerProperties.contains target &&
            data.directInput.targetDataInputId = data.call.input.id &&
            data.directOutput.sourceDataOutputId = data.call.output.id &&
            ids.all (fun id => id != "") && decide ids.Nodup
      | _, _ => false

end BpmnSemantics.SemanticProcess

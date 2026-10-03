import BpmnSemantics.SemanticProcess.ActivityDataContract

/-! # Call data interface declarations

The scalar arm retains distinct Call and callable owners, ports, sets and associations under
CDATA-MATCH-01. Its source contract excludes collections, ItemDefinitions, DataStates, optional and
while-executing members, and set pairing. Names are descriptive and never establish correspondence.
-/

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

inductive CallDataInterface where
  | empty
  | scalar (data : ScalarCallData)
  deriving Repr, DecidableEq

def scalarIoDeclarationIds (io : ScalarIoSpecification) : List String :=
  [io.ownerId, io.id, io.input.id, io.output.id, io.inputSet.id, io.outputSet.id]

def scalarIoSetsMatchPorts (io : ScalarIoSpecification) : Bool :=
  io.inputSet.dataInputRefs = [io.input.id] &&
    io.outputSet.dataOutputRefs = [io.output.id]

def callDataInterfaceValid (data : CallDataInterface) (callId calledProcessId : String) : Bool :=
  match data with
  | .empty => true
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

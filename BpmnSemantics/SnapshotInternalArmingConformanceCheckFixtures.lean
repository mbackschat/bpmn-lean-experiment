module

public import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
public import BpmnSemantics.SemanticProcess.RootScopeFixtures
public import BpmnSemantics.CompensationSourceLoweringFixtures
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic

/-! Fixture definitions and executable checks of [`SnapshotInternalArmingConformance`](SnapshotInternalArmingConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.SnapshotInternalArmingConformance


open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

def processId : ProcessId := ⟨"P"⟩
def instanceId : SemanticId := ⟨"i"⟩
def owner : ScopeOccurrenceId := rootScopeOccurrenceId instanceId processId

def ordinary : List SemanticOperation :=
  [ .awaitUserTask ⟨"a"⟩ { elementId := ⟨"a"⟩ } ⟨"a0"⟩ ⟨"a1"⟩ { id := ⟨"a"⟩, name := none }
  , .awaitMessage ⟨"b"⟩ { elementId := ⟨"b"⟩ } ⟨"b0"⟩ ⟨"b1"⟩
      { elementId := ⟨"b"⟩, channel := .directMessage ⟨"b"⟩ }
  , .awaitPayloadMessage ⟨"c"⟩ { elementId := ⟨"c"⟩ } ⟨"c0"⟩ ⟨"c1"⟩
      { elementId := ⟨"c"⟩, channel := .operationMessage ⟨"ci"⟩ ⟨"co"⟩ ⟨"cm"⟩ }
      { associationId := "o", sourceDataOutputId := "d", sourceDataOutputName := none,
        targetPropertyId := "v" }
  , .awaitCorrelatedPayloadMessage ⟨"d"⟩ { elementId := ⟨"d"⟩ } ⟨"d0"⟩ ⟨"d1"⟩
      { elementId := ⟨"d"⟩, channel := .operationMessage ⟨"di"⟩ ⟨"do"⟩ ⟨"dm"⟩ } "k" "cp"
      { language := correlationScalarPathLanguage, body := "payload" }
      { language := correlationScalarPathLanguage, body := "property:v", propertyId := "v" }
  , .awaitTimer ⟨"e"⟩ { elementId := ⟨"e"⟩ } ⟨"e0"⟩ ⟨"e1"⟩
      { elementId := ⟨"e"⟩, durationMs := 1000 }
  , .awaitEffect ⟨"f"⟩ { elementId := ⟨"f"⟩ } ⟨"f0"⟩ ⟨"f1"⟩
      { elementId := ⟨"f"⟩,
        descriptor := { protocol := "urn:bpmn-lean:effect-protocol:activity-v1", operation := "urn:bpmn-lean:effect-operation:probe-v1" },
        inputMappings := [], outputMappings := [] } none ]

def operations : List SemanticOperation := ordinary ++
  [ .duplicate ⟨"g"⟩ { elementId := ⟨"g"⟩ } ⟨"z0"⟩
      [⟨"a0"⟩, ⟨"b0"⟩, ⟨"c0"⟩, ⟨"d0"⟩, ⟨"e0"⟩, ⟨"f0"⟩]
  , .synchronize ⟨"h"⟩ { elementId := ⟨"h"⟩ }
      [⟨"a1"⟩, ⟨"b1"⟩, ⟨"c1"⟩, ⟨"d1"⟩, ⟨"e1"⟩, ⟨"f1"⟩] ⟨"z1"⟩
  , .reachNoneEnd ⟨"i"⟩ { elementId := ⟨"i"⟩ } ⟨"z1"⟩
  , .initiate ⟨"j"⟩ { elementId := ⟨"j"⟩ } ⟨"z0"⟩
  , .completeScope ⟨"k"⟩ { elementId := ⟨"P"⟩ } (rootDefinitionScopeId processId) none ]

def places : List ControlPlace :=
  ["a0", "a1", "b0", "b1", "c0", "c1", "d0", "d1", "e0", "e1", "f0", "f1", "z0", "z1"].map
    fun name => { id := ⟨name⟩, origin := { elementId := ⟨name⟩ } }

def program : Program :=
  { identity :=
      { compiler := .bpmnSourceSemanticProcess
        semanticProfile := ⟨"parallel-fork-join-draft"⟩
        sourceId := ⟨"s"⟩
        sourceSha256 := "0000000000000000000000000000000000000000000000000000000000000000" }
    internalSchedulingMode := .rejectObservableChoice
    processId
    definitionScopes := [rootDefinitionScope processId,
      { id := ⟨"scope:Z"⟩, parentScopeId := some (rootDefinitionScopeId processId), originElementId := ⟨"Z"⟩ }]
    operationScopes := operations.map fun operation =>
      { operationId := operation.id, scopeId := rootDefinitionScopeId processId }
    controlPlaceScopes := places.map fun place =>
      { controlPlaceId := place.id, scopeId := rootDefinitionScopeId processId }
    controlPlaces := places
    operations
    compensationEventSubProcessSnapshots := some
      { targets := [{ parentScopeId := rootDefinitionScopeId processId, handlerScopeId := ⟨"scope:Z"⟩ }],
        maxRecords := 1, maxCanonicalBytes := 4096 } }

def ready : RuntimeState :=
  { initialState with
    control := .running instanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := rootDefinitionScopeId processId, count := 1 }]
    tokens := ["a0", "b0", "c0", "d0", "e0", "f0"].map fun name => { placeId := ⟨name⟩, owner }
    variables := { process := { bindings := [{ name := "v", value := .string "x" }] }, activities := [], processInterfaces := [], scopes := [] }
    compensationParentContextRetentions := [.provisional { id := owner, parent := none } ⟨"scope:Z"⟩] }

def prepared : List PreparedInternalArming :=
  (prepareSnapshotArmingBatch? program ready ordinary).getD []

def changed_predecessor_rejects_retained_preparation : Bool := decide <|
    prepared.all (fun entry =>
      (prepareSnapshotArming? program { ready with logicalTimeMs := 1 } entry.operation).isSome &&
      (applyPreparedSnapshotArming? program { ready with logicalTimeMs := 1 } entry).isNone) = true

def duplicate_operation_refuses_batching : Bool := decide <|
    (prepareSnapshotArmingBatch? program ready (ordinary ++ ordinary)).isNone = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("changed_predecessor_rejects_retained_preparation", changed_predecessor_rejects_retained_preparation),
  ("duplicate_operation_refuses_batching", duplicate_operation_refuses_batching)
]

end BpmnSemantics.SnapshotInternalArmingConformance

module

public import BpmnSemantics.SemanticProcess.ExecutionRuntime
public import BpmnSemantics.SemanticProcessJson.CheckedProcess
public import BpmnSemantics.SemanticProcessJson.Program
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessAdmission
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
public import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
public import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistrationLaws
public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessFlowNodeOccurrence
public import BpmnSemantics.SemanticProcess.TransitionTrace
public import BpmnSemantics.SemanticProcess.Scenario
public import BpmnSemantics.SemanticProcess.StructuredCompositionFixtures
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries

/-! Fixture definitions and executable checks of [`InterruptingMessageEventSubProcessConformance`](InterruptingMessageEventSubProcessConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.InterruptingMessageEventSubProcessConformance


open Lean SemanticProcess SemanticProcessJson

def channel : MessageChannel := .operationMessage ⟨"WithdrawalInterface"⟩ ⟨"Withdraw"⟩ ⟨"WithdrawalMessage"⟩

def channelJson : Json := Json.mkObj [
  ("kind", toJson "operationMessage"), ("interfaceId", toJson "WithdrawalInterface"),
  ("interfaceOperationId", toJson "Withdraw"), ("messageId", toJson "WithdrawalMessage")]

def declarationFields : List (String × Json) := [
  ("parentScopeId", toJson "scope:Application"), ("handlerScopeId", toJson "scope:Withdrawal"),
  ("elementId", toJson "Withdrawal"), ("startEventId", toJson "WithdrawalStart"), ("channel", channelJson)]

def checkedDeclarationJson : Json := Json.mkObj (declarationFields ++ [
  ("interruption", toJson "interrupting"), ("childEntryFlowId", toJson "HandlerEntry")])

def programDeclarationJson : Json := Json.mkObj (declarationFields ++ [
  ("childEntry", toJson "place:HandlerEntry")])

def expectedCheckedDeclaration : CheckedInterruptingMessageEventSubProcess := {
  parentScopeId := ⟨"scope:Application"⟩
  handlerScopeId := ⟨"scope:Withdrawal"⟩
  elementId := ⟨"Withdrawal"⟩
  startEventId := ⟨"WithdrawalStart"⟩
  channel
  interruption := .interrupting
  childEntryFlowId := ⟨"HandlerEntry"⟩ }

def expectedProgramDeclaration : InterruptingMessageEventSubProcessDeclaration := {
  parentScopeId := ⟨"scope:Application"⟩
  handlerScopeId := ⟨"scope:Withdrawal"⟩
  elementId := ⟨"Withdrawal"⟩
  startEventId := ⟨"WithdrawalStart"⟩
  channel
  childEntry := ⟨"place:HandlerEntry"⟩ }

def identityFields : List (String × Json) := [
  ("semanticProfile", toJson "bpmn-2.0.2-interrupting-message-event-subprocess-draft"),
  ("sourceId", toJson "withdrawal-wire"), ("sourceOverlay", .null),
  ("sourceSha256", toJson "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]

def declarationField (value : Option Json) : List (String × Json) :=
  value.toList.map fun value => ("interruptingMessageEventSubProcesses", value)

def checkedJson (value : Option Json) : Json := Json.mkObj ([
  ("kind", toJson "checkedProcess"), ("identity", Json.mkObj identityFields),
  ("processId", toJson "Application"), ("definitionScopes", .arr #[]), ("nodeScopes", .arr #[]),
  ("sequenceFlowScopes", .arr #[]), ("nodes", .arr #[]), ("sequenceFlows", .arr #[])] ++ declarationField value)

def programJson (value : Option Json) : Json := Json.mkObj ([
  ("kind", toJson "semanticProcess"),
  ("identity", Json.mkObj (("compiler", toJson "bpmn-source-semantic-process") :: identityFields)),
  ("processId", toJson "Application"), ("internalSchedulingMode", toJson "rejectObservableChoice"),
  ("definitionScopes", .arr #[]), ("operationScopes", .arr #[]), ("controlPlaceScopes", .arr #[]),
  ("controlPlaces", .arr #[]), ("operations", .arr #[])] ++ declarationField value)

def checkedApplication : CheckedProcess := {
  identity := {
    semanticProfile := ⟨"bpmn-2.0.2-interrupting-message-event-subprocess-draft"⟩
    sourceId := ⟨"application-withdrawal"⟩
    sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  processId := ⟨"Application"⟩
  definitionScopes := [
    { id := ⟨"scope:Application"⟩, parentScopeId := none, originElementId := ⟨"Application"⟩ },
    { id := ⟨"scope:Withdrawal"⟩, parentScopeId := some ⟨"scope:Application"⟩, originElementId := ⟨"Withdrawal"⟩ }]
  nodes := [
    .userTask ⟨"CheckA"⟩ (some "Check eligibility") none,
    .userTask ⟨"CheckB"⟩ (some "Check documents") none,
    .noneEndEvent ⟨"EndA"⟩, .noneEndEvent ⟨"EndB"⟩,
    .parallelGateway ⟨"Fork"⟩ .diverging,
    .userTask ⟨"Handler"⟩ (some "Withdraw application") none,
    .noneEndEvent ⟨"HandlerEnd"⟩, .noneStartEvent ⟨"Start"⟩,
    .embeddedSubProcess ⟨"Withdrawal"⟩ ⟨"scope:Withdrawal"⟩,
    .messageStartEvent ⟨"WithdrawalStart"⟩ channel]
  nodeScopes := ["CheckA", "CheckB", "EndA", "EndB", "Fork", "Handler", "HandlerEnd", "Start", "Withdrawal", "WithdrawalStart"].map fun id =>
    { nodeId := ⟨id⟩, scopeId := if ["Handler", "HandlerEnd", "WithdrawalStart"].contains id then
        ⟨"scope:Withdrawal"⟩ else ⟨"scope:Application"⟩ }
  sequenceFlows := [
    { id := ⟨"Entry"⟩, sourceId := ⟨"Start"⟩, targetId := ⟨"Fork"⟩, condition := none },
    { id := ⟨"FinishA"⟩, sourceId := ⟨"CheckA"⟩, targetId := ⟨"EndA"⟩, condition := none },
    { id := ⟨"FinishB"⟩, sourceId := ⟨"CheckB"⟩, targetId := ⟨"EndB"⟩, condition := none },
    { id := ⟨"HandlerEntry"⟩, sourceId := ⟨"WithdrawalStart"⟩, targetId := ⟨"Handler"⟩, condition := none },
    { id := ⟨"HandlerFinish"⟩, sourceId := ⟨"Handler"⟩, targetId := ⟨"HandlerEnd"⟩, condition := none },
    { id := ⟨"ToA"⟩, sourceId := ⟨"Fork"⟩, targetId := ⟨"CheckA"⟩, condition := none },
    { id := ⟨"ToB"⟩, sourceId := ⟨"Fork"⟩, targetId := ⟨"CheckB"⟩, condition := none }]
  sequenceFlowScopes := ["Entry", "FinishA", "FinishB", "HandlerEntry", "HandlerFinish", "ToA", "ToB"].map fun id =>
    { sequenceFlowId := ⟨id⟩, scopeId := if ["HandlerEntry", "HandlerFinish"].contains id then
        ⟨"scope:Withdrawal"⟩ else ⟨"scope:Application"⟩ }
  interruptingMessageEventSubProcesses := [expectedCheckedDeclaration] }

def ordinarySource : CheckedProcess := {
  identity := { checkedApplication.identity with semanticProfile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩ }
  processId := ⟨"Application"⟩
  definitionScopes := [{ id := ⟨"scope:Application"⟩, parentScopeId := none, originElementId := ⟨"Application"⟩ }]
  nodes := [.userTask ⟨"CheckA"⟩ none none, .noneEndEvent ⟨"EndA"⟩, .noneStartEvent ⟨"Start"⟩]
  nodeScopes := ["CheckA", "EndA", "Start"].map fun id => { nodeId := ⟨id⟩, scopeId := ⟨"scope:Application"⟩ }
  sequenceFlows := [
    { id := ⟨"Entry"⟩, sourceId := ⟨"Start"⟩, targetId := ⟨"CheckA"⟩ },
    { id := ⟨"FinishA"⟩, sourceId := ⟨"CheckA"⟩, targetId := ⟨"EndA"⟩ }]
  sequenceFlowScopes := ["Entry", "FinishA"].map fun id => { sequenceFlowId := ⟨id⟩, scopeId := ⟨"scope:Application"⟩ } }

def complete_checked_admission_preserves_ordinary_profile : Bool := decide <|
    checkedWellFormed ordinarySource = true

def ordinaryStartPrograms : List Program :=
  let ordinary := lowerCheckedProcess ordinarySource
  [ordinary, { ordinary with identity := { ordinary.identity with
    semanticProfile := structuredCompositionCheckpointProfileId } }]

def ordinary_start_profiles_remain_admitted : Bool := decide <|
    ordinaryStartPrograms.all (fun program =>
      (admitStimulus program initialState
        (.startProcess ⟨"start"⟩ ⟨"Application"⟩ ⟨"instance"⟩ [])).outcome == .committed) = true

def ordinary_starts_refuse_foreign_handler_declarations_without_state_change : Bool := decide <|
    ordinaryStartPrograms.all (fun program =>
      let malformed := { program with interruptingMessageEventSubProcesses := [expectedProgramDeclaration] }
      let result := admitStimulus malformed initialState
        (.startProcess ⟨"start"⟩ ⟨"Application"⟩ ⟨"instance"⟩ [])
      result.outcome == .rejected && result.state == initialState) = true

def complete_checked_admission_refuses_listener_on_ordinary_profile : Bool := decide <|
    checkedWellFormed { ordinarySource with interruptingMessageEventSubProcesses := [expectedCheckedDeclaration] } = false

def complete_checked_admission_accepts_application_withdrawal : Bool := decide <|
    checkedWellFormed checkedApplication = true

def complete_checked_admission_refuses_missing_declaration : Bool := decide <|
    checkedWellFormed { checkedApplication with interruptingMessageEventSubProcesses := [] } = false

def complete_checked_admission_refuses_parent_flow_to_dormant_handler : Bool := decide <|
    checkedWellFormed { checkedApplication with sequenceFlows := checkedApplication.sequenceFlows.map fun flow =>
      if flow.id.value = "ToB" then { flow with targetId := ⟨"Withdrawal"⟩ } else flow } = false

def complete_lowering_retains_declaration_and_token_free_completion : Bool := decide <|
    let program := lowerCheckedProcess checkedApplication
    program.interruptingMessageEventSubProcesses = [expectedProgramDeclaration] ∧
      program.operations.length = 10 ∧
      program.operations.contains (.completeEventSubProcess
        ⟨"operation:complete-event-subprocess:scope:Withdrawal"⟩
        { elementId := ⟨"Withdrawal"⟩ } ⟨"scope:Withdrawal"⟩) = true

def applicationProgram : Program := lowerCheckedProcess checkedApplication

def program_profile_admits_independently_validated_withdrawal_graph : Bool := decide <|
    programProfileCapabilitiesValid applicationProgram = true

def complete_program_admission_accepts_application_withdrawal : Bool := decide <|
    programWellFormed applicationProgram = true

def event_handler_has_no_ordinary_child_entry : Bool := decide <|
    applicationProgram.compensationEventSubProcessSnapshots = none ∧
      ({ id := ⟨"scope:Withdrawal"⟩, parentScopeId := some ⟨"scope:Application"⟩,
         originElementId := ⟨"Withdrawal"⟩ } : DefinitionScope) ∈ applicationProgram.definitionScopes ∧
      (applicationProgram.operations.filter fun operation =>
        decide (enteredChildScopeId? operation = some (⟨"scope:Withdrawal"⟩ : DefinitionScopeId))).length = 0

def complete_program_graph_accepts_declared_handler_lifecycle : Bool := decide <|
    programGraphWellFormedForProgram applicationProgram = true

def raw_program_graph_does_not_invent_handler_entry : Bool := decide <|
    programGraphWellFormed applicationProgram = false

def complete_program_graph_refuses_undeclared_handler : Bool := decide <|
    programGraphWellFormedForProgram { applicationProgram with interruptingMessageEventSubProcesses := [] } = false

def complete_program_graph_refuses_wrong_handler_completion_owner : Bool := decide <|
    programGraphWellFormedForProgram { applicationProgram with operationScopes := applicationProgram.operationScopes.map fun ownership =>
      if ownership.operationId.value = "operation:complete-event-subprocess:scope:Withdrawal" then
        { ownership with scopeId := ⟨"scope:Application"⟩ } else ownership } = false

def program_profile_accepts_collection_permutations : Bool := decide <|
    programProfileCapabilitiesValid { applicationProgram with
      operations := applicationProgram.operations.reverse
      operationScopes := applicationProgram.operationScopes.reverse
      controlPlaces := applicationProgram.controlPlaces.reverse
      controlPlaceScopes := applicationProgram.controlPlaceScopes.reverse
      definitionScopes := applicationProgram.definitionScopes.reverse } = true

def program_profile_refuses_source_identity_alias : Bool := decide <|
    programProfileCapabilitiesValid { applicationProgram with
      interruptingMessageEventSubProcesses := [{ expectedProgramDeclaration with startEventId := ⟨"CheckA"⟩ }] } = false

def program_profile_refuses_missing_declaration : Bool := decide <|
    programProfileCapabilitiesValid { applicationProgram with interruptingMessageEventSubProcesses := [] } = false

def program_profile_preserves_ordinary_program : Bool := decide <|
    programProfileCapabilitiesValid (lowerCheckedProcess ordinarySource) = true

def program_profile_refuses_listener_on_ordinary_program : Bool := decide <|
    programProfileCapabilitiesValid { lowerCheckedProcess ordinarySource with
      interruptingMessageEventSubProcesses := [expectedProgramDeclaration] } = false

def program_profile_refuses_shared_parent_task_output : Bool := decide <|
    programProfileCapabilitiesValid { applicationProgram with operations := applicationProgram.operations.map fun
      | .awaitUserTask id origin input output task =>
          .awaitUserTask id origin input (if origin.elementId.value = "CheckB" then ⟨"place:FinishA"⟩ else output) task
      | operation => operation } = false

def program_profile_refuses_ordinary_child_completion : Bool := decide <|
    programProfileCapabilitiesValid { applicationProgram with operations := applicationProgram.operations.map fun
      | .completeEventSubProcess id origin scope => .completeScope id origin scope (some ⟨"place:Entry"⟩)
      | operation => operation } = false

def program_profile_refuses_parent_owned_handler_entry : Bool := decide <|
    programProfileCapabilitiesValid { applicationProgram with controlPlaceScopes := applicationProgram.controlPlaceScopes.map fun ownership =>
      if ownership.controlPlaceId = expectedProgramDeclaration.childEntry then
        { ownership with scopeId := expectedProgramDeclaration.parentScopeId } else ownership } = false

def checked_graph_accepts_parallel_work_with_dormant_handler : Bool := decide <|
    interruptingMessageEventSubProcessCheckedGraph checkedApplication = true

def lowering_resolves_handler_entry_flow_to_control_place : Bool := decide <|
    lowerMessageEventSubProcessDeclarations checkedApplication = [expectedProgramDeclaration]

def lowering_identifies_declaration_owned_dormant_handler : Bool := decide <|
    checkedMessageEventSubProcessElement checkedApplication ⟨"Withdrawal"⟩ = true

def lowering_selects_token_free_handler_completion : Bool := decide <|
    lowerMessageEventSubProcessCompletion? checkedApplication
      { id := ⟨"scope:Withdrawal"⟩, parentScopeId := some ⟨"scope:Application"⟩, originElementId := ⟨"Withdrawal"⟩ } =
      some (.completeEventSubProcess ⟨"operation:complete-event-subprocess:scope:Withdrawal"⟩
        { elementId := ⟨"Withdrawal"⟩ } ⟨"scope:Withdrawal"⟩, ⟨"scope:Withdrawal"⟩)

def lowering_leaves_ordinary_root_completion_to_existing_owner : Bool := decide <|
    lowerMessageEventSubProcessCompletion? checkedApplication
      { id := ⟨"scope:Application"⟩, parentScopeId := none, originElementId := ⟨"Application"⟩ } = none

def checked_graph_refuses_normal_flow_into_handler : Bool := decide <|
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      sequenceFlows := checkedApplication.sequenceFlows.map fun flow =>
        if flow.id.value = "ToB" then { flow with targetId := ⟨"Withdrawal"⟩ } else flow } = false

def checked_graph_refuses_handler_entry_owned_by_parent : Bool := decide <|
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      sequenceFlowScopes := checkedApplication.sequenceFlowScopes.map fun ownership =>
        if ownership.sequenceFlowId.value = "HandlerEntry" then
          { ownership with scopeId := ⟨"scope:Application"⟩ } else ownership } = false

def checked_graph_accepts_declaration_permutations : Bool := decide <|
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      definitionScopes := checkedApplication.definitionScopes.reverse
      nodes := checkedApplication.nodes.reverse
      nodeScopes := checkedApplication.nodeScopes.reverse
      sequenceFlows := checkedApplication.sequenceFlows.reverse
      sequenceFlowScopes := checkedApplication.sequenceFlowScopes.reverse } = true

def checked_graph_refuses_two_branches_sharing_one_end : Bool := decide <|
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      sequenceFlows := checkedApplication.sequenceFlows.map fun flow =>
        if flow.id.value = "FinishB" then { flow with targetId := ⟨"EndA"⟩ } else flow } = false

def checked_graph_refuses_noninterrupting_declaration : Bool := decide <|
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      interruptingMessageEventSubProcesses := [{ expectedCheckedDeclaration with interruption := .nonInterrupting }] } = false

def checked_graph_refuses_stale_child_entry : Bool := decide <|
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      interruptingMessageEventSubProcesses := [{ expectedCheckedDeclaration with childEntryFlowId := ⟨"ToA"⟩ }] } = false

def checked_graph_refuses_wrong_start_channel : Bool := decide <|
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      interruptingMessageEventSubProcesses := [{ expectedCheckedDeclaration with
        channel := .operationMessage ⟨"WithdrawalInterface"⟩ ⟨"Withdraw"⟩ ⟨"AnotherMessage"⟩ }] } = false

def checked_decoder_retains_exact_handler_declaration : Bool := decide <|
    ((decodeCheckedProcess (checkedJson (some (.arr #[checkedDeclarationJson])))).toOption.map
      (·.interruptingMessageEventSubProcesses)) = some [expectedCheckedDeclaration]

def program_decoder_retains_exact_handler_declaration : Bool := decide <|
    ((decodeProgram (programJson (some (.arr #[programDeclarationJson])))).toOption.map
      (·.interruptingMessageEventSubProcesses)) = some [expectedProgramDeclaration]

def checked_decoder_preserves_declaration_omission : Bool := decide <|
    ((decodeCheckedProcess (checkedJson none)).toOption.map (·.interruptingMessageEventSubProcesses)) = some []

def program_decoder_preserves_declaration_omission : Bool := decide <|
    ((decodeProgram (programJson none)).toOption.map (·.interruptingMessageEventSubProcesses)) = some []

def checked_decoder_refuses_null_collection : Bool := decide <|
    (decodeCheckedProcess (checkedJson (some .null))).isOk = false

def program_decoder_refuses_null_collection : Bool := decide <|
    (decodeProgram (programJson (some .null))).isOk = false

def checked_decoder_refuses_program_entry_representation : Bool := decide <|
    (decodeCheckedProcess (checkedJson (some (.arr #[programDeclarationJson])))).isOk = false

def program_decoder_refuses_checked_entry_representation : Bool := decide <|
    (decodeProgram (programJson (some (.arr #[checkedDeclarationJson])))).isOk = false

def applicationRoot : RuntimeScopeOccurrence := {
  id := { processInstanceId := ⟨"application"⟩, definitionScopeId := ⟨"scope:Application"⟩, activation := 1 }
  parent := none }

def withdrawalHandler : RuntimeScopeOccurrence := {
  id := { processInstanceId := ⟨"application"⟩, definitionScopeId := ⟨"scope:Withdrawal"⟩, activation := 1 }
  parent := some applicationRoot.id }

def quiescentHandlerState : RuntimeState := { initialState with
  control := .running ⟨"application"⟩
  scopeOccurrences := [applicationRoot, withdrawalHandler]
  endOccurrences := 2 }

def handlerCompletion : SemanticOperation :=
  .completeEventSubProcess ⟨"operation:complete-event-subprocess:scope:Withdrawal"⟩
    ⟨⟨"Withdrawal"⟩⟩ ⟨"scope:Withdrawal"⟩

def operation_dispatch_closes_only_quiescent_handler : Bool := decide <|
    fire? applicationProgram handlerCompletion quiescentHandlerState = some
      { quiescentHandlerState with scopeOccurrences := [applicationRoot] }

def operation_dispatch_refuses_handler_with_remaining_token : Bool := decide <|
    fire? applicationProgram handlerCompletion { quiescentHandlerState with
      tokens := [{ placeId := ⟨"place:HandlerFinish"⟩, owner := withdrawalHandler.id }] } = none

def handler_completion_publishes_only_child_completion : Bool := decide <|
    candidateFlowNodeOccurrenceDeltaForOperation? applicationProgram quiescentHandlerState
      { quiescentHandlerState with scopeOccurrences := [applicationRoot] }
      handlerCompletion ⟨"finish-withdrawal"⟩ 1 = some
        { started := [], ended := [{ anchor := .scope withdrawalHandler.id, terminal := .completed }] }

def handler_completion_refuses_parent_as_handler : Bool := decide <|
    candidateFlowNodeOccurrenceDeltaForOperation? applicationProgram quiescentHandlerState
      quiescentHandlerState (.completeEventSubProcess ⟨"invalid"⟩ ⟨⟨"Application"⟩⟩
        ⟨"scope:Application"⟩) ⟨"invalid-completion"⟩ 1 = none

def startApplication : Stimulus :=
  .startProcess ⟨"start-application"⟩ ⟨"Application"⟩ ⟨"application"⟩ []

def withdrawalListener : EventSubProcessMessageSubscription := {
  id := { processInstanceId := ⟨"application"⟩, elementId := ⟨"WithdrawalStart"⟩, activation := 1 }
  owner := applicationRoot.id
  channel }

def external_start_registers_parent_listener_without_handler : Bool := decide <|
    let admission := admitStimulus applicationProgram initialState startApplication
    admission.outcome = .committed ∧
      admission.state.eventSubProcessMessageSubscriptions = [withdrawalListener] ∧
      admission.state.scopeOccurrences = [applicationRoot] ∧ admission.state.tokens = []

def external_start_refuses_nonpristine_state : Bool := decide <|
    let before := { initialState with endOccurrences := 1 }
    let admission := admitStimulus applicationProgram before startApplication
    admission.outcome = .rejected ∧ admission.state = before

def startedApplication : RuntimeState :=
  (admitStimulus applicationProgram initialState startApplication).state

def unregisteredRoot : RuntimeState := { initialState with
  control := .running ⟨"application"⟩
  initiationPending := true
  scopeOccurrences := [applicationRoot]
  scopeActivations := [{ scopeId := applicationRoot.id.definitionScopeId, count := 1 }] }

def started_parent_listener_satisfies_family_and_generic_validity : Bool := decide <|
    interruptingMessageEventSubProcessCheckpointStateWellFormed applicationProgram
      ⟨"application"⟩ startedApplication = true

def family_validity_refuses_missing_listener_during_ordinary_work : Bool := decide <|
    interruptingMessageEventSubProcessStateValid applicationProgram
      { startedApplication with eventSubProcessMessageSubscriptions := [] } = false

def family_validity_refuses_duplicate_message_issuance_history : Bool := decide <|
    interruptingMessageEventSubProcessStateValid applicationProgram { startedApplication with
      messageActivations := startedApplication.messageActivations ++ startedApplication.messageActivations } = false

def family_validity_refuses_listener_with_active_handler : Bool := decide <|
    interruptingMessageEventSubProcessStateValid applicationProgram { startedApplication with
      initiationPending := false
      scopeOccurrences := [applicationRoot, withdrawalHandler]
      scopeActivations := [{ scopeId := applicationRoot.id.definitionScopeId, count := 1 },
        { scopeId := withdrawalHandler.id.definitionScopeId, count := 1 }] } = false

def family_validity_refuses_listener_on_predecessor_profile : Bool := decide <|
    interruptingMessageEventSubProcessStateValid (lowerCheckedProcess ordinarySource)
      { initialState with eventSubProcessMessageSubscriptions := [withdrawalListener] } = false


def ordinaryTaskOwner : ScopeOccurrenceId := ⟨⟨"instance"⟩, ⟨"scope:InvoiceProcess"⟩, 1⟩
def ordinaryTaskWait : UserTaskWait := {
  processInstanceId := ⟨"instance"⟩, owner := ordinaryTaskOwner
  task := { id := ⟨"Notify"⟩, name := none }, activation := 1, output := ⟨"place:d"⟩ }
def ordinaryTaskWithForeignListener : RuntimeState := {
  initialState with
  control := .running ⟨"instance"⟩
  waits := [ordinaryTaskWait]
  eventSubProcessMessageSubscriptions := [{
    id := ⟨⟨"instance"⟩, ⟨"unselected-message"⟩, 1⟩
    owner := ordinaryTaskOwner, channel }] }

open StructuredComposition StructuredCompositionFixtures in
open StructuredComposition StructuredCompositionFixtures in
open StructuredCompositionFixtures in
def waitingReview : RuntimeState := (do
  let initiated ← step applicationProgram startedApplication (nodeOperationId ⟨"Start"⟩)
  let forked ← step applicationProgram initiated (nodeOperationId ⟨"Fork"⟩)
  let first ← step applicationProgram forked (nodeOperationId ⟨"CheckA"⟩)
  step applicationProgram first (nodeOperationId ⟨"CheckB"⟩)).getD initialState

def withdrawApplication : Stimulus :=
  .deliverMessage ⟨"withdraw-application"⟩ withdrawalListener.id channel

def explicit_start_choices_arm_both_ordinary_tasks : Bool := decide <|
    waitingReview.waits.map (·.task.id.value) = ["CheckA", "CheckB"] ∧
      waitingReview.eventSubProcessMessageSubscriptions = [withdrawalListener] ∧
      interruptingMessageEventSubProcessCheckpointStateWellFormed applicationProgram
        ⟨"application"⟩ waitingReview = true

def external_delivery_interrupts_both_tasks_and_enters_only_handler : Bool := decide <|
    let admission := admitStimulus applicationProgram waitingReview withdrawApplication
    admission.outcome = .committed ∧ admission.state.waits = [] ∧
      admission.state.activityOccurrences = [] ∧ admission.state.eventSubProcessMessageSubscriptions = [] ∧
      admission.state.scopeOccurrences = [applicationRoot, withdrawalHandler] ∧
      admission.state.tokens = [{ placeId := ⟨"place:HandlerEntry"⟩, owner := withdrawalHandler.id }] ∧
      admission.state.messageActivations = waitingReview.messageActivations ∧
      interruptingMessageEventSubProcessCheckpointStateWellFormed applicationProgram
        ⟨"application"⟩ admission.state = true

def triggeredApplication : RuntimeState :=
  (admitStimulus applicationProgram waitingReview withdrawApplication).state

def dormant_listener_creates_no_executing_handler : Bool := decide <|
    (projectOpenFlowNodeOccurrencesWithMessageHandler? applicationProgram waitingReview).map
      (List.map (·.elementId.value)) = some ["CheckA", "CheckB"]

def triggered_handler_projects_its_declared_scope : Bool := decide <|
    projectOpenFlowNodeOccurrencesWithMessageHandler? applicationProgram triggeredApplication = some
      [{ anchor := .scope withdrawalHandler.id, processId := ⟨"Application"⟩,
         elementId := ⟨"Withdrawal"⟩, owner := applicationRoot.id }]

def message_delivery_publishes_cancellation_and_fresh_handler_start : Bool := decide <|
    flowNodeOccurrenceDeltaForStimulusWithMessageHandler? applicationProgram waitingReview
      triggeredApplication withdrawApplication 0 = some (canonicalFlowNodeOccurrenceDelta
        [{ anchor := .scope withdrawalHandler.id, processId := ⟨"Application"⟩,
           elementId := ⟨"Withdrawal"⟩, owner := applicationRoot.id },
         { anchor := .transition ⟨"withdraw-application"⟩ 0 0, processId := ⟨"Application"⟩,
           elementId := ⟨"WithdrawalStart"⟩, owner := withdrawalHandler.id }]
        [{ anchor := .wait ⟨⟨"application"⟩, ⟨"CheckA"⟩, 1⟩, terminal := .cancelled },
         { anchor := .wait ⟨⟨"application"⟩, ⟨"CheckB"⟩, 1⟩, terminal := .cancelled },
         { anchor := .transition ⟨"withdraw-application"⟩ 0 0, terminal := .completed }])

def message_delivery_refuses_publication_against_unchanged_successor : Bool := decide <|
    flowNodeOccurrenceDeltaForStimulusWithMessageHandler? applicationProgram waitingReview
      waitingReview withdrawApplication 0 = none

def handler_projection_refuses_orphaned_handler : Bool := decide <|
    projectOpenFlowNodeOccurrencesWithMessageHandler? applicationProgram
      { triggeredApplication with scopeOccurrences := [withdrawalHandler] } = none

def handlerWaiting : RuntimeState :=
  (step applicationProgram triggeredApplication (nodeOperationId ⟨"Handler"⟩)).getD initialState

def handlerCompleted : RuntimeState :=
  (admitStimulus applicationProgram handlerWaiting
    (.completeUserTaskInstance ⟨"finish-handler"⟩ ⟨⟨"application"⟩, ⟨"Handler"⟩, 1⟩ [])).state

def handlerQuiescent : RuntimeState :=
  (step applicationProgram handlerCompleted (nodeOperationId ⟨"HandlerEnd"⟩)).getD initialState

def handlerClosed : RuntimeState :=
  (step applicationProgram handlerQuiescent handlerCompletion.id).getD initialState

def handler_task_projects_under_its_executing_scope : Bool := decide <|
    projectOpenFlowNodeOccurrencesWithMessageHandler? applicationProgram handlerWaiting = some
      (sortFlowNodeOccurrenceStarts
        [{ anchor := .scope withdrawalHandler.id, processId := ⟨"Application"⟩,
           elementId := ⟨"Withdrawal"⟩, owner := applicationRoot.id },
         { anchor := .wait ⟨⟨"application"⟩, ⟨"Handler"⟩, 1⟩, processId := ⟨"Application"⟩,
           elementId := ⟨"Handler"⟩, owner := withdrawalHandler.id }])

def handler_completion_lifecycle_matches_its_independent_open_projection : Bool := decide <|
    flowNodeOccurrenceDeltaForOperationWithMessageHandler? applicationProgram handlerQuiescent
      handlerClosed handlerCompletion ⟨"finish-handler"⟩ 2 = some
        { started := [], ended := [{ anchor := .scope withdrawalHandler.id, terminal := .completed }] }

def scheduledStart : TracedStimulusResult :=
  applyStimulusTraced 8 applicationProgram initialState startApplication

def scheduledWithdrawal : TracedStimulusResult :=
  applyStimulusTraced 8 applicationProgram scheduledStart.result.state withdrawApplication

def scheduledHandlerCompletion : TracedStimulusResult :=
  applyStimulusTraced 8 applicationProgram scheduledWithdrawal.result.state
    (.completeUserTaskInstance ⟨"finish-handler"⟩ ⟨⟨"application"⟩, ⟨"Handler"⟩, 1⟩ [])

def dormant_parent_publishes_message_ingress_without_executing_start : Bool := decide <|
    (observeStableState applicationProgram waitingReview).map (·.openMessageSubscriptions) =
        some [{ id := withdrawalListener.id, channel }] ∧
      (observeStableState applicationProgram waitingReview).map (·.enabledInteractions) = some
        [.completeUserTaskInstance ⟨⟨"application"⟩, ⟨"CheckA"⟩, 1⟩,
         .completeUserTaskInstance ⟨⟨"application"⟩, ⟨"CheckB"⟩, 1⟩,
         .deliverMessage withdrawalListener.id channel] ∧
      (observeStableState applicationProgram waitingReview).map (fun observation =>
        observation.activeWaits.map (·.elementId.value)) = some ["CheckA", "CheckB"]

def triggered_parent_publishes_only_handler_ingress : Bool := decide <|
    (observeStableState applicationProgram handlerWaiting).map (·.openMessageSubscriptions) = some [] ∧
      (observeStableState applicationProgram handlerWaiting).map (·.enabledInteractions) = some
        [.completeUserTaskInstance ⟨⟨"application"⟩, ⟨"Handler"⟩, 1⟩]

def completeTask (name : String) : Stimulus :=
  .completeUserTaskInstance ⟨"complete:" ++ name⟩ ⟨⟨"application"⟩, ⟨name⟩, 1⟩ []

def initial_parallel_frontier_is_complete_and_both_arm_orders_agree : Bool := decide <|
    let forked := (runChoices applicationProgram startedApplication
      [nodeOperationId ⟨"Start"⟩, nodeOperationId ⟨"Fork"⟩]).getD initialState
    (InternalCommutation.deriveInternalExecutionFrontier applicationProgram forked).offers.map
        (·.operation.id) = [nodeOperationId ⟨"CheckA"⟩, nodeOperationId ⟨"CheckB"⟩] ∧
      runChoices applicationProgram forked [nodeOperationId ⟨"CheckA"⟩, nodeOperationId ⟨"CheckB"⟩] =
        some waitingReview ∧
      runChoices applicationProgram forked [nodeOperationId ⟨"CheckB"⟩, nodeOperationId ⟨"CheckA"⟩] =
        some waitingReview

def refusesExactly (before : RuntimeState) (stimulus : Stimulus) : Bool :=
  let result := applyStimulusTraced 8 applicationProgram before stimulus
  result.result.outcome == .rejected && result.result.state == before &&
    result.committedTransitions.isEmpty && result.flowNodeOccurrenceLifecycles.isEmpty

def invalid_deliveries_and_cancelled_tasks_preserve_state_without_publication : Bool := decide <|
    refusesExactly initialState withdrawApplication = true ∧
      ([.deliverMessage ⟨"foreign"⟩ { withdrawalListener.id with processInstanceId := ⟨"foreign"⟩ } channel,
        .deliverMessage ⟨"future"⟩ { withdrawalListener.id with activation := 2 } channel,
        .deliverMessage ⟨"wrong-channel"⟩ withdrawalListener.id
          (.operationMessage ⟨"Other"⟩ ⟨"Withdraw"⟩ ⟨"WithdrawalMessage"⟩),
        .deliverPayloadMessage ⟨"payload"⟩ withdrawalListener.id channel (.string "unexpected")].all
        (refusesExactly waitingReview)) = true ∧
      ([withdrawApplication, completeTask "CheckA", completeTask "CheckB"].all
        (refusesExactly handlerWaiting)) = true

def fitsOrRollsBack (before : RuntimeState) (stimulus : Stimulus) (fuel : Nat) : Bool :=
  let atBound := applyStimulusTraced fuel applicationProgram before stimulus
  let short := applyStimulusTraced (fuel - 1) applicationProgram before stimulus
  atBound.result.outcome == .committed && atBound.committedTransitions.length == fuel + 1 &&
    atBound.flowNodeOccurrenceLifecycles.length == fuel + 1 &&
    short.result.outcome == .rolledBack && short.result.state == before &&
    short.result.internalStepBoundExceeded && short.committedTransitions.isEmpty &&
    short.flowNodeOccurrenceLifecycles.isEmpty

def startup_delivery_and_handler_completion_have_exact_atomic_fuel_bounds : Bool := decide <|
    fitsOrRollsBack initialState startApplication 4 = true ∧
      fitsOrRollsBack waitingReview withdrawApplication 1 = true ∧
      fitsOrRollsBack handlerWaiting (completeTask "Handler") 3 = true

def checkedCommandSequence (program : Program) :
    RuntimeState → List (Stimulus × Nat) → Option RuntimeState
  | state, [] => some state
  | state, (stimulus, steps) :: rest => do
      let result := applyStimulusTraced 8 program state stimulus
      if result.result.outcome != .committed || result.committedTransitions.length != steps + 1 ||
          result.flowNodeOccurrenceLifecycles.length != steps + 1 then none
      if !(List.range (steps + 1)).all (fun index =>
          match replayCommittedTransitions program state (result.committedTransitions.take (index + 1)) with
          | none => false
          | some reached => interruptingMessageEventSubProcessCheckpointStateWellFormed program
              ⟨"application"⟩ reached) then none
      if replayCommittedTransitions program state result.committedTransitions != some result.result.state then none
      checkedCommandSequence program result.result.state rest

def completeSchedules : List (List (Stimulus × Nat)) :=
  [[(completeTask "CheckA", 1), (completeTask "CheckB", 2)],
   [(completeTask "CheckB", 1), (completeTask "CheckA", 2)],
   [(withdrawApplication, 1), (completeTask "Handler", 3)],
   [(completeTask "CheckA", 1), (withdrawApplication, 1), (completeTask "Handler", 3)],
   [(completeTask "CheckB", 1), (withdrawApplication, 1), (completeTask "Handler", 3)]]

/-- Every complete schedule under `mode` runs to completion with valid prefixes and no residue. -/
def completeSchedulesFinish (mode : InternalSchedulingMode) : Bool :=
  completeSchedules.all fun commands =>
    match checkedCommandSequence { applicationProgram with internalSchedulingMode := mode }
        initialState ((startApplication, 4) :: commands) with
    | none => false
    | some final => final.control == .completed ⟨"application"⟩ &&
        final.scopeOccurrences.isEmpty && final.eventSubProcessMessageSubscriptions.isEmpty

def last_task_and_message_races_follow_input_order_and_keep_completed_history : Bool := decide <|
    (["CheckA", "CheckB"].all fun first =>
      let other := if first == "CheckA" then "CheckB" else "CheckA"
      let afterFirst := (applyStimulusTraced 8 applicationProgram waitingReview (completeTask first)).result.state
      let normal := applyStimulusTraced 8 applicationProgram afterFirst (completeTask other)
      let interrupted := applyStimulusTraced 8 applicationProgram afterFirst withdrawApplication
      normal.result.outcome == .committed && normal.result.state.control == .completed ⟨"application"⟩ &&
        refusesExactly normal.result.state withdrawApplication &&
        interrupted.result.outcome == .committed && interrupted.result.state.waits.map (·.task.id.value) == ["Handler"] &&
        interrupted.result.state.endOccurrences == afterFirst.endOccurrences &&
        refusesExactly interrupted.result.state (completeTask other)) = true

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("complete_checked_admission_preserves_ordinary_profile", complete_checked_admission_preserves_ordinary_profile),
  ("ordinary_start_profiles_remain_admitted", ordinary_start_profiles_remain_admitted),
  ("ordinary_starts_refuse_foreign_handler_declarations_without_state_change", ordinary_starts_refuse_foreign_handler_declarations_without_state_change),
  ("complete_checked_admission_refuses_listener_on_ordinary_profile", complete_checked_admission_refuses_listener_on_ordinary_profile),
  ("complete_checked_admission_accepts_application_withdrawal", complete_checked_admission_accepts_application_withdrawal),
  ("complete_checked_admission_refuses_missing_declaration", complete_checked_admission_refuses_missing_declaration),
  ("complete_checked_admission_refuses_parent_flow_to_dormant_handler", complete_checked_admission_refuses_parent_flow_to_dormant_handler),
  ("complete_lowering_retains_declaration_and_token_free_completion", complete_lowering_retains_declaration_and_token_free_completion),
  ("program_profile_admits_independently_validated_withdrawal_graph", program_profile_admits_independently_validated_withdrawal_graph),
  ("complete_program_admission_accepts_application_withdrawal", complete_program_admission_accepts_application_withdrawal),
  ("event_handler_has_no_ordinary_child_entry", event_handler_has_no_ordinary_child_entry),
  ("complete_program_graph_accepts_declared_handler_lifecycle", complete_program_graph_accepts_declared_handler_lifecycle),
  ("raw_program_graph_does_not_invent_handler_entry", raw_program_graph_does_not_invent_handler_entry),
  ("complete_program_graph_refuses_undeclared_handler", complete_program_graph_refuses_undeclared_handler),
  ("complete_program_graph_refuses_wrong_handler_completion_owner", complete_program_graph_refuses_wrong_handler_completion_owner),
  ("program_profile_accepts_collection_permutations", program_profile_accepts_collection_permutations),
  ("program_profile_refuses_source_identity_alias", program_profile_refuses_source_identity_alias),
  ("program_profile_refuses_missing_declaration", program_profile_refuses_missing_declaration),
  ("program_profile_preserves_ordinary_program", program_profile_preserves_ordinary_program),
  ("program_profile_refuses_listener_on_ordinary_program", program_profile_refuses_listener_on_ordinary_program),
  ("program_profile_refuses_shared_parent_task_output", program_profile_refuses_shared_parent_task_output),
  ("program_profile_refuses_ordinary_child_completion", program_profile_refuses_ordinary_child_completion),
  ("program_profile_refuses_parent_owned_handler_entry", program_profile_refuses_parent_owned_handler_entry),
  ("checked_graph_accepts_parallel_work_with_dormant_handler", checked_graph_accepts_parallel_work_with_dormant_handler),
  ("lowering_resolves_handler_entry_flow_to_control_place", lowering_resolves_handler_entry_flow_to_control_place),
  ("lowering_identifies_declaration_owned_dormant_handler", lowering_identifies_declaration_owned_dormant_handler),
  ("lowering_selects_token_free_handler_completion", lowering_selects_token_free_handler_completion),
  ("lowering_leaves_ordinary_root_completion_to_existing_owner", lowering_leaves_ordinary_root_completion_to_existing_owner),
  ("checked_graph_refuses_normal_flow_into_handler", checked_graph_refuses_normal_flow_into_handler),
  ("checked_graph_refuses_handler_entry_owned_by_parent", checked_graph_refuses_handler_entry_owned_by_parent),
  ("checked_graph_accepts_declaration_permutations", checked_graph_accepts_declaration_permutations),
  ("checked_graph_refuses_two_branches_sharing_one_end", checked_graph_refuses_two_branches_sharing_one_end),
  ("checked_graph_refuses_noninterrupting_declaration", checked_graph_refuses_noninterrupting_declaration),
  ("checked_graph_refuses_stale_child_entry", checked_graph_refuses_stale_child_entry),
  ("checked_graph_refuses_wrong_start_channel", checked_graph_refuses_wrong_start_channel),
  ("checked_decoder_retains_exact_handler_declaration", checked_decoder_retains_exact_handler_declaration),
  ("program_decoder_retains_exact_handler_declaration", program_decoder_retains_exact_handler_declaration),
  ("checked_decoder_preserves_declaration_omission", checked_decoder_preserves_declaration_omission),
  ("program_decoder_preserves_declaration_omission", program_decoder_preserves_declaration_omission),
  ("checked_decoder_refuses_null_collection", checked_decoder_refuses_null_collection),
  ("program_decoder_refuses_null_collection", program_decoder_refuses_null_collection),
  ("checked_decoder_refuses_program_entry_representation", checked_decoder_refuses_program_entry_representation),
  ("program_decoder_refuses_checked_entry_representation", program_decoder_refuses_checked_entry_representation),
  ("operation_dispatch_closes_only_quiescent_handler", operation_dispatch_closes_only_quiescent_handler),
  ("operation_dispatch_refuses_handler_with_remaining_token", operation_dispatch_refuses_handler_with_remaining_token),
  ("handler_completion_publishes_only_child_completion", handler_completion_publishes_only_child_completion),
  ("handler_completion_refuses_parent_as_handler", handler_completion_refuses_parent_as_handler),
  ("external_start_registers_parent_listener_without_handler", external_start_registers_parent_listener_without_handler),
  ("external_start_refuses_nonpristine_state", external_start_refuses_nonpristine_state),
  ("started_parent_listener_satisfies_family_and_generic_validity", started_parent_listener_satisfies_family_and_generic_validity),
  ("family_validity_refuses_missing_listener_during_ordinary_work", family_validity_refuses_missing_listener_during_ordinary_work),
  ("family_validity_refuses_duplicate_message_issuance_history", family_validity_refuses_duplicate_message_issuance_history),
  ("family_validity_refuses_listener_with_active_handler", family_validity_refuses_listener_with_active_handler),
  ("family_validity_refuses_listener_on_predecessor_profile", family_validity_refuses_listener_on_predecessor_profile),
  ("explicit_start_choices_arm_both_ordinary_tasks", explicit_start_choices_arm_both_ordinary_tasks),
  ("external_delivery_interrupts_both_tasks_and_enters_only_handler", external_delivery_interrupts_both_tasks_and_enters_only_handler),
  ("dormant_listener_creates_no_executing_handler", dormant_listener_creates_no_executing_handler),
  ("triggered_handler_projects_its_declared_scope", triggered_handler_projects_its_declared_scope),
  ("message_delivery_publishes_cancellation_and_fresh_handler_start", message_delivery_publishes_cancellation_and_fresh_handler_start),
  ("message_delivery_refuses_publication_against_unchanged_successor", message_delivery_refuses_publication_against_unchanged_successor),
  ("handler_projection_refuses_orphaned_handler", handler_projection_refuses_orphaned_handler),
  ("handler_task_projects_under_its_executing_scope", handler_task_projects_under_its_executing_scope),
  ("handler_completion_lifecycle_matches_its_independent_open_projection", handler_completion_lifecycle_matches_its_independent_open_projection),
  ("dormant_parent_publishes_message_ingress_without_executing_start", dormant_parent_publishes_message_ingress_without_executing_start),
  ("triggered_parent_publishes_only_handler_ingress", triggered_parent_publishes_only_handler_ingress),
  ("initial_parallel_frontier_is_complete_and_both_arm_orders_agree", initial_parallel_frontier_is_complete_and_both_arm_orders_agree),
  ("invalid_deliveries_and_cancelled_tasks_preserve_state_without_publication", invalid_deliveries_and_cancelled_tasks_preserve_state_without_publication),
  ("startup_delivery_and_handler_completion_have_exact_atomic_fuel_bounds", startup_delivery_and_handler_completion_have_exact_atomic_fuel_bounds),
  ("last_task_and_message_races_follow_input_order_and_keep_completed_history", last_task_and_message_races_follow_input_order_and_keep_completed_history)
]

end BpmnSemantics.InterruptingMessageEventSubProcessConformance

import BpmnSemantics.SemanticProcess.ExecutionRuntime
import BpmnSemantics.SemanticProcessJson.CheckedProcess
import BpmnSemantics.SemanticProcessJson.Program
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessAdmission
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessLowering
import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.Transition
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistrationLaws
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessFlowNodeOccurrence
import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcess.StructuredCompositionLifecycleProofs
import BpmnSemantics.SemanticProcess.StructuredCompositionFixtures

/-! Bounded conformance for the interrupting Message Event Sub-Process account. Strict wire witnesses
separate declaration storage from structural admission; composed execution witnesses belong to this same owner. -/

namespace BpmnSemantics.InterruptingMessageEventSubProcessConformance

open Lean SemanticProcess SemanticProcessJson

private def channel : MessageChannel := .operationMessage ⟨"WithdrawalInterface"⟩ ⟨"Withdraw"⟩ ⟨"WithdrawalMessage"⟩

private def channelJson : Json := Json.mkObj [
  ("kind", toJson "operationMessage"), ("interfaceId", toJson "WithdrawalInterface"),
  ("interfaceOperationId", toJson "Withdraw"), ("messageId", toJson "WithdrawalMessage")]

private def declarationFields : List (String × Json) := [
  ("parentScopeId", toJson "scope:Application"), ("handlerScopeId", toJson "scope:Withdrawal"),
  ("elementId", toJson "Withdrawal"), ("startEventId", toJson "WithdrawalStart"), ("channel", channelJson)]

private def checkedDeclarationJson : Json := Json.mkObj (declarationFields ++ [
  ("interruption", toJson "interrupting"), ("childEntryFlowId", toJson "HandlerEntry")])

private def programDeclarationJson : Json := Json.mkObj (declarationFields ++ [
  ("childEntry", toJson "place:HandlerEntry")])

private def expectedCheckedDeclaration : CheckedInterruptingMessageEventSubProcess := {
  parentScopeId := ⟨"scope:Application"⟩
  handlerScopeId := ⟨"scope:Withdrawal"⟩
  elementId := ⟨"Withdrawal"⟩
  startEventId := ⟨"WithdrawalStart"⟩
  channel
  interruption := .interrupting
  childEntryFlowId := ⟨"HandlerEntry"⟩ }

private def expectedProgramDeclaration : InterruptingMessageEventSubProcessDeclaration := {
  parentScopeId := ⟨"scope:Application"⟩
  handlerScopeId := ⟨"scope:Withdrawal"⟩
  elementId := ⟨"Withdrawal"⟩
  startEventId := ⟨"WithdrawalStart"⟩
  channel
  childEntry := ⟨"place:HandlerEntry"⟩ }

private def identityFields : List (String × Json) := [
  ("semanticProfile", toJson "bpmn-2.0.2-interrupting-message-event-subprocess-draft"),
  ("sourceId", toJson "withdrawal-wire"), ("sourceOverlay", .null),
  ("sourceSha256", toJson "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")]

private def declarationField (value : Option Json) : List (String × Json) :=
  value.toList.map fun value => ("interruptingMessageEventSubProcesses", value)

private def checkedJson (value : Option Json) : Json := Json.mkObj ([
  ("kind", toJson "checkedProcess"), ("identity", Json.mkObj identityFields),
  ("processId", toJson "Application"), ("definitionScopes", .arr #[]), ("nodeScopes", .arr #[]),
  ("sequenceFlowScopes", .arr #[]), ("nodes", .arr #[]), ("sequenceFlows", .arr #[])] ++ declarationField value)

private def programJson (value : Option Json) : Json := Json.mkObj ([
  ("kind", toJson "semanticProcess"),
  ("identity", Json.mkObj (("compiler", toJson "bpmn-source-semantic-process") :: identityFields)),
  ("processId", toJson "Application"), ("internalSchedulingMode", toJson "rejectObservableChoice"),
  ("definitionScopes", .arr #[]), ("operationScopes", .arr #[]), ("controlPlaceScopes", .arr #[]),
  ("controlPlaces", .arr #[]), ("operations", .arr #[])] ++ declarationField value)

private def checkedApplication : CheckedProcess := {
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

private def ordinarySource : CheckedProcess := {
  identity := { checkedApplication.identity with semanticProfile := ⟨"cibseven-2.2.0-user-task-process-data-draft"⟩ }
  processId := ⟨"Application"⟩
  definitionScopes := [{ id := ⟨"scope:Application"⟩, parentScopeId := none, originElementId := ⟨"Application"⟩ }]
  nodes := [.userTask ⟨"CheckA"⟩ none none, .noneEndEvent ⟨"EndA"⟩, .noneStartEvent ⟨"Start"⟩]
  nodeScopes := ["CheckA", "EndA", "Start"].map fun id => { nodeId := ⟨id⟩, scopeId := ⟨"scope:Application"⟩ }
  sequenceFlows := [
    { id := ⟨"Entry"⟩, sourceId := ⟨"Start"⟩, targetId := ⟨"CheckA"⟩ },
    { id := ⟨"FinishA"⟩, sourceId := ⟨"CheckA"⟩, targetId := ⟨"EndA"⟩ }]
  sequenceFlowScopes := ["Entry", "FinishA"].map fun id => { sequenceFlowId := ⟨id⟩, scopeId := ⟨"scope:Application"⟩ } }

theorem complete_checked_admission_preserves_ordinary_profile :
    checkedWellFormed ordinarySource = true := by
  decide +kernel

private def ordinaryStartPrograms : List Program :=
  let ordinary := lowerCheckedProcess ordinarySource
  [ordinary, { ordinary with identity := { ordinary.identity with
    semanticProfile := structuredCompositionCheckpointProfileId } }]

theorem ordinary_start_profiles_remain_admitted :
    ordinaryStartPrograms.all (fun program =>
      (admitStimulus program initialState
        (.startProcess ⟨"start"⟩ ⟨"Application"⟩ ⟨"instance"⟩ [])).outcome == .committed) = true := by
  decide +kernel

theorem ordinary_starts_refuse_foreign_handler_declarations_without_state_change :
    ordinaryStartPrograms.all (fun program =>
      let malformed := { program with interruptingMessageEventSubProcesses := [expectedProgramDeclaration] }
      let result := admitStimulus malformed initialState
        (.startProcess ⟨"start"⟩ ⟨"Application"⟩ ⟨"instance"⟩ [])
      result.outcome == .rejected && result.state == initialState) = true := by
  decide +kernel

theorem complete_checked_admission_refuses_listener_on_ordinary_profile :
    checkedWellFormed { ordinarySource with interruptingMessageEventSubProcesses := [expectedCheckedDeclaration] } = false := by
  decide +kernel

theorem complete_checked_admission_accepts_application_withdrawal :
    checkedWellFormed checkedApplication = true := by
  decide +kernel

theorem complete_checked_admission_refuses_missing_declaration :
    checkedWellFormed { checkedApplication with interruptingMessageEventSubProcesses := [] } = false := by
  decide +kernel

theorem complete_checked_admission_refuses_parent_flow_to_dormant_handler :
    checkedWellFormed { checkedApplication with sequenceFlows := checkedApplication.sequenceFlows.map fun flow =>
      if flow.id.value = "ToB" then { flow with targetId := ⟨"Withdrawal"⟩ } else flow } = false := by
  decide +kernel

theorem complete_lowering_retains_declaration_and_token_free_completion :
    let program := lowerCheckedProcess checkedApplication
    program.interruptingMessageEventSubProcesses = [expectedProgramDeclaration] ∧
      program.operations.length = 10 ∧
      program.operations.contains (.completeEventSubProcess
        ⟨"operation:complete-event-subprocess:scope:Withdrawal"⟩
        { elementId := ⟨"Withdrawal"⟩ } ⟨"scope:Withdrawal"⟩) = true := by
  decide +kernel

private def applicationProgram : Program := lowerCheckedProcess checkedApplication

theorem program_profile_admits_independently_validated_withdrawal_graph :
    programProfileCapabilitiesValid applicationProgram = true := by
  decide +kernel

theorem complete_program_admission_accepts_application_withdrawal :
    programWellFormed applicationProgram = true := by
  decide +kernel

theorem event_handler_has_no_ordinary_child_entry :
    applicationProgram.compensationEventSubProcessSnapshots = none ∧
      ({ id := ⟨"scope:Withdrawal"⟩, parentScopeId := some ⟨"scope:Application"⟩,
         originElementId := ⟨"Withdrawal"⟩ } : DefinitionScope) ∈ applicationProgram.definitionScopes ∧
      (applicationProgram.operations.filter fun operation =>
        decide (enteredChildScopeId? operation = some (⟨"scope:Withdrawal"⟩ : DefinitionScopeId))).length = 0 := by
  decide +kernel

theorem complete_program_graph_accepts_declared_handler_lifecycle :
    programGraphWellFormedForProgram applicationProgram = true := by
  decide +kernel

theorem raw_program_graph_does_not_invent_handler_entry :
    programGraphWellFormed applicationProgram = false := by
  decide +kernel

theorem complete_program_graph_refuses_undeclared_handler :
    programGraphWellFormedForProgram { applicationProgram with interruptingMessageEventSubProcesses := [] } = false := by
  decide +kernel

theorem complete_program_graph_refuses_wrong_handler_completion_owner :
    programGraphWellFormedForProgram { applicationProgram with operationScopes := applicationProgram.operationScopes.map fun ownership =>
      if ownership.operationId.value = "operation:complete-event-subprocess:scope:Withdrawal" then
        { ownership with scopeId := ⟨"scope:Application"⟩ } else ownership } = false := by
  decide +kernel

theorem program_profile_accepts_collection_permutations :
    programProfileCapabilitiesValid { applicationProgram with
      operations := applicationProgram.operations.reverse
      operationScopes := applicationProgram.operationScopes.reverse
      controlPlaces := applicationProgram.controlPlaces.reverse
      controlPlaceScopes := applicationProgram.controlPlaceScopes.reverse
      definitionScopes := applicationProgram.definitionScopes.reverse } = true := by
  decide +kernel

theorem program_profile_refuses_source_identity_alias :
    programProfileCapabilitiesValid { applicationProgram with
      interruptingMessageEventSubProcesses := [{ expectedProgramDeclaration with startEventId := ⟨"CheckA"⟩ }] } = false := by
  decide +kernel

theorem program_profile_refuses_missing_declaration :
    programProfileCapabilitiesValid { applicationProgram with interruptingMessageEventSubProcesses := [] } = false := by
  decide +kernel

theorem program_profile_preserves_ordinary_program :
    programProfileCapabilitiesValid (lowerCheckedProcess ordinarySource) = true := by
  decide +kernel

theorem program_profile_refuses_listener_on_ordinary_program :
    programProfileCapabilitiesValid { lowerCheckedProcess ordinarySource with
      interruptingMessageEventSubProcesses := [expectedProgramDeclaration] } = false := by
  decide +kernel

theorem program_profile_refuses_shared_parent_task_output :
    programProfileCapabilitiesValid { applicationProgram with operations := applicationProgram.operations.map fun
      | .awaitUserTask id origin input output task =>
          .awaitUserTask id origin input (if origin.elementId.value = "CheckB" then ⟨"place:FinishA"⟩ else output) task
      | operation => operation } = false := by
  decide +kernel

theorem program_profile_refuses_ordinary_child_completion :
    programProfileCapabilitiesValid { applicationProgram with operations := applicationProgram.operations.map fun
      | .completeEventSubProcess id origin scope => .completeScope id origin scope (some ⟨"place:Entry"⟩)
      | operation => operation } = false := by
  decide +kernel

theorem program_profile_refuses_parent_owned_handler_entry :
    programProfileCapabilitiesValid { applicationProgram with controlPlaceScopes := applicationProgram.controlPlaceScopes.map fun ownership =>
      if ownership.controlPlaceId = expectedProgramDeclaration.childEntry then
        { ownership with scopeId := expectedProgramDeclaration.parentScopeId } else ownership } = false := by
  decide +kernel

theorem checked_graph_accepts_parallel_work_with_dormant_handler :
    interruptingMessageEventSubProcessCheckedGraph checkedApplication = true := by
  decide +kernel

theorem lowering_resolves_handler_entry_flow_to_control_place :
    lowerMessageEventSubProcessDeclarations checkedApplication = [expectedProgramDeclaration] := by
  decide +kernel

theorem lowering_identifies_declaration_owned_dormant_handler :
    checkedMessageEventSubProcessElement checkedApplication ⟨"Withdrawal"⟩ = true := by
  decide +kernel

theorem lowering_selects_token_free_handler_completion :
    lowerMessageEventSubProcessCompletion? checkedApplication
      { id := ⟨"scope:Withdrawal"⟩, parentScopeId := some ⟨"scope:Application"⟩, originElementId := ⟨"Withdrawal"⟩ } =
      some (.completeEventSubProcess ⟨"operation:complete-event-subprocess:scope:Withdrawal"⟩
        { elementId := ⟨"Withdrawal"⟩ } ⟨"scope:Withdrawal"⟩, ⟨"scope:Withdrawal"⟩) := by
  decide +kernel

theorem lowering_leaves_ordinary_root_completion_to_existing_owner :
    lowerMessageEventSubProcessCompletion? checkedApplication
      { id := ⟨"scope:Application"⟩, parentScopeId := none, originElementId := ⟨"Application"⟩ } = none := by
  decide +kernel

theorem checked_graph_refuses_normal_flow_into_handler :
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      sequenceFlows := checkedApplication.sequenceFlows.map fun flow =>
        if flow.id.value = "ToB" then { flow with targetId := ⟨"Withdrawal"⟩ } else flow } = false := by
  decide +kernel

theorem checked_graph_refuses_handler_entry_owned_by_parent :
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      sequenceFlowScopes := checkedApplication.sequenceFlowScopes.map fun ownership =>
        if ownership.sequenceFlowId.value = "HandlerEntry" then
          { ownership with scopeId := ⟨"scope:Application"⟩ } else ownership } = false := by
  decide +kernel

theorem checked_graph_accepts_declaration_permutations :
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      definitionScopes := checkedApplication.definitionScopes.reverse
      nodes := checkedApplication.nodes.reverse
      nodeScopes := checkedApplication.nodeScopes.reverse
      sequenceFlows := checkedApplication.sequenceFlows.reverse
      sequenceFlowScopes := checkedApplication.sequenceFlowScopes.reverse } = true := by
  decide +kernel

theorem checked_graph_refuses_two_branches_sharing_one_end :
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      sequenceFlows := checkedApplication.sequenceFlows.map fun flow =>
        if flow.id.value = "FinishB" then { flow with targetId := ⟨"EndA"⟩ } else flow } = false := by
  decide +kernel

theorem checked_graph_refuses_noninterrupting_declaration :
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      interruptingMessageEventSubProcesses := [{ expectedCheckedDeclaration with interruption := .nonInterrupting }] } = false := by
  decide +kernel

theorem checked_graph_refuses_stale_child_entry :
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      interruptingMessageEventSubProcesses := [{ expectedCheckedDeclaration with childEntryFlowId := ⟨"ToA"⟩ }] } = false := by
  decide +kernel

theorem checked_graph_refuses_wrong_start_channel :
    interruptingMessageEventSubProcessCheckedGraph { checkedApplication with
      interruptingMessageEventSubProcesses := [{ expectedCheckedDeclaration with
        channel := .operationMessage ⟨"WithdrawalInterface"⟩ ⟨"Withdraw"⟩ ⟨"AnotherMessage"⟩ }] } = false := by
  decide +kernel

theorem checked_decoder_retains_exact_handler_declaration :
    ((decodeCheckedProcess (checkedJson (some (.arr #[checkedDeclarationJson])))).toOption.map
      (·.interruptingMessageEventSubProcesses)) = some [expectedCheckedDeclaration] := by
  decide +kernel

theorem program_decoder_retains_exact_handler_declaration :
    ((decodeProgram (programJson (some (.arr #[programDeclarationJson])))).toOption.map
      (·.interruptingMessageEventSubProcesses)) = some [expectedProgramDeclaration] := by
  decide +kernel

theorem checked_decoder_preserves_declaration_omission :
    ((decodeCheckedProcess (checkedJson none)).toOption.map (·.interruptingMessageEventSubProcesses)) = some [] := by
  decide +kernel

theorem program_decoder_preserves_declaration_omission :
    ((decodeProgram (programJson none)).toOption.map (·.interruptingMessageEventSubProcesses)) = some [] := by
  decide +kernel

theorem checked_decoder_refuses_null_collection :
    (decodeCheckedProcess (checkedJson (some .null))).isOk = false := by
  decide +kernel

theorem program_decoder_refuses_null_collection :
    (decodeProgram (programJson (some .null))).isOk = false := by
  decide +kernel

theorem checked_decoder_refuses_program_entry_representation :
    (decodeCheckedProcess (checkedJson (some (.arr #[programDeclarationJson])))).isOk = false := by
  decide +kernel

theorem program_decoder_refuses_checked_entry_representation :
    (decodeProgram (programJson (some (.arr #[checkedDeclarationJson])))).isOk = false := by
  decide +kernel

private def applicationRoot : RuntimeScopeOccurrence := {
  id := { processInstanceId := ⟨"application"⟩, definitionScopeId := ⟨"scope:Application"⟩, activation := 1 }
  parent := none }

private def withdrawalHandler : RuntimeScopeOccurrence := {
  id := { processInstanceId := ⟨"application"⟩, definitionScopeId := ⟨"scope:Withdrawal"⟩, activation := 1 }
  parent := some applicationRoot.id }

private def quiescentHandlerState : RuntimeState := { initialState with
  control := .running ⟨"application"⟩
  scopeOccurrences := [applicationRoot, withdrawalHandler]
  endOccurrences := 2 }

private def handlerCompletion : SemanticOperation :=
  .completeEventSubProcess ⟨"operation:complete-event-subprocess:scope:Withdrawal"⟩
    ⟨⟨"Withdrawal"⟩⟩ ⟨"scope:Withdrawal"⟩

theorem operation_dispatch_closes_only_quiescent_handler :
    fire? applicationProgram handlerCompletion quiescentHandlerState = some
      { quiescentHandlerState with scopeOccurrences := [applicationRoot] } := by
  decide +kernel

theorem operation_dispatch_refuses_handler_with_remaining_token :
    fire? applicationProgram handlerCompletion { quiescentHandlerState with
      tokens := [{ placeId := ⟨"place:HandlerFinish"⟩, owner := withdrawalHandler.id }] } = none := by
  decide +kernel

theorem handler_completion_publishes_only_child_completion :
    candidateFlowNodeOccurrenceDeltaForOperation? applicationProgram quiescentHandlerState
      { quiescentHandlerState with scopeOccurrences := [applicationRoot] }
      handlerCompletion ⟨"finish-withdrawal"⟩ 1 = some
        { started := [], ended := [{ anchor := .scope withdrawalHandler.id, terminal := .completed }] } := by
  decide +kernel

theorem handler_completion_refuses_parent_as_handler :
    candidateFlowNodeOccurrenceDeltaForOperation? applicationProgram quiescentHandlerState
      quiescentHandlerState (.completeEventSubProcess ⟨"invalid"⟩ ⟨⟨"Application"⟩⟩
        ⟨"scope:Application"⟩) ⟨"invalid-completion"⟩ 1 = none := by
  decide +kernel

private def startApplication : Stimulus :=
  .startProcess ⟨"start-application"⟩ ⟨"Application"⟩ ⟨"application"⟩ []

private def withdrawalListener : EventSubProcessMessageSubscription := {
  id := { processInstanceId := ⟨"application"⟩, elementId := ⟨"WithdrawalStart"⟩, activation := 1 }
  owner := applicationRoot.id
  channel }

theorem external_start_registers_parent_listener_without_handler :
    let admission := admitStimulus applicationProgram initialState startApplication
    admission.outcome = .committed ∧
      admission.state.eventSubProcessMessageSubscriptions = [withdrawalListener] ∧
      admission.state.scopeOccurrences = [applicationRoot] ∧ admission.state.tokens = [] := by
  decide +kernel

theorem external_start_refuses_nonpristine_state :
    let before := { initialState with endOccurrences := 1 }
    let admission := admitStimulus applicationProgram before startApplication
    admission.outcome = .rejected ∧ admission.state = before := by
  decide +kernel

private def startedApplication : RuntimeState :=
  (admitStimulus applicationProgram initialState startApplication).state

private def unregisteredRoot : RuntimeState := { initialState with
  control := .running ⟨"application"⟩
  initiationPending := true
  scopeOccurrences := [applicationRoot]
  scopeActivations := [{ scopeId := applicationRoot.id.definitionScopeId, count := 1 }] }

theorem external_start_implements_declarative_registration :
    EventSubProcessRegistrationStep applicationProgram unregisteredRoot applicationRoot.id startedApplication := by
  apply registerEventSubProcessListener_sound
  decide +kernel

theorem started_parent_listener_satisfies_family_and_generic_validity :
    interruptingMessageEventSubProcessCheckpointStateWellFormed applicationProgram
      ⟨"application"⟩ startedApplication = true := by
  decide +kernel

theorem family_validity_refuses_missing_listener_during_ordinary_work :
    interruptingMessageEventSubProcessStateValid applicationProgram
      { startedApplication with eventSubProcessMessageSubscriptions := [] } = false := by
  decide +kernel

theorem family_validity_refuses_duplicate_message_issuance_history :
    interruptingMessageEventSubProcessStateValid applicationProgram { startedApplication with
      messageActivations := startedApplication.messageActivations ++ startedApplication.messageActivations } = false := by
  decide +kernel

theorem family_validity_refuses_listener_with_active_handler :
    interruptingMessageEventSubProcessStateValid applicationProgram { startedApplication with
      initiationPending := false
      scopeOccurrences := [applicationRoot, withdrawalHandler]
      scopeActivations := [{ scopeId := applicationRoot.id.definitionScopeId, count := 1 },
        { scopeId := withdrawalHandler.id.definitionScopeId, count := 1 }] } = false := by
  decide +kernel

theorem family_validity_refuses_listener_on_predecessor_profile :
    interruptingMessageEventSubProcessStateValid (lowerCheckedProcess ordinarySource)
      { initialState with eventSubProcessMessageSubscriptions := [withdrawalListener] } = false := by
  decide +kernel


private def ordinaryTaskOwner : ScopeOccurrenceId := ⟨⟨"instance"⟩, ⟨"scope:InvoiceProcess"⟩, 1⟩
private def ordinaryTaskWait : UserTaskWait := {
  processInstanceId := ⟨"instance"⟩, owner := ordinaryTaskOwner
  task := { id := ⟨"Notify"⟩, name := none }, activation := 1, output := ⟨"place:d"⟩ }
private def ordinaryTaskWithForeignListener : RuntimeState := {
  initialState with
  control := .running ⟨"instance"⟩
  waits := [ordinaryTaskWait]
  eventSubProcessMessageSubscriptions := [{
    id := ⟨⟨"instance"⟩, ⟨"unselected-message"⟩, 1⟩
    owner := ordinaryTaskOwner, channel }] }

open StructuredComposition StructuredCompositionFixtures in
theorem ordinary_task_domain_excludes_foreign_listener :
    programWellFormed serialProgram = true ∧
      serialProgram.identity.semanticProfile = structuredCompositionCheckpointProfileId ∧
      (programAnalysis serialProgram).isSome = true ∧
      ordinaryTaskWithForeignListener.waits ≠ [] ∧
      ¬ForeignRuntimeEmpty ordinaryTaskWithForeignListener ∧
      ForeignRuntimeEmpty { ordinaryTaskWithForeignListener with eventSubProcessMessageSubscriptions := [] } := by
  refine ⟨by decide +kernel, rfl, by decide +kernel, by decide +kernel, ?_, ?_⟩ <;>
    simp [ForeignRuntimeEmpty, ordinaryTaskWithForeignListener, initialState]

open StructuredComposition StructuredCompositionFixtures in
theorem foreign_listener_does_not_change_ordinary_task_lifetime_or_ownership :
    TaskLifetimeShape serialProgram ordinaryTaskWithForeignListener ∧
      ∀ operation ∈ serialProgram.operations, ∀ wait ∈ ordinaryTaskWithForeignListener.waits,
        operationOwningScope? serialProgram operation.id = some wait.owner.definitionScopeId := by
  constructor
  · apply Or.inr
    refine ⟨ordinaryTaskWait, .awaitUserTask ⟨"operation:Notify"⟩ { elementId := ⟨"Notify"⟩ }
      ⟨"place:c"⟩ ⟨"place:d"⟩ { id := ⟨"Notify"⟩, name := none }, ?_⟩
    simp [ordinaryTaskWithForeignListener, ordinaryTaskWait, ordinaryTaskOwner, serialProgram,
      serialOperations, initialState, emptyScopedVariables]
  · simp [serialProgram, serialOperations, ordinaryTaskWithForeignListener, ordinaryTaskWait,
      ordinaryTaskOwner, operationOwningScope?, dataTask, SemanticOperation.id]

open StructuredCompositionFixtures in
theorem foreign_listener_refuses_every_ordinary_completion_without_mutation
    (commandId : SemanticId) (bindings : List VariableBinding) :
    admitStimulus serialProgram ordinaryTaskWithForeignListener
      (.completeUserTaskInstance commandId ⟨⟨"instance"⟩, ⟨"Notify"⟩, 1⟩ bindings) =
        { outcome := .rejected, state := ordinaryTaskWithForeignListener } := by
  simp [admitStimulus, callDataRuntimeStateValid, interruptingMessageEventSubProcessStateValid,
    serialProgram, profile, ordinaryTaskWithForeignListener]

private def waitingReview : RuntimeState := (do
  let initiated ← step applicationProgram startedApplication (nodeOperationId ⟨"Start"⟩)
  let forked ← step applicationProgram initiated (nodeOperationId ⟨"Fork"⟩)
  let first ← step applicationProgram forked (nodeOperationId ⟨"CheckA"⟩)
  step applicationProgram first (nodeOperationId ⟨"CheckB"⟩)).getD initialState

private def withdrawApplication : Stimulus :=
  .deliverMessage ⟨"withdraw-application"⟩ withdrawalListener.id channel

theorem explicit_start_choices_arm_both_ordinary_tasks :
    waitingReview.waits.map (·.task.id.value) = ["CheckA", "CheckB"] ∧
      waitingReview.eventSubProcessMessageSubscriptions = [withdrawalListener] ∧
      interruptingMessageEventSubProcessCheckpointStateWellFormed applicationProgram
        ⟨"application"⟩ waitingReview = true := by
  decide +kernel

theorem external_delivery_interrupts_both_tasks_and_enters_only_handler :
    let admission := admitStimulus applicationProgram waitingReview withdrawApplication
    admission.outcome = .committed ∧ admission.state.waits = [] ∧
      admission.state.activityOccurrences = [] ∧ admission.state.eventSubProcessMessageSubscriptions = [] ∧
      admission.state.scopeOccurrences = [applicationRoot, withdrawalHandler] ∧
      admission.state.tokens = [{ placeId := ⟨"place:HandlerEntry"⟩, owner := withdrawalHandler.id }] ∧
      admission.state.messageActivations = waitingReview.messageActivations ∧
      interruptingMessageEventSubProcessCheckpointStateWellFormed applicationProgram
        ⟨"application"⟩ admission.state = true := by
  decide +kernel

private def triggeredApplication : RuntimeState :=
  (admitStimulus applicationProgram waitingReview withdrawApplication).state

theorem dormant_listener_creates_no_executing_handler :
    (projectOpenFlowNodeOccurrencesWithMessageHandler? applicationProgram waitingReview).map
      (List.map (·.elementId.value)) = some ["CheckA", "CheckB"] := by
  decide +kernel

theorem triggered_handler_projects_its_declared_scope :
    projectOpenFlowNodeOccurrencesWithMessageHandler? applicationProgram triggeredApplication = some
      [{ anchor := .scope withdrawalHandler.id, processId := ⟨"Application"⟩,
         elementId := ⟨"Withdrawal"⟩, owner := applicationRoot.id }] := by
  decide +kernel

theorem message_delivery_publishes_cancellation_and_fresh_handler_start :
    flowNodeOccurrenceDeltaForStimulusWithMessageHandler? applicationProgram waitingReview
      triggeredApplication withdrawApplication 0 = some (canonicalFlowNodeOccurrenceDelta
        [{ anchor := .scope withdrawalHandler.id, processId := ⟨"Application"⟩,
           elementId := ⟨"Withdrawal"⟩, owner := applicationRoot.id },
         { anchor := .transition ⟨"withdraw-application"⟩ 0 0, processId := ⟨"Application"⟩,
           elementId := ⟨"WithdrawalStart"⟩, owner := withdrawalHandler.id }]
        [{ anchor := .wait ⟨⟨"application"⟩, ⟨"CheckA"⟩, 1⟩, terminal := .cancelled },
         { anchor := .wait ⟨⟨"application"⟩, ⟨"CheckB"⟩, 1⟩, terminal := .cancelled },
         { anchor := .transition ⟨"withdraw-application"⟩ 0 0, terminal := .completed }]) := by
  decide +kernel

theorem message_delivery_refuses_publication_against_unchanged_successor :
    flowNodeOccurrenceDeltaForStimulusWithMessageHandler? applicationProgram waitingReview
      waitingReview withdrawApplication 0 = none := by
  decide +kernel

theorem handler_projection_refuses_orphaned_handler :
    projectOpenFlowNodeOccurrencesWithMessageHandler? applicationProgram
      { triggeredApplication with scopeOccurrences := [withdrawalHandler] } = none := by
  decide +kernel

private def handlerWaiting : RuntimeState :=
  (step applicationProgram triggeredApplication (nodeOperationId ⟨"Handler"⟩)).getD initialState

private def handlerCompleted : RuntimeState :=
  (admitStimulus applicationProgram handlerWaiting
    (.completeUserTaskInstance ⟨"finish-handler"⟩ ⟨⟨"application"⟩, ⟨"Handler"⟩, 1⟩ [])).state

private def handlerQuiescent : RuntimeState :=
  (step applicationProgram handlerCompleted (nodeOperationId ⟨"HandlerEnd"⟩)).getD initialState

private def handlerClosed : RuntimeState :=
  (step applicationProgram handlerQuiescent handlerCompletion.id).getD initialState

theorem handler_task_projects_under_its_executing_scope :
    projectOpenFlowNodeOccurrencesWithMessageHandler? applicationProgram handlerWaiting = some
      (sortFlowNodeOccurrenceStarts
        [{ anchor := .scope withdrawalHandler.id, processId := ⟨"Application"⟩,
           elementId := ⟨"Withdrawal"⟩, owner := applicationRoot.id },
         { anchor := .wait ⟨⟨"application"⟩, ⟨"Handler"⟩, 1⟩, processId := ⟨"Application"⟩,
           elementId := ⟨"Handler"⟩, owner := withdrawalHandler.id }]) := by
  decide +kernel

theorem handler_completion_lifecycle_matches_its_independent_open_projection :
    flowNodeOccurrenceDeltaForOperationWithMessageHandler? applicationProgram handlerQuiescent
      handlerClosed handlerCompletion ⟨"finish-handler"⟩ 2 = some
        { started := [], ended := [{ anchor := .scope withdrawalHandler.id, terminal := .completed }] } := by
  decide +kernel

private def scheduledStart : TracedStimulusResult :=
  applyStimulusTraced 8 applicationProgram initialState startApplication

private def scheduledWithdrawal : TracedStimulusResult :=
  applyStimulusTraced 8 applicationProgram scheduledStart.result.state withdrawApplication

private def scheduledHandlerCompletion : TracedStimulusResult :=
  applyStimulusTraced 8 applicationProgram scheduledWithdrawal.result.state
    (.completeUserTaskInstance ⟨"finish-handler"⟩ ⟨⟨"application"⟩, ⟨"Handler"⟩, 1⟩ [])

theorem scheduled_start_preserves_complete_parallel_frontier_and_publication :
    scheduledStart.result.outcome = .committed ∧ scheduledStart.result.state = waitingReview ∧
      scheduledStart.committedTransitions.length = 5 ∧ scheduledStart.flowNodeOccurrenceLifecycles.length = 5 := by
  decide +kernel

theorem scheduled_withdrawal_publishes_the_external_trigger_and_handler_task :
    scheduledWithdrawal.result.outcome = .committed ∧ scheduledWithdrawal.result.state = handlerWaiting ∧
      scheduledWithdrawal.committedTransitions.length = 2 ∧
      scheduledWithdrawal.flowNodeOccurrenceLifecycles.length = 2 := by
  unfold scheduledWithdrawal
  rw [scheduled_start_preserves_complete_parallel_frontier_and_publication.2.1]
  decide +kernel

theorem scheduled_handler_completion_publishes_all_three_internal_steps :
    scheduledHandlerCompletion.result.outcome = .committed ∧
      scheduledHandlerCompletion.result.state.control = .completed ⟨"application"⟩ ∧
      scheduledHandlerCompletion.result.state.scopeOccurrences = [] ∧
      scheduledHandlerCompletion.committedTransitions.length = 4 ∧
      scheduledHandlerCompletion.flowNodeOccurrenceLifecycles.length = 4 := by
  unfold scheduledHandlerCompletion
  rw [scheduled_withdrawal_publishes_the_external_trigger_and_handler_task.2.1]
  decide +kernel

theorem dormant_parent_publishes_message_ingress_without_executing_start :
    (observeStableState applicationProgram waitingReview).map (·.openMessageSubscriptions) =
        some [{ id := withdrawalListener.id, channel }] ∧
      (observeStableState applicationProgram waitingReview).map (·.enabledInteractions) = some
        [.completeUserTaskInstance ⟨⟨"application"⟩, ⟨"CheckA"⟩, 1⟩,
         .completeUserTaskInstance ⟨⟨"application"⟩, ⟨"CheckB"⟩, 1⟩,
         .deliverMessage withdrawalListener.id channel] ∧
      (observeStableState applicationProgram waitingReview).map (fun observation =>
        observation.activeWaits.map (·.elementId.value)) = some ["CheckA", "CheckB"] := by
  decide +kernel

theorem triggered_parent_publishes_only_handler_ingress :
    (observeStableState applicationProgram handlerWaiting).map (·.openMessageSubscriptions) = some [] ∧
      (observeStableState applicationProgram handlerWaiting).map (·.enabledInteractions) = some
        [.completeUserTaskInstance ⟨⟨"application"⟩, ⟨"Handler"⟩, 1⟩] := by
  decide +kernel

private def completeTask (name : String) : Stimulus :=
  .completeUserTaskInstance ⟨"complete:" ++ name⟩ ⟨⟨"application"⟩, ⟨name⟩, 1⟩ []

theorem initial_parallel_frontier_is_complete_and_both_arm_orders_agree :
    let forked := (runChoices applicationProgram startedApplication
      [nodeOperationId ⟨"Start"⟩, nodeOperationId ⟨"Fork"⟩]).getD initialState
    (InternalCommutation.deriveInternalExecutionFrontier applicationProgram forked).offers.map
        (·.operation.id) = [nodeOperationId ⟨"CheckA"⟩, nodeOperationId ⟨"CheckB"⟩] ∧
      runChoices applicationProgram forked [nodeOperationId ⟨"CheckA"⟩, nodeOperationId ⟨"CheckB"⟩] =
        some waitingReview ∧
      runChoices applicationProgram forked [nodeOperationId ⟨"CheckB"⟩, nodeOperationId ⟨"CheckA"⟩] =
        some waitingReview := by
  decide +kernel

private def refusesExactly (before : RuntimeState) (stimulus : Stimulus) : Bool :=
  let result := applyStimulusTraced 8 applicationProgram before stimulus
  result.result.outcome == .rejected && result.result.state == before &&
    result.committedTransitions.isEmpty && result.flowNodeOccurrenceLifecycles.isEmpty

theorem invalid_deliveries_and_cancelled_tasks_preserve_state_without_publication :
    refusesExactly initialState withdrawApplication = true ∧
      ([.deliverMessage ⟨"foreign"⟩ { withdrawalListener.id with processInstanceId := ⟨"foreign"⟩ } channel,
        .deliverMessage ⟨"future"⟩ { withdrawalListener.id with activation := 2 } channel,
        .deliverMessage ⟨"wrong-channel"⟩ withdrawalListener.id
          (.operationMessage ⟨"Other"⟩ ⟨"Withdraw"⟩ ⟨"WithdrawalMessage"⟩),
        .deliverPayloadMessage ⟨"payload"⟩ withdrawalListener.id channel (.string "unexpected")].all
        (refusesExactly waitingReview)) = true ∧
      ([withdrawApplication, completeTask "CheckA", completeTask "CheckB"].all
        (refusesExactly handlerWaiting)) = true := by
  decide +kernel

private def fitsOrRollsBack (before : RuntimeState) (stimulus : Stimulus) (fuel : Nat) : Bool :=
  let atBound := applyStimulusTraced fuel applicationProgram before stimulus
  let short := applyStimulusTraced (fuel - 1) applicationProgram before stimulus
  atBound.result.outcome == .committed && atBound.committedTransitions.length == fuel + 1 &&
    atBound.flowNodeOccurrenceLifecycles.length == fuel + 1 &&
    short.result.outcome == .rolledBack && short.result.state == before &&
    short.result.internalStepBoundExceeded && short.committedTransitions.isEmpty &&
    short.flowNodeOccurrenceLifecycles.isEmpty

theorem startup_delivery_and_handler_completion_have_exact_atomic_fuel_bounds :
    fitsOrRollsBack initialState startApplication 4 = true ∧
      fitsOrRollsBack waitingReview withdrawApplication 1 = true ∧
      fitsOrRollsBack handlerWaiting (completeTask "Handler") 3 = true := by
  decide +kernel

private def checkedCommandSequence (program : Program) :
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

private def completeSchedules : List (List (Stimulus × Nat)) :=
  [[(completeTask "CheckA", 1), (completeTask "CheckB", 2)],
   [(completeTask "CheckB", 1), (completeTask "CheckA", 2)],
   [(withdrawApplication, 1), (completeTask "Handler", 3)],
   [(completeTask "CheckA", 1), (withdrawApplication, 1), (completeTask "Handler", 3)],
   [(completeTask "CheckB", 1), (withdrawApplication, 1), (completeTask "Handler", 3)]]

theorem both_modes_execute_normal_and_interrupted_schedules_with_valid_prefixes :
    ([InternalSchedulingMode.rejectObservableChoice, .requireChoiceSchedule].all fun mode =>
      completeSchedules.all fun commands =>
        match checkedCommandSequence { applicationProgram with internalSchedulingMode := mode }
            initialState ((startApplication, 4) :: commands) with
        | none => false
        | some final => final.control == .completed ⟨"application"⟩ &&
            final.scopeOccurrences.isEmpty && final.eventSubProcessMessageSubscriptions.isEmpty) = true := by
  decide +kernel

theorem last_task_and_message_races_follow_input_order_and_keep_completed_history :
    (["CheckA", "CheckB"].all fun first =>
      let other := if first == "CheckA" then "CheckB" else "CheckA"
      let afterFirst := (applyStimulusTraced 8 applicationProgram waitingReview (completeTask first)).result.state
      let normal := applyStimulusTraced 8 applicationProgram afterFirst (completeTask other)
      let interrupted := applyStimulusTraced 8 applicationProgram afterFirst withdrawApplication
      normal.result.outcome == .committed && normal.result.state.control == .completed ⟨"application"⟩ &&
        refusesExactly normal.result.state withdrawApplication &&
        interrupted.result.outcome == .committed && interrupted.result.state.waits.map (·.task.id.value) == ["Handler"] &&
        interrupted.result.state.endOccurrences == afterFirst.endOccurrences &&
        refusesExactly interrupted.result.state (completeTask other)) = true := by
  decide +kernel

end BpmnSemantics.InterruptingMessageEventSubProcessConformance

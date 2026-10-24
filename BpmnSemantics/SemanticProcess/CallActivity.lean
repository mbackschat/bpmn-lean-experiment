import BpmnSemantics.SemanticProcess.CallActivityIdentity
import BpmnSemantics.SemanticProcess.RuntimeOwnerRemoval
import BpmnSemantics.SemanticProcess.CallInstanceClosure
import BpmnSemantics.SemanticProcess.ScopeCompletion

/-! # Called-Process Call Activity runtime semantics

This module owns the hidden caller/called association, exact invocation and normal-return transitions, and their declarative soundness boundary. Called-instance identity is owned by `CallActivityIdentity`; source QName resolution, public observation, and Temporal hosting remain outside this module.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def callRecordBefore
    (left right : CalledProcessOccurrence) : Bool :=
  if scopeOwnerBefore left.caller right.caller then true
  else if left.caller = right.caller then
    if left.id.elementId.value ≠ right.id.elementId.value then
      left.id.elementId.value < right.id.elementId.value
    else left.id.activation < right.id.activation
  else false

def insertCallRecord (record : CalledProcessOccurrence) :
    List CalledProcessOccurrence → List CalledProcessOccurrence
  | [] => [record]
  | current :: rest =>
      if callRecordBefore record current then record :: current :: rest
      else current :: insertCallRecord record rest

def sortCallRecords :
    List CalledProcessOccurrence → List CalledProcessOccurrence
  | [] => []
  | record :: rest => insertCallRecord record (sortCallRecords rest)

def rootInstanceId? (state : RuntimeState) : Option SemanticId :=
  match state.control with
  | .running instanceId
  | .completed instanceId
  | .cancelled instanceId => some instanceId
  | .notStarted | .failed .. => none

private def sameCallIdentity (record : CalledProcessOccurrence)
    (caller : ScopeOccurrenceId) (elementId : NodeId) : Bool :=
  record.caller = caller && record.id.elementId.value = elementId.value

/-- The hidden call collection and parentless called roots form a one-to-one identity association. -/
def calledProcessAssociationsValid (state : RuntimeState) : Bool :=
  match rootInstanceId? state with
  | none => false
  | some hostingInstanceId =>
      match state.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.parent.isNone &&
            occurrence.id.processInstanceId = hostingInstanceId) with
      | [hostingRoot] =>
          -- One live record per Call element, as invocation freshness keeps it; a parentless caller
          -- used to imply it through the per-caller anchor below (CALLN-FRAME-01).
          let recordsValid := state.calledProcessOccurrences.all fun record =>
              (state.calledProcessOccurrences.filter fun candidate =>
                decide (candidate.id.elementId.value = record.id.elementId.value)).length = 1 &&
              record.id.processInstanceId = record.caller.processInstanceId &&
              record.id.activation > 0 &&
              -- Stage B admits an embedded caller, so the caller is any one live occurrence; runtime
              -- well-formedness binds its definition scope to the invocation's (CALLN-FRAME-01).
              (state.scopeOccurrences.filter fun occurrence =>
                decide (occurrence.id = record.caller)).length = 1 &&
              record.calledRoot.processInstanceId =
                deriveCalledProcessInstanceId record.caller.processInstanceId
                  ⟨record.id.elementId.value⟩ record.id.activation &&
              record.calledRoot.processInstanceId ≠ hostingInstanceId &&
              record.calledRoot.definitionScopeId ≠ record.caller.definitionScopeId &&
              record.calledRoot.activation = 1 &&
              (state.calledProcessOccurrences.filter fun candidate =>
                sameCallIdentity candidate record.caller
                  ⟨record.id.elementId.value⟩).length = 1 &&
              (state.scopeOccurrences.filter fun occurrence =>
                decide (occurrence.id = record.calledRoot &&
                  occurrence.parent.isNone)).length = 1
          let rootsValid := state.scopeOccurrences.all fun occurrence =>
              if occurrence.parent.isNone &&
                  occurrence.id.processInstanceId ≠ hostingInstanceId then
                (state.calledProcessOccurrences.filter fun record =>
                  decide (record.calledRoot = occurrence.id)).length = 1
              else true
          let reachable := processInstanceClosureWithin
            state.calledProcessOccurrences [hostingRoot.id.processInstanceId]
            (state.calledProcessOccurrences.length + 1)
          recordsValid && rootsValid &&
            state.calledProcessOccurrences.all fun record =>
              reachable.contains record.calledRoot.processInstanceId
      | _ => false

/-- Call-association validity depends only on runtime control, scope occurrences, and call records. -/
theorem calledProcessAssociationsValid_frame (before after : RuntimeState)
    (controlFrame : after.control = before.control)
    (scopesFrame : after.scopeOccurrences = before.scopeOccurrences)
    (callsFrame : after.calledProcessOccurrences = before.calledProcessOccurrences) :
    calledProcessAssociationsValid after = calledProcessAssociationsValid before := by
  cases before
  cases after
  simp_all [calledProcessAssociationsValid, rootInstanceId?]

/-- Valid associations of a running instance include its hosting root occurrence. -/
theorem calledProcessAssociationsValid_hosting_root (state : RuntimeState) (hosting : SemanticId)
    (running : state.control = .running hosting) (valid : calledProcessAssociationsValid state = true) :
    ∃ root ∈ state.scopeOccurrences, root.id.processInstanceId = hosting := by
  unfold calledProcessAssociationsValid at valid
  simp only [rootInstanceId?, running] at valid
  split at valid
  · rename_i hostingRoot roots
    have member : hostingRoot ∈ state.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.parent.isNone && occurrence.id.processInstanceId = hosting)) := by
      rw [roots]; simp
    obtain ⟨member, named⟩ := List.mem_filter.mp member
    simp only [Bool.and_eq_true, decide_eq_true_eq] at named
    exact ⟨hostingRoot, member, named.2⟩
  · contradiction

/-- An instance no scope occurrence uses is not the hosting one, whose root valid associations keep live;
so a fresh called instance differs from the hosting instance whichever instance its caller lies in. -/
theorem fresh_instance_ne_hosting (state : RuntimeState) (hosting calledInstance : SemanticId)
    (running : state.control = .running hosting) (valid : calledProcessAssociationsValid state = true)
    (fresh : (state.scopeOccurrences.filter fun occurrence =>
      decide (occurrence.id.processInstanceId = calledInstance)).length = 0) : calledInstance ≠ hosting := by
  intro same
  obtain ⟨root, member, identity⟩ := calledProcessAssociationsValid_hosting_root state hosting running valid
  have present : root ∈ state.scopeOccurrences.filter (fun occurrence =>
      decide (occurrence.id.processInstanceId = calledInstance)) :=
    List.mem_filter.mpr ⟨member, by simp [identity, same]⟩
  rw [List.length_eq_zero_iff.mp fresh] at present
  contradiction

private theorem all_congr_mem {α : Type} {values : List α} {left right : α → Bool}
    (same : ∀ value ∈ values, left value = right value) : values.all left = values.all right := by
  apply Bool.eq_iff_iff.mpr
  simp only [List.all_eq_true]
  exact ⟨fun holds value member => same value member ▸ holds value member,
    fun holds value member => (same value member).symm ▸ holds value member⟩

/-- Call associations inspect parentless scope occurrences and each record's caller occurrence, which
Stage B lets be embedded (CALLN-FRAME-01); deleting child scopes that hold no caller leaves their
censuses and the unchanged Call graph's reachability intact. -/
theorem calledProcessAssociationsValid_parentless_frame (before after : RuntimeState)
    (controlFrame : after.control = before.control)
    (rootsFrame : after.scopeOccurrences.filter (·.parent.isNone) =
      before.scopeOccurrences.filter (·.parent.isNone))
    (callsFrame : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (callersFrame : ∀ record ∈ before.calledProcessOccurrences,
      after.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = record.caller)) =
        before.scopeOccurrences.filter (fun occurrence => decide (occurrence.id = record.caller))) :
    calledProcessAssociationsValid after = calledProcessAssociationsValid before := by
  have rootIdentity : rootInstanceId? after = rootInstanceId? before := by
    simp [rootInstanceId?, controlFrame]
  have census (predicate : RuntimeScopeOccurrence → Bool) :
      after.scopeOccurrences.filter (fun occurrence => occurrence.parent.isNone && predicate occurrence) =
      before.scopeOccurrences.filter (fun occurrence => occurrence.parent.isNone && predicate occurrence) := by
    have same := congrArg (List.filter predicate) rootsFrame
    simpa only [List.filter_filter, Bool.and_comm] using same
  have rootsValid (instanceId : SemanticId) :
      (after.scopeOccurrences.all fun occurrence =>
        if occurrence.parent.isNone && occurrence.id.processInstanceId ≠ instanceId then
          (after.calledProcessOccurrences.filter fun record =>
            decide (record.calledRoot = occurrence.id)).length = 1
        else true) =
      (before.scopeOccurrences.all fun occurrence =>
        if occurrence.parent.isNone && occurrence.id.processInstanceId ≠ instanceId then
          (before.calledProcessOccurrences.filter fun record =>
            decide (record.calledRoot = occurrence.id)).length = 1
        else true) := by
    rw [callsFrame]
    apply Bool.eq_iff_iff.mpr
    simp only [List.all_eq_true]
    constructor <;> intro valid occurrence member
    all_goals
      by_cases parentless : occurrence.parent.isNone = true
      · have retained := (List.mem_filter (p := fun occurrence : RuntimeScopeOccurrence =>
          occurrence.parent.isNone)).mpr ⟨member, parentless⟩
        first | rw [rootsFrame] at retained | rw [← rootsFrame] at retained
        exact valid occurrence (List.mem_filter.mp retained).1
      · simp [parentless]
  have endpoints (owner : ScopeOccurrenceId) :
      (after.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id = owner) && occurrence.parent.isNone) =
      (before.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id = owner) && occurrence.parent.isNone) := by
    simpa only [Bool.and_comm] using
      census (fun occurrence => decide (occurrence.id = owner))
  unfold calledProcessAssociationsValid
  rw [rootIdentity]
  simp only [callsFrame] at rootsValid
  cases rootInstanceId? before with
  | none => rfl
  | some instanceId =>
      simp only [Bool.decide_eq_true]
      rw [census]
      split
      · simp only [endpoints, callsFrame, rootsValid]
        congr 1
        congr 1
        exact all_congr_mem fun record member => by rw [callersFrame record member]
      · rfl

/-- Association validity exposes each record's one caller occurrence, which Stage B lets be embedded
(CALLN-FRAME-01), and its parentless called root. -/
theorem calledProcessAssociationsValid_endpoints (state : RuntimeState)
    (valid : calledProcessAssociationsValid state = true)
    (record : CalledProcessOccurrence) (member : record ∈ state.calledProcessOccurrences) :
    (∃ caller ∈ state.scopeOccurrences, caller.id = record.caller) ∧
      (∃ root ∈ state.scopeOccurrences, root.id = record.calledRoot ∧ root.parent = none) := by
  unfold calledProcessAssociationsValid at valid
  split at valid
  · contradiction
  · split at valid
    · simp only [Bool.and_eq_true, List.all_eq_true] at valid
      have fields := valid.1.1 record member
      constructor
      · obtain ⟨caller, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true fields.1.1.1.1.1.1.2)
        have present : caller ∈ [caller] := List.mem_singleton_self _
        rw [← singleton] at present
        obtain ⟨present, identity⟩ := List.mem_filter.mp present
        exact ⟨caller, present, by simpa using identity⟩
      · obtain ⟨root, singleton⟩ := List.length_eq_one_iff.mp (of_decide_eq_true fields.2)
        have present : root ∈ [root] := List.mem_singleton_self _
        rw [← singleton] at present
        obtain ⟨present, fields⟩ := List.mem_filter.mp present
        simp only [Bool.and_eq_true, decide_eq_true_eq, Option.isNone_iff_eq_none] at fields
        exact ⟨root, present, fields⟩
    · contradiction

/-- Valid Call records that mint the same called Process identity have the same Call anchor. -/
theorem calledProcessAssociationsValid_called_instance_injective (state : RuntimeState)
    (left right : CalledProcessOccurrence)
    (running : state.control = .running instanceId)
    (valid : calledProcessAssociationsValid state = true)
    (leftMember : left ∈ state.calledProcessOccurrences)
    (rightMember : right ∈ state.calledProcessOccurrences)
    (sameCalledInstance : left.calledRoot.processInstanceId =
    right.calledRoot.processInstanceId) :
  left.id = right.id := by
  unfold calledProcessAssociationsValid at valid
  simp only [rootInstanceId?, running] at valid
  generalize rootsEq : (state.scopeOccurrences.filter fun occurrence =>
    decide (occurrence.parent.isNone &&
      occurrence.id.processInstanceId = instanceId)) = roots at valid
  cases roots with
  | nil => simp at valid
  | cons root rest => cases rest with
    | cons other tail => simp at valid
    | nil =>
        simp only [Bool.and_eq_true, List.all_eq_true] at valid
        have leftValid := valid.1.1 left leftMember
        have rightValid := valid.1.1 right rightMember
        have leftIdProcess : left.id.processInstanceId = left.caller.processInstanceId :=
          of_decide_eq_true leftValid.1.1.1.1.1.1.1.1.2
        have rightIdProcess : right.id.processInstanceId = right.caller.processInstanceId :=
          of_decide_eq_true rightValid.1.1.1.1.1.1.1.1.2
        have leftDerived : left.calledRoot.processInstanceId =
            deriveCalledProcessInstanceId left.caller.processInstanceId
              ⟨left.id.elementId.value⟩ left.id.activation :=
          of_decide_eq_true leftValid.1.1.1.1.1.2
        have rightDerived : right.calledRoot.processInstanceId =
            deriveCalledProcessInstanceId right.caller.processInstanceId
              ⟨right.id.elementId.value⟩ right.id.activation :=
          of_decide_eq_true rightValid.1.1.1.1.1.2
        have tuple := calledProcessIdentityTuple_injective
          left.caller.processInstanceId right.caller.processInstanceId
          ⟨left.id.elementId.value⟩ ⟨right.id.elementId.value⟩
          left.id.activation right.id.activation
          (leftDerived.symm.trans (sameCalledInstance.trans rightDerived))
        generalize leftIdentityEq : left.id = leftIdentity at leftIdProcess tuple ⊢
        generalize rightIdentityEq : right.id = rightIdentity at rightIdProcess tuple ⊢
        cases leftIdentity
        cases rightIdentity
        simp only [OccurrenceId.mk.injEq]
        exact ⟨leftIdProcess.trans (tuple.1.trans rightIdProcess.symm),
          congrArg (fun id : NodeId => (⟨id.value⟩ : SemanticId)) tuple.2.1,
          tuple.2.2⟩

def removeCalledProcessTree (state : RuntimeState)
    (record : CalledProcessOccurrence) : RuntimeState :=
  let removed := processInstanceClosureWithin state.calledProcessOccurrences
    [record.calledRoot.processInstanceId]
    (state.calledProcessOccurrences.length + 1)
  let removedOwner := fun owner : ScopeOccurrenceId =>
    removed.contains owner.processInstanceId
  let filtered := filterScopeOwnedWork state (fun owner => !removedOwner owner)
  { filtered with
    eventSubProcessMessageSubscriptions := state.eventSubProcessMessageSubscriptions.filter fun listener =>
      !removedOwner listener.owner
    calledProcessOccurrences := state.calledProcessOccurrences.filter fun candidate =>
      candidate.id ≠ record.id &&
        !removedOwner candidate.caller && !removedOwner candidate.calledRoot
    sequentialScopeControllers := state.sequentialScopeControllers.filter fun controller =>
      !removed.contains controller.id.processInstanceId
    parallelScopeControllers := state.parallelScopeControllers.filter fun controller =>
      !removed.contains controller.id.processInstanceId
    sequentialMultiInstanceControllers :=
      state.sequentialMultiInstanceControllers.filter fun controller =>
        !removed.contains controller.processInstanceId
    parallelMultiInstanceControllers :=
      state.parallelMultiInstanceControllers.filter fun controller =>
        !removed.contains controller.id.processInstanceId
    compensationParentContextRetentions :=
      state.compensationParentContextRetentions.filter fun retention =>
        let parent := match retention with
          | .provisional parent _ | .promoted parent _ _ => parent
        !removedOwner parent.id && parent.parent.all (fun owner => !removedOwner owner)
    compensationTriggers := state.compensationTriggers.filter fun trigger =>
      !removedOwner trigger.owner
    compensationHandlerEffectWaits := state.compensationHandlerEffectWaits.filter fun wait =>
      !removed.contains wait.id.processInstanceId &&
        !removed.contains wait.triggerId.processInstanceId &&
        !removed.contains wait.handlerId.processInstanceId
    variables :=
      { filtered.variables with
        activities := state.variables.activities.filter fun activity =>
          !removed.contains activity.owner.processInstanceId } }

/-- Invoke one exact called Process after counting every record associated with the Call identity. -/
def invokeProcessState? (state : RuntimeState) (origin : BpmnElementOrigin)
    (input : ControlPlaceId) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (calledEntry : ControlPlaceId)
    (returnOperationId : OperationId) : Option RuntimeState :=
  match onlyTokenOwner? state input, rootInstanceId? state with
  | some caller, some _ =>
      -- Association validity places every parentless root in the hosting instance or under a live
      -- record, so the caller checked below is a live scope occurrence of one of those instances, as
      -- CALLN-INVOKE-01 admits.
      if calledProcessAssociationsValid state then
        if (state.tokens.filter fun token =>
            decide (token.placeId = input && token.owner = caller)).length = 1 then
          if (state.calledProcessOccurrences.filter fun record =>
              decide (record.id.elementId.value = origin.elementId.value)).length = 0 then
            match state.scopeOccurrences.filter fun occurrence =>
                decide (occurrence.id = caller) with
            | [callerRoot] =>
                if callerRoot.id = caller then
                  let activation := callActivationCount state origin.elementId + 1
                  let calledInstanceId :=
                    deriveCalledProcessInstanceId caller.processInstanceId
                      origin.elementId activation
                  let calledRoot : ScopeOccurrenceId :=
                    { processInstanceId := calledInstanceId
                      definitionScopeId := calledRootScopeId
                      activation := 1 }
                  let record : CalledProcessOccurrence :=
                    { id :=
                        { processInstanceId := caller.processInstanceId
                          elementId := ⟨origin.elementId.value⟩
                          activation }
                      caller
                      calledProcessId
                      calledRoot
                      returnOperationId }
                  if (state.scopeOccurrences.filter fun occurrence =>
                        decide (occurrence.id.processInstanceId =
                          calledInstanceId)).length = 0 then
                    if (state.calledProcessOccurrences.filter fun candidate =>
                        decide (candidate.id = record.id ||
                          candidate.calledRoot.processInstanceId =
                            calledInstanceId)).length = 0 then
                      some
                        { state with
                          tokens := addToken (removeToken state.tokens input caller)
                            calledEntry calledRoot
                          scopeOccurrences := insertScopeOccurrence
                            { id := calledRoot, parent := none }
                            state.scopeOccurrences
                          calledProcessOccurrences := sortCallRecords
                            (record :: state.calledProcessOccurrences)
                          callActivations := setCallActivationCount state
                            origin.elementId activation }
                    else none
                  else none
                else none
            | _ => none
          else none
        else none
      else none
  | _, _ => none

/-- Return one exact quiescent called root after counting every record associated with the return identity. -/
def returnProcessState? (state : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId) :
    Option RuntimeState := do
  if calledProcessAssociationsValid state then
    match state.calledProcessOccurrences.filter fun record =>
        decide (record.returnOperationId = id &&
          record.id.elementId.value = origin.elementId.value) with
    | [record] =>
        if record.calledProcessId = calledProcessId then
          if record.calledRoot.definitionScopeId = calledRootScopeId then
          match state.scopeOccurrences.filter fun occurrence =>
              decide (occurrence.id = record.calledRoot) with
          | [calledRoot] =>
              if calledRoot.parent.isNone then
                if (state.scopeOccurrences.filter fun occurrence =>
                    decide (occurrence.id = record.caller)).length = 1 then
                  if (state.scopeOccurrences.filter fun occurrence =>
                      decide (occurrence.id.processInstanceId =
                        record.calledRoot.processInstanceId &&
                        occurrence.parent.isNone)).length = 1 then
                    if scopeQuiescent state calledRoot.id then
                      let cleaned := removeCalledProcessTree state record
                      some { cleaned with
                        tokens := addToken cleaned.tokens callerOutput record.caller }
                    else none
                  else none
                else none
              else none
          | _ => none
          else none
        else none
    | _ => none
  else none

/-- Declarative invocation with an explicit caller occurrence, fresh association, derived identity, and exact state update. -/
inductive InvokeProcessStep : RuntimeState → BpmnElementOrigin →
    ControlPlaceId → ProcessId → DefinitionScopeId → ControlPlaceId →
    OperationId → RuntimeState → Prop where
  | permitted before origin input calledProcessId calledRootScopeId calledEntry
      returnOperationId caller rootInstance callerRoot activation calledRoot record
      (owned : onlyTokenOwner? before input = some caller)
      (root : rootInstanceId? before = some rootInstance)
      (associations : calledProcessAssociationsValid before = true)
      (oneInput : (before.tokens.filter fun token =>
        decide (token.placeId = input && token.owner = caller)).length = 1)
      (freshCall : (before.calledProcessOccurrences.filter fun candidate =>
        decide (candidate.id.elementId.value = origin.elementId.value)).length = 0)
      (uniqueCallerRoot : before.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = caller)) = [callerRoot])
      (callerRootIdentity : callerRoot.id = caller)
      (nextActivation : activation = callActivationCount before origin.elementId + 1)
      (calledRootExact : calledRoot =
        { processInstanceId := deriveCalledProcessInstanceId
            caller.processInstanceId origin.elementId activation
          definitionScopeId := calledRootScopeId
          activation := 1 })
      (recordExact : record =
        { id :=
            { processInstanceId := caller.processInstanceId
              elementId := ⟨origin.elementId.value⟩
              activation }
          caller
          calledProcessId
          calledRoot
          returnOperationId })
      (freshCalledScopes : (before.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id.processInstanceId =
          calledRoot.processInstanceId)).length = 0)
      (freshCalledRecord : (before.calledProcessOccurrences.filter fun candidate =>
        decide (candidate.id = record.id ||
          candidate.calledRoot.processInstanceId =
            calledRoot.processInstanceId)).length = 0) :
      InvokeProcessStep before origin input calledProcessId calledRootScopeId
        calledEntry returnOperationId
        { before with
          tokens := addToken (removeToken before.tokens input caller)
            calledEntry calledRoot
          scopeOccurrences := insertScopeOccurrence
            { id := calledRoot, parent := none } before.scopeOccurrences
          calledProcessOccurrences := sortCallRecords
            (record :: before.calledProcessOccurrences)
          callActivations :=
            setCallActivationCount before origin.elementId activation }

/-- Declarative normal return with one exact association, quiescent called root, cleanup, and one caller continuation. -/
inductive ReturnProcessStep : RuntimeState → OperationId → BpmnElementOrigin →
    ProcessId → DefinitionScopeId → ControlPlaceId → RuntimeState → Prop where
  | permitted before id origin calledProcessId calledRootScopeId callerOutput
      record calledRoot
      (associations : calledProcessAssociationsValid before = true)
      (uniqueReturn : before.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.returnOperationId = id &&
          candidate.id.elementId.value = origin.elementId.value)) = [record])
      (calledProcessMatches : record.calledProcessId = calledProcessId)
      (calledScopeMatches :
        record.calledRoot.definitionScopeId = calledRootScopeId)
      (uniqueCalledRoot : before.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = record.calledRoot)) = [calledRoot])
      (calledRootIsRoot : calledRoot.parent = none)
      (uniqueCaller : (before.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id = record.caller)).length = 1)
      (uniqueProcessRoot : (before.scopeOccurrences.filter fun occurrence =>
        decide (occurrence.id.processInstanceId =
          record.calledRoot.processInstanceId &&
          occurrence.parent.isNone)).length = 1)
      (quiescent : scopeQuiescent before calledRoot.id = true) :
      ReturnProcessStep before id origin calledProcessId calledRootScopeId
        callerOutput
        { removeCalledProcessTree before record with
          tokens := addToken (removeCalledProcessTree before record).tokens
            callerOutput record.caller }

theorem invokeProcessState_sound (before after : RuntimeState)
    (origin input calledProcessId calledRootScopeId calledEntry returnOperationId)
    (result : invokeProcessState? before origin input calledProcessId
      calledRootScopeId calledEntry returnOperationId = some after) :
    InvokeProcessStep before origin input calledProcessId calledRootScopeId
      calledEntry returnOperationId after := by
  unfold invokeProcessState? at result
  generalize ownedEq : onlyTokenOwner? before input = owner? at result
  generalize rootEq : rootInstanceId? before = root? at result
  cases owner? with
  | none => simp at result
  | some caller =>
      cases root? with
      | none => simp at result
      | some rootInstance =>
          by_cases associations : calledProcessAssociationsValid before = true
          · simp only [associations, ite_true] at result
            by_cases oneInput : (before.tokens.filter fun token =>
              decide (token.placeId = input && token.owner = caller)).length = 1
            · by_cases freshCall : (before.calledProcessOccurrences.filter fun record =>
                decide (record.id.elementId.value = origin.elementId.value)).length = 0
              · generalize callerRootsEq : before.scopeOccurrences.filter
                  (fun occurrence => decide (occurrence.id = caller)) = callerRoots at result
                cases callerRoots with
                | nil =>
                    simp [freshCall] at result
                | cons callerRoot rest =>
                    cases rest with
                    | cons second remaining =>
                        simp [freshCall] at result
                    | nil =>
                        cases callerRoot with
                        | mk callerRootId parent =>
                            by_cases callerIdentity : callerRootId = caller
                            · subst callerRootId
                              let activation := callActivationCount before
                                origin.elementId + 1
                              let calledRoot : ScopeOccurrenceId :=
                                { processInstanceId := deriveCalledProcessInstanceId
                                    caller.processInstanceId origin.elementId activation
                                  definitionScopeId := calledRootScopeId
                                  activation := 1 }
                              let record : CalledProcessOccurrence :=
                                { id :=
                                    { processInstanceId := caller.processInstanceId
                                      elementId := ⟨origin.elementId.value⟩
                                      activation }
                                  caller
                                  calledProcessId
                                  calledRoot
                                  returnOperationId }
                              by_cases freshScopes : (before.scopeOccurrences.filter fun occurrence =>
                                  decide (occurrence.id.processInstanceId =
                                    calledRoot.processInstanceId)).length = 0
                              · by_cases freshRecord :
                                    (before.calledProcessOccurrences.filter fun candidate =>
                                      decide (candidate.id = record.id ||
                                        candidate.calledRoot.processInstanceId =
                                          calledRoot.processInstanceId)).length = 0
                                · simp [freshCall, freshScopes, activation,
                                      calledRoot] at result
                                  cases result.2.2
                                  exact .permitted before origin input calledProcessId
                                    calledRootScopeId calledEntry returnOperationId caller
                                    rootInstance
                                    { id := caller, parent := parent }
                                    activation calledRoot record ownedEq rootEq
                                    associations oneInput freshCall callerRootsEq
                                    rfl rfl rfl rfl freshScopes freshRecord
                                · simp [freshCall, freshScopes, activation,
                                      calledRoot] at result
                                  exfalso
                                  apply freshRecord
                                  simpa [List.length_eq_zero_iff,
                                    activation, calledRoot,
                                    record] using result.2.1
                              · simp [freshCall, freshScopes, activation,
                                    calledRoot] at result
                            · simp [freshCall, callerIdentity] at result
              · simp [freshCall] at result
            · simp at result
              exfalso
              apply oneInput
              simpa using result.1
          · simp [associations] at result

theorem returnProcessState_sound (before after : RuntimeState)
    (id origin calledProcessId calledRootScopeId callerOutput)
    (result : returnProcessState? before id origin calledProcessId
      calledRootScopeId callerOutput = some after) :
    ReturnProcessStep before id origin calledProcessId calledRootScopeId
      callerOutput after := by
  unfold returnProcessState? at result
  by_cases associations : calledProcessAssociationsValid before = true
  · simp only [associations, ite_true] at result
    generalize recordsEq : before.calledProcessOccurrences.filter (fun record =>
        decide (record.returnOperationId = id &&
          record.id.elementId.value = origin.elementId.value)) = records at result
    cases records with
    | nil =>
        simp at result
    | cons record rest =>
        cases rest with
        | cons second remaining =>
            simp at result
        | nil =>
            by_cases processMatches : record.calledProcessId = calledProcessId
            · by_cases scopeMatches :
                  record.calledRoot.definitionScopeId = calledRootScopeId
              · generalize rootEq : before.scopeOccurrences.filter (fun occurrence =>
                    decide (occurrence.id = record.calledRoot)) = roots at result
                cases roots with
                | nil =>
                    simp [processMatches, scopeMatches, rootEq] at result
                | cons calledRoot remainingRoots =>
                    cases remainingRoots with
                    | cons second tail =>
                        simp [processMatches, scopeMatches, rootEq] at result
                    | nil =>
                        cases calledRoot with
                        | mk calledRootId parent =>
                          cases parent with
                          | some parentId =>
                            simp [processMatches, scopeMatches, rootEq] at result
                          | none =>
                            by_cases uniqueCaller : (before.scopeOccurrences.filter fun occurrence =>
                              decide (occurrence.id = record.caller)).length = 1
                            · by_cases uniqueProcessRoot :
                                (before.scopeOccurrences.filter fun occurrence =>
                                  decide (occurrence.id.processInstanceId =
                                    record.calledRoot.processInstanceId &&
                                    occurrence.parent.isNone)).length = 1
                              · by_cases quiescent : scopeQuiescent before calledRootId = true
                                · simp [processMatches, scopeMatches, rootEq,
                                      uniqueCaller, quiescent] at result
                                  cases result.2
                                  exact .permitted before id origin calledProcessId
                                    calledRootScopeId callerOutput record
                                    { id := calledRootId, parent := none }
                                    associations recordsEq processMatches scopeMatches
                                    rootEq rfl uniqueCaller uniqueProcessRoot quiescent
                                · simp [processMatches, scopeMatches, rootEq,
                                    uniqueCaller, quiescent] at result
                              · simp [processMatches, scopeMatches, rootEq,
                                  uniqueCaller] at result
                                exfalso
                                apply uniqueProcessRoot
                                simpa using result.1
                            · simp [processMatches, scopeMatches, rootEq,
                                uniqueCaller] at result
              · simp [processMatches, scopeMatches] at result
            · simp [processMatches] at result
  · simp [associations] at result

/-- Every permitted return removes the unique association tree and emits one exact caller-owned continuation update. -/
theorem return_step_removes_exact_association_and_emits_one_continuation
    (before after : RuntimeState) (id : OperationId)
    (origin : BpmnElementOrigin) (calledProcessId : ProcessId)
    (calledRootScopeId : DefinitionScopeId) (callerOutput : ControlPlaceId)
    (transition : ReturnProcessStep before id origin calledProcessId
      calledRootScopeId callerOutput after) :
    ∃ record calledRoot,
      before.calledProcessOccurrences.filter (fun candidate =>
        decide (candidate.returnOperationId = id &&
          candidate.id.elementId.value = origin.elementId.value)) = [record] ∧
      before.scopeOccurrences.filter (fun occurrence =>
        decide (occurrence.id = record.calledRoot)) = [calledRoot] ∧
      scopeQuiescent before calledRoot.id = true ∧
      record ∉ after.calledProcessOccurrences ∧
      after =
        { removeCalledProcessTree before record with
          tokens := addToken (removeCalledProcessTree before record).tokens
            callerOutput record.caller } := by
  cases transition with
  | permitted record calledRoot _ uniqueReturn _ _ uniqueCalledRoot _ _ _ quiescent =>
      refine ⟨record, calledRoot, uniqueReturn, uniqueCalledRoot, quiescent, ?_, rfl⟩
      simp [removeCalledProcessTree]

end BpmnSemantics.SemanticProcess

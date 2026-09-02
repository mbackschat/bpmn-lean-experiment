import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed
import BpmnSemantics.SemanticProcess.EventBasedGateway

/-! # Context-backed Message key correlation

This module owns the pure finite-population matcher, candidate projection from committed Process
state, and exact target delivery for the bounded single-property correlation profile.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- One exact candidate projected from committed Process state under the host's stable-population
barrier. The subscription occurrence and both Property identities are evidence, not caller input. -/
structure CorrelatedMessageCandidate where
  address : CorrelatedMessageAddress
  processInstanceId : SemanticId
  subscriptionId : MessageSubscriptionId
  correlationPropertyId : String
  processPropertyId : String
  key : CorrelatedStringPayload
  deriving Repr, DecidableEq

inductive CorrelatedMessageMatch where
  | noMatch
  | unique (candidate : CorrelatedMessageCandidate)
  | ambiguous
  deriving Repr, DecidableEq

private def lowerHexDigit (character : Char) : Bool :=
  character.isDigit || ('a' ≤ character && character ≤ 'f')

private def sha256Valid (value : String) : Bool :=
  value.length = 64 && value.toList.all lowerHexDigit

def correlatedMessageAddressValid (address : CorrelatedMessageAddress) : Bool :=
  !address.definition.semanticProfile.value.isEmpty &&
    !address.definition.sourceId.value.isEmpty &&
    sha256Valid address.definition.sourceSha256 &&
    (match address.definition.sourceOverlay with
    | none => true
    | some overlay => !overlay.id.value.isEmpty && sha256Valid overlay.sha256) &&
    !address.processId.value.isEmpty && address.channel.identifiersNonempty &&
    (match address.channel with | .operationMessage .. => true | .directMessage .. => false) &&
    !address.correlationKeyId.isEmpty

def correlatedMessageCandidateValid (candidate : CorrelatedMessageCandidate) : Bool :=
  correlatedMessageAddressValid candidate.address &&
    !candidate.processInstanceId.value.isEmpty &&
    candidate.subscriptionId.processInstanceId = candidate.processInstanceId &&
    !candidate.subscriptionId.elementId.value.isEmpty &&
    candidate.subscriptionId.activation > 0 &&
    !candidate.correlationPropertyId.isEmpty && !candidate.processPropertyId.isEmpty &&
    !candidate.key.value.isEmpty

def correlatedMessageCandidateMatches (address : CorrelatedMessageAddress)
    (payload : CorrelatedStringPayload) (candidate : CorrelatedMessageCandidate) : Bool :=
  candidate.address == address && candidate.key == payload

def matchingCorrelatedMessageCandidates (address : CorrelatedMessageAddress)
    (payload : CorrelatedStringPayload) (candidates : List CorrelatedMessageCandidate) :
    List CorrelatedMessageCandidate :=
  candidates.filter (correlatedMessageCandidateMatches address payload)

/-- Candidate enumeration order cannot change the matching population. -/
theorem matchingCorrelatedMessageCandidates_perm
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    {left right : List CorrelatedMessageCandidate} (permutation : left.Perm right) :
    (matchingCorrelatedMessageCandidates address payload left).Perm
      (matchingCorrelatedMessageCandidates address payload right) := by
  exact permutation.filter (correlatedMessageCandidateMatches address payload)

private def classifyCorrelatedMessageCandidates :
    List CorrelatedMessageCandidate → CorrelatedMessageMatch
  | [] => .noMatch
  | [candidate] => .unique candidate
  | _ :: _ :: _ => .ambiguous

private theorem classifyCorrelatedMessageCandidates_perm
    {left right : List CorrelatedMessageCandidate} (permutation : left.Perm right) :
    classifyCorrelatedMessageCandidates left = classifyCorrelatedMessageCandidates right := by
  cases left with
  | nil =>
      have rightNil : right = [] := permutation.symm.eq_nil
      subst right
      rfl
  | cons first rest =>
      cases rest with
      | nil =>
          have rightSingleton : right = [first] := permutation.symm.eq_singleton
          subst right
          rfl
      | cons second tail =>
          cases right with
          | nil => simp at permutation
          | cons rightFirst rightRest =>
              cases rightRest with
              | nil =>
                  have lengths := permutation.length_eq
                  simp at lengths
              | cons rightSecond rightTail => rfl

/-- Exact-cardinality matching. Invalid evidence is distinct from the semantic zero-match result. -/
def matchCorrelatedMessageCandidates (address : CorrelatedMessageAddress)
    (payload : CorrelatedStringPayload) (candidates : List CorrelatedMessageCandidate) :
    Option CorrelatedMessageMatch :=
  if !correlatedMessageAddressValid address || payload.value.isEmpty ||
      !candidates.all correlatedMessageCandidateValid then none
  else
    some (classifyCorrelatedMessageCandidates
      (matchingCorrelatedMessageCandidates address payload candidates))

/-- Validation and exact-cardinality classification are invariant under candidate enumeration. -/
theorem matchCorrelatedMessageCandidates_perm
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    {left right : List CorrelatedMessageCandidate} (permutation : left.Perm right) :
    matchCorrelatedMessageCandidates address payload left =
      matchCorrelatedMessageCandidates address payload right := by
  unfold matchCorrelatedMessageCandidates
  rw [permutation.all_eq]
  split
  · rfl
  · rw [classifyCorrelatedMessageCandidates_perm
      (matchingCorrelatedMessageCandidates_perm address payload permutation)]

/-- Under valid evidence, semantic no-match is exactly an empty filtered population. -/
theorem matchCorrelatedMessageCandidates_noMatch_iff
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    (candidates : List CorrelatedMessageCandidate)
    (addressValid : correlatedMessageAddressValid address = true)
    (payloadNonempty : payload.value.isEmpty = false)
    (candidatesValid : candidates.all correlatedMessageCandidateValid = true) :
    matchCorrelatedMessageCandidates address payload candidates = some .noMatch ↔
      matchingCorrelatedMessageCandidates address payload candidates = [] := by
  generalize filteredEq : matchingCorrelatedMessageCandidates address payload candidates = filtered
  cases filtered with
  | nil =>
      simp [matchCorrelatedMessageCandidates, addressValid, payloadNonempty, candidatesValid,
        filteredEq, classifyCorrelatedMessageCandidates]
  | cons first rest =>
      cases rest <;>
        simp [matchCorrelatedMessageCandidates, addressValid, payloadNonempty, candidatesValid,
          filteredEq, classifyCorrelatedMessageCandidates]

/-- A sole exact filtered candidate is complete for the unique result. -/
theorem matchCorrelatedMessageCandidates_unique_complete
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    (candidates : List CorrelatedMessageCandidate) (candidate : CorrelatedMessageCandidate)
    (addressValid : correlatedMessageAddressValid address = true)
    (payloadNonempty : payload.value.isEmpty = false)
    (candidatesValid : candidates.all correlatedMessageCandidateValid = true)
    (sole : matchingCorrelatedMessageCandidates address payload candidates = [candidate]) :
    matchCorrelatedMessageCandidates address payload candidates = some (.unique candidate) := by
  simp [matchCorrelatedMessageCandidates, addressValid, payloadNonempty, candidatesValid, sole,
    classifyCorrelatedMessageCandidates]

/-- Any filtered population containing at least two candidates is ambiguous. -/
theorem matchCorrelatedMessageCandidates_ambiguous_of_two_or_more
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    (candidates : List CorrelatedMessageCandidate) (first second : CorrelatedMessageCandidate)
    (rest : List CorrelatedMessageCandidate)
    (addressValid : correlatedMessageAddressValid address = true)
    (payloadNonempty : payload.value.isEmpty = false)
    (candidatesValid : candidates.all correlatedMessageCandidateValid = true)
    (multiple : matchingCorrelatedMessageCandidates address payload candidates =
      first :: second :: rest) :
    matchCorrelatedMessageCandidates address payload candidates = some .ambiguous := by
  simp [matchCorrelatedMessageCandidates, addressValid, payloadNonempty, candidatesValid, multiple,
    classifyCorrelatedMessageCandidates]

/-- Ambiguity is preserved by every re-enumeration of the same finite candidate population. -/
theorem matchCorrelatedMessageCandidates_ambiguous_perm
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    {left right : List CorrelatedMessageCandidate} (permutation : left.Perm right)
    (ambiguous : matchCorrelatedMessageCandidates address payload left = some .ambiguous) :
    matchCorrelatedMessageCandidates address payload right = some .ambiguous := by
  rw [← matchCorrelatedMessageCandidates_perm address payload permutation]
  exact ambiguous

/-- A unique result always carries a candidate with the complete requested address and exact key. -/
theorem matchCorrelatedMessageCandidates_unique_sound
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    (candidates : List CorrelatedMessageCandidate) (candidate : CorrelatedMessageCandidate)
    (matched : matchCorrelatedMessageCandidates address payload candidates =
      some (.unique candidate)) :
    candidate ∈ candidates ∧ candidate.address = address ∧ candidate.key = payload := by
  unfold matchCorrelatedMessageCandidates at matched
  split at matched
  · contradiction
  rename_i admitted
  generalize filteredEq : matchingCorrelatedMessageCandidates address payload candidates =
    filtered at matched
  cases filtered with
  | nil => simp [classifyCorrelatedMessageCandidates] at matched
  | cons head tail =>
      cases tail with
      | nil =>
          have candidateEq : head = candidate := CorrelatedMessageMatch.unique.inj
            (Option.some.inj matched)
          subst head
          have selected : candidate ∈ matchingCorrelatedMessageCandidates address payload
              candidates := by rw [filteredEq]; simp
          obtain ⟨member, agrees⟩ := List.mem_filter.mp selected
          simp only [correlatedMessageCandidateMatches, Bool.and_eq_true,
            beq_iff_eq] at agrees
          exact ⟨member, agrees.1, agrees.2⟩
      | cons second rest => simp [classifyCorrelatedMessageCandidates] at matched

/-- Two valid equal-key candidates are ambiguous. List order has no winner-selection authority. -/
theorem matchCorrelatedMessageCandidates_two_matches_ambiguous
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    (left right : CorrelatedMessageCandidate)
    (addressValid : correlatedMessageAddressValid address = true)
    (payloadNonempty : payload.value.isEmpty = false)
    (leftValid : correlatedMessageCandidateValid left = true)
    (rightValid : correlatedMessageCandidateValid right = true)
    (leftAddress : left.address = address) (rightAddress : right.address = address)
    (leftKey : left.key = payload) (rightKey : right.key = payload) :
    matchCorrelatedMessageCandidates address payload [left, right] = some .ambiguous := by
  simp [matchCorrelatedMessageCandidates, addressValid, payloadNonempty, leftValid, rightValid,
    matchingCorrelatedMessageCandidates, correlatedMessageCandidateMatches, leftAddress,
    rightAddress, leftKey, rightKey, classifyCorrelatedMessageCandidates]

/-- Reversing two exact equal-key candidates cannot create a lexical winner. -/
theorem matchCorrelatedMessageCandidates_no_lexical_winner
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    (left right : CorrelatedMessageCandidate)
    (addressValid : correlatedMessageAddressValid address = true)
    (payloadNonempty : payload.value.isEmpty = false)
    (leftValid : correlatedMessageCandidateValid left = true)
    (rightValid : correlatedMessageCandidateValid right = true)
    (leftAddress : left.address = address) (rightAddress : right.address = address)
    (leftKey : left.key = payload) (rightKey : right.key = payload) :
    matchCorrelatedMessageCandidates address payload [left, right] = some .ambiguous ∧
      matchCorrelatedMessageCandidates address payload [right, left] = some .ambiguous := by
  have forward := matchCorrelatedMessageCandidates_two_matches_ambiguous address payload left right
    addressValid payloadNonempty leftValid rightValid leftAddress rightAddress leftKey rightKey
  have permutation : [left, right].Perm [right, left] := by
    exact List.Perm.swap _ _ _
  exact ⟨forward, by
    rw [← matchCorrelatedMessageCandidates_perm address payload permutation]
    exact forward⟩

/-- A candidate from another immutable definition cannot enter even a singleton match. -/
theorem matchCorrelatedMessageCandidates_cross_definition_isolation
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    (candidate : CorrelatedMessageCandidate)
    (addressValid : correlatedMessageAddressValid address = true)
    (payloadNonempty : payload.value.isEmpty = false)
    (candidateValid : correlatedMessageCandidateValid candidate = true)
    (different : candidate.address ≠ address) :
    matchCorrelatedMessageCandidates address payload [candidate] = some .noMatch := by
  simp [matchCorrelatedMessageCandidates, addressValid, payloadNonempty, candidateValid,
    matchingCorrelatedMessageCandidates, correlatedMessageCandidateMatches, different,
    classifyCorrelatedMessageCandidates]

/-- Reusing every local BPMN identity and key under another source digest still cannot match. -/
theorem matchCorrelatedMessageCandidates_source_sha_isolation
    (address : CorrelatedMessageAddress) (payload : CorrelatedStringPayload)
    (candidate : CorrelatedMessageCandidate)
    (addressValid : correlatedMessageAddressValid address = true)
    (payloadNonempty : payload.value.isEmpty = false)
    (candidateValid : correlatedMessageCandidateValid candidate = true)
    (differentSource :
      candidate.address.definition.sourceSha256 ≠ address.definition.sourceSha256) :
    matchCorrelatedMessageCandidates address payload [candidate] = some .noMatch := by
  apply matchCorrelatedMessageCandidates_cross_definition_isolation address payload candidate
    addressValid payloadNonempty candidateValid
  intro sameAddress
  exact differentSource (congrArg (fun current => current.definition.sourceSha256) sameAddress)

private def correlatedOperationSelectedForWait (program : Program)
    (operation : SemanticOperation) (wait : MessageWait) : Bool :=
  messageWaitDeclarers program wait.elementId == [operation] &&
    (program.operations.filter fun candidate => decide (candidate = operation)).length = 1 &&
    operationOwningScope? program operation.id = some wait.owner.definitionScopeId

def soleCorrelatedPayloadMessageOperation? (program : Program) : Option SemanticOperation :=
  match program.operations.filter fun
    | .awaitCorrelatedPayloadMessage .. => true
    | _ => false with
  | [operation] => some operation
  | _ => none

def selectedCorrelatedMessageWait? (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (operation : SemanticOperation)
    (message : MessageDefinition) (output : ControlPlaceId) : Option MessageWait :=
  match state.messageWaits.filter fun candidate =>
      candidate.processInstanceId = instanceId &&
        candidate.owner.processInstanceId = instanceId &&
        candidate.elementId = message.elementId && candidate.output = output &&
        candidate.channel = message.channel &&
        correlatedOperationSelectedForWait program operation candidate with
  | [wait] => some wait
  | _ => none

theorem selectedCorrelatedMessageWait?_facts (program : Program) (state : RuntimeState)
    (instanceId : SemanticId) (operation : SemanticOperation)
    (message : MessageDefinition) (output : ControlPlaceId) (wait : MessageWait)
    (selected : selectedCorrelatedMessageWait? program state instanceId operation message output =
      some wait) :
    wait ∈ state.messageWaits ∧ wait.processInstanceId = instanceId ∧
      wait.owner.processInstanceId = instanceId ∧ wait.elementId = message.elementId ∧
      wait.output = output ∧ wait.channel = message.channel ∧
      messageWaitDeclarers program wait.elementId = [operation] ∧
      operationOwningScope? program operation.id = some wait.owner.definitionScopeId := by
  unfold selectedCorrelatedMessageWait? at selected
  generalize filteredEq : state.messageWaits.filter (fun candidate =>
      candidate.processInstanceId = instanceId &&
        candidate.owner.processInstanceId = instanceId &&
        candidate.elementId = message.elementId && candidate.output = output &&
        candidate.channel = message.channel &&
        correlatedOperationSelectedForWait program operation candidate) = filtered at selected
  cases filtered with
  | nil => simp at selected
  | cons current rest =>
      cases rest with
      | cons _ _ => simp at selected
      | nil =>
          have waitEq : current = wait := Option.some.inj selected
          subst current
          have member : wait ∈ state.messageWaits.filter (fun candidate =>
              candidate.processInstanceId = instanceId &&
                candidate.owner.processInstanceId = instanceId &&
                candidate.elementId = message.elementId && candidate.output = output &&
                candidate.channel = message.channel &&
                correlatedOperationSelectedForWait program operation candidate) := by
            rw [filteredEq]
            simp
          obtain ⟨waitMember, facts⟩ := List.mem_filter.mp member
          simp only [Bool.and_eq_true, decide_eq_true_eq,
            correlatedOperationSelectedForWait, beq_iff_eq] at facts
          exact ⟨waitMember, facts.1.1.1.1.1, facts.1.1.1.1.2, facts.1.1.1.2,
            facts.1.1.2, facts.1.2, facts.2.1.1, facts.2.2⟩

/-- Projects the sole live correlated wait, its sole declarer, and its sole current Process binding. -/
def projectCorrelatedMessageCandidate (program : Program) (state : RuntimeState) :
    Option CorrelatedMessageCandidate := do
  let instanceId ← match state.control with
    | .running instanceId => some instanceId
    | _ => none
  let operation ← soleCorrelatedPayloadMessageOperation? program
  match operation with
  | .awaitCorrelatedPayloadMessage _ _ _ output message correlationKeyId
      correlationPropertyId payloadSelector processPropertySelector => do
      if !correlationMessagePathValid payloadSelector ||
          !correlationProcessPropertyPathValid processPropertySelector then none else pure ()
      let wait ← selectedCorrelatedMessageWait? program state instanceId operation message output
      let keyValue ← evaluateCorrelationProcessPropertyPath? processPropertySelector
        state.variables.process.bindings
      let key : CorrelatedStringPayload := { value := keyValue }
      let address : CorrelatedMessageAddress :=
        { definition := program.identity, processId := program.processId,
          channel := message.channel, correlationKeyId }
      if !correlatedMessageAddressValid address || correlationPropertyId.isEmpty then none
      else
        some
          { address, processInstanceId := instanceId
            subscriptionId :=
              { processInstanceId := wait.processInstanceId,
                elementId := ⟨wait.elementId.value⟩, activation := wait.activation }
            correlationPropertyId
            processPropertyId := processPropertySelector.propertyId
            key }
  | _ => none

/-- Successful projection exposes exactly the sole current correlated operation, selected wait,
exact selectors, current Process-property value, and complete candidate fact. -/
theorem projectCorrelatedMessageCandidate_correct (program : Program) (state : RuntimeState)
    (candidate : CorrelatedMessageCandidate)
    (projected : projectCorrelatedMessageCandidate program state = some candidate) :
    ∃ instanceId id origin input output message correlationKeyId correlationPropertyId
        payloadSelector processPropertySelector wait,
      state.control = .running instanceId ∧
      soleCorrelatedPayloadMessageOperation? program = some
        (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector) ∧
      selectedCorrelatedMessageWait? program state instanceId
        (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector) message output = some wait ∧
      correlationMessagePathValid payloadSelector = true ∧
      correlationProcessPropertyPathValid processPropertySelector = true ∧
      evaluateCorrelationProcessPropertyPath? processPropertySelector
        state.variables.process.bindings = some candidate.key.value ∧
      candidate =
        { address :=
            { definition := program.identity, processId := program.processId,
              channel := message.channel, correlationKeyId }
          processInstanceId := instanceId
          subscriptionId :=
            { processInstanceId := wait.processInstanceId,
              elementId := ⟨wait.elementId.value⟩, activation := wait.activation }
          correlationPropertyId
          processPropertyId := processPropertySelector.propertyId
          key := { value := candidate.key.value } } := by
  unfold projectCorrelatedMessageCandidate at projected
  cases controlEq : state.control with
  | notStarted => simp [controlEq] at projected
  | completed _ => simp [controlEq] at projected
  | cancelled _ => simp [controlEq] at projected
  | failed _ _ => simp [controlEq] at projected
  | running instanceId =>
      cases operationEq : soleCorrelatedPayloadMessageOperation? program with
      | none => simp [controlEq, operationEq] at projected
      | some operation =>
          cases operation with
          | awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
              correlationPropertyId payloadSelector processPropertySelector =>
              simp [controlEq, operationEq] at projected
              have messageSelectorValid : correlationMessagePathValid payloadSelector = true :=
                projected.1.1
              have processSelectorValid :
                  correlationProcessPropertyPathValid processPropertySelector = true :=
                projected.1.2
              have remaining := projected.2
              cases waitEq : selectedCorrelatedMessageWait? program state instanceId
                  (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
                    correlationPropertyId payloadSelector processPropertySelector) message output with
              | none => simp [waitEq] at remaining
              | some wait =>
                  simp only [waitEq] at remaining
                  cases keyEq : evaluateCorrelationProcessPropertyPath?
                      processPropertySelector state.variables.process.bindings with
                  | none => simp [keyEq] at remaining
                  | some keyValue =>
                      simp [keyEq] at remaining
                      obtain ⟨addressAccepted, candidateEq⟩ := remaining
                      subst candidate
                      exact ⟨instanceId, id, origin, input, output, message,
                        correlationKeyId, correlationPropertyId, payloadSelector,
                        processPropertySelector, wait, rfl, rfl, waitEq,
                        messageSelectorValid, processSelectorValid, keyEq, rfl⟩
          | _ => simp [controlEq, operationEq] at projected

def correlatedDeliveryRechecks (candidate : CorrelatedMessageCandidate)
    (delivery : DeliverCorrelatedPayloadMessageStimulus) : Bool :=
  delivery.ingressOrdinal > 0 && candidate.address = delivery.address &&
    candidate.subscriptionId = delivery.subscriptionId &&
    candidate.correlationPropertyId = delivery.correlationPropertyId &&
    candidate.processPropertyId = delivery.processPropertyId &&
    candidate.key = delivery.payload

theorem correlatedDeliveryRechecks_exact (candidate : CorrelatedMessageCandidate)
    (delivery : DeliverCorrelatedPayloadMessageStimulus) :
    correlatedDeliveryRechecks candidate delivery = true ↔
      delivery.ingressOrdinal > 0 ∧ candidate.address = delivery.address ∧
        candidate.subscriptionId = delivery.subscriptionId ∧
        candidate.correlationPropertyId = delivery.correlationPropertyId ∧
        candidate.processPropertyId = delivery.processPropertyId ∧
        candidate.key = delivery.payload := by
  simp only [correlatedDeliveryRechecks, Bool.and_eq_true, decide_eq_true_eq, and_assoc]

def correlatedWaitOccurrenceMatches (subscriptionId : MessageSubscriptionId)
    (wait : MessageWait) : Bool :=
  wait.processInstanceId = subscriptionId.processInstanceId &&
    wait.elementId.value = subscriptionId.elementId.value &&
    wait.activation = subscriptionId.activation

def currentCorrelatedMessageWaitForCandidate? (program : Program) (state : RuntimeState)
    (candidate : CorrelatedMessageCandidate) : Option MessageWait := do
  let operation ← soleCorrelatedPayloadMessageOperation? program
  match operation with
  | .awaitCorrelatedPayloadMessage _ _ _ output message _ _ _ _ => do
      let wait ← selectedCorrelatedMessageWait? program state candidate.processInstanceId
        operation message output
      if correlatedWaitOccurrenceMatches candidate.subscriptionId wait then some wait else none
  | _ => none

theorem currentCorrelatedMessageWaitForCandidate?_facts
    (program : Program) (state : RuntimeState) (candidate : CorrelatedMessageCandidate)
    (wait : MessageWait)
    (current : currentCorrelatedMessageWaitForCandidate? program state candidate = some wait) :
    ∃ id origin input output message correlationKeyId correlationPropertyId
        payloadSelector processPropertySelector,
      soleCorrelatedPayloadMessageOperation? program = some
        (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector) ∧
      selectedCorrelatedMessageWait? program state candidate.processInstanceId
        (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector) message output = some wait ∧
      correlatedWaitOccurrenceMatches candidate.subscriptionId wait = true := by
  unfold currentCorrelatedMessageWaitForCandidate? at current
  cases operationEq : soleCorrelatedPayloadMessageOperation? program with
  | none => simp [operationEq] at current
  | some operation =>
      cases operation with
      | awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
          correlationPropertyId payloadSelector processPropertySelector =>
          cases waitEq : selectedCorrelatedMessageWait? program state candidate.processInstanceId
              (.awaitCorrelatedPayloadMessage id origin input output message correlationKeyId
                correlationPropertyId payloadSelector processPropertySelector) message output with
          | none => simp [operationEq, waitEq] at current
          | some selectedWait =>
              cases occurrence :
                  correlatedWaitOccurrenceMatches candidate.subscriptionId selectedWait with
              | false => simp [operationEq, waitEq, occurrence] at current
              | true =>
                simp [operationEq, waitEq, occurrence] at current
                cases current
                exact ⟨id, origin, input, output, message, correlationKeyId,
                  correlationPropertyId, payloadSelector, processPropertySelector,
                  rfl, waitEq, occurrence⟩
      | _ => simp [operationEq] at current

/-- Reproject and recheck the exact selected target, then atomically withdraw only that wait and
produce its outgoing token. The payload is correlation evidence and is never written. -/
def deliverCorrelatedPayloadMessage (program : Program) (state : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus) : Option RuntimeState :=
  match projectCorrelatedMessageCandidate program state with
  | none => none
  | some candidate =>
      if correlatedDeliveryRechecks candidate delivery then
        match currentCorrelatedMessageWaitForCandidate? program state candidate with
        | none => none
        | some wait =>
            if state.eventRaces.any (fun race => eventRaceHasMessage race wait) ||
                activityRecordsAttachMessageWait state.activityOccurrences wait then none
            else
              some
                { state with
                  messageWaits := state.messageWaits.erase wait
                  tokens := addToken state.tokens wait.output wait.owner }
      else none

/-- A changed current Process key refuses the stale delivery before any wait can be retargeted. -/
theorem deliverCorrelatedPayloadMessage_changed_property_refuses
    (program : Program) (state : RuntimeState)
    (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (current : CorrelatedMessageCandidate)
    (projected : projectCorrelatedMessageCandidate program state = some current)
    (changed : current.key ≠ delivery.payload) :
    deliverCorrelatedPayloadMessage program state delivery = none := by
  simp [deliverCorrelatedPayloadMessage, projected, correlatedDeliveryRechecks, changed]

/-- Declarative exact-target delivery relation, separately stating candidate revalidation. -/
inductive CorrelatedPayloadMessageDeliveryStep :
    Program → RuntimeState → DeliverCorrelatedPayloadMessageStimulus → RuntimeState → Prop where
  | commit (program : Program) (before : RuntimeState)
      (delivery : DeliverCorrelatedPayloadMessageStimulus)
      (candidate : CorrelatedMessageCandidate) (wait : MessageWait)
      (projected : projectCorrelatedMessageCandidate program before = some candidate)
      (rechecked : correlatedDeliveryRechecks candidate delivery = true)
      (selected : currentCorrelatedMessageWaitForCandidate? program before candidate = some wait)
      (ordinary : before.eventRaces.any (fun race => eventRaceHasMessage race wait) = false)
      (unattached : activityRecordsAttachMessageWait before.activityOccurrences wait = false) :
      CorrelatedPayloadMessageDeliveryStep program before delivery
        { before with
          messageWaits := before.messageWaits.erase wait
          tokens := addToken before.tokens wait.output wait.owner }

theorem deliverCorrelatedPayloadMessage_sound (program : Program)
    (before after : RuntimeState) (delivery : DeliverCorrelatedPayloadMessageStimulus)
    (success : deliverCorrelatedPayloadMessage program before delivery = some after) :
    CorrelatedPayloadMessageDeliveryStep program before delivery after := by
  unfold deliverCorrelatedPayloadMessage at success
  split at success
  · contradiction
  rename_i candidate projected
  split at success
  · rename_i rechecked
    split at success
    · contradiction
    rename_i wait selected
    split at success
    · contradiction
    rename_i admissible
    have ordinary : before.eventRaces.any (fun race => eventRaceHasMessage race wait) = false := by
      cases value : before.eventRaces.any (fun race => eventRaceHasMessage race wait) <;>
        simp_all
    have unattached :
        activityRecordsAttachMessageWait before.activityOccurrences wait = false := by
      cases value : activityRecordsAttachMessageWait before.activityOccurrences wait <;>
        simp_all
    cases success
    exact .commit program before delivery candidate wait projected rechecked selected
      ordinary unattached
  · contradiction

end BpmnSemantics.SemanticProcess

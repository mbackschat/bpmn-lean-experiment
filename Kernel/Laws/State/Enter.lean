module

public import Kernel.Laws.State.Keeps

/-! # Laws of the kernel state: entering a scope occurrence and queuing bare begins

That `State.enterScope` keeps `WellFormed` when it enters below a scope occurrence that stands, owned, if at all, by a
begun occurrence running there, composed from `Kernel.Laws.State.enterScope_eq`; it reads no body. The new scope
occurrence takes the counter's identity, so nothing standing or queued names it, and what stood keeps its process
instance, since its parent chain is unchanged (`Laws.State.instanceOf_kept`). A bare begin, which names no
reservation, queued as a signal or deferred onto the work stack in a scope occurrence that stands, claims nothing, so
it keeps the claims single and what has settled settled. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-- A containment holds in a state that keeps every scope occurrence. -/
theorem Within.grow {s t : State} (scopes : ∀ entry ∈ s.scopes, entry ∈ t.scopes) {inner outer : ScopeOccurrenceId}
    (within : Within s inner outer) : Within t inner outer := by
  induction within with
  | refl scope => exact .refl scope
  | parent child parent outer member link _ ih => exact .parent child parent outer (scopes child member) link ih

/-- What entering the scope occurrence `entry` makes of `before`: `entry`, issued at the counter, joins the scope
occurrences with its variable set, holding `locals`; the slots hold nothing new and nothing else changes but the
instances a called root records (`State.enterScope`, `State.enterCalled`). -/
structure Enters (before after : State) (entry : ScopeOccurrence) (locals : List (String × Value)) : Prop where
  id : entry.id = ⟨before.nextIssue⟩
  nextIssue : after.nextIssue = before.nextIssue + 1
  scopes : after.scopes = before.scopes ++ [entry]
  variables : after.variables = before.variables ++ [{ scope := entry.id, entries := keyed locals }]
  occurrences : after.occurrences = before.occurrences
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  signals : after.signals = before.signals
  activations : after.activations = before.activations
  journal : after.journal = before.journal
  draft : after.draft = before.draft
  status : after.status = before.status
  failure : after.failure = before.failure
  instanceId : after.instanceId = before.instanceId
  slots : SlotsWithin before after

/-- Entering a scope occurrence below one that stands, owned, if at all, by a begun occurrence running there, keeps a
state well-formed. -/
theorem Enters.wellFormed {s after : State} {entry : ScopeOccurrence} {locals : List (String × Value)}
    (formed : WellFormed program s) (enters : Enters s after entry locals) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (entryParent : entry.parent = some parent)
    (ownerBegun : ∀ id, entry.occurrence = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧
      occurrence.begun = true ∧ occurrence.scope = parent) :
    WellFormed program after := by
  have entryId := enters.id
  have scopes := enters.scopes
  have members : ∀ found ∈ after.scopes, found ∈ s.scopes ∨ found = entry := fun found inside => by
    simpa [scopes] using inside
  have grows : ∀ found ∈ s.scopes, found ∈ after.scopes := fun found inside => by
    rw [scopes]
    exact List.mem_append_left _ inside
  have fresh : ∀ found ∈ s.scopes, found.id ≠ entry.id := fun found inside same => by
    have := formed.issued.scopes found inside
    rw [same, entryId] at this
    exact Nat.lt_irrefl _ this
  have ids : scopeIds after = scopeIds s ++ [entry.id] := by simp [scopeIds, scopes]
  have nodup : (scopeIds after).Nodup := by
    rw [ids, List.nodup_append]
    exact ⟨formed.distinct.scopes, by simp, fun a old b new same => by
      obtain ⟨found, inside, rfl⟩ := List.mem_map.mp old
      simp at new
      exact fresh found inside (same.trans new)⟩
  have rootBelow : State.root.value < s.nextIssue := by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp formed.rooted.1
    exact named ▸ formed.issued.scopes found inside
  have notRoot : entry.id ≠ State.root := fun same => by
    have := congrArg ScopeOccurrenceId.value same
    rw [entryId] at this
    dsimp only at this
    omega
  have below : ∀ x ∈ scopeIds s, x.value < s.nextIssue := fun x member => by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp member
    exact named ▸ formed.issued.scopes found inside
  have idsGrow : ∀ x ∈ scopeIds s, x ∈ scopeIds after := fun x member => by
    rw [ids]
    exact List.mem_append_left _ member
  have hNext := enters.nextIssue
  have hOcc := enters.occurrences
  have hItems := enters.openItems
  have hTokens := enters.tokens
  have hSignals := enters.signals
  have hVars := enters.variables
  have startsEq : starts after = starts s := by simp [starts, enters.journal, enters.draft]
  have countedEq : ∀ k, Counted after k ↔ Counted s k := by simp [Counted, enters.activations]
  have queuedEq : ∀ request, Queued after request ↔ Queued s request := by simp [Queued, hSignals, hTokens]
  have parentless : ∀ found ∈ after.scopes, found.parent = none → found.id = State.root := fun found inside orphan => by
    rcases members found inside with old | rfl
    · exact (formed.rooted.2.1 found old).mp orphan
    · simp [entryParent] at orphan
  have instances : ∀ x ∈ scopeIds s, after.instanceOf x = s.instanceOf x := fun x present =>
    instanceOf_kept formed nodup parentless enters.instanceId present fun found inside _ => grows found inside
  have keys : ∀ occurrence ∈ s.occurrences, key after occurrence = key s occurrence := fun occurrence member =>
    key_congr (instances _ (formed.owned.occurrenceScopes occurrence member))
  have parentWithin : Within s parent State.root := by
    obtain ⟨found, inside, named⟩ := List.mem_map.mp stands
    exact named ▸ formed.rooted.2.2 found inside
  have issued : IssuedBelow after := ⟨fun occurrence member => by
      rw [hNext]
      rw [hOcc] at member
      exact Nat.lt_succ_of_lt (formed.issued.occurrences occurrence member),
    fun item member => by
      rw [hNext]
      rw [hItems] at member
      exact Nat.lt_succ_of_lt (formed.issued.items item member),
    fun found member => by
      rw [hNext]
      rcases members found member with old | rfl
      · exact Nat.lt_succ_of_lt (formed.issued.scopes found old)
      · rw [entryId]
        exact Nat.lt_succ_self _⟩
  have distinct : Distinct after := ⟨by simpa [occurrenceIds, hOcc] using formed.distinct.occurrences,
    by simpa [hItems] using formed.distinct.items, nodup, by
      rw [hOcc, List.map_congr_left keys]
      exact formed.distinct.keys⟩
  have owned : Owned after := ⟨fun occurrence member => by
      rw [hOcc] at member
      exact idsGrow _ (formed.owned.occurrenceScopes occurrence member),
    fun item member => by
      rw [hItems] at member
      exact idsGrow _ (formed.owned.itemScopes item member),
    fun item member => by
      rw [hOcc]
      rw [hItems] at member
      exact formed.owned.itemOccurrences item member,
    fun item member host attached => by
      rw [hOcc]
      rw [hItems] at member
      exact formed.owned.attachments item member host attached,
    fun found member id link => by
      rw [hOcc]
      rcases members found member with old | rfl
      · exact formed.owned.scopeOwners found old id link
      · obtain ⟨occurrence, inside, named, begun⟩ := ownerBegun id link
        exact ⟨occurrence, inside, named, begun.1⟩,
    fun variables member => by
      rw [hVars] at member
      rcases List.mem_append.mp member with old | new
      · exact idsGrow _ (formed.owned.variableScopes variables old)
      · rw [List.mem_singleton.mp new, ids]
        simp [entryId],
    fun token member => by
      rw [hTokens] at member
      exact idsGrow _ (formed.owned.tokenScopes token member)⟩
  have rooted : Rooted after := ⟨idsGrow _ formed.rooted.1, fun found member => by
      rcases members found member with old | rfl
      · exact formed.rooted.2.1 found old
      · exact ⟨fun orphan => by simp [entryParent] at orphan, fun same => absurd same notRoot⟩,
    fun found member => by
      rcases members found member with old | rfl
      · exact (formed.rooted.2.2 found old).grow grows
      · exact .parent _ parent _ (by rw [scopes]; exact List.mem_append_right _ (List.mem_singleton_self _)) entryParent
          (parentWithin.grow grows)⟩
  have variables : VariablesKeyed after := ⟨by
      rw [hVars, List.map_append, List.nodup_append]
      refine ⟨formed.variables.scopes, by simp, fun a old b new same => ?_⟩
      obtain ⟨found, inside, rfl⟩ := List.mem_map.mp old
      have := below _ (formed.owned.variableScopes found inside)
      simp at new
      rw [same, new, entryId] at this
      exact Nat.lt_irrefl _ this,
    fun found member => by
      rw [hVars] at member
      rcases List.mem_append.mp member with old | new
      · exact formed.variables.names found old
      · rw [List.mem_singleton.mp new]
        exact keyed_names locals⟩
  have queue : QueueSound after := ⟨fun host element scope member => by
      rw [hSignals] at member
      obtain ⟨hostBelow, scopeBelow, placed⟩ := formed.queue.arm host element scope member
      rw [hNext, hOcc]
      exact ⟨Nat.lt_succ_of_lt hostBelow, Nat.lt_succ_of_lt scopeBelow, placed⟩,
    fun scope member => by
      rw [hSignals] at member
      rw [hNext]
      exact Nat.lt_succ_of_lt (formed.queue.armScope scope member),
    fun occurrence gateway scope member => by
      rw [hSignals] at member
      obtain ⟨hostBelow, scopeBelow, placed⟩ := formed.queue.armGateway occurrence gateway scope member
      rw [hNext, hOcc]
      exact ⟨Nat.lt_succ_of_lt hostBelow, Nat.lt_succ_of_lt scopeBelow, placed⟩,
    fun status failure member => by
      rw [hSignals] at member
      exact formed.queue.ends status failure member,
    fun id leave writes rule member => by
      rw [hSignals] at member
      rw [hNext]
      exact Nat.lt_succ_of_lt (formed.queue.completes id leave writes rule member)⟩
  have ownedBelow : OwnedBelow after := fun found member occurrence present link => by
    rw [hOcc] at present
    rcases members found member with old | rfl
    · exact formed.ownedBelow found old occurrence present link
    · obtain ⟨owner, inside, named, begun⟩ := ownerBegun occurrence.id link
      have same : owner = occurrence := nodup_map_eq formed.distinct.occurrences inside present named
      rw [entryParent, ← same, begun.2]
  have claimed : ReservationsClaimed after := ⟨fun item member attached reserved other inside same => by
      rw [hItems] at member inside
      rw [hOcc] at reserved
      exact formed.claimed.attached item member attached reserved other inside same,
    fun request queued => by
      obtain ⟨distinctNames, beginnable⟩ := formed.claimed.named request ((queuedEq request).mp queued)
      refine ⟨distinctNames, fun id named => ?_⟩
      obtain ⟨idBelow, facts⟩ := beginnable id named
      refine ⟨by rw [hNext]; omega, fun occurrence member same => ?_⟩
      rw [hOcc] at member
      obtain ⟨unbegun, free, instance_⟩ := facts occurrence member same
      refine ⟨unbegun, by rw [hItems]; exact free, fun present => ?_⟩
      rw [ids] at present
      rcases List.mem_append.mp present with old | new
      · rw [instances _ old, instances _ (formed.owned.occurrenceScopes occurrence member)]
        exact instance_ old
      · have issuedScope := formed.claimed.scopesIssued request ((queuedEq request).mp queued)
        rw [List.mem_singleton.mp new, entryId] at issuedScope
        exact absurd issuedScope (Nat.lt_irrefl _),
    fun first second pair => by
      rw [hSignals] at pair
      exact formed.claimed.signalsApart first second pair,
    fun first second pair => by
      rw [hTokens] at pair
      exact formed.claimed.tokensApart first second pair,
    fun first second signal token => by
      rw [hSignals] at signal
      rw [hTokens] at token
      exact formed.claimed.queuesApart first second signal token,
    fun request id leave writes rule queued named => by
      rw [hSignals]
      exact formed.claimed.uncompleted request id leave writes rule ((queuedEq request).mp queued) named,
    fun request queued => by
      rw [hNext]
      exact Nat.lt_succ_of_lt (formed.claimed.scopesIssued request ((queuedEq request).mp queued)),
    fun request queued id named occurrence member => by
      rw [hOcc] at member
      exact formed.claimed.innerPlaced request ((queuedEq request).mp queued) id named occurrence member⟩
  exact ⟨issued, distinct, by simpa [StartedOnce, startsEq] using formed.startedOnce,
    ⟨by rw [enters.activations]; exact formed.activations.keys,
      by rw [enters.activations]; exact formed.activations.positive⟩,
    fun occurrence member unbegun fact started => by
      rw [hOcc] at member
      rw [startsEq] at started
      rw [keys occurrence member]
      exact formed.reservations occurrence member unbegun fact started,
    owned, rooted, variables, by
      unfold FailureRecorded
      rw [enters.failure, enters.status]
      exact formed.failure,
    queue, fun fact member => (countedEq _).mpr (formed.counted fact (startsEq ▸ member)),
    fun occurrence member => by
      rw [hOcc] at member
      rw [keys occurrence member]
      exact (countedEq _).mpr (formed.occurrencesCounted occurrence member),
    ownedBelow, claimed,
    formed.settled.transport enters.slots (by rw [hNext]; omega) (fun occurrence member _ => .inl (hOcc ▸ member))
      (fun request queued => (queuedEq request).mp queued) (fun signal member => hSignals ▸ member)
      fun found member => (members found member).imp (fun old => old) fun same => by
        rw [same, entryId]
        exact Nat.le_refl _,
    formed.attachedReserved.shrink (fun _ member => enters.openItems ▸ member) fun _ member _ => hOcc ▸ member,
    formed.typed.shrink (fun _ member => enters.openItems ▸ member) (fun _ member _ => hOcc ▸ member)
      fun _ member => hSignals ▸ member,
    formed.worked.shrink (fun _ member => enters.openItems ▸ member) (fun _ member _ => hOcc ▸ member),
    formed.roles.shrink fun _ member => hOcc ▸ member,
    formed.raises.transport (fun _ _ queued => hSignals ▸ queued) (by rw [hNext]; omega)
      (fun x present low => by
        rw [ids] at present
        rcases List.mem_append.mp present with old | new
        · exact ⟨old, instances x old⟩
        · rw [List.mem_singleton.mp new, entryId] at low
          exact absurd low (Nat.lt_irrefl _))
      (fun _ counted => (countedEq _).mpr counted) fun _ member _ => hOcc ▸ member⟩

/-- Entering a scope occurrence below one that stands, owned, if at all, by a begun occurrence running there, keeps a
state well-formed. -/
theorem enterScope_wellFormed {s : State} (formed : WellFormed program s) (element : ElementId) {parent : ScopeOccurrenceId}
    (stands : parent ∈ scopeIds s) (locals : List (String × Value)) {owner : Option Nat}
    (ownerBegun : ∀ id, owner = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = parent) :
    WellFormed program (s.enterScope element parent locals owner).1 := by
  rw [enterScope_eq]
  exact Enters.wellFormed formed ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, .same rfl⟩
    stands rfl ownerBegun

/-- No scope occurrence holds the counter's identity. -/
theorem scopes_fresh {s : State} (formed : WellFormed program s) : ∀ entry ∈ s.scopes, entry.id ≠ ⟨s.nextIssue⟩ :=
  fun entry inside same => by
    have := formed.issued.scopes entry inside
    rw [same] at this
    exact Nat.lt_irrefl _ this

/-- A begun Call entering its called root below its own scope occurrence keeps a state well-formed: the root's recorded
instance names no occurrence, item or queued begin, since all were issued before it. -/
theorem enterCalled_wellFormed {s : State} (formed : WellFormed program s) (called : Program) {call : Occurrence}
    (member : call ∈ s.occurrences) (begun : call.begun = true) (variables : List (String × Value))
    (definition : DefinitionRef) : WellFormed program (s.enterCalled called call variables definition).1 := by
  rw [enterCalled_eq _ _ _ _ _ (scopes_fresh formed)]
  exact Enters.wellFormed formed ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl,
    ⟨fun _ inside => inside, fun _ inside => inside, fun _ inside => inside⟩⟩ (formed.owned.occurrenceScopes call member)
    rfl fun id named => ⟨call, member, Option.some.inj named, begun, rfl⟩

/-! ## Bare begins -/

/-- What has settled stays settled through a change that issues nothing back, keeps the occurrences and queues only
begins naming no reservation. -/
theorem Settled.bare {s t : State} {id : Nat} (settled : Settled s id) (issued : s.nextIssue ≤ t.nextIssue)
    (occurrences : t.occurrences = s.occurrences)
    (queued : ∀ request, Queued t request → Queued s request ∨ names request = []) : Settled t id := by
  obtain ⟨below, begun, unnamed⟩ := settled
  refine ⟨Nat.lt_of_lt_of_le below issued, occurrences ▸ begun, fun request named inside => ?_⟩
  rcases queued request named with old | bare
  · exact unnamed request old inside
  · rw [bare] at inside
    simp at inside

/-- A bare begin, queued, keeps what has settled. -/
theorem Settled.begin {s : State} {id : Nat} (settled : Settled s id) {request : BeginRequest}
    (bare : names request = []) : Settled (s.signal (.begin request)) id := by
  rw [signal_eq]
  refine settled.bare (Nat.le_refl _) rfl fun other named => ?_
  rcases named with signal | token
  · rcases List.mem_append.mp signal with old | new
    · exact .inl (.inl old)
    · rw [Signal.begin.inj (List.mem_singleton.mp new)]
      exact .inr bare
  · exact .inl (.inr token)

/-- Bare begins, deferred, keep what has settled. -/
theorem Settled.defer {s : State} {id : Nat} (settled : Settled s id) {requests : List BeginRequest}
    (bare : ∀ request ∈ requests, names request = []) : Settled (s.deferBegins requests) id := by
  rw [deferBegins_eq]
  refine settled.bare (Nat.le_refl _) rfl fun other named => ?_
  rcases named with signal | token
  · exact .inl (.inl signal)
  · rcases List.mem_append.mp token with old | new
    · exact .inl (.inr old)
    · exact .inr (bare other (by simpa using new))

/-- Entering a scope occurrence keeps what has settled: it issues afresh and queues nothing. -/
theorem Settled.enter {s : State} {id : Nat} (settled : Settled s id) (element : ElementId) (parent : ScopeOccurrenceId)
    (locals : List (String × Value)) (owner : Option Nat) : Settled (s.enterScope element parent locals owner).1 id := by
  rw [enterScope_eq]
  exact settled.transport (Nat.le_succ _) (fun _ member _ => .inl member) fun _ queued => queued

/-- The slots stay settled through such a change that keeps them and the scope occurrences and queues no
compensation. -/
theorem SlotsSettled.bare {s t : State} (settled : SlotsSettled s) (slots : t.slots = s.slots)
    (scopes : t.scopes = s.scopes) (issued : s.nextIssue ≤ t.nextIssue) (occurrences : t.occurrences = s.occurrences)
    (queued : ∀ request, Queued t request → Queued s request ∨ names request = [])
    (compensations : ∀ scope activity trigger leave resume, Signal.compensate scope activity trigger leave resume ∈ t.signals →
      Signal.compensate scope activity trigger leave resume ∈ s.signals)
    (raises : ∀ raised origin, Signal.raise raised origin ∈ t.signals → Signal.raise raised origin ∈ s.signals) :
    SlotsSettled t where
  parked waiting member := (settled.parked waiting (slots ▸ member)).bare issued occurrences queued
  bodies run member := (settled.bodies run (slots ▸ member)).bare issued occurrences queued
  resumed run member occurrence leave resume :=
    (settled.resumed run (slots ▸ member) occurrence leave resume).bare issued occurrences queued
  queued scope activity trigger leave occurrence resume member :=
    (settled.queued scope activity trigger leave occurrence resume
      (compensations scope activity trigger leave _ member)).bare issued occurrences queued
  placed run member := (settled.placed run (slots ▸ member)).transport issued fun _ inside => .inl (scopes ▸ inside)
  runsPlaced run member :=
    (settled.runsPlaced run (slots ▸ member)).transport issued fun _ inside => .inl (scopes ▸ inside)
  grouped scope activity trigger leave outer context member :=
    settled.grouped scope activity trigger leave outer context (compensations scope activity trigger leave _ member)
  raised raised origin host member named :=
    (settled.raised raised origin host (raises raised origin member) named).bare issued occurrences queued

/-- Queuing a bare begin in a scope occurrence that stands keeps the claims single. That the begin is no completion,
`Kernel.Proofs.Step` tells. -/
theorem signal_claimed_begin {s : State} {request : BeginRequest} (formed : WellFormed program s) (bare : names request = [])
    (stands : request.scope ∈ scopeIds s)
    (notComplete : ∀ id leave writes rule, Signal.begin request ≠ .complete id leave writes rule) :
    ReservationsClaimed (s.signal (.begin request)) := by
  rw [signal_eq]
  have queued : ∀ other, Queued { s with signals := s.signals ++ [.begin request] } other →
      Queued s other ∨ other = request := fun other named => by
    rcases named with signal | token
    · rcases List.mem_append.mp signal with old | new
      · exact .inl (.inl old)
      · exact .inr (Signal.begin.inj (List.mem_singleton.mp new))
    · exact .inl (.inr token)
  have named : ∀ other, Queued { s with signals := s.signals ++ [.begin request] } other → ∀ id ∈ names other,
      Queued s other := fun other queuedOther id inside => (queued other queuedOther).resolve_right fun same => by
    rw [same, bare] at inside
    simp at inside
  refine ⟨formed.claimed.attached, fun other queuedOther => ?_, fun first second pair id inside => ?_,
    formed.claimed.tokensApart, fun first second signal token id inside => ?_,
    fun other id leave writes rule queuedOther inside completed => ?_, fun other queuedOther => ?_,
    fun other queuedOther id inside => ?_⟩
  · rcases queued other queuedOther with old | rfl
    · exact (formed.claimed.named other old).imp id fun beginnable id inside =>
        (beginnable id inside).congr rfl rfl rfl rfl fun _ => by apply instanceOf_congr <;> rfl
    · rw [bare]
      exact ⟨List.nodup_nil, fun _ inside => by simp at inside⟩
  · by_cases same : second = request
    · rw [same, bare]
      exact List.not_mem_nil
    · exact formed.claimed.signalsApart first second (pair_of_append pair fun equal => same (Signal.begin.inj equal))
        id inside
  · rcases List.mem_append.mp signal with old | new
    · exact formed.claimed.queuesApart first second old token id inside
    · rw [Signal.begin.inj (List.mem_singleton.mp new), bare] at inside
      simp at inside
  · rcases List.mem_append.mp completed with old | new
    · exact formed.claimed.uncompleted other id leave writes rule (named other queuedOther id inside) inside old
    · exact notComplete id leave writes rule (List.mem_singleton.mp new).symm
  · rcases queued other queuedOther with old | rfl
    · exact formed.claimed.scopesIssued other old
    · obtain ⟨entry, member, named⟩ := List.mem_map.mp stands
      exact named ▸ formed.issued.scopes entry member
  · rcases queued other queuedOther with old | rfl
    · exact formed.claimed.innerPlaced other old id inside
    · have named : id ∈ names other := List.mem_append_right _ inside
      simp [bare] at named

/-- Queuing a bare begin keeps the slots settled: it claims nothing. That the begin is no compensation,
`Kernel.Proofs.Step` tells. -/
theorem signal_settled_begin {s : State} {request : BeginRequest} (formed : WellFormed program s) (bare : names request = [])
    (notCompensate : ∀ scope activity trigger leave resume,
      Signal.begin request ≠ .compensate scope activity trigger leave resume)
    (notRaise : ∀ raised origin, Signal.begin request ≠ .raise raised origin) :
    SlotsSettled (s.signal (.begin request)) := by
  rw [signal_eq]
  refine formed.settled.bare rfl rfl (Nat.le_refl _) rfl (fun other named => ?_)
    (fun scope activity trigger leave resume member => ?_) fun raised origin member => ?_
  · rcases named with signal | token
    · rcases List.mem_append.mp signal with old | new
      · exact .inl (.inl old)
      · rw [Signal.begin.inj (List.mem_singleton.mp new)]
        exact .inr bare
    · exact .inl (.inr token)
  · rcases List.mem_append.mp member with old | new
    · exact old
    · exact absurd (List.mem_singleton.mp new).symm (notCompensate scope activity trigger leave resume)
  · rcases List.mem_append.mp member with old | new
    · exact old
    · exact absurd (List.mem_singleton.mp new).symm (notRaise raised origin)

/-- Deferring bare begins, each in a scope occurrence that stands, keeps a state well-formed. -/
theorem deferBegins_wellFormed {s : State} (formed : WellFormed program s) {requests : List BeginRequest}
    (bare : ∀ request ∈ requests, names request = [] ∧ request.scope ∈ scopeIds s) :
    WellFormed program (s.deferBegins requests) := by
  rw [deferBegins_eq]
  have fresh : ∀ request, Token.begin request ∈ (requests.map Token.begin).reverse → request ∈ requests :=
    fun request member => by simpa using member
  have housed : ∀ token ∈ (requests.map Token.begin).reverse, token.busyScope ∈ scopeIds s := fun token member => by
    obtain ⟨request, inside, rfl⟩ := List.mem_map.mp (List.mem_reverse.mp member)
    rw [busyScope_begin]
    exact (bare request inside).2
  generalize (requests.map Token.begin).reverse = added at fresh housed
  have queued : ∀ request, Queued { s with tokens := s.tokens ++ added } request →
      Queued s request ∨ request ∈ requests := fun request named => by
    rcases named with signal | token
    · exact .inl (.inl signal)
    · rcases List.mem_append.mp token with old | new
      · exact .inl (.inr old)
      · exact .inr (fresh request new)
  have nameless : ∀ request ∈ requests, ∀ id, id ∉ names request := fun request inside id named => by
    rw [(bare request inside).1] at named
    simp at named
  have keys : key { s with tokens := s.tokens ++ added } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  have claimed : ReservationsClaimed { s with tokens := s.tokens ++ added } := ⟨formed.claimed.attached,
    fun request named => by
      rcases queued request named with old | new
      · exact (formed.claimed.named request old).imp id fun beginnable id inside =>
          (beginnable id inside).congr rfl rfl rfl rfl fun _ => by apply instanceOf_congr <;> rfl
      · rw [(bare request new).1]
        exact ⟨List.nodup_nil, fun _ inside => by simp at inside⟩,
    formed.claimed.signalsApart,
    fun first second pair id inside => by
      by_cases late : second ∈ requests
      · exact nameless second late id
      · have early : first ∉ requests := fun named => nameless first named id inside
        exact formed.claimed.tokensApart first second (pair_of_append_absent pair (fun member => early (fresh _ member))
          fun member => late (fresh _ member)) id inside,
    fun first second signal token id inside => by
      rcases List.mem_append.mp token with old | new
      · exact formed.claimed.queuesApart first second signal old id inside
      · exact nameless second (fresh second new) id,
    fun request id leave writes rule named inside => by
      rcases queued request named with old | new
      · exact formed.claimed.uncompleted request id leave writes rule old inside
      · exact absurd inside (nameless request new id),
    fun request named => by
      rcases queued request named with old | new
      · exact formed.claimed.scopesIssued request old
      · obtain ⟨entry, member, same⟩ := List.mem_map.mp (bare request new).2
        exact same ▸ formed.issued.scopes entry member,
    fun request named id inside => by
      rcases queued request named with old | new
      · exact formed.claimed.innerPlaced request old id inside
      · exact absurd (List.mem_append_right _ inside) (nameless request new id)⟩
  exact {
  issued := ⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences,
    formed.owned.attachments, formed.owned.scopeOwners, formed.owned.variableScopes, fun token member =>
      (List.mem_append.mp member).elim (formed.owned.tokenScopes token) (housed token)⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
    Within.congr (s := s) (t := { s with tokens := s.tokens ++ added }) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := formed.failure
  queue := ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends, formed.queue.completes⟩
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := claimed
  settled := formed.settled.bare rfl rfl (Nat.le_refl _) rfl (fun request named =>
    (queued request named).imp id fun new => (bare request new).1) (fun _ _ _ _ _ member => member)
    fun _ _ member => member
  attachedReserved := formed.attachedReserved
  typed := formed.typed
  worked := formed.worked
  roles := formed.roles
  raises := formed.raises.same rfl rfl rfl (instanceOf_congr rfl rfl) rfl rfl }

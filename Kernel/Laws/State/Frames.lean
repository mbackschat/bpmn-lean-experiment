module

public import Kernel.Laws.State.Invariant

/-! # Laws of the kernel state: frames

What `WellFormed` keeps through a change of the fields it reads, stated over the fields alone: the phases of `Step` that
only drop or reorder entries (`Narrows`), a change of status and failure, and the clearing of a scope occurrence
(`Cleared`), which `Kernel.Laws.State` shows `State.clearInside` makes. A frame states what an operation does to the
process instance of the scope occurrences that stand (`State.instanceOf`), since keys read it and this module reads no
body; `Kernel.Laws.State` proves it of each operation. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## Keys, counters and claims -/

/-- An occurrence whose scope occurrence keeps its process instance keeps its key. -/
theorem key_congr {before after : State} {occurrence : Occurrence}
    (same : after.instanceOf occurrence.scope = before.instanceOf occurrence.scope) : key after occurrence = key before occurrence := by
  simp [key, same]

theorem Counted.congr {before after : State} (same : after.activations = before.activations) {k : OccurrenceKey}
    (counted : Counted before k) : Counted after k := by
  simpa [Counted, same] using counted

/-- The claims stay single through a change that adds no item, occurrence, queued begin or completion, issues
nothing back and keeps the process instance of what stands. -/
theorem ReservationsClaimed.shrink {before after : State} (claimed : ReservationsClaimed before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence ∈ before.occurrences)
    (housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after)
    (scopes : ∀ x ∈ scopeIds after, x ∈ scopeIds before)
    (instances : ∀ x ∈ scopeIds after, after.instanceOf x = before.instanceOf x)
    (issued : before.nextIssue ≤ after.nextIssue)
    (signals : after.signals.Sublist before.signals) (tokens : after.tokens.Sublist before.tokens) :
    ReservationsClaimed after where
  attached item member attached reserved other inside same :=
    have ⟨found, held, rest⟩ := reserved
    claimed.attached item (items item member) attached ⟨found, occurrences found held, rest⟩ other (items other inside) same
  named request queued := by
    obtain ⟨nodup, beginnable⟩ := claimed.named request (queued.shrink signals tokens)
    refine ⟨nodup, fun id named => ?_⟩
    obtain ⟨below, facts⟩ := beginnable id named
    refine ⟨Nat.lt_of_lt_of_le below issued, fun occurrence member same => ?_⟩
    obtain ⟨unbegun, free, instance_⟩ := facts occurrence (occurrences occurrence member) same
    refine ⟨unbegun, fun item inside => free item (items item inside), fun present => ?_⟩
    rw [instances _ present, instances _ (housed occurrence member)]
    exact instance_ (scopes _ present)
  signalsApart first second pair := claimed.signalsApart first second (List.Sublist.trans pair signals)
  tokensApart first second pair := claimed.tokensApart first second (List.Sublist.trans pair tokens)
  queuesApart first second signal token :=
    claimed.queuesApart first second (signals.subset signal) (tokens.subset token)
  uncompleted request id leave writes rule queued named completed :=
    claimed.uncompleted request id leave writes rule (queued.shrink signals tokens) named (signals.subset completed)
  scopesIssued request queued := Nat.lt_of_lt_of_le (claimed.scopesIssued request (queued.shrink signals tokens)) issued

/-- `after`'s slots hold no join wait, Multi-Instance body or compensation run `before`'s do not. -/
structure SlotsWithin (before after : State) : Prop where
  parked : ∀ waiting ∈ after.slots.parked, waiting ∈ before.slots.parked
  bodies : ∀ run ∈ after.slots.multiInstances, run ∈ before.slots.multiInstances
  runs : ∀ run ∈ after.slots.compensation.runs, run ∈ before.slots.compensation.runs

theorem SlotsWithin.same {before after : State} (same : after.slots = before.slots) : SlotsWithin before after :=
  ⟨fun _ member => same ▸ member, fun _ member => same ▸ member, fun _ member => same ▸ member⟩

/-- A begun occurrence stays settled through a change that issues nothing back, adds no unbegun occurrence it issued
before and queues no begin. -/
theorem Settled.transport {before after : State} {id : Nat} (settled : Settled before id)
    (issued : before.nextIssue ≤ after.nextIssue)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false →
      occurrence ∈ before.occurrences ∨ before.nextIssue ≤ occurrence.id)
    (queued : ∀ request, Queued after request → Queued before request) : Settled after id := by
  obtain ⟨below, begun, unnamed⟩ := settled
  refine ⟨Nat.lt_of_lt_of_le below issued, fun occurrence member same => ?_, fun request named =>
    unnamed request (queued request named)⟩
  cases flag : occurrence.begun
  · rcases occurrences occurrence member flag with old | fresh
    · simpa [flag] using begun occurrence old same
    · omega
  · rfl

/-- A run stays placed through a change that issues nothing back and adds only scope occurrences it issues. -/
theorem Placed.transport {before after : State} {run : MultiInstanceRun} (placed : Placed before run)
    (issued : before.nextIssue ≤ after.nextIssue)
    (scopes : ∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ before.nextIssue ≤ entry.id.value) : Placed after run :=
  fun scope active => by
    obtain ⟨below, parent⟩ := placed scope active
    refine ⟨Nat.lt_of_lt_of_le below issued, fun entry member named => ?_⟩
    rcases scopes entry member with old | fresh
    · exact parent entry old named
    · rw [named] at fresh
      omega

/-- The slots stay settled through such a change that adds no slot entry, queues no compensation and adds only scope
occurrences it issues. -/
theorem SlotsSettled.transport {before after : State} (settled : SlotsSettled before) (slots : SlotsWithin before after)
    (issued : before.nextIssue ≤ after.nextIssue)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false →
      occurrence ∈ before.occurrences ∨ before.nextIssue ≤ occurrence.id)
    (queued : ∀ request, Queued after request → Queued before request)
    (signals : ∀ signal ∈ after.signals, signal ∈ before.signals)
    (scopes : ∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ before.nextIssue ≤ entry.id.value) : SlotsSettled after where
  parked waiting member := (settled.parked waiting (slots.parked waiting member)).transport issued occurrences queued
  bodies run member := (settled.bodies run (slots.bodies run member)).transport issued occurrences queued
  resumed run member occurrence leave resume :=
    (settled.resumed run (slots.runs run member) occurrence leave resume).transport issued occurrences queued
  queued scope activity trigger leave occurrence resume member :=
    (settled.queued scope activity trigger leave occurrence resume (signals _ member)).transport issued occurrences queued
  placed run member := (settled.placed run (slots.bodies run member)).transport issued scopes

/-! ## Process instances

`State.instanceOf` reads a scope occurrence's process instance up its parent chain: the nearest called root's, else the
instance's own. `InstanceIn s x name chain` states that reading over the fields, with the chain of scope occurrences
it visits, so a frame that keeps the chain of a standing scope occurrence keeps its process instance
(`Laws.State.instanceOf_eq` evaluates it). -/

theorem Within.trans {s : State} {a b c : ScopeOccurrenceId} (first : Within s a b) (second : Within s b c) :
    Within s a c := by
  induction first with
  | refl => exact second
  | parent child parent _ member link _ ih => exact .parent child parent c member link (ih second)

inductive InstanceIn (s : State) : ScopeOccurrenceId → String → List ScopeOccurrence → Prop where
  | called (entry : ScopeOccurrence) (name : String) : entry ∈ s.scopes → entry.calledInstance = some name →
      InstanceIn s entry.id name [entry]
  | up (entry : ScopeOccurrence) (parent : ScopeOccurrenceId) (name : String) (chain : List ScopeOccurrence) :
      entry ∈ s.scopes → entry.calledInstance = none → entry.parent = some parent → InstanceIn s parent name chain →
      InstanceIn s entry.id name (entry :: chain)
  | root (entry : ScopeOccurrence) : entry ∈ s.scopes → entry.calledInstance = none → entry.parent = none →
      InstanceIn s entry.id s.instanceId [entry]

theorem InstanceIn.mem {s : State} {x : ScopeOccurrenceId} {name : String} {chain : List ScopeOccurrence}
    (reading : InstanceIn s x name chain) : ∀ entry ∈ chain, entry ∈ s.scopes := by
  induction reading with
  | called entry _ member _ => simpa using member
  | up entry _ _ _ member _ _ _ ih =>
    intro other inside
    rcases List.mem_cons.mp inside with rfl | later
    · exact member
    · exact ih other later
  | root entry member _ _ => simpa using member

/-- A state holding the chain, of the same instance, reads the same process instance. -/
theorem InstanceIn.transport {s t : State} {x : ScopeOccurrenceId} {name : String} {chain : List ScopeOccurrence}
    (reading : InstanceIn s x name chain) (held : ∀ entry ∈ chain, entry ∈ t.scopes) (same : t.instanceId = s.instanceId) :
    InstanceIn t x name chain := by
  induction reading with
  | called entry name _ called => exact .called entry name (held entry (by simp)) called
  | up entry parent name chain _ uncalled link _ ih =>
    exact .up entry parent name chain (held entry (by simp)) uncalled link (ih fun other inside => held other (by simp [inside]))
  | root entry _ uncalled parentless => exact same ▸ .root entry (held entry (by simp)) uncalled parentless

/-- Every scope occurrence of a well-formed state reads a process instance, up a chain of distinct scope occurrences it
lies within. -/
theorem instanceIn_exists {s : State} (formed : WellFormed program s) {x : ScopeOccurrenceId} (present : x ∈ scopeIds s) :
    ∃ name chain, InstanceIn s x name chain ∧ (chain.map (·.id)).Nodup ∧ ∀ entry ∈ chain, Within s x entry.id := by
  obtain ⟨entry, member, named⟩ := List.mem_map.mp present
  have reach := named ▸ formed.rooted.2.2 entry member
  clear named member entry present
  generalize rooted : State.root = root at reach
  induction reach with
  | refl =>
    subst rooted
    obtain ⟨entry, member, named⟩ := List.mem_map.mp formed.rooted.1
    have parentless := (formed.rooted.2.1 entry member).mpr named
    rw [← named]
    cases called : entry.calledInstance with
    | none => exact ⟨_, _, InstanceIn.root entry member called parentless, by simp, by simp; exact .refl _⟩
    | some name => exact ⟨_, _, InstanceIn.called entry name member called, by simp, by simp; exact .refl _⟩
  | parent child parent _ member link _ ih =>
    obtain ⟨name, chain, reading, rest⟩ := ih rooted
    obtain ⟨nodup, within⟩ := rest
    cases called : child.calledInstance with
    | some name => exact ⟨_, _, InstanceIn.called child name member called, by simp, by simp; exact .refl _⟩
    | none =>
      refine ⟨name, child :: chain, .up child parent name chain member called link reading, ?_, ?_⟩
      · refine List.nodup_cons.mpr ⟨fun inside => ?_, nodup⟩
        obtain ⟨other, otherInside, same⟩ := List.mem_map.mp inside
        have := within other otherInside
        simp only at same
        rw [same] at this
        exact parent_not_within formed member link this
      · intro other inside
        rcases List.mem_cons.mp inside with rfl | later
        · exact .refl _
        · exact .parent child parent _ member link (within other later)

/-- `Beginnable` reads the counter, the occurrences, the items, the scope occurrences and their process instances. -/
theorem Beginnable.congr {before after : State} {scope : ScopeOccurrenceId} {id : Nat} (beginnable : Beginnable before scope id)
    (issued : after.nextIssue = before.nextIssue) (occurrences : after.occurrences = before.occurrences)
    (items : after.openItems = before.openItems) (scopes : after.scopes = before.scopes)
    (instances : ∀ x, after.instanceOf x = before.instanceOf x) : Beginnable after scope id := by
  obtain ⟨below, facts⟩ := beginnable
  refine ⟨issued ▸ below, fun occurrence member same => ?_⟩
  obtain ⟨unbegun, free, instance_⟩ := facts occurrence (occurrences ▸ member) same
  refine ⟨unbegun, items ▸ free, fun present => ?_⟩
  rw [instances, instances]
  exact instance_ (by simpa [scopeIds, scopes] using present)

/-! ## What an open item waits on -/

/-- An occurrence stays unbegun through a change that begins none of its identity: every begun occurrence of the
identity after it was one before. -/
theorem Unbegun.transport {before after : State} {id : Nat} (unbegun : Unbegun before id)
    (begun : ∀ occurrence ∈ after.occurrences, occurrence.id = id → occurrence.begun = true →
      occurrence ∈ before.occurrences) : Unbegun after id := fun occurrence member named =>
  Bool.eq_false_iff.mpr fun flag => by simp [unbegun occurrence (begun occurrence member named flag) named] at flag

/-- What an attached item waits on stays unbegun through a change that adds no open item and begins none of what an
open item waits on. -/
theorem AttachedReserved.transport {before after : State} (reserved : AttachedReserved before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (begun : ∀ item ∈ after.openItems, ∀ occurrence ∈ after.occurrences, occurrence.id = item.occurrence →
      occurrence.begun = true → occurrence ∈ before.occurrences) : AttachedReserved after :=
  fun item member attached => (reserved item (items item member) attached).transport (begun item member)

/-- `Typed` holds through a change that adds no open item and begins none of what an open item waits on. -/
theorem Typed.transport {program : Program} {before after : State} (typed : Typed program before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (begun : ∀ item ∈ after.openItems, ∀ occurrence ∈ after.occurrences, occurrence.id = item.occurrence →
      occurrence.begun = true → occurrence ∈ before.occurrences) : Typed program after := fun item member started =>
  have ⟨unbegun, alone⟩ := typed item (items item member) started
  ⟨unbegun.transport (begun item member), fun other inside same => alone other (items other inside) same⟩

theorem AttachedReserved.shrink {before after : State} (reserved : AttachedReserved before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (begun : ∀ occurrence ∈ after.occurrences, occurrence.begun = true → occurrence ∈ before.occurrences) :
    AttachedReserved after := reserved.transport items fun _ _ occurrence member _ flag => begun occurrence member flag

theorem Typed.shrink {program : Program} {before after : State} (typed : Typed program before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (begun : ∀ occurrence ∈ after.occurrences, occurrence.begun = true → occurrence ∈ before.occurrences) :
    Typed program after := typed.transport items fun _ _ occurrence member _ flag => begun occurrence member flag

/-! ## Narrowing -/

/-- `after` holds what `before` holds, with no more open items, tokens, queued signals or start facts of the input in
progress, and no new identifier: the phases that only drop or reorder entries, and, with their variable sets changed
(`WellFormed.reshape`), the variable writes. -/
structure Narrows (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  instances : ∀ scope, after.instanceOf scope = before.instanceOf scope
  recorded : FailureRecorded before → FailureRecorded after
  openItems : after.openItems.Sublist before.openItems
  tokens : after.tokens.Sublist before.tokens
  signals : after.signals.Sublist before.signals
  starts : ∀ fact ∈ starts after, fact ∈ starts before
  slots : SlotsWithin before after

/-- A state that narrows a well-formed one is well-formed when it starts no occurrence key twice and its variable sets
belong to scope occurrences that stand, one per scope occurrence. -/
theorem WellFormed.reshape {before after : State} (formed : WellFormed program before) (narrows : Narrows before after)
    (once : StartedOnce after) (located : ∀ variables ∈ after.variables, variables.scope ∈ scopeIds after)
    (keyed : VariablesKeyed after) : WellFormed program after := by
  have keys : ∀ occurrence, key after occurrence = key before occurrence := fun _ => key_congr (narrows.instances _)
  have items := narrows.openItems.subset
  have settled := formed.settled.transport narrows.slots (Nat.le_of_eq narrows.nextIssue.symm)
    (fun _ member _ => .inl (narrows.occurrences ▸ member)) (fun _ queued => queued.shrink narrows.signals narrows.tokens)
    (fun _ member => narrows.signals.subset member) (fun _ member => .inl (narrows.scopes ▸ member))
  have queue : QueueSound after := {
    arm := fun host element scope queued => by
      simpa [narrows.nextIssue, narrows.occurrences] using formed.queue.arm host element scope (narrows.signals.subset queued)
    armScope := fun scope queued => narrows.nextIssue ▸ formed.queue.armScope scope (narrows.signals.subset queued)
    armGateway := fun occurrence gateway scope queued => by
      simpa [narrows.nextIssue, narrows.occurrences] using
        formed.queue.armGateway occurrence gateway scope (narrows.signals.subset queued)
    ends := fun status failure queued => formed.queue.ends status failure (narrows.signals.subset queued) }
  exact {
  issued := ⟨by simpa [narrows.occurrences, narrows.nextIssue] using formed.issued.occurrences,
    fun item member => narrows.nextIssue ▸ formed.issued.items item (items member),
    by simpa [narrows.scopes, narrows.nextIssue] using formed.issued.scopes⟩
  distinct := ⟨by simpa [occurrenceIds, narrows.occurrences] using formed.distinct.occurrences,
    formed.distinct.items.sublist (narrows.openItems.map _), by simpa [scopeIds, narrows.scopes] using formed.distinct.scopes,
    by rw [narrows.occurrences, funext keys]; exact formed.distinct.keys⟩
  startedOnce := once
  activations := ⟨by simpa [narrows.activations] using formed.activations.keys,
    by simpa [narrows.activations] using formed.activations.positive⟩
  reservations := fun occurrence member unbegun fact started => by
    rw [keys]
    exact formed.reservations occurrence (narrows.occurrences ▸ member) unbegun fact (narrows.starts fact started)
  owned := {
    occurrenceScopes := by simpa [scopeIds, narrows.occurrences, narrows.scopes] using formed.owned.occurrenceScopes
    itemScopes := fun item member => by
      simpa [scopeIds, narrows.scopes] using formed.owned.itemScopes item (items member)
    itemOccurrences := fun item member => by
      simpa [narrows.occurrences] using formed.owned.itemOccurrences item (items member)
    attachments := fun item member => by
      simpa [narrows.occurrences] using formed.owned.attachments item (items member)
    scopeOwners := by simpa [narrows.scopes, narrows.occurrences] using formed.owned.scopeOwners
    variableScopes := located
    tokenScopes := fun token member => by
      simpa [scopeIds, narrows.scopes] using formed.owned.tokenScopes token (narrows.tokens.subset member) }
  rooted := by
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, narrows.scopes] using present, by simpa [narrows.scopes] using parentless, ?_⟩
    intro scope member
    exact Within.congr narrows.scopes (reach scope (narrows.scopes ▸ member))
  variables := keyed
  failure := narrows.recorded formed.failure
  queue := queue
  counted := fun fact started => (formed.counted fact (narrows.starts fact started)).congr narrows.activations
  occurrencesCounted := fun occurrence member => by
    rw [keys]
    exact (formed.occurrencesCounted occurrence (narrows.occurrences ▸ member)).congr narrows.activations
  ownedBelow := by simpa [OwnedBelow, narrows.scopes, narrows.occurrences] using formed.ownedBelow
  claimed := formed.claimed.shrink (fun _ member => items member) (fun _ member => narrows.occurrences ▸ member)
    (by simpa [scopeIds, narrows.occurrences, narrows.scopes] using formed.owned.occurrenceScopes)
    (by simp [scopeIds, narrows.scopes]) (fun x _ => narrows.instances x) (Nat.le_of_eq narrows.nextIssue.symm)
    narrows.signals narrows.tokens
  settled := settled
  attachedReserved := formed.attachedReserved.shrink (fun _ member => items member)
    fun _ member _ => narrows.occurrences ▸ member
  typed := formed.typed.shrink (fun _ member => items member) fun _ member _ => narrows.occurrences ▸ member }

/-- A state that narrows a well-formed one with the same variable sets is well-formed when it starts no occurrence key
twice. -/
theorem WellFormed.narrow {before after : State} (formed : WellFormed program before) (narrows : Narrows before after)
    (variables : after.variables = before.variables) (once : StartedOnce after) : WellFormed program after :=
  formed.reshape narrows once (by simpa [scopeIds, variables, narrows.scopes] using formed.owned.variableScopes)
    ⟨by simpa [variables] using formed.variables.scopes, by simpa [variables] using formed.variables.names⟩

/-- Start facts that are a permutation of a well-formed state's, with nothing else but the journal and the draft
changed, keep it well-formed. -/
theorem WellFormed.permuted {before after : State} (formed : WellFormed program before) (narrows : Narrows before after)
    (variables : after.variables = before.variables) (perm : (starts after).Perm (starts before)) : WellFormed program after :=
  formed.narrow narrows variables ((perm.map _).nodup_iff.mpr formed.startedOnce)

/-- A well-formed state with its status and failure changed together stays well-formed; changing them keeps every
process instance (`Laws.State`). -/
theorem WellFormed.withStatus {s : State} (formed : WellFormed program s) {status : InstanceStatus}
    {failure : Option InstanceFailure} (instances : ∀ scope, { s with status, failure }.instanceOf scope = s.instanceOf scope)
    (recorded : failure.isSome = true ↔ status = .failed) : WellFormed program { s with status, failure } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, instances, fun _ => recorded, .refl _, .refl _, .refl _, fun _ => id, .same rfl⟩ rfl
    formed.startedOnce

/-- What `WellFormed` reads besides the variable sets: `setVariable` and `removeVariable` keep all of it. -/
structure SameButVariables (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  occurrences : after.occurrences = before.occurrences
  openItems : after.openItems = before.openItems
  tokens : after.tokens = before.tokens
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  journal : after.journal = before.journal
  draft : after.draft = before.draft
  status : after.status = before.status
  failure : after.failure = before.failure
  signals : after.signals = before.signals
  instances : ∀ scope, after.instanceOf scope = before.instanceOf scope
  slots : after.slots = before.slots

/-- A state that differs from a well-formed one only in its variable sets is well-formed when every set belongs to a
present scope occurrence and the sets stay keyed. -/
theorem WellFormed.ofVariables {before after : State} (formed : WellFormed program before) (same : SameButVariables before after)
    (located : ∀ variables ∈ after.variables, variables.scope ∈ scopeIds after) (keyed : VariablesKeyed after) :
    WellFormed program after :=
  formed.reshape ⟨same.scopes, same.occurrences, same.activations, same.nextIssue, same.instances,
    by simp [FailureRecorded, same.failure, same.status], by rw [same.openItems]; exact .refl _,
    by rw [same.tokens]; exact .refl _, by rw [same.signals]; exact .refl _,
    by simp [starts, same.journal, same.draft], .same same.slots⟩
    (by simpa [StartedOnce, starts, same.journal, same.draft] using formed.startedOnce) located keyed

/-! ## Clearing a scope occurrence -/

/-- What `State.clearInside before scope keep` leaves of `before`, read through the scope tree: the scope occurrences
and variable sets not strictly within `scope`, the occurrences, open items and tokens not within it but those of the
kept occurrences, and everything else as it was but the draft's end and cancelled facts; what stands keeps its process
instance. P3's cancellation lane and the phases that clear (`Step.endInstance`, `State.leaveScope`) build on it. -/
structure Cleared (before after : State) (scope : ScopeOccurrenceId) (keep : List Nat) : Prop where
  scopes : ∀ entry, entry ∈ after.scopes ↔ entry ∈ before.scopes ∧ ¬ StrictlyWithin before entry.id scope
  occurrences : ∀ occurrence, occurrence ∈ after.occurrences ↔
    occurrence ∈ before.occurrences ∧ (¬ Within before occurrence.scope scope ∨ occurrence.id ∈ keep)
  openItems : ∀ item, item ∈ after.openItems ↔
    item ∈ before.openItems ∧ (¬ Within before item.scope scope ∨ item.occurrence ∈ keep)
  tokens : ∀ token, token ∈ after.tokens ↔ token ∈ before.tokens ∧ ¬ Within before token.busyScope scope
  variables : ∀ variables, variables ∈ after.variables ↔
    variables ∈ before.variables ∧ ¬ StrictlyWithin before variables.scope scope
  scopesSublist : after.scopes.Sublist before.scopes
  occurrencesSublist : after.occurrences.Sublist before.occurrences
  openItemsSublist : after.openItems.Sublist before.openItems
  tokensSublist : after.tokens.Sublist before.tokens
  variablesSublist : after.variables.Sublist before.variables
  instances : ∀ x ∈ scopeIds after, after.instanceOf x = before.instanceOf x
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  signals : after.signals = before.signals
  status : after.status = before.status
  failure : after.failure = before.failure
  journal : after.journal = before.journal
  started : after.draft.started = before.draft.started
  slots : SlotsWithin before after

/-- A scope occurrence that lies within `State.root` and not strictly within a cleared `scope` still does after the
clearing: nothing on its way up lies strictly within `scope`, or it would itself. -/
private theorem Cleared.reaches {before after : State} {scope : ScopeOccurrenceId} {keep : List Nat}
    (formed : WellFormed program before) (cleared : Cleared before after scope keep) {x : ScopeOccurrenceId}
    (within : Within before x State.root) : ¬ StrictlyWithin before x scope → Within after x State.root := by
  generalize rooted : State.root = root at within
  induction within with
  | refl => intro _; subst rooted; exact .refl _
  | parent child parent _ member link _ ih =>
    intro outside
    refine .parent child parent _ ((cleared.scopes child).mpr ⟨member, outside⟩) link (ih rooted fun ⟨inside, other⟩ => ?_)
    have childInside : Within before child.id scope := .parent child parent scope member link inside
    have same : child.id = scope := Classical.byContradiction fun distinct => outside ⟨childInside, distinct⟩
    exact parent_not_within formed member link (same ▸ inside)

/-- A cleared well-formed state is well-formed when every occurrence the clearing keeps lies in no scope occurrence
strictly within the cleared one, and every open item the clearing leaves hangs on an occurrence it leaves. -/
theorem Cleared.wellFormed {before after : State} {scope : ScopeOccurrenceId} {keep : List Nat} (formed : WellFormed program before)
    (cleared : Cleared before after scope keep) (present : scope ∈ scopeIds before)
    (kept : ∀ occurrence ∈ before.occurrences, occurrence.id ∈ keep → ¬ StrictlyWithin before occurrence.scope scope)
    (attached : ∀ item ∈ before.openItems, (¬ Within before item.scope scope ∨ item.occurrence ∈ keep) → ∀ host,
      item.attachedTo = some host → ∀ occurrence ∈ before.occurrences, occurrence.id = host →
        ¬ Within before occurrence.scope scope ∨ host ∈ keep) :
    WellFormed program after := by
  have sameStarts : starts after = starts before := by simp [starts, cleared.journal, cleared.started]
  -- A scope occurrence of `before` that is no strict descendant of `scope` stands after the clearing.
  have stays : ∀ id, id ∈ scopeIds before → ¬ StrictlyWithin before id scope → id ∈ scopeIds after := fun id member outside => by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    exact List.mem_map.mpr ⟨entry, (cleared.scopes entry).mpr ⟨inside, named ▸ outside⟩, named⟩
  have notStrict : ∀ id, ¬ Within before id scope → ¬ StrictlyWithin before id scope := fun _ outside strict =>
    outside strict.1
  -- An occurrence of `before` that the clearing leaves lies in a scope occurrence that stands.
  have occurrenceStays : ∀ occurrence ∈ before.occurrences, (¬ Within before occurrence.scope scope ∨ occurrence.id ∈ keep) →
      occurrence.scope ∈ scopeIds after := fun occurrence member left => by
    refine stays _ (formed.owned.occurrenceScopes occurrence member) ?_
    rcases left with outside | keeps
    · exact notStrict _ outside
    · exact kept occurrence member keeps
  have housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after := fun occurrence member => by
    obtain ⟨old, left⟩ := (cleared.occurrences occurrence).mp member
    exact occurrenceStays occurrence old left
  have keys : ∀ occurrence ∈ after.occurrences, key after occurrence = key before occurrence := fun occurrence member =>
    key_congr (cleared.instances _ (housed occurrence member))
  constructor
  · exact ⟨fun occurrence member => cleared.nextIssue ▸ formed.issued.occurrences occurrence
        (cleared.occurrencesSublist.subset member),
      fun item member => cleared.nextIssue ▸ formed.issued.items item (cleared.openItemsSublist.subset member),
      fun entry member => cleared.nextIssue ▸ formed.issued.scopes entry (cleared.scopesSublist.subset member)⟩
  · refine ⟨formed.distinct.occurrences.sublist (cleared.occurrencesSublist.map _),
      formed.distinct.items.sublist (cleared.openItemsSublist.map _),
      formed.distinct.scopes.sublist (cleared.scopesSublist.map _), ?_⟩
    rw [List.map_congr_left keys]
    exact formed.distinct.keys.sublist (cleared.occurrencesSublist.map _)
  · have once := formed.startedOnce
    unfold StartedOnce at once ⊢
    rw [sameStarts]
    exact once
  · exact ⟨cleared.activations ▸ formed.activations.keys, cleared.activations ▸ formed.activations.positive⟩
  · intro occurrence member unbegun fact started
    rw [keys occurrence member]
    exact formed.reservations occurrence (cleared.occurrencesSublist.subset member) unbegun fact
      (show fact ∈ starts before from sameStarts ▸ started)
  · constructor
    · exact housed
    · intro item member
      obtain ⟨old, left⟩ := (cleared.openItems item).mp member
      obtain ⟨occurrence, inside, facts⟩ := formed.owned.itemOccurrences item old
      obtain ⟨named, _, placed⟩ := facts
      rw [← placed]
      refine occurrenceStays occurrence inside ?_
      rcases left with outside | keeps
      · exact .inl (placed ▸ outside)
      · exact .inr (named ▸ keeps)
    · intro item member
      obtain ⟨old, left⟩ := (cleared.openItems item).mp member
      obtain ⟨occurrence, inside, facts⟩ := formed.owned.itemOccurrences item old
      obtain ⟨named, element, placed⟩ := facts
      refine ⟨occurrence, (cleared.occurrences occurrence).mpr ⟨inside, ?_⟩, named, element, placed⟩
      rcases left with outside | keeps
      · exact .inl (placed ▸ outside)
      · exact .inr (named ▸ keeps)
    · intro item member host link
      obtain ⟨old, left⟩ := (cleared.openItems item).mp member
      obtain ⟨occurrence, inside, named, facts⟩ := formed.owned.attachments item old host link
      exact ⟨occurrence, (cleared.occurrences occurrence).mpr
        ⟨inside, named ▸ attached item old left host link occurrence inside named⟩, named, facts⟩
    · intro entry member owner owned
      obtain ⟨old, outside⟩ := (cleared.scopes entry).mp member
      obtain ⟨occurrence, inside, named, begun⟩ := formed.owned.scopeOwners entry old owner owned
      refine ⟨occurrence, (cleared.occurrences occurrence).mpr ⟨inside, ?_⟩, named, begun⟩
      by_cases keeps : occurrence.id ∈ keep
      · exact .inr keeps
      · refine .inl fun within => ?_
        have link := formed.ownedBelow entry old occurrence inside (named ▸ owned)
        have entryInside : Within before entry.id scope := .parent entry occurrence.scope scope old link within
        have same : entry.id = scope := Classical.byContradiction fun distinct => outside ⟨entryInside, distinct⟩
        exact parent_not_within formed old link (same ▸ within)
    · intro variables member
      obtain ⟨old, outside⟩ := (cleared.variables variables).mp member
      exact stays _ (formed.owned.variableScopes variables old) outside
    · intro token member
      obtain ⟨old, outside⟩ := (cleared.tokens token).mp member
      exact stays _ (formed.owned.tokenScopes token old) (notStrict _ outside)
  · obtain ⟨rootPresent, parentless, reach⟩ := formed.rooted
    obtain ⟨scopeEntry, scopeInside, scopeNamed⟩ := List.mem_map.mp present
    refine ⟨stays _ rootPresent fun ⟨inside, distinct⟩ => distinct (Within.antisymm formed rootPresent inside
      (scopeNamed ▸ reach scopeEntry scopeInside)), fun entry member => parentless entry
      (cleared.scopesSublist.subset member), fun entry member => ?_⟩
    obtain ⟨old, outside⟩ := (cleared.scopes entry).mp member
    exact cleared.reaches formed (reach entry old) outside
  · exact ⟨formed.variables.scopes.sublist (cleared.variablesSublist.map _),
      fun variables member => formed.variables.names variables (cleared.variablesSublist.subset member)⟩
  · simpa [FailureRecorded, cleared.status, cleared.failure] using formed.failure
  · obtain ⟨arm, armScope, armGateway, ends⟩ := formed.queue
    refine ⟨fun host element scope queued => ?_, by simpa [cleared.signals, cleared.nextIssue] using armScope,
      fun occurrence gateway scope queued => ?_, by simpa [cleared.signals] using ends⟩
    · obtain ⟨host_, scope_, facts⟩ := arm host element scope (cleared.signals ▸ queued)
      exact ⟨cleared.nextIssue ▸ host_, cleared.nextIssue ▸ scope_,
        fun found member => facts found (cleared.occurrencesSublist.subset member)⟩
    · obtain ⟨occurrence_, scope_, facts⟩ := armGateway occurrence gateway scope (cleared.signals ▸ queued)
      exact ⟨cleared.nextIssue ▸ occurrence_, cleared.nextIssue ▸ scope_,
        fun found member => facts found (cleared.occurrencesSublist.subset member)⟩
  · intro fact started
    exact (formed.counted fact (show fact ∈ starts before from sameStarts ▸ started)).congr cleared.activations
  · intro occurrence member
    rw [keys occurrence member]
    exact (formed.occurrencesCounted occurrence (cleared.occurrencesSublist.subset member)).congr cleared.activations
  · intro entry member occurrence inside owned
    exact formed.ownedBelow entry (cleared.scopesSublist.subset member) occurrence
      (cleared.occurrencesSublist.subset inside) owned
  · exact formed.claimed.shrink (fun _ member => cleared.openItemsSublist.subset member)
      (fun _ member => cleared.occurrencesSublist.subset member) housed
      (fun x member => by
        obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
        exact List.mem_map.mpr ⟨entry, cleared.scopesSublist.subset inside, named⟩)
      cleared.instances (Nat.le_of_eq cleared.nextIssue.symm) (by rw [cleared.signals]; exact .refl _) cleared.tokensSublist
  · exact formed.settled.transport cleared.slots (Nat.le_of_eq cleared.nextIssue.symm)
      (fun _ member _ => .inl (cleared.occurrencesSublist.subset member))
      (fun _ queued => queued.shrink (by rw [cleared.signals]; exact .refl _) cleared.tokensSublist)
      (fun _ member => cleared.signals ▸ member) (fun _ member => .inl (cleared.scopesSublist.subset member))
  · exact formed.attachedReserved.shrink (fun _ member => cleared.openItemsSublist.subset member)
      fun _ member _ => cleared.occurrencesSublist.subset member
  · exact formed.typed.shrink (fun _ member => cleared.openItemsSublist.subset member)
      fun _ member _ => cleared.occurrencesSublist.subset member

/-! ## Pruning occurrences and items -/

/-- `after` holds `before` with some occurrences and open items removed and nothing else `WellFormed` reads changed,
and every item that stays waits for and hangs on occurrences that stay, as every scope occurrence's owner stays:
`State.disarm`, and the removal of an occurrence record nothing refers to. -/
structure Prunes (before after : State) : Prop where
  scopes : after.scopes = before.scopes
  instances : ∀ x, after.instanceOf x = before.instanceOf x
  occurrences : after.occurrences.Sublist before.occurrences
  openItems : after.openItems.Sublist before.openItems
  tokens : after.tokens = before.tokens
  signals : after.signals = before.signals
  variables : after.variables = before.variables
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  journal : after.journal = before.journal
  started : after.draft.started = before.draft.started
  status : after.status = before.status
  failure : after.failure = before.failure
  slots : after.slots = before.slots
  waited : ∀ item ∈ after.openItems, ∀ occurrence ∈ before.occurrences,
    (occurrence.id = item.occurrence ∨ item.attachedTo = some occurrence.id) → occurrence ∈ after.occurrences
  owners : ∀ entry ∈ after.scopes, ∀ occurrence ∈ before.occurrences, entry.occurrence = some occurrence.id →
    occurrence ∈ after.occurrences

theorem Prunes.wellFormed {before after : State} (formed : WellFormed program before) (prunes : Prunes before after) :
    WellFormed program after := by
  have keys : ∀ occurrence, key after occurrence = key before occurrence := fun _ => key_congr (prunes.instances _)
  have sameStarts : starts after = starts before := by simp [starts, prunes.journal, prunes.started]
  have kept := prunes.occurrences.subset
  have items := prunes.openItems.subset
  have housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after := fun occurrence member => by
    simpa [scopeIds, prunes.scopes] using formed.owned.occurrenceScopes occurrence (kept member)
  refine ⟨?issued, ?distinct, ?startedOnce, ?activations, ?reservations, ?owned, ?rooted, ?variables,
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled, ?attachedReserved, ?typed⟩
  case issued =>
    exact ⟨fun occurrence member => prunes.nextIssue ▸ formed.issued.occurrences occurrence (kept member),
      fun item member => prunes.nextIssue ▸ formed.issued.items item (items member),
      by simpa [prunes.scopes, prunes.nextIssue] using formed.issued.scopes⟩
  case distinct =>
    refine ⟨formed.distinct.occurrences.sublist (prunes.occurrences.map _),
      formed.distinct.items.sublist (prunes.openItems.map _), by simpa [scopeIds, prunes.scopes] using formed.distinct.scopes,
      ?_⟩
    rw [funext keys]
    exact formed.distinct.keys.sublist (prunes.occurrences.map _)
  case startedOnce => simpa [StartedOnce, sameStarts] using formed.startedOnce
  case activations => exact ⟨prunes.activations ▸ formed.activations.keys, prunes.activations ▸ formed.activations.positive⟩
  case reservations =>
    intro occurrence member unbegun fact started
    rw [keys]
    exact formed.reservations occurrence (kept member) unbegun fact (sameStarts ▸ started)
  case owned =>
    refine ⟨housed, fun item member => ?_, fun item member => ?_, fun item member host attached => ?_,
      fun entry member owner owned => ?_, ?_, ?_⟩
    · simpa [scopeIds, prunes.scopes] using formed.owned.itemScopes item (items member)
    · obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.itemOccurrences item (items member)
      exact ⟨occurrence, prunes.waited item member occurrence inside (.inl named), named, rest⟩
    · obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.attachments item (items member) host attached
      exact ⟨occurrence, prunes.waited item member occurrence inside (.inr (named ▸ attached)), named, rest⟩
    · obtain ⟨occurrence, inside, named, begunFlag⟩ :=
        formed.owned.scopeOwners entry (prunes.scopes ▸ member) owner owned
      exact ⟨occurrence, prunes.owners entry member occurrence inside (named ▸ owned), named, begunFlag⟩
    · simpa [scopeIds, prunes.variables, prunes.scopes] using formed.owned.variableScopes
    · simpa [scopeIds, prunes.tokens, prunes.scopes] using formed.owned.tokenScopes
  case rooted =>
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, prunes.scopes] using present, by simpa [prunes.scopes] using parentless, ?_⟩
    intro x member
    exact Within.congr prunes.scopes (reach x (prunes.scopes ▸ member))
  case variables =>
    exact ⟨by simpa [prunes.variables] using formed.variables.scopes,
      by simpa [prunes.variables] using formed.variables.names⟩
  case failure => simpa [FailureRecorded, prunes.failure, prunes.status] using formed.failure
  case queue =>
    obtain ⟨arm, armScope, armGateway, ends⟩ := formed.queue
    refine ⟨fun host element scope queued => ?_, by simpa [prunes.signals, prunes.nextIssue] using armScope,
      fun occurrence gateway scope queued => ?_, by simpa [prunes.signals] using ends⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := arm host element scope (prunes.signals ▸ queued)
      exact ⟨prunes.nextIssue ▸ hostBelow, prunes.nextIssue ▸ scopeBelow, fun found member => facts found (kept member)⟩
    · obtain ⟨below, scopeBelow, facts⟩ := armGateway occurrence gateway scope (prunes.signals ▸ queued)
      exact ⟨prunes.nextIssue ▸ below, prunes.nextIssue ▸ scopeBelow, fun found member => facts found (kept member)⟩
  case counted =>
    exact fun fact started => (formed.counted fact (sameStarts ▸ started)).congr prunes.activations
  case occurrencesCounted =>
    intro occurrence member
    rw [keys]
    exact (formed.occurrencesCounted occurrence (kept member)).congr prunes.activations
  case ownedBelow =>
    exact fun entry member occurrence inside owned =>
      formed.ownedBelow entry (prunes.scopes ▸ member) occurrence (kept inside) owned
  case claimed =>
    exact formed.claimed.shrink (fun _ member => items member) (fun _ member => kept member) housed
      (by simp [scopeIds, prunes.scopes]) (fun x _ => prunes.instances x) (Nat.le_of_eq prunes.nextIssue.symm)
      (by rw [prunes.signals]; exact .refl _) (by rw [prunes.tokens]; exact .refl _)
  case settled =>
    exact formed.settled.transport (.same prunes.slots) (Nat.le_of_eq prunes.nextIssue.symm)
      (fun _ member _ => .inl (kept member))
      (fun _ queued => queued.shrink (by rw [prunes.signals]; exact .refl _) (by rw [prunes.tokens]; exact .refl _))
      (fun _ member => prunes.signals ▸ member) (fun _ member => .inl (prunes.scopes ▸ member))
  case attachedReserved => exact formed.attachedReserved.shrink (fun _ member => items member) fun _ member _ => kept member
  case typed => exact formed.typed.shrink (fun _ member => items member) fun _ member _ => kept member

/-- `s` without the occurrence record `id`: what `State.removeOccurrence` removes first. -/
def withoutRecord (s : State) (id : Nat) : State := { s with occurrences := s.occurrences.filter (·.id != id) }

/-! ## Leaving a scope occurrence -/

/-- What `State.leaveScope before scope` leaves of `before`, read through the scope tree: what does not lie within
`scope`, which goes with everything inside it, and everything else as it was but the draft's end and cancelled facts;
what stands keeps its process instance. `State.removeOccurrence` leaves the scope occurrences the removed occurrence
owns. -/
structure Left (before after : State) (scope : ScopeOccurrenceId) : Prop where
  scopes : ∀ entry, entry ∈ after.scopes ↔ entry ∈ before.scopes ∧ ¬ Within before entry.id scope
  occurrences : ∀ occurrence, occurrence ∈ after.occurrences ↔
    occurrence ∈ before.occurrences ∧ ¬ Within before occurrence.scope scope
  openItems : ∀ item, item ∈ after.openItems ↔ item ∈ before.openItems ∧ ¬ Within before item.scope scope
  tokens : ∀ token, token ∈ after.tokens ↔ token ∈ before.tokens ∧ ¬ Within before token.busyScope scope
  variables : ∀ variables, variables ∈ after.variables ↔
    variables ∈ before.variables ∧ ¬ Within before variables.scope scope
  scopesSublist : after.scopes.Sublist before.scopes
  occurrencesSublist : after.occurrences.Sublist before.occurrences
  openItemsSublist : after.openItems.Sublist before.openItems
  tokensSublist : after.tokens.Sublist before.tokens
  variablesSublist : after.variables.Sublist before.variables
  instances : ∀ x ∈ scopeIds after, after.instanceOf x = before.instanceOf x
  activations : after.activations = before.activations
  nextIssue : after.nextIssue = before.nextIssue
  signals : after.signals = before.signals
  status : after.status = before.status
  failure : after.failure = before.failure
  journal : after.journal = before.journal
  started : after.draft.started = before.draft.started
  slots : SlotsWithin before after

/-- A scope occurrence that lies within `State.root` and not within a left `scope` still does after leaving it:
nothing on its way up lies within `scope`, or it would itself. -/
private theorem Left.reaches {before after : State} {scope : ScopeOccurrenceId} (left : Left before after scope)
    {x : ScopeOccurrenceId} (within : Within before x State.root) : ¬ Within before x scope → Within after x State.root := by
  generalize rooted : State.root = root at within
  induction within with
  | refl => intro _; subst rooted; exact .refl _
  | parent child parent _ member link _ ih =>
    intro outside
    exact .parent child parent _ ((left.scopes child).mpr ⟨member, outside⟩) link
      (ih rooted fun inside => outside (.parent child parent scope member link inside))

/-- Leaving a present scope occurrence other than the root keeps a state well-formed: whatever stands outside it waits
for, hangs on and is owned by occurrences outside it, since an item hangs on an occurrence of its own scope occurrence
and a scope occurrence lies directly below its owner's. -/
theorem Left.wellFormed {before after : State} {scope : ScopeOccurrenceId} (formed : WellFormed program before)
    (left : Left before after scope) (present : scope ∈ scopeIds before) (notRoot : scope ≠ State.root) :
    WellFormed program after := by
  have sameStarts : starts after = starts before := by simp [starts, left.journal, left.started]
  have stays : ∀ id, id ∈ scopeIds before → ¬ Within before id scope → id ∈ scopeIds after := fun id member outside => by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    exact List.mem_map.mpr ⟨entry, (left.scopes entry).mpr ⟨inside, named ▸ outside⟩, named⟩
  have housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after := fun occurrence member => by
    obtain ⟨old, outside⟩ := (left.occurrences occurrence).mp member
    exact stays _ (formed.owned.occurrenceScopes occurrence old) outside
  have keys : ∀ occurrence ∈ after.occurrences, key after occurrence = key before occurrence := fun occurrence member =>
    key_congr (left.instances _ (housed occurrence member))
  have kept := left.occurrencesSublist.subset
  refine ⟨?issued, ?distinct, ?startedOnce, ?activations, ?reservations, ?owned, ?rooted, ?variables,
    ?failure, ?queue, ?counted, ?occurrencesCounted, ?ownedBelow, ?claimed, ?settled, ?attachedReserved, ?typed⟩
  case issued =>
    exact ⟨fun occurrence member => left.nextIssue ▸ formed.issued.occurrences occurrence (kept member),
      fun item member => left.nextIssue ▸ formed.issued.items item (left.openItemsSublist.subset member),
      fun entry member => left.nextIssue ▸ formed.issued.scopes entry (left.scopesSublist.subset member)⟩
  case distinct =>
    refine ⟨formed.distinct.occurrences.sublist (left.occurrencesSublist.map _),
      formed.distinct.items.sublist (left.openItemsSublist.map _),
      formed.distinct.scopes.sublist (left.scopesSublist.map _), ?_⟩
    rw [List.map_congr_left keys]
    exact formed.distinct.keys.sublist (left.occurrencesSublist.map _)
  case startedOnce => simpa [StartedOnce, sameStarts] using formed.startedOnce
  case activations => exact ⟨left.activations ▸ formed.activations.keys, left.activations ▸ formed.activations.positive⟩
  case reservations =>
    intro occurrence member unbegun fact started
    rw [keys occurrence member]
    exact formed.reservations occurrence (kept member) unbegun fact (sameStarts ▸ started)
  case owned =>
    refine ⟨housed, fun item member => ?_, fun item member => ?_, fun item member host attached => ?_,
      fun entry member owner owned => ?_, fun variables member => ?_, fun token member => ?_⟩
    · obtain ⟨old, outside⟩ := (left.openItems item).mp member
      exact stays _ (formed.owned.itemScopes item old) outside
    · obtain ⟨old, outside⟩ := (left.openItems item).mp member
      obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.itemOccurrences item old
      exact ⟨occurrence, (left.occurrences occurrence).mpr ⟨inside, rest.2 ▸ outside⟩, named, rest⟩
    · obtain ⟨old, outside⟩ := (left.openItems item).mp member
      obtain ⟨occurrence, inside, named, rest⟩ := formed.owned.attachments item old host attached
      exact ⟨occurrence, (left.occurrences occurrence).mpr ⟨inside, rest.2 ▸ outside⟩, named, rest⟩
    · obtain ⟨old, outside⟩ := (left.scopes entry).mp member
      obtain ⟨occurrence, inside, named, begunFlag⟩ := formed.owned.scopeOwners entry old owner owned
      refine ⟨occurrence, (left.occurrences occurrence).mpr ⟨inside, fun within => outside ?_⟩, named, begunFlag⟩
      exact .parent entry occurrence.scope scope old (formed.ownedBelow entry old occurrence inside (named ▸ owned)) within
    · obtain ⟨old, outside⟩ := (left.variables variables).mp member
      exact stays _ (formed.owned.variableScopes variables old) outside
    · obtain ⟨old, outside⟩ := (left.tokens token).mp member
      exact stays _ (formed.owned.tokenScopes token old) outside
  case rooted =>
    obtain ⟨rootPresent, parentless, reach⟩ := formed.rooted
    obtain ⟨scopeEntry, scopeInside, scopeNamed⟩ := List.mem_map.mp present
    refine ⟨stays _ rootPresent fun inside => notRoot (Within.antisymm formed rootPresent inside
      (scopeNamed ▸ reach scopeEntry scopeInside)).symm, fun entry member => parentless entry
      (left.scopesSublist.subset member), fun entry member => ?_⟩
    obtain ⟨old, outside⟩ := (left.scopes entry).mp member
    exact left.reaches (reach entry old) outside
  case variables =>
    exact ⟨formed.variables.scopes.sublist (left.variablesSublist.map _),
      fun variables member => formed.variables.names variables (left.variablesSublist.subset member)⟩
  case failure => simpa [FailureRecorded, left.status, left.failure] using formed.failure
  case queue =>
    obtain ⟨arm, armScope, armGateway, ends⟩ := formed.queue
    refine ⟨fun host element scope queued => ?_, by simpa [left.signals, left.nextIssue] using armScope,
      fun occurrence gateway scope queued => ?_, by simpa [left.signals] using ends⟩
    · obtain ⟨hostBelow, scopeBelow, facts⟩ := arm host element scope (left.signals ▸ queued)
      exact ⟨left.nextIssue ▸ hostBelow, left.nextIssue ▸ scopeBelow, fun found member => facts found (kept member)⟩
    · obtain ⟨below, scopeBelow, facts⟩ := armGateway occurrence gateway scope (left.signals ▸ queued)
      exact ⟨left.nextIssue ▸ below, left.nextIssue ▸ scopeBelow, fun found member => facts found (kept member)⟩
  case counted =>
    exact fun fact started => (formed.counted fact (sameStarts ▸ started)).congr left.activations
  case occurrencesCounted =>
    intro occurrence member
    rw [keys occurrence member]
    exact (formed.occurrencesCounted occurrence (kept member)).congr left.activations
  case ownedBelow =>
    exact fun entry member occurrence inside owned =>
      formed.ownedBelow entry (left.scopesSublist.subset member) occurrence (kept inside) owned
  case claimed =>
    exact formed.claimed.shrink (fun _ member => left.openItemsSublist.subset member) (fun _ member => kept member)
      housed (fun x member => by
        obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
        exact List.mem_map.mpr ⟨entry, left.scopesSublist.subset inside, named⟩)
      left.instances (Nat.le_of_eq left.nextIssue.symm) (by rw [left.signals]; exact .refl _) left.tokensSublist
  case settled =>
    exact formed.settled.transport left.slots (Nat.le_of_eq left.nextIssue.symm) (fun _ member _ => .inl (kept member))
      (fun _ queued => queued.shrink (by rw [left.signals]; exact .refl _) left.tokensSublist)
      (fun _ member => left.signals ▸ member) (fun _ member => .inl (left.scopesSublist.subset member))
  case attachedReserved =>
    exact formed.attachedReserved.shrink (fun _ member => left.openItemsSublist.subset member) fun _ member _ => kept member
  case typed =>
    exact formed.typed.shrink (fun _ member => left.openItemsSublist.subset member) fun _ member _ => kept member

end Kernel.Laws.State

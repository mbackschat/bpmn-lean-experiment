module

public import Kernel.Laws.State.Invariant
public import Kernel.State.Removal

/-! # Laws of the kernel state: frames

What `WellFormed` keeps through a change of the fields it reads, stated over the fields alone: the phases of `Step` that
only drop or reorder entries (`Narrows`), a change of status and failure, and a change of the variable sets alone
(`SameButVariables`); `Kernel.Laws.State.Clear` adds the changes that remove entries along the scope tree. A frame states
what an operation does to the process instance of the scope occurrences that stand (`State.instanceOf`), since keys read
it and this module reads no body; `Kernel.Laws.State` proves it of each operation. Nothing executable imports this
module.
-/

@[expose] public section

namespace Kernel.Laws.State

variable {program : Program}

open Kernel

/-! ## Keys, counters and claims -/

/-- An occurrence whose scope occurrence keeps its process instance keeps its key. -/
theorem key_congr {before after : State} {occurrence : Occurrence}
    (same : after.instanceOf occurrence.scope = before.instanceOf occurrence.scope) : key after occurrence = key before occurrence := by
  simp [key, same]

theorem Counted.congr {before after : State} (same : after.activations = before.activations) (table : TableGrows before after)
    {k : OccurrenceKey} (counted : Counted before k) : Counted after k := by
  unfold Counted at counted ⊢
  split at counted
  · simpa [same] using counted
  · exact table _ _ counted

/-- The claims stay single through a change that adds no item, occurrence, queued begin or completion, issues
nothing back and keeps the process instance of what stands. -/
theorem ReservationsClaimed.shrink {before after : State} (claimed : ReservationsClaimed before)
    (items : ∀ item ∈ itemList after.openItems, item ∈ itemList before.openItems)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence ∈ before.occurrences)
    (housed : ∀ occurrence ∈ after.occurrences, occurrence.scope ∈ scopeIds after)
    (scopes : ∀ x ∈ scopeIds after, x ∈ scopeIds before)
    (instances : ∀ x ∈ scopeIds after, after.instanceOf x = before.instanceOf x)
    (issued : OccurrenceGrows before after) (grows : ScopeGrows before after)
    (signals : Fewer (allSignals after) (allSignals before)) (tokens : Fewer (allQueuedTokens after) (allQueuedTokens before)) :
    ReservationsClaimed after where
  attached item member attached reserved other inside same :=
    have ⟨found, held, rest⟩ := reserved
    claimed.attached item (items item member) attached ⟨found, occurrences found held, rest⟩ other (items other inside) same
  named request queued := by
    obtain ⟨nodup, beginnable⟩ := claimed.named request (queued.shrink signals.subset tokens.subset)
    refine ⟨nodup, fun id named => ?_⟩
    obtain ⟨below, facts⟩ := beginnable id named
    refine ⟨issued _ below, fun occurrence member same => ?_⟩
    obtain ⟨unbegun, free, instance_⟩ := facts occurrence (occurrences occurrence member) same
    refine ⟨unbegun, fun item inside => free item (items item inside), fun present => ?_⟩
    rw [instances _ present, instances _ (housed occurrence member)]
    exact instance_ (scopes _ present)
  signalsApart := apart_fewer signals claimed.signalsApart
  tokensApart := apart_fewer tokens claimed.tokensApart
  queuesApart first second signal token :=
    claimed.queuesApart first second (signals.subset signal) (tokens.subset token)
  uncompleted request id leave writes rule queued named completed :=
    claimed.uncompleted request id leave writes rule (queued.shrink signals.subset tokens.subset) named (signals.subset completed)
  scopesIssued request queued := grows.issued (claimed.scopesIssued request (queued.shrink signals.subset tokens.subset))
  innerPlaced request queued id named occurrence member :=
    claimed.innerPlaced request (queued.shrink signals.subset tokens.subset) id named occurrence (occurrences occurrence member)

/-- `after`'s slots hold no join wait, Multi-Instance body or compensation run `before`'s do not. -/
structure SlotsWithin (before after : State) : Prop where
  parked : ∀ waiting ∈ after.slots.parked, waiting ∈ before.slots.parked
  bodies : ∀ run ∈ after.slots.multiInstances, run ∈ before.slots.multiInstances
  runs : ∀ run ∈ after.slots.compensation.runs, run ∈ before.slots.compensation.runs

theorem SlotsWithin.same {before after : State} (same : after.slots = before.slots) : SlotsWithin before after :=
  ⟨fun _ member => same ▸ member, fun _ member => same ▸ member, fun _ member => same ▸ member⟩

/-- A begun occurrence stays settled through a change that issues nothing back, adds no unbegun occurrence it issued
before and queues no begin. -/
theorem Settled.transport {before after : State} {id : OccurrenceId} (settled : Settled before id)
    (issued : OccurrenceGrows before after)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false →
      occurrence ∈ before.occurrences ∨ ¬ OccurrenceIssued before occurrence.id)
    (queued : ∀ request, Queued after request → Queued before request) : Settled after id := by
  obtain ⟨below, begun, unnamed⟩ := settled
  refine ⟨issued _ below, fun occurrence member same => ?_, fun request named =>
    unnamed request (queued request named)⟩
  cases flag : occurrence.begun
  · rcases occurrences occurrence member flag with old | fresh
    · simpa [flag] using begun occurrence old same
    · exact absurd (same ▸ below) fresh
  · rfl

/-- A run stays placed through a change that issues nothing back and adds only scope occurrences it issues. -/
theorem Placed.transport {before after : State} {run : MultiInstanceRun} (placed : Placed before run)
    (grows : ScopeGrows before after)
    (scopes : ∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ ¬ ScopeIssued before entry.id) : Placed after run :=
  fun scope active => by
    obtain ⟨below, parent⟩ := placed scope active
    refine ⟨grows.issued below, fun entry member named => ?_⟩
    rcases scopes entry member with old | fresh
    · exact parent entry old named
    · rw [named] at fresh
      exact absurd below fresh

/-- A compensation run stays placed through a change that issues nothing back and adds only scope occurrences it
issues. -/
theorem RunPlaced.transport {before after : State} {run : CompensationRun} (placed : RunPlaced before run)
    (grows : ScopeGrows before after)
    (scopes : ∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ ¬ ScopeIssued before entry.id) : RunPlaced after run :=
  ⟨placed.1, fun context running => by
    obtain ⟨below, parent⟩ := placed.2 context running
    refine ⟨grows.issued below, fun entry member named => ?_⟩
    rcases scopes entry member with old | fresh
    · exact parent entry old named
    · rw [named] at fresh
      exact absurd below fresh⟩

/-- The slots stay settled through such a change that adds no slot entry, queues no compensation and adds only scope
occurrences it issues. -/
theorem SlotsSettled.transport {before after : State} (settled : SlotsSettled before) (slots : SlotsWithin before after)
    (issued : OccurrenceGrows before after) (grows : ScopeGrows before after)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false →
      occurrence ∈ before.occurrences ∨ ¬ OccurrenceIssued before occurrence.id)
    (queued : ∀ request, Queued after request → Queued before request)
    (signals : ∀ signal ∈ allSignals after, signal ∈ allSignals before)
    (scopes : ∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ ¬ ScopeIssued before entry.id) : SlotsSettled after where
  parked waiting member := (settled.parked waiting (slots.parked waiting member)).transport issued occurrences queued
  bodies run member := (settled.bodies run (slots.bodies run member)).transport issued occurrences queued
  resumed run member occurrence leave resume :=
    (settled.resumed run (slots.runs run member) occurrence leave resume).transport issued occurrences queued
  queued scope activity trigger leave occurrence resume member :=
    (settled.queued scope activity trigger leave occurrence resume (signals _ member)).transport issued occurrences queued
  placed run member := (settled.placed run (slots.bodies run member)).transport grows scopes
  runsPlaced run member := (settled.runsPlaced run (slots.runs run member)).transport grows scopes
  grouped scope activity trigger leave context member :=
    settled.grouped scope activity trigger leave context (signals _ member)
  raised raised origin host member named :=
    (settled.raised raised origin host (signals _ member) named).transport issued occurrences queued

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

inductive InstanceIn (s : State) : ScopeOccurrenceId → InstanceName → List ScopeOccurrence → Prop where
  | called (entry : ScopeOccurrence) (name : InstanceName) : entry ∈ s.scopes → entry.calledInstance = some name →
      InstanceIn s entry.id name [entry]
  | up (entry : ScopeOccurrence) (parent : ScopeOccurrenceId) (name : InstanceName) (chain : List ScopeOccurrence) :
      entry ∈ s.scopes → entry.calledInstance = none → entry.parent = some parent → InstanceIn s parent name chain →
      InstanceIn s entry.id name (entry :: chain)
  | root (entry : ScopeOccurrence) : entry ∈ s.scopes → entry.calledInstance = none → entry.parent = none →
      InstanceIn s entry.id (.named s.instanceId) [entry]

theorem InstanceIn.mem {s : State} {x : ScopeOccurrenceId} {name : InstanceName} {chain : List ScopeOccurrence}
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
theorem InstanceIn.transport {s t : State} {x : ScopeOccurrenceId} {name : InstanceName} {chain : List ScopeOccurrence}
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

/-- `Beginnable` reads the issued keys, the occurrences, the items, the scope occurrences and their process instances. -/
theorem Beginnable.congr {before after : State} {scope : ScopeOccurrenceId} {id : OccurrenceId}
    (beginnable : Beginnable before scope id) (issued : OccurrenceGrows before after) (occurrences : after.occurrences = before.occurrences)
    (items : itemList after.openItems = itemList before.openItems) (scopes : after.scopes = before.scopes)
    (instances : ∀ x, after.instanceOf x = before.instanceOf x) : Beginnable after scope id := by
  obtain ⟨below, facts⟩ := beginnable
  refine ⟨issued _ below, fun occurrence member same => ?_⟩
  obtain ⟨unbegun, free, instance_⟩ := facts occurrence (occurrences ▸ member) same
  refine ⟨unbegun, items ▸ free, fun present => ?_⟩
  rw [instances, instances]
  exact instance_ (by simpa [scopeIds, scopes] using present)

/-! ## What an open item waits on -/

/-- An occurrence stays unbegun through a change that begins none of its identity: every begun occurrence of the
identity after it was one before. -/
theorem Unbegun.transport {before after : State} {id : OccurrenceId} (unbegun : Unbegun before id)
    (begun : ∀ occurrence ∈ after.occurrences, occurrence.id = id → occurrence.begun = true →
      occurrence ∈ before.occurrences) : Unbegun after id := fun occurrence member named =>
  Bool.eq_false_iff.mpr fun flag => by simp [unbegun occurrence (begun occurrence member named flag) named] at flag

/-- What an attached item waits on stays unbegun through a change that adds no open item and begins none of what an
open item waits on. -/
theorem AttachedReserved.transport {before after : State} (reserved : AttachedReserved before)
    (items : ∀ item ∈ itemList after.openItems, item ∈ itemList before.openItems)
    (begun : ∀ item ∈ itemList after.openItems, ∀ occurrence ∈ after.occurrences, occurrence.id = item.id.occurrence →
      occurrence.begun = true → occurrence ∈ before.occurrences) : AttachedReserved after :=
  fun item member attached => (reserved item (items item member) attached).transport (begun item member)

/-- `Typed` holds through a change that adds no open item or queued signal and begins none of what an open item
waits on. -/
theorem Typed.transport {program : Program} {before after : State} (typed : Typed program before)
    (items : ∀ item ∈ itemList after.openItems, item ∈ itemList before.openItems)
    (begun : ∀ item ∈ itemList after.openItems, ∀ occurrence ∈ after.occurrences, occurrence.id = item.id.occurrence →
      occurrence.begun = true → occurrence ∈ before.occurrences)
    (signals : ∀ signal ∈ allSignals after, signal ∈ allSignals before) : Typed program after := fun item member started =>
  have ⟨unbegun, alone, uncompleted, waits⟩ := typed item (items item member) started
  ⟨unbegun.transport (begun item member), fun other inside same => alone other (items other inside) same,
    fun leave writes rule queued => uncompleted leave writes rule (signals _ queued), waits⟩

theorem AttachedReserved.shrink {before after : State} (reserved : AttachedReserved before)
    (items : ∀ item ∈ itemList after.openItems, item ∈ itemList before.openItems)
    (begun : ∀ occurrence ∈ after.occurrences, occurrence.begun = true → occurrence ∈ before.occurrences) :
    AttachedReserved after := reserved.transport items fun _ _ occurrence member _ flag => begun occurrence member flag

theorem Typed.shrink {program : Program} {before after : State} (typed : Typed program before)
    (items : ∀ item ∈ itemList after.openItems, item ∈ itemList before.openItems)
    (begun : ∀ occurrence ∈ after.occurrences, occurrence.begun = true → occurrence ∈ before.occurrences)
    (signals : ∀ signal ∈ allSignals after, signal ∈ allSignals before) :
    Typed program after := typed.transport items (fun _ _ occurrence member _ flag => begun occurrence member flag) signals

/-- What an open item of a well-formed state waits on was issued. -/
theorem WellFormed.waited {s : State} (formed : WellFormed program s) :
    ∀ item ∈ itemList s.openItems, OccurrenceIssued s item.id.occurrence :=
  fun item member =>
    have ⟨occurrence, present, named, _⟩ := formed.owned.itemOccurrences item member
    named ▸ formed.issued.occurrences occurrence present

/-- What waits for work stays on a begun occurrence through a change that adds no open item and whose unbegun
occurrences were unbegun before or are issued since. -/
theorem Worked.transport {before after : State} (worked : Worked before)
    (items : ∀ item ∈ itemList after.openItems, item ∈ itemList before.openItems)
    (waited : ∀ item ∈ itemList before.openItems, OccurrenceIssued before item.id.occurrence)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false →
      occurrence ∈ before.occurrences ∨ ¬ OccurrenceIssued before occurrence.id) : Worked after :=
  fun item member working occurrence present named => by
    cases flag : occurrence.begun
    · rcases occurrences occurrence present flag with old | fresh
      · simpa [flag] using worked item (items item member) working occurrence old named
      · exact absurd (named ▸ waited item (items item member)) fresh
    · rfl

theorem Worked.shrink {before after : State} (worked : Worked before)
    (items : ∀ item ∈ itemList after.openItems, item ∈ itemList before.openItems)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false → occurrence ∈ before.occurrences) :
    Worked after := fun item member working occurrence present named => by
  cases flag : occurrence.begun
  · simpa [flag] using worked item (items item member) working occurrence (occurrences occurrence present flag) named
  · rfl

/-- An Event's occurrences keep their role through a change each of whose occurrences, an Event's, numbers under the
element role, or carries the element and role of one before. -/
theorem EventRoles.transport {program : Program} {before after : State} (roles : EventRoles program before)
    (occurrences : ∀ occurrence ∈ after.occurrences,
      (((program.element? occurrence.element).bind (·.event?)).isSome = true → occurrence.role = .element) ∨
      ∃ old ∈ before.occurrences, old.element = occurrence.element ∧ old.role = occurrence.role) :
    EventRoles program after := fun occurrence member event => by
  rcases occurrences occurrence member with role | ⟨old, held, element, role⟩
  · exact role event
  · rw [← role]
    exact roles old held (element ▸ event)

theorem EventRoles.shrink {program : Program} {before after : State} (roles : EventRoles program before)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence ∈ before.occurrences) : EventRoles program after :=
  roles.transport fun occurrence member => .inr ⟨occurrence, occurrences occurrence member, rfl, rfl⟩

/-- A body keeps its element's Multi-Instance envelope through a change each of whose bodies is of an element with
one, or carries the element and role of an occurrence before. -/
theorem BodyRoles.transport {program : Program} {before after : State} (bodies : BodyRoles program before)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.role = .multiInstanceBody →
      (((program.element? occurrence.element).bind (·.envelope?)).bind (·.multiInstance)).isSome = true ∨
      ∃ old ∈ before.occurrences, old.element = occurrence.element ∧ old.role = occurrence.role) :
    BodyRoles program after := fun occurrence member body => by
  rcases occurrences occurrence member body with loops | ⟨old, held, element, role⟩
  · exact loops
  · rw [← element]
    exact bodies old held (role.trans body)

theorem BodyRoles.shrink {program : Program} {before after : State} (bodies : BodyRoles program before)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence ∈ before.occurrences) : BodyRoles program after :=
  bodies.transport fun occurrence member _ => .inr ⟨occurrence, occurrences occurrence member, rfl, rfl⟩

/-- An item keeps waiting for an occurrence of the element role through a change each of whose items waits for what
an item waited for before, and each of whose occurrences an item waits for carries the identity and role of one
before. -/
theorem ItemRoles.transport {before after : State} (roles : ItemRoles before)
    (items : ∀ item ∈ itemList after.openItems, ∃ old ∈ itemList before.openItems, old.id.occurrence = item.id.occurrence)
    (occurrences : ∀ item ∈ itemList after.openItems, ∀ occurrence ∈ after.occurrences, occurrence.id = item.id.occurrence →
      ∃ old ∈ before.occurrences, old.id = occurrence.id ∧ old.role = occurrence.role) : ItemRoles after :=
  fun item member occurrence present named => by
    obtain ⟨old, held, same, role⟩ := occurrences item member occurrence present named
    obtain ⟨waiting, open_, waits⟩ := items item member
    rw [← role]
    exact roles waiting open_ old held (same.trans (named.trans waits.symm))

theorem ItemRoles.shrink {before after : State} (roles : ItemRoles before)
    (items : ∀ item ∈ itemList after.openItems, item ∈ itemList before.openItems)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence ∈ before.occurrences) : ItemRoles after :=
  roles.transport (fun item member => ⟨item, items item member, rfl⟩)
    fun _ _ occurrence present _ => ⟨occurrence, occurrences occurrence present, rfl, rfl⟩

/-- The queued raises stay sound through a change that queues no raise, issues nothing back and adds no unbegun
occurrence. -/
theorem RaisesSound.transport {program : Program} {before after : State} (raises : RaisesSound program before)
    (signals : ∀ raised origin, Signal.raise raised origin ∈ allSignals after →
      Signal.raise raised origin ∈ allSignals before)
    (grows : ScopeGrows before after) (issued : OccurrenceGrows before after)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false → occurrence ∈ before.occurrences) :
    RaisesSound program after := fun raised origin queued event => by
  obtain ⟨below, thrower, begun⟩ := raises raised origin (signals raised origin queued) event
  refine ⟨grows.issued below, issued _ thrower, fun occurrence member named => ?_⟩
  cases flag : occurrence.begun
  · simpa [flag] using begun occurrence (occurrences occurrence member flag) named
  · rfl

/-- `RaisesSound` reads the queue, the scope occurrences, the counters and the occurrences. -/
theorem RaisesSound.same {program : Program} {s t : State} (raises : RaisesSound program s)
    (signals : allSignals t = allSignals s) (ordinals : t.scopeOrdinals = s.scopeOrdinals) (scopes : t.scopes = s.scopes)
    (counters : t.occurrenceOrdinals = s.occurrenceOrdinals) (occurrences : t.occurrences = s.occurrences)
    (table : t.issued = s.issued) : RaisesSound program t :=
  raises.transport (fun _ _ queued => signals ▸ queued)
    (.of_same (congrArg (List.map ScopeOccurrence.id) scopes) ordinals (.of_eq table))
    (.of_same (congrArg (List.map ScopeOccurrence.id) scopes) ordinals counters (.of_eq table))
    fun _ member _ => occurrences ▸ member

/-! ## Narrowing -/

/-- `after` holds what `before` holds, with no more open items, tokens, queued signals or start facts of the input in
progress, and no new identifier: the phases that only drop or reorder entries, and, with their variable sets changed
(`WellFormed.reshape`), the variable writes. -/
structure Narrows (before after : State) : Prop where
  /-- The scope map itself is kept, so its keying is; `Narrows.scopes` reads the list view. -/
  scopeMap : after.scopeMap = before.scopeMap
  scopeOrdinals : after.scopeOrdinals = before.scopeOrdinals
  /-- The occurrence map itself is kept, so its keying is; `Narrows.occurrences` reads the list view. -/
  occurrenceMap : after.occurrenceMap = before.occurrenceMap
  activations : after.activations = before.activations
  occurrenceOrdinals : after.occurrenceOrdinals = before.occurrenceOrdinals
  instances : ∀ scope, after.instanceOf scope = before.instanceOf scope
  recorded : FailureRecorded before → FailureRecorded after
  items : ItemsNarrow after.openItems before.openItems after.itemOrdinals before.itemOrdinals
  tokens : Fewer (allQueuedTokens after) (allQueuedTokens before)
  signals : Fewer (allSignals after) (allSignals before)
  starts : ∀ fact ∈ starts after, fact ∈ starts before
  slots : SlotsWithin before after
  issued : after.issued = before.issued
  issuing : after.issuing = before.issuing
  issueNext : after.issueNext = before.issueNext
  /-- The units that ran keep their transitions (`IssuerFresh.ran`); a change that leaves the transitions alone proves
  it by default. -/
  ran : ∀ unit, before.transitions.contains unit = true → after.transitions.contains unit = true := by exact fun _ => id

theorem Narrows.scopes {before after : State} (narrows : Narrows before after) : after.scopes = before.scopes := by
  rw [scopes_eq, scopes_eq, narrows.scopeMap]

theorem Narrows.occurrences {before after : State} (narrows : Narrows before after) :
    after.occurrences = before.occurrences :=
  occurrences_congr narrows.occurrenceMap

/-- A state that narrows a well-formed one is well-formed when it starts no occurrence key twice and its variable sets
belong to scope occurrences that stand. -/
theorem WellFormed.reshape {before after : State} (formed : WellFormed program before) (narrows : Narrows before after)
    (once : StartedOnce after) (located : ∀ x ∈ after.variables, x ∈ scopeIds after) : WellFormed program after := by
  have keys : ∀ occurrence, key after occurrence = key before occurrence := fun _ => key_congr (narrows.instances _)
  have items : itemList after.openItems ⊆ itemList before.openItems := by exact narrows.items.subset
  have grows : ScopeGrows before after :=
    .of_same (congrArg (List.map ScopeOccurrence.id) narrows.scopes) narrows.scopeOrdinals (.of_eq narrows.issued)
  have issued : OccurrenceGrows before after :=
    .of_same (congrArg (List.map ScopeOccurrence.id) narrows.scopes) narrows.scopeOrdinals narrows.occurrenceOrdinals
      (.of_eq narrows.issued)
  have settled := formed.settled.transport narrows.slots issued grows
    (fun _ member _ => .inl (narrows.occurrences ▸ member))
    (fun _ queued => queued.shrink narrows.signals.subset narrows.tokens.subset)
    (fun _ member => narrows.signals.subset member) (fun _ member => .inl (narrows.scopes ▸ member))
  have queue : QueueSound after := {
    arm := fun host element scope queued => by
      obtain ⟨host', scope', begun⟩ := formed.queue.arm host element scope (narrows.signals.subset queued)
      exact ⟨issued _ host', grows.issued scope', narrows.occurrences ▸ begun⟩
    armScope := fun scope queued => grows.issued (formed.queue.armScope scope (narrows.signals.subset queued))
    armGateway := fun occurrence gateway scope queued => by
      obtain ⟨occurrence', scope', begun⟩ := formed.queue.armGateway occurrence gateway scope (narrows.signals.subset queued)
      exact ⟨issued _ occurrence', grows.issued scope', narrows.occurrences ▸ begun⟩
    ends := fun status failure queued => formed.queue.ends status failure (narrows.signals.subset queued)
    completes := fun id leave writes rule queued =>
      issued _ (formed.queue.completes id leave writes rule (narrows.signals.subset queued)) }
  have rooted : Rooted after := by
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, narrows.scopes] using present, by simpa [narrows.scopes] using parentless, ?_⟩
    intro scope member
    exact Within.congr narrows.scopes (reach scope (narrows.scopes ▸ member))
  have raises : RaisesSound program after := formed.raises.transport (fun _ _ queued => narrows.signals.subset queued)
    grows issued fun _ member _ => narrows.occurrences ▸ member
  have issuer : IssuerFresh after := formed.issuer.grow narrows.issued narrows.issuing narrows.issueNext narrows.ran
  have positions := formed.issued.positionsKept (fun _ member => narrows.scopes ▸ member) (.of_eq narrows.issued)
  have occurrencePositions :=
    formed.issued.occurrencePositionsKept (fun _ member => narrows.occurrences ▸ member) (.of_eq narrows.issued)
  have distinct : Distinct after := ⟨narrows.occurrenceMap ▸ formed.distinct.occurrencesKeyed,
    narrows.items.keyed formed.distinct.items, narrows.scopeMap ▸ formed.distinct.scopesKeyed,
    by rw [narrows.occurrences, funext keys]; exact formed.distinct.keys⟩
  have issuedAfter : IssuedBelow after :=
    ⟨fun occurrence member => issued _ (formed.issued.occurrences occurrence (narrows.occurrences ▸ member)),
      fun item member =>
        let ⟨owner, below, tabled⟩ := formed.issued.items item (items member)
        ⟨owner, fun present n committed => Nat.lt_of_lt_of_le (below (narrows.occurrences ▸ present) n committed)
          (narrows.items.ordinals _), fun unit index fresh => narrows.issued ▸ tabled unit index fresh⟩,
      fun scope member => grows.issued (formed.issued.scopes scope (narrows.scopes ▸ member)), positions,
      occurrencePositions, formed.issued.namesKept (fun _ member => narrows.scopes ▸ member) (.of_eq narrows.issued),
      formed.issued.slotsKept narrows.issued⟩
  exact {
  issued := issuedAfter
  issuer := issuer
  distinct := distinct
  startedOnce := once
  activations := ⟨by simpa [narrows.activations] using formed.activations.keys,
    by simpa [narrows.activations] using formed.activations.positive,
    by simpa [narrows.activations] using formed.activations.resolved⟩
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
  rooted := rooted
  failure := narrows.recorded formed.failure
  queue := queue
  counted := fun fact started => (formed.counted fact (narrows.starts fact started)).congr narrows.activations (fun _ _ held => narrows.issued ▸ held)
  occurrencesCounted := fun occurrence member => by
    rw [keys]
    exact (formed.occurrencesCounted occurrence (narrows.occurrences ▸ member)).congr narrows.activations (fun _ _ held => narrows.issued ▸ held)
  ownedBelow := by simpa [OwnedBelow, narrows.scopes, narrows.occurrences] using formed.ownedBelow
  claimed := formed.claimed.shrink (fun _ member => items member) (fun _ member => narrows.occurrences ▸ member)
    (by simpa [scopeIds, narrows.occurrences, narrows.scopes] using formed.owned.occurrenceScopes)
    (by simp [scopeIds, narrows.scopes]) (fun x _ => narrows.instances x) issued grows
    narrows.signals narrows.tokens
  settled := settled
  attachedReserved := formed.attachedReserved.shrink (fun _ member => items member)
    fun _ member _ => narrows.occurrences ▸ member
  typed := formed.typed.shrink (fun _ member => items member) (fun _ member _ => narrows.occurrences ▸ member)
    fun _ member => narrows.signals.subset member
  worked := formed.worked.shrink (fun _ member => items member) fun _ member _ => narrows.occurrences ▸ member
  roles := formed.roles.shrink fun _ member => narrows.occurrences ▸ member
  raises := raises
  bodyRoles := formed.bodyRoles.shrink fun _ member => narrows.occurrences ▸ member
  itemRoles := formed.itemRoles.shrink (fun _ member => items member) fun _ member => narrows.occurrences ▸ member }

/-- A state that narrows a well-formed one with the same variable sets is well-formed when it starts no occurrence key
twice. -/
theorem WellFormed.narrow {before after : State} (formed : WellFormed program before) (narrows : Narrows before after)
    (variables : after.variables = before.variables) (once : StartedOnce after) : WellFormed program after :=
  formed.reshape narrows once (by simpa [scopeIds, variables, narrows.scopes] using formed.owned.variableScopes)

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
  formed.narrow {
      scopeMap := rfl, scopeOrdinals := rfl, occurrenceMap := rfl, activations := rfl, occurrenceOrdinals := rfl,
      instances := instances,
      recorded := fun _ => recorded, items := .refl _, tokens := .refl _, signals := .refl _, starts := fun _ => id,
      slots := .same rfl, issued := rfl, issuing := rfl, issueNext := rfl } rfl
    formed.startedOnce

/-- What `WellFormed` reads besides the variable sets: `setVariable` and `removeVariable` keep all of it. -/
structure SameButVariables (before after : State) : Prop where
  scopeMap : after.scopeMap = before.scopeMap
  scopeOrdinals : after.scopeOrdinals = before.scopeOrdinals
  occurrenceMap : after.occurrenceMap = before.occurrenceMap
  items : after.openItems = before.openItems
  ordinals : after.itemOrdinals = before.itemOrdinals
  tokens : allQueuedTokens after = allQueuedTokens before
  activations : after.activations = before.activations
  occurrenceOrdinals : after.occurrenceOrdinals = before.occurrenceOrdinals
  journal : after.journal = before.journal
  transitions : after.transitions = before.transitions
  draft : after.draft = before.draft
  status : after.status = before.status
  failure : after.failure = before.failure
  signals : allSignals after = allSignals before
  queues : QueuesKept before after
  instances : ∀ scope, after.instanceOf scope = before.instanceOf scope
  instanceId : after.instanceId = before.instanceId
  slots : after.slots = before.slots
  issued : after.issued = before.issued
  issuing : after.issuing = before.issuing
  issueNext : after.issueNext = before.issueNext

theorem SameButVariables.scopes {before after : State} (same : SameButVariables before after) : after.scopes = before.scopes := by
  rw [scopes_eq, scopes_eq, same.scopeMap]

theorem SameButVariables.occurrences {before after : State} (same : SameButVariables before after) :
    after.occurrences = before.occurrences :=
  occurrences_congr same.occurrenceMap

/-- A state that differs from a well-formed one only in its variable sets is well-formed when every set belongs to a
present scope occurrence. -/
theorem WellFormed.ofVariables {before after : State} (formed : WellFormed program before) (same : SameButVariables before after)
    (located : ∀ x ∈ after.variables, x ∈ scopeIds after) : WellFormed program after :=
  formed.reshape {
      scopeMap := same.scopeMap, scopeOrdinals := same.scopeOrdinals, occurrenceMap := same.occurrenceMap, activations := same.activations,
      occurrenceOrdinals := same.occurrenceOrdinals, instances := same.instances,
      recorded := by simp [FailureRecorded, same.failure, same.status],
      items := by rw [same.items, same.ordinals]; exact .refl _, tokens := by rw [same.tokens]; exact .refl _,
      signals := by rw [same.signals]; exact .refl _,
      starts := by simp [starts, same.transitions, same.draft],
      slots := .same same.slots, issued := same.issued, issuing := same.issuing, issueNext := same.issueNext,
      ran := fun _ held => same.transitions ▸ held }
    (by simpa [StartedOnce, starts, same.journal, same.transitions, same.draft] using formed.startedOnce) located

/-! ## Where a queued trigger comes from

What a step's hooks are handed about the trigger a queued compensation or Cancel raise names, stated over the fields
alone so that `Kernel.Laws.Step.HookContract`, the features' records and the frames of the proof lanes read one
vocabulary: the occurrence a throw raises or compensates from was begun from a state that kept the invariant
(`BegunFrom`, `RaisesFrom`), a raise or compensation `Step` runs was taken off the head of a queue that kept it
(`Popped`), and a caught Cancel's compensation takes the trigger of the raise it was taken off (`RollsBack`), through
search steps that move no trigger (`Steady`). -/

/-- `signal` queues no compensation and no Cancel raise, so it carries no trigger. -/
def Untriggered (signal : Signal) : Prop :=
  (∀ scope activity trigger leave resume, signal ≠ .compensate scope activity trigger leave resume) ∧
    ∀ event origin, signal = .raise event origin → event.isCancel = false

/-- What a raise's search steps keep of what it reads: the occurrences, the scope occurrences, their process instances,
the activation counters and the queued begins, with no identity issued back, no compensation run added and only
signals queued that carry no trigger (`Untriggered`). -/
structure Steady (before after : State) : Prop where
  occurrences : after.occurrences = before.occurrences
  scopes : after.scopes = before.scopes
  issued : OccurrenceGrows before after
  ordinals : after.scopeOrdinals = before.scopeOrdinals
  queued : ∀ request, Queued after request → Queued before request
  instances : ∀ scope, after.instanceOf scope = before.instanceOf scope
  activations : after.activations = before.activations
  runs : ∀ run ∈ after.slots.compensation.runs, run ∈ before.slots.compensation.runs
  signals : ∃ more, allSignals after = allSignals before ++ more ∧ ∀ signal ∈ more, Untriggered signal
  table : TableGrows before after

theorem Steady.refl (state : State) : Steady state state :=
  ⟨rfl, rfl, .refl _, rfl, fun _ => id, fun _ => rfl, rfl, fun _ => id, ⟨[], by simp, by simp⟩, .refl _⟩

theorem Steady.trans {first second third : State} (one : Steady first second) (two : Steady second third) :
    Steady first third := by
  obtain ⟨more, appended, quiet⟩ := one.signals
  obtain ⟨further, appendedTwo, quietTwo⟩ := two.signals
  refine ⟨two.occurrences.trans one.occurrences, two.scopes.trans one.scopes, one.issued.trans two.issued,
    two.ordinals.trans one.ordinals,
    fun request queued => one.queued request (two.queued request queued), fun scope => (two.instances scope).trans
      (one.instances scope), two.activations.trans one.activations, fun run inside => one.runs run (two.runs run inside),
    ⟨more ++ further, by rw [appendedTwo, appended, List.append_assoc], fun signal inside => ?_⟩, one.table.trans two.table⟩
  rcases List.mem_append.mp inside with early | late
  · exact quiet signal early
  · exact quietTwo signal late

/-- A `Steady` step keeps every scope-key history: it keeps the scope occurrences and their counters. -/
theorem Steady.grows {before after : State} (steady : Steady before after) : ScopeGrows before after :=
  .of_same (congrArg (List.map (·.id)) steady.scopes) steady.ordinals steady.table

/-- What `Step.begin` establishes of the request it begins from `before`, for the throw its occurrence of the element
role makes (`Step.roleOf`, `Laws.Step.HookContract.arriveThrow`): the request's scope occurrence stands and the
reservation it names, if any, is beginnable there, so the begun occurrence is that unbegun reservation or a fresh issue
under the element's own counter. -/
structure BeginsThrow (before : State) (request : BeginRequest) (occurrence : Occurrence) : Prop where
  scope : request.scope ∈ scopeIds before
  reserved : ∀ id, request.reserved = some id → Beginnable before request.scope id
  role : occurrence.role = .element

/-- `occurrence` is the one a begin from a state that kept `inv` began, in `state`, for a throw (`BeginsThrow`). -/
def BegunFrom (inv : State → Prop) (state : State) (occurrence : Occurrence) : Prop :=
  ∃ before request role sourceType, inv before ∧ BeginsThrow before request occurrence ∧
    before.beginOccurrence request role sourceType = (state, occurrence)

/-- `state` is where a throw raises from: the state a begin of `occurrence` from a state that kept `inv` left, or that
state with the occurrence's completion queued. -/
def RaisesFrom (inv : State → Prop) (occurrence : Occurrence) (state : State) : Prop :=
  ∃ base, BegunFrom inv base occurrence ∧ (state = base ∨ ∃ leave, state = base.signal (.complete occurrence.id leave [] .outward))

/-- `state` is what taking `signal`, queued under `unit`, off a queue that kept `inv` left. -/
def Popped (inv : State → Prop) (signal : Signal) (state : State) : Prop :=
  ∃ queue unit, inv queue ∧ queue.queuedSignals[unit]? = some signal ∧
    state = { queue with queuedSignals := queue.queuedSignals.erase unit }

/-- `trigger` is the thrower of a Cancel raise taken off a queue that kept `inv` (`Popped`), whose search reached
`state`, or `state` with a host disarmed, by `Steady` steps: the trigger a caught Cancel's compensation takes
(`Feature.Propagation.leaveOccurrence`). The raise's scope occurrence stood when it was taken off, since a search from
a scope occurrence that is gone fails (`Feature.Propagation.searchScopes`, #121). -/
def RollsBack (inv : State → Prop) (trigger : OccurrenceName) (state : State) : Prop :=
  ∃ base raised origin searched, Popped inv (.raise raised origin) base ∧ origin.scope ∈ scopeIds base ∧
    raised.isCancel = true ∧
    Steady base searched ∧ (state = searched ∨ ∃ host, state = searched.disarm host) ∧
    trigger = { processInstanceId := searched.instanceOf origin.scope, element := origin.element,
                activation := origin.activation }

section Weaken

variable {inv weaker : State → Prop} (weakens : ∀ t, inv t → weaker t)
include weakens

theorem BegunFrom.imp {state : State} {occurrence : Occurrence} (begun : BegunFrom inv state occurrence) :
    BegunFrom weaker state occurrence := by
  obtain ⟨before, request, rest⟩ := begun
  obtain ⟨role, sourceType, holds, made⟩ := rest
  exact ⟨before, request, role, sourceType, weakens _ holds, made⟩

theorem RaisesFrom.imp {occurrence : Occurrence} {state : State} (raises : RaisesFrom inv occurrence state) :
    RaisesFrom weaker occurrence state := by
  obtain ⟨base, begun, at_⟩ := raises
  exact ⟨base, begun.imp weakens, at_⟩

theorem Popped.imp {signal : Signal} {state : State} (popped : Popped inv signal state) : Popped weaker signal state := by
  obtain ⟨queue, unit, holds, rest₁⟩ := popped
  obtain ⟨found, same⟩ := rest₁
  exact ⟨queue, unit, weakens _ holds, found, same⟩

theorem RollsBack.imp {trigger : OccurrenceName} {state : State} (rolls : RollsBack inv trigger state) :
    RollsBack weaker trigger state := by
  obtain ⟨base, raised, origin, rest⟩ := rolls
  obtain ⟨searched, popped, rest⟩ := rest
  exact ⟨base, raised, origin, searched, popped.imp weakens, rest⟩

end Weaken

end Kernel.Laws.State

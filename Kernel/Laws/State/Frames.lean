module

public import Kernel.Laws.State.Invariant

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
  innerPlaced request queued id named occurrence member :=
    claimed.innerPlaced request (queued.shrink signals tokens) id named occurrence (occurrences occurrence member)

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

/-- A compensation run stays placed through a change that issues nothing back and adds only scope occurrences it
issues. -/
theorem RunPlaced.transport {before after : State} {run : CompensationRun} (placed : RunPlaced before run)
    (issued : before.nextIssue ≤ after.nextIssue)
    (scopes : ∀ entry ∈ after.scopes, entry ∈ before.scopes ∨ before.nextIssue ≤ entry.id.value) : RunPlaced after run :=
  ⟨placed.1, fun context running => by
    obtain ⟨below, parent⟩ := placed.2 context running
    refine ⟨Nat.lt_of_lt_of_le below issued, fun entry member named => ?_⟩
    rcases scopes entry member with old | fresh
    · exact parent entry old named
    · rw [named] at fresh
      omega⟩

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
  runsPlaced run member := (settled.runsPlaced run (slots.runs run member)).transport issued scopes
  grouped scope activity trigger leave outer context member :=
    settled.grouped scope activity trigger leave outer context (signals _ member)
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

/-- `Typed` holds through a change that adds no open item or queued signal and begins none of what an open item
waits on. -/
theorem Typed.transport {program : Program} {before after : State} (typed : Typed program before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (begun : ∀ item ∈ after.openItems, ∀ occurrence ∈ after.occurrences, occurrence.id = item.occurrence →
      occurrence.begun = true → occurrence ∈ before.occurrences)
    (signals : ∀ signal ∈ after.signals, signal ∈ before.signals) : Typed program after := fun item member started =>
  have ⟨unbegun, alone, uncompleted, waits⟩ := typed item (items item member) started
  ⟨unbegun.transport (begun item member), fun other inside same => alone other (items other inside) same,
    fun leave writes rule queued => uncompleted leave writes rule (signals _ queued), waits⟩

theorem AttachedReserved.shrink {before after : State} (reserved : AttachedReserved before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (begun : ∀ occurrence ∈ after.occurrences, occurrence.begun = true → occurrence ∈ before.occurrences) :
    AttachedReserved after := reserved.transport items fun _ _ occurrence member _ flag => begun occurrence member flag

theorem Typed.shrink {program : Program} {before after : State} (typed : Typed program before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (begun : ∀ occurrence ∈ after.occurrences, occurrence.begun = true → occurrence ∈ before.occurrences)
    (signals : ∀ signal ∈ after.signals, signal ∈ before.signals) :
    Typed program after := typed.transport items (fun _ _ occurrence member _ flag => begun occurrence member flag) signals

/-- What an open item of a well-formed state waits on was issued. -/
theorem WellFormed.waited {s : State} (formed : WellFormed program s) : ∀ item ∈ s.openItems, item.occurrence < s.nextIssue :=
  fun item member =>
    have ⟨occurrence, present, named, _⟩ := formed.owned.itemOccurrences item member
    named ▸ formed.issued.occurrences occurrence present

/-- What waits for work stays on a begun occurrence through a change that adds no open item and whose unbegun
occurrences were unbegun before or are issued since. -/
theorem Worked.transport {before after : State} (worked : Worked before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
    (waited : ∀ item ∈ before.openItems, item.occurrence < before.nextIssue)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false →
      occurrence ∈ before.occurrences ∨ before.nextIssue ≤ occurrence.id) : Worked after :=
  fun item member working occurrence present named => by
    cases flag : occurrence.begun
    · rcases occurrences occurrence present flag with old | fresh
      · simpa [flag] using worked item (items item member) working occurrence old named
      · have := waited item (items item member)
        omega
    · rfl

theorem Worked.shrink {before after : State} (worked : Worked before)
    (items : ∀ item ∈ after.openItems, item ∈ before.openItems)
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

/-- The queued raises stay sound through a change that queues no raise, issues nothing back, keeps every issued scope
occurrence that stands standing in its process instance, keeps every count and adds no unbegun occurrence. -/
theorem RaisesSound.transport {program : Program} {before after : State} (raises : RaisesSound program before)
    (signals : ∀ raised origin, Signal.raise raised origin ∈ after.signals → Signal.raise raised origin ∈ before.signals)
    (issued : before.nextIssue ≤ after.nextIssue)
    (scopes : ∀ x ∈ scopeIds after, x.value < before.nextIssue →
      x ∈ scopeIds before ∧ after.instanceOf x = before.instanceOf x)
    (counters : ∀ k, Counted before k → Counted after k)
    (occurrences : ∀ occurrence ∈ after.occurrences, occurrence.begun = false → occurrence ∈ before.occurrences) :
    RaisesSound program after := fun raised origin queued event => by
  obtain ⟨below, counted, begun⟩ := raises raised origin (signals raised origin queued) event
  refine ⟨Nat.lt_of_lt_of_le below issued, fun present => ?_, fun occurrence member element scope activation => ?_⟩
  · obtain ⟨old, same⟩ := scopes _ present below
    rw [same]
    exact counters _ (counted old)
  · cases flag : occurrence.begun
    · simpa [flag] using begun occurrence (occurrences occurrence member flag) element scope activation
    · rfl

/-- `RaisesSound` reads the queue, the counter, the scope occurrences and their process instances, the counts and the
occurrences. -/
theorem RaisesSound.same {program : Program} {s t : State} (raises : RaisesSound program s)
    (signals : t.signals = s.signals) (nextIssue : t.nextIssue = s.nextIssue) (scopes : t.scopes = s.scopes)
    (instances : ∀ x, t.instanceOf x = s.instanceOf x) (activations : t.activations = s.activations)
    (occurrences : t.occurrences = s.occurrences) : RaisesSound program t :=
  raises.transport (fun _ _ queued => signals ▸ queued) (Nat.le_of_eq nextIssue.symm)
    (fun x present _ => ⟨by simpa [scopeIds, scopes] using present, instances x⟩) (fun _ counted => counted.congr activations)
    fun _ member _ => occurrences ▸ member

/-- What lies within `scope` belongs to every set that holds `scope` and the children of its members. -/
theorem Within.closed_mem {s : State} {scope x : ScopeOccurrenceId} {set : List ScopeOccurrenceId} (inside : Within s x scope)
    (start : scope ∈ set) (closed : ∀ p ∈ set, ∀ child ∈ s.scopes, child.parent = some p → child.id ∈ set) : x ∈ set := by
  induction inside with
  | refl => exact start
  | parent child parent _ member link _ ih => exact closed parent (ih start) child member link

/-- What `State.subtree`'s breadth-first search keeps, from `scope`: everything it met is a present scope occurrence
within `scope`, met once, `scope` itself or a child of one it expanded; every child of one it expanded was met. -/
structure Search (s : State) (scope : ScopeOccurrenceId) (seen frontier : List ScopeOccurrenceId) : Prop where
  present : ∀ x ∈ seen ++ frontier, x ∈ scopeIds s
  nodup : (seen ++ frontier).Nodup
  within : ∀ x ∈ seen ++ frontier, Within s x scope
  closed : ∀ p ∈ seen, ∀ child ∈ s.scopes, child.parent = some p → child.id ∈ seen ++ frontier
  reached : ∀ x ∈ seen ++ frontier, x = scope ∨ ∃ p ∈ seen, ∃ child ∈ s.scopes, child.id = x ∧ child.parent = some p

theorem search_step {s : State} (formed : WellFormed program s) {scope next : ScopeOccurrenceId}
    {seen rest : List ScopeOccurrenceId} (search : Search s scope seen (next :: rest)) :
    Search s scope (seen ++ [next]) (rest ++ (s.scopes.filter (·.parent == some next)).map (·.id)) := by
  have perm : ((seen ++ [next]) ++ (rest ++ (s.scopes.filter (·.parent == some next)).map (·.id))).Perm
      ((seen ++ next :: rest) ++ (s.scopes.filter (·.parent == some next)).map (·.id)) := by
    simp only [List.append_assoc, List.cons_append]
    exact List.Perm.refl _
  have nextWithin := search.within next (by simp)
  have child_mem : ∀ x, x ∈ (s.scopes.filter (·.parent == some next)).map (·.id) →
      ∃ child ∈ s.scopes, child.id = x ∧ child.parent = some next := fun x member => by
    obtain ⟨child, inside, same⟩ := List.mem_map.mp member
    obtain ⟨inside, linked⟩ := List.mem_filter.mp inside
    exact ⟨child, inside, same, by simpa using linked⟩
  constructor
  · intro x member
    rcases List.mem_append.mp (perm.mem_iff.mp member) with old | new
    · exact search.present x old
    · obtain ⟨child, inside, same, _⟩ := child_mem x new
      exact List.mem_map.mpr ⟨child, inside, same⟩
  · refine perm.nodup_iff.mpr (List.nodup_append.mpr ⟨search.nodup, ?_, ?_⟩)
    · exact (formed.distinct.scopes.sublist ((List.filter_sublist).map _))
    · intro x old y new same
      subst same
      obtain ⟨child, inside, named, linked⟩ := child_mem x new
      rcases search.reached x old with first | ⟨p, seenP, found⟩
      · subst first
        exact parent_not_within formed inside linked (named ▸ nextWithin)
      · obtain ⟨other, otherInside, otherNamed, otherLinked⟩ := found
        have := scope_unique formed.distinct otherInside inside (otherNamed.trans named.symm)
        subst this
        rw [linked] at otherLinked
        cases otherLinked
        exact (List.nodup_append.mp search.nodup).2.2 _ seenP _ (by simp) rfl
  · intro x member
    rcases List.mem_append.mp (perm.mem_iff.mp member) with old | new
    · exact search.within x old
    · obtain ⟨child, inside, same, linked⟩ := child_mem x new
      exact same ▸ .parent child next scope inside linked nextWithin
  · intro p seenP child inside linked
    refine perm.mem_iff.mpr ?_
    rcases List.mem_append.mp seenP with old | new
    · exact List.mem_append_left _ (search.closed p old child inside linked)
    · simp only [List.mem_singleton] at new
      subst new
      exact List.mem_append_right _ (List.mem_map.mpr ⟨child, List.mem_filter.mpr ⟨inside, by simp [linked]⟩, rfl⟩)
  · intro x member
    rcases List.mem_append.mp (perm.mem_iff.mp member) with old | new
    · rcases search.reached x old with first | ⟨p, seenP, rest⟩
      · exact .inl first
      · exact .inr ⟨p, List.mem_append_left _ seenP, rest⟩
    · obtain ⟨child, inside, same, linked⟩ := child_mem x new
      exact .inr ⟨next, by simp, child, inside, same, linked⟩

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
    ends := fun status failure queued => formed.queue.ends status failure (narrows.signals.subset queued)
    completes := fun id leave writes rule queued =>
      narrows.nextIssue ▸ formed.queue.completes id leave writes rule (narrows.signals.subset queued) }
  have rooted : Rooted after := by
    obtain ⟨present, parentless, reach⟩ := formed.rooted
    refine ⟨by simpa [scopeIds, narrows.scopes] using present, by simpa [narrows.scopes] using parentless, ?_⟩
    intro scope member
    exact Within.congr narrows.scopes (reach scope (narrows.scopes ▸ member))
  have raises : RaisesSound program after := formed.raises.transport (fun _ _ queued => narrows.signals.subset queued)
    (Nat.le_of_eq narrows.nextIssue.symm)
    (fun x present _ => ⟨by simpa [scopeIds, narrows.scopes] using present, narrows.instances x⟩)
    (fun _ counted => counted.congr narrows.activations) fun _ member _ => narrows.occurrences ▸ member
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
  rooted := rooted
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
  typed := formed.typed.shrink (fun _ member => items member) (fun _ member _ => narrows.occurrences ▸ member)
    fun _ member => narrows.signals.subset member
  worked := formed.worked.shrink (fun _ member => items member) fun _ member _ => narrows.occurrences ▸ member
  roles := formed.roles.shrink fun _ member => narrows.occurrences ▸ member
  raises := raises }

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
  instanceId : after.instanceId = before.instanceId
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

end Kernel.Laws.State

module

public import Kernel.Laws.State

/-! # Laws of the kernel state: what the operations keep

That the state operations `Step` and the hooks apply keep `WellFormed` under the conditions their callers establish,
composed from what `Kernel.Laws.State` shows each operation does to the fields and the frames of
`Kernel.Laws.State.Frames` and `Kernel.Laws.State.Issue`; it reads no body. `Kernel.Laws.State.Removal` adds the
removal of an occurrence; `Kernel.Proofs.Step` assembles them into `Laws.Step.Phases` and `Kernel.Proofs.State` into
`Laws.Step.Operations`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

/-! ## Variables -/

/-- Rebinding or appending a name keeps a set's names distinct. -/
theorem names_after_set (entries : List (String × Value)) (name : String) (value : Value)
    (nodup : (entries.map (·.1)).Nodup) :
    ((if entries.any (·.1 == name) then entries.map fun entry => if entry.1 == name then (name, value) else entry
      else entries ++ [(name, value)]).map (·.1)).Nodup := by
  split
  · rename_i present
    have same : ((entries.map fun entry => if entry.1 == name then (name, value) else entry).map (·.1)) =
        entries.map (·.1) := by
      simp only [List.map_map]
      apply List.map_congr_left
      intro entry _
      by_cases targeted : entry.1 = name <;> simp [targeted]
    rw [same]; exact nodup
  · rename_i absent
    simp only [List.any_eq_true, beq_iff_eq, not_exists, not_and] at absent
    rw [List.map_append, List.nodup_append]
    refine ⟨nodup, by simp, ?_⟩
    intro first member second other
    simp only [List.map_cons, List.map_nil, List.mem_singleton] at other
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp member
    subst other; subst named
    exact fun targeted => absent entry inside targeted

/-- `setVariable` keeps the variable sets keyed, whichever scope occurrence it writes to. -/
theorem setVariable_variablesKeyed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (keyed : VariablesKeyed state) : VariablesKeyed (state.setVariable target name value) := by
  constructor
  · rw [setVariable_variables]
    split
    · rw [List.map_map]
      have same : ((·.scope) ∘ fun (vars : ScopeVariables) => if vars.scope == target then
          { vars with entries := if vars.entries.any (·.1 == name) then
              vars.entries.map fun entry => if entry.1 == name then (name, value) else entry
            else vars.entries ++ [(name, value)] } else vars) = (·.scope) := by
        funext vars
        by_cases targeted : vars.scope = target <;> simp [targeted]
      rw [same]; exact keyed.scopes
    · rename_i absent
      simp only [List.any_eq_true, beq_iff_eq, not_exists, not_and] at absent
      rw [List.map_append, List.nodup_append]
      refine ⟨keyed.scopes, by simp, ?_⟩
      intro first member second other
      simp only [List.map_cons, List.map_nil, List.mem_singleton] at other
      obtain ⟨vars, inside, located⟩ := List.mem_map.mp member
      subst other; subst located
      exact fun targeted => absent vars inside targeted
  · intro vars member
    rw [setVariable_variables] at member
    split at member
    · obtain ⟨old, inside, made⟩ := List.mem_map.mp member
      subst made
      by_cases targeted : old.scope = target
      · simp only [targeted, beq_self_eq_true, ite_true]
        exact names_after_set old.entries name value (keyed.names old inside)
      · simp only [beq_iff_eq, targeted, ite_false]
        exact keyed.names old inside
    · rcases List.mem_append.mp member with old | fresh
      · exact keyed.names vars old
      · simp only [List.mem_singleton] at fresh
        subst fresh
        simp

/-- `setVariable` keeps a state well-formed when the scope occurrence it writes to is present. -/
theorem setVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String} {value : Value}
    (formed : WellFormed state) (present : target ∈ scopeIds state) :
    WellFormed (state.setVariable target name value) := by
  have same := setVariable_same state target name value
  refine formed.ofVariables same ?_ (setVariable_variablesKeyed formed.variables)
  intro vars member
  rw [scopeIds, same.scopes]
  rw [setVariable_variables] at member
  split at member
  · obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have := formed.owned.variableScopes old inside
    by_cases targeted : old.scope = target <;> simpa [targeted, scopeIds] using this
  · rcases List.mem_append.mp member with old | fresh
    · exact formed.owned.variableScopes vars old
    · simp only [List.mem_singleton] at fresh
      subst fresh
      exact present

/-- `removeVariable` keeps a state well-formed. -/
theorem removeVariable_wellFormed {state : State} {target : ScopeOccurrenceId} {name : String}
    (formed : WellFormed state) : WellFormed (state.removeVariable target name) := by
  refine formed.ofVariables (removeVariable_same state target name) ?_ ⟨?_, ?_⟩
  · intro vars member
    rw [removeVariable_variables] at member
    obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have := formed.owned.variableScopes old inside
    rw [scopeIds, (removeVariable_same state target name).scopes]
    by_cases targeted : old.scope = target <;> simpa [targeted, scopeIds] using this
  · have same : ((state.removeVariable target name).variables.map (·.scope)) = state.variables.map (·.scope) := by
      simp only [removeVariable_variables, List.map_map]
      apply List.map_congr_left
      intro vars _
      by_cases targeted : vars.scope = target <;> simp [targeted]
    rw [same]; exact formed.variables.scopes
  · intro vars member
    rw [removeVariable_variables] at member
    obtain ⟨old, inside, made⟩ := List.mem_map.mp member
    subst made
    have nodup := formed.variables.names old inside
    by_cases targeted : old.scope = target
    · simp only [targeted, beq_self_eq_true, ite_true]
      exact nodup.sublist ((List.filter_sublist).map _)
    · simp only [beq_iff_eq, targeted, ite_false]
      exact nodup

/-! ## The phases of `Step`

That each phase `Step` runs itself keeps `WellFormed` (`Laws.Step.Phases`, which `Kernel.Proofs.State` assembles). -/

/-- `Step.onRunning` starts an input from an empty journal and outbox. -/
theorem reset_wellFormed {s : State} (formed : WellFormed s) : WellFormed { s with journal := [], outbox := [] } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun fact member => by
      simp only [starts, List.flatMap_nil, List.nil_append] at member; exact List.mem_append_right _ member⟩ rfl
    (formed.startedOnce.sublist ((List.sublist_append_right _ _).map _))

/-- `Step.advanceClock` moves the logical time. -/
theorem clock_wellFormed {s : State} (formed : WellFormed s) (atMs : Nat) : WellFormed { s with logicalTimeMs := atMs } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun _ => id⟩ rfl formed.startedOnce

/-- `Step.orderJournal` puts the journal in run order. -/
theorem runOrder_wellFormed {s : State} (formed : WellFormed s) : WellFormed { s with journal := s.journal.reverse } :=
  have perm : (starts { s with journal := s.journal.reverse }).Perm (starts s) :=
    ((List.reverse_perm _).flatMap_right _).append_right _
  formed.permuted ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun _ => perm.mem_iff.mp⟩ rfl perm

/-- `Step.conclude` journals the draft, whose start facts the transition carries, and empties it and the write log. -/
theorem journal_wellFormed {s : State} (formed : WellFormed s) {transition : Transition}
    (started : transition.started = s.draft.started) :
    WellFormed { s with journal := transition :: s.journal, draft := {}, writes := [] } :=
  have perm : (starts { s with journal := transition :: s.journal, draft := {}, writes := [] }).Perm (starts s) := by
    simp only [starts, List.flatMap_cons, started, List.append_nil]
    exact List.perm_append_comm
  formed.permuted ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun _ => perm.mem_iff.mp⟩ rfl perm

/-- `State.recordEnd` journals an end fact. -/
theorem recordEnd_wellFormed {s : State} (formed : WellFormed s) (key : OccurrenceKey) (terminal : Terminal) :
    WellFormed (s.recordEnd key terminal) :=
  recordEnd_eq s key terminal ▸ formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _, fun _ => id⟩ rfl formed.startedOnce

/-- The closure takes queued signals off the queue. -/
theorem dequeue_wellFormed {s : State} (formed : WellFormed s) {signals : List Signal} (fewer : signals.Sublist s.signals) :
    WellFormed { s with signals } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, fewer, fun _ => id⟩ rfl formed.startedOnce

/-- The closure takes its next token off the work stack. -/
theorem untoken_wellFormed {s : State} (formed : WellFormed s) {tokens : List Token} (fewer : tokens.Sublist s.tokens) :
    WellFormed { s with tokens } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, fewer, .refl _, fun _ => id⟩ rfl formed.startedOnce

/-- `State.closeOwnItems` closes the items waiting for an occurrence. -/
theorem closeOwnItems_wellFormed {s : State} (formed : WellFormed s) (occurrence : Nat) :
    WellFormed (s.closeOwnItems occurrence) :=
  closeOwnItems_eq s occurrence ▸ formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, List.filter_sublist, .refl _, .refl _, fun _ => id⟩ rfl
    formed.startedOnce

/-- Replacing what open items wait for, each keeping its identity, element, scope occurrence, occurrence and
attachment, keeps a state well-formed: no clause reads what an item waits for. -/
theorem rekind_wellFormed {s : State} (formed : WellFormed s) {change : OpenItem → OpenItem}
    (kept : ∀ item, change item = { item with kind := (change item).kind }) :
    WellFormed { s with openItems := s.openItems.map change } := by
  have keys : key { s with openItems := s.openItems.map change } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  have instances : ∀ x, { s with openItems := s.openItems.map change }.instanceOf x = s.instanceOf x :=
    instanceOf_congr rfl rfl
  have back : ∀ item ∈ s.openItems.map change, ∃ old ∈ s.openItems, change old = item := fun _ member =>
    List.mem_map.mp member
  have ids : (fun item => (change item).id) = (·.id) := funext fun item => by rw [kept item]
  refine ⟨?issued, ?distinct, formed.startedOnce, ⟨formed.activations.keys, formed.activations.positive⟩, ?reservations,
    ?owned, ?rooted, ⟨formed.variables.scopes, formed.variables.names⟩, formed.failure,
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends⟩, formed.counted,
    ?occurrencesCounted, formed.ownedBelow, ?claimed⟩
  case issued =>
    refine ⟨formed.issued.occurrences, fun item member => ?_, formed.issued.scopes⟩
    obtain ⟨old, inside, rfl⟩ := back item member
    rw [kept old]
    exact formed.issued.items old inside
  case distinct =>
    refine ⟨formed.distinct.occurrences, ?_, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
    show ((s.openItems.map change).map (·.id)).Nodup
    rw [List.map_map, Function.comp_def, ids]
    exact formed.distinct.items
  case reservations =>
    unfold ReservationsUnstarted
    rw [keys]
    exact formed.reservations
  case owned =>
    refine ⟨formed.owned.occurrenceScopes, fun item member => ?_, fun item member => ?_, fun item member => ?_,
      formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
    all_goals obtain ⟨old, inside, rfl⟩ := back item member
    all_goals rw [kept old]
    · exact formed.owned.itemScopes old inside
    · exact formed.owned.itemOccurrences old inside
    · exact formed.owned.attachments old inside
  case rooted =>
    exact ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
      Within.congr (s := s) (t := { s with openItems := s.openItems.map change }) rfl (formed.rooted.2.2 scope member)⟩
  case occurrencesCounted =>
    unfold OccurrencesCounted
    rw [keys]
    exact formed.occurrencesCounted
  case claimed =>
    refine ⟨fun item member attached reserved other inside same => ?_, fun request queued => ?_,
      formed.claimed.signalsApart, formed.claimed.tokensApart, formed.claimed.queuesApart, formed.claimed.uncompleted⟩
    · obtain ⟨old, oldInside, rfl⟩ := back item member
      obtain ⟨oldOther, otherInside, rfl⟩ := back other inside
      rw [kept old] at attached same reserved
      rw [kept oldOther] at same
      rw [formed.claimed.attached old oldInside attached reserved oldOther otherInside same]
    · obtain ⟨nodup, beginnable⟩ := formed.claimed.named request queued
      refine ⟨nodup, fun id named => ?_⟩
      obtain ⟨below, facts⟩ := beginnable id named
      refine ⟨below, fun occurrence member same => ?_⟩
      obtain ⟨unbegun, free, instance_⟩ := facts occurrence member same
      refine ⟨unbegun, fun item inside => ?_, fun present => by rw [instances, instances]; exact instance_ present⟩
      obtain ⟨old, oldInside, rfl⟩ := back item inside
      rw [kept old]
      exact free old oldInside

/-- Issuing an identifier keeps a state well-formed: what stands was issued before, and so before the next. -/
theorem issue_wellFormed {s : State} (formed : WellFormed s) : WellFormed s.issue.1 := by
  rw [issue_eq]
  show WellFormed { s with nextIssue := s.nextIssue + 1 }
  have later : s.nextIssue ≤ s.nextIssue + 1 := Nat.le_succ _
  have keys : key { s with nextIssue := s.nextIssue + 1 } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  exact {
  issued := ⟨fun occurrence member => Nat.lt_succ_of_lt (formed.issued.occurrences occurrence member),
    fun item member => Nat.lt_succ_of_lt (formed.issued.items item member),
    fun scope member => Nat.lt_succ_of_lt (formed.issued.scopes scope member)⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences,
    formed.owned.attachments, formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
    Within.congr (s := s) (t := { s with nextIssue := s.nextIssue + 1 }) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := formed.failure
  queue := {
    arm := fun host element scope queued =>
      have ⟨host_, scope_, rest⟩ := formed.queue.arm host element scope queued
      ⟨Nat.lt_succ_of_lt host_, Nat.lt_succ_of_lt scope_, rest⟩
    armScope := fun scope queued => Nat.lt_succ_of_lt (formed.queue.armScope scope queued)
    armGateway := fun occurrence gateway scope queued =>
      have ⟨occurrence_, scope_, rest⟩ := formed.queue.armGateway occurrence gateway scope queued
      ⟨Nat.lt_succ_of_lt occurrence_, Nat.lt_succ_of_lt scope_, rest⟩
    ends := formed.queue.ends }
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := formed.claimed.shrink (fun _ member => member) (fun _ member => member) formed.owned.occurrenceScopes
    (fun _ member => member) (fun _ _ => by apply instanceOf_congr <;> rfl) later (.refl _) (.refl _) }

/-- Replacing the retained compensation records and runs keeps a state well-formed: no clause reads them. -/
theorem compensation_wellFormed {s : State} (formed : WellFormed s) (compensation : Compensations) :
    WellFormed { s with slots := { s.slots with compensation } } :=
  formed.narrow ⟨rfl, rfl, rfl, rfl, fun _ => by apply instanceOf_congr <;> rfl, id, .refl _, .refl _, .refl _,
    fun _ => id⟩ rfl formed.startedOnce

/-- Queuing a signal keeps a state well-formed when the queue stays sound and the claims single. -/
theorem signal_wellFormed {s : State} {signal : Signal} (formed : WellFormed s) (queue : QueueSound (s.signal signal))
    (claimed : ReservationsClaimed (s.signal signal)) : WellFormed (s.signal signal) := by
  rw [signal_eq] at *
  have keys : key { s with signals := s.signals ++ [signal] } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  exact {
  issued := ⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩
  distinct := ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
  startedOnce := formed.startedOnce
  activations := ⟨formed.activations.keys, formed.activations.positive⟩
  reservations := by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations
  owned := ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences,
    formed.owned.attachments, formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
  rooted := ⟨formed.rooted.1, formed.rooted.2.1, fun scope member =>
    Within.congr (s := s) (t := { s with signals := s.signals ++ [signal] }) rfl (formed.rooted.2.2 scope member)⟩
  variables := ⟨formed.variables.scopes, formed.variables.names⟩
  failure := formed.failure
  queue := queue
  counted := formed.counted
  occurrencesCounted := by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted
  ownedBelow := formed.ownedBelow
  claimed := claimed }

/-- A queued signal keeps the queue sound when, should it be an arming, what it names was issued and its host, while it
stands, is begun in the named scope occurrence, and, should it be an instance end, it records a failure exactly when it
fails. Which signal it is, `Kernel.Proofs.Step` tells, since only `Signal`'s owners may tell its constructors apart. -/
theorem signal_queueSound {s : State} {signal : Signal} (formed : WellFormed s)
    (arm : ∀ host element scope, signal = .arm host element scope → host < s.nextIssue ∧ scope.value < s.nextIssue ∧
      ∀ occurrence ∈ s.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope)
    (armScope : ∀ scope, signal = .armScope scope → scope.value < s.nextIssue)
    (armGateway : ∀ occurrence gateway scope, signal = .armGateway occurrence gateway scope →
      occurrence < s.nextIssue ∧ scope.value < s.nextIssue ∧
        ∀ found ∈ s.occurrences, found.id = occurrence → found.begun = true ∧ found.scope = scope)
    (ends : ∀ status failure, signal = .endInstance status failure → (failure.isSome = true ↔ status = .failed)) :
    QueueSound (s.signal signal) := by
  rw [signal_eq]
  exact {
  arm host element scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.arm host element scope old
    · exact arm host element scope (List.mem_singleton.mp new).symm
  armScope scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.armScope scope old
    · exact armScope scope (List.mem_singleton.mp new).symm
  armGateway occurrence gateway scope queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.armGateway occurrence gateway scope old
    · exact armGateway occurrence gateway scope (List.mem_singleton.mp new).symm
  ends status failure queued := by
    rcases List.mem_append.mp queued with old | new
    · exact formed.queue.ends status failure old
    · exact ends status failure (List.mem_singleton.mp new).symm }

/-- A pair of a list with one entry appended lies in the list, unless its second entry is the appended one. -/
private theorem pair_of_append {α : Type} {a b c : α} {l : List α} (pair : [a, b].Sublist (l ++ [c])) (other : b ≠ c) :
    [a, b].Sublist l := by
  obtain ⟨first, second, split, rest⟩ := List.sublist_append_iff.mp pair
  obtain ⟨inFirst, inSecond⟩ := rest
  match second, inSecond with
  | [], _ => rw [List.append_nil] at split; exact split ▸ inFirst
  | [_], sub =>
    obtain rfl := List.mem_singleton.mp (List.singleton_sublist.mp sub)
    have := congrArg List.reverse split
    simp at this
    exact absurd this.1 other
  | _ :: _ :: _, sub => have := sub.length_le; simp at this

/-- Queuing a signal that is no begin, and if a completion, then of an occurrence no queued begin names, keeps the
claims single. Which signal it is, `Kernel.Proofs.Step` tells. -/
theorem signal_claimed {s : State} {signal : Signal} (formed : WellFormed s)
    (notBegin : ∀ request, signal ≠ .begin request)
    (completes : ∀ id leave writes rule, signal = .complete id leave writes rule →
      ∀ request, Queued s request → id ∉ names request) :
    ReservationsClaimed (s.signal signal) := by
  rw [signal_eq]
  have old : ∀ request, Signal.begin request ∈ s.signals ++ [signal] → Signal.begin request ∈ s.signals :=
    fun request queued => (List.mem_append.mp queued).resolve_right fun new =>
      notBegin request (List.mem_singleton.mp new).symm
  have queuedOld : ∀ request, Queued { s with signals := s.signals ++ [signal] } request → Queued s request := fun request queued =>
    queued.elim (fun queued => .inl (old request queued)) .inr
  exact ⟨formed.claimed.attached, fun request queued => (formed.claimed.named request (queuedOld request queued)).imp id
      fun beginnable id named => (beginnable id named).congr rfl rfl rfl rfl fun _ => by apply instanceOf_congr <;> rfl,
    fun first second pair => formed.claimed.signalsApart first second (pair_of_append pair (notBegin second).symm),
    formed.claimed.tokensApart,
    fun first second queued token => formed.claimed.queuesApart first second (old first queued) token,
    fun request id leave writes rule queued named completed => formed.claimed.uncompleted request id leave writes rule
      (queuedOld request queued) named ((List.mem_append.mp completed).resolve_right fun new =>
        completes id leave writes rule (List.mem_singleton.mp new).symm request (queuedOld request queued) named)⟩

/-- No queued begin names a begun occurrence that stands: what a queued begin names is unbegun while it stands. -/
theorem begun_unnamed {s : State} (formed : WellFormed s) {occurrence : Occurrence} (member : occurrence ∈ s.occurrences)
    (begun : occurrence.begun = true) : ∀ request, Queued s request → occurrence.id ∉ names request :=
  fun request queued named => by
    have := ((formed.claimed.named request queued).2 _ named).2 occurrence member rfl
    simp [begun] at this

/-- No queued begin names the occurrence an open item waits for: a beginnable reservation has no item waiting for it. -/
theorem waited_unnamed {s : State} (formed : WellFormed s) {item : OpenItem} (member : item ∈ s.openItems) :
    ∀ request, Queued s request → item.occurrence ∉ names request :=
  fun request queued named => by
    obtain ⟨occurrence, inside, same, _⟩ := formed.owned.itemOccurrences item member
    have := (((formed.claimed.named request queued).2 _ named).2 occurrence inside same).2.1 item member
    exact this.1 rfl

/-- An item added with a fresh identity below the counter, waiting for an occurrence that stands in its own scope
occurrence and hanging, if at all, on a begun occurrence there, keeps a state well-formed when nothing queued begins
what it waits for and an item already waiting for that occurrence waits for a begun one. -/
theorem addItem_wellFormed {s : State} (formed : WellFormed s) {item : OpenItem}
    (fresh : ∀ other ∈ s.openItems, other.id < item.id) (below : item.id < s.nextIssue)
    (waits : ∃ occurrence ∈ s.occurrences, occurrence.id = item.occurrence ∧ occurrence.element = item.element ∧
      occurrence.scope = item.scope)
    (hangs : ∀ host, item.attachedTo = some host → ∃ occurrence ∈ s.occurrences, occurrence.id = host ∧
      occurrence.begun = true ∧ occurrence.scope = item.scope)
    (apart : ∀ other ∈ s.openItems, other.occurrence = item.occurrence → ∀ occurrence ∈ s.occurrences,
      occurrence.id = item.occurrence → occurrence.begun = true)
    (unnamed : ∀ request, Queued s request → item.occurrence ∉ names request) :
    WellFormed { s with openItems := s.openItems ++ [item] } := by
  have members : ∀ found ∈ s.openItems ++ [item], found ∈ s.openItems ∨ found = item := fun found inside => by
    simpa using inside
  have instances : ∀ x, State.instanceOf { s with openItems := s.openItems ++ [item] } x = s.instanceOf x :=
    instanceOf_congr rfl rfl
  have keys : key { s with openItems := s.openItems ++ [item] } = key s := funext fun _ => key_congr (instances _)
  -- An item sharing what another waits for, either attached, makes that occurrence begun, so no reservation.
  have shared : ∀ first ∈ s.openItems ++ [item], ∀ second ∈ s.openItems ++ [item], first ≠ second →
      first.occurrence = second.occurrence → ∀ occurrence ∈ s.occurrences, occurrence.id = first.occurrence →
        occurrence.begun = false → first.attachedTo.isSome = true → False := by
    intro first firstIn second secondIn differ same occurrence present named unbegun attached
    rcases members first firstIn with firstOld | rfl <;> rcases members second secondIn with secondOld | rfl
    · exact differ (formed.claimed.attached first firstOld attached ⟨occurrence, present, named, unbegun⟩ second
        secondOld same.symm).symm
    · simp [apart first firstOld same occurrence present (named.trans same)] at unbegun
    · simp [apart second secondOld same.symm occurrence present named] at unbegun
    · exact differ rfl
  refine ⟨?issued, ?distinct, formed.startedOnce, ⟨formed.activations.keys, formed.activations.positive⟩,
    by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations, ?owned, ?rooted,
    ⟨formed.variables.scopes, formed.variables.names⟩, formed.failure,
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends⟩, formed.counted,
    by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted, formed.ownedBelow, ?claimed⟩
  case issued =>
    refine ⟨formed.issued.occurrences, fun found inside => ?_, formed.issued.scopes⟩
    rcases members found inside with old | rfl
    · exact formed.issued.items found old
    · exact below
  case distinct =>
    refine ⟨formed.distinct.occurrences, ?_, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩
    rw [List.map_append, List.nodup_append]
    exact ⟨formed.distinct.items, by simp, fun a old b new same => by
      obtain ⟨other, inside, rfl⟩ := List.mem_map.mp old
      simp at new
      have := fresh other inside
      omega⟩
  case owned =>
    obtain ⟨occurrence, present, named, same⟩ := waits
    refine ⟨formed.owned.occurrenceScopes, fun found inside => ?_, fun found inside => ?_, fun found inside => ?_,
      formed.owned.scopeOwners, formed.owned.variableScopes, formed.owned.tokenScopes⟩
    · rcases members found inside with old | rfl
      · exact formed.owned.itemScopes found old
      · exact same.2 ▸ formed.owned.occurrenceScopes occurrence present
    · rcases members found inside with old | rfl
      · exact formed.owned.itemOccurrences found old
      · exact ⟨occurrence, present, named, same⟩
    · rcases members found inside with old | rfl
      · exact formed.owned.attachments found old
      · exact hangs
  case rooted =>
    exact ⟨formed.rooted.1, formed.rooted.2.1, fun scope inside =>
      Within.congr (s := s) (t := { s with openItems := s.openItems ++ [item] }) rfl (formed.rooted.2.2 scope inside)⟩
  case claimed =>
    refine ⟨fun found inside attached reserved other held same => ?_, fun request queued => ?_,
      formed.claimed.signalsApart, formed.claimed.tokensApart, formed.claimed.queuesApart, formed.claimed.uncompleted⟩
    · obtain ⟨occurrence, present, named, unbegun⟩ := reserved
      exact Classical.byContradiction fun differ =>
        shared found inside other held (Ne.symm differ) same.symm occurrence present named unbegun attached
    · obtain ⟨nodup, beginnable⟩ := formed.claimed.named request queued
      refine ⟨nodup, fun id named => ?_⟩
      obtain ⟨issuedBelow, facts⟩ := beginnable id named
      refine ⟨issuedBelow, fun found present same => ?_⟩
      obtain ⟨unbegun, free, instance_⟩ := facts found present same
      refine ⟨unbegun, fun waiting inside => ?_, fun stands => by
        rw [instances, instances]
        exact instance_ stands⟩
      rcases members waiting inside with old | rfl
      · exact free waiting old
      · refine ⟨fun equal => unnamed request queued (equal ▸ named), fun hung => ?_⟩
        obtain ⟨host, hostIn, hostNamed, begun⟩ := hangs id hung
        have := nodup_map_eq formed.distinct.occurrences hostIn present (hostNamed.trans same.symm)
        subst this
        simp [begun.1] at unbegun

/-- An item opened at the counter for a begun occurrence that stands keeps a state well-formed: it holds no
reservation, so nothing queued begins what it waits for. -/
theorem openItem_wellFormed {s : State} (formed : WellFormed s) (kind : OpenKind) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) (begun : occurrence.begun = true) : WellFormed (s.openItem kind occurrence) := by
  rw [openItem_eq]
  have counted : WellFormed { s with nextIssue := s.nextIssue + 1 } := by
    have := issue_wellFormed formed
    rw [issue_eq] at this
    exact this
  exact addItem_wellFormed counted (fun other inside => formed.issued.items other inside) (Nat.lt_succ_self _)
    ⟨occurrence, member, rfl, rfl, rfl⟩ (fun _ hung => by simp at hung)
    (fun _ _ _ found present same => by rw [nodup_map_eq formed.distinct.occurrences present member same]; exact begun)
    (begun_unnamed formed member begun)

/-- A subscription opened in a scope occurrence that stands, hanging, if at all, on a begun occurrence there, keeps a
state well-formed: its reservation is fresh, so no item and nothing queued names it. -/
theorem openSubscription_wellFormed {s : State} (formed : WellFormed s) (kind : OpenKind) (element : ElementId)
    {scope : ScopeOccurrenceId} (stands : scope ∈ scopeIds s) {host : Option Nat}
    (hangs : ∀ id, host = some id → ∃ occurrence ∈ s.occurrences, occurrence.id = id ∧ occurrence.begun = true ∧
      occurrence.scope = scope) (passive : Bool) :
    WellFormed (s.openSubscription kind element scope host passive).1 := by
  rw [openSubscription_eq]
  have reserves := reserve_reserves formed.activations element scope
  obtain ⟨reserved, unnamed⟩ := reserves.wellFormed formed stands
  generalize s.reserve element scope = pair at reserves reserved unnamed
  obtain ⟨t, reservation⟩ := pair
  dsimp only at reserves reserved unnamed ⊢
  have counted : WellFormed { t with nextIssue := t.nextIssue + 1 } := by
    have := issue_wellFormed reserved
    rw [issue_eq] at this
    exact this
  have above : ∀ other ∈ t.openItems, other.occurrence ≠ reservation.id := fun other inside same => by
    obtain ⟨waited, present, named, _⟩ := formed.owned.itemOccurrences other (reserves.openItems ▸ inside)
    have := formed.issued.occurrences waited present
    have := reserves.id
    omega
  refine addItem_wellFormed counted (fun other inside => reserved.issued.items other inside) (Nat.lt_succ_self _)
    ⟨reservation, by rw [reserves.occurrences]; simp, rfl, reserves.kind, reserves.placed⟩ (fun id hung => ?_)
    (fun other inside same => absurd same (above other inside)) unnamed
  obtain ⟨occurrence, present, rest⟩ := hangs id hung
  exact ⟨occurrence, by rw [reserves.occurrences]; exact List.mem_append_left _ present, rest⟩

private theorem pair_of_append_absent {α : Type} {a b : α} {l m : List α} (pair : [a, b].Sublist (l ++ m))
    (first : a ∉ m) (second : b ∉ m) : [a, b].Sublist l := by
  obtain ⟨front, back, split, rest⟩ := List.sublist_append_iff.mp pair
  obtain ⟨inFront, inBack⟩ := rest
  match back, inBack with
  | [], _ => rw [List.append_nil] at split; exact split ▸ inFront
  | x :: _, sub =>
    have inPair : x ∈ [a, b] := split ▸ List.mem_append_right _ (List.mem_cons_self ..)
    have inM : x ∈ m := sub.subset (List.mem_cons_self ..)
    rcases List.mem_cons.mp inPair with rfl | later
    · exact absurd inM first
    · exact absurd ((List.mem_singleton.mp later) ▸ inM) second

/-- `State.emit` queues flow tokens in a scope occurrence that stands: no begin, so the claims stay as they were. -/
theorem emit_wellFormed {s : State} (formed : WellFormed s) (flows : List FlowId) {scope : ScopeOccurrenceId}
    (stands : scope ∈ scopeIds s) : WellFormed (s.emit flows scope) := by
  rw [emit_eq]
  have flowsOnly : ∀ request, Token.begin request ∉ flows.map (Token.flow · scope) := by simp
  have old : ∀ request, Token.begin request ∈ s.tokens ++ flows.map (Token.flow · scope) →
      Token.begin request ∈ s.tokens := fun request queued =>
    (List.mem_append.mp queued).resolve_right (flowsOnly request)
  have queuedOld : ∀ request, Queued { s with tokens := s.tokens ++ flows.map (Token.flow · scope) } request →
      Queued s request := fun request queued => queued.elim .inl fun queued => .inr (old request queued)
  have keys : key { s with tokens := s.tokens ++ flows.map (Token.flow · scope) } = key s :=
    funext fun _ => key_congr (by apply instanceOf_congr <;> rfl)
  refine ⟨⟨formed.issued.occurrences, formed.issued.items, formed.issued.scopes⟩,
    ⟨formed.distinct.occurrences, formed.distinct.items, formed.distinct.scopes, keys ▸ formed.distinct.keys⟩,
    formed.startedOnce, ⟨formed.activations.keys, formed.activations.positive⟩,
    by unfold ReservationsUnstarted; rw [keys]; exact formed.reservations,
    ⟨formed.owned.occurrenceScopes, formed.owned.itemScopes, formed.owned.itemOccurrences, formed.owned.attachments,
      formed.owned.scopeOwners, formed.owned.variableScopes, fun token member => ?_⟩,
    ⟨formed.rooted.1, formed.rooted.2.1, fun x member => Within.congr (s := s)
      (t := { s with tokens := s.tokens ++ flows.map (Token.flow · scope) }) rfl (formed.rooted.2.2 x member)⟩,
    ⟨formed.variables.scopes, formed.variables.names⟩, formed.failure,
    ⟨formed.queue.arm, formed.queue.armScope, formed.queue.armGateway, formed.queue.ends⟩, formed.counted,
    by unfold OccurrencesCounted; rw [keys]; exact formed.occurrencesCounted, formed.ownedBelow,
    ⟨formed.claimed.attached, fun request queued => (formed.claimed.named request (queuedOld request queued)).imp id
      fun beginnable id named => (beginnable id named).congr rfl rfl rfl rfl (instanceOf_congr rfl rfl),
    formed.claimed.signalsApart, fun first second pair => formed.claimed.tokensApart first second ?_,
    fun first second signal token => formed.claimed.queuesApart first second signal (old second token),
    fun request id leave writes rule queued named completed =>
      formed.claimed.uncompleted request id leave writes rule (queuedOld request queued) named completed⟩⟩
  · rcases List.mem_append.mp member with old | new
    · exact formed.owned.tokenScopes token old
    · obtain ⟨flow, _, rfl⟩ := List.mem_map.mp new
      rw [busyScope_flow]
      exact stands
  · exact pair_of_append_absent pair (flowsOnly first) (flowsOnly second)

/-! ## Beginning occurrences -/

/-- The begin of a request whose reservations are beginnable and unclaimed, in a scope occurrence that stands. -/
theorem begin_wellFormed {state : State} (formed : WellFormed state) (request : BeginRequest) (role : ActivationRole)
    (sourceType : String) (stands : request.scope ∈ scopeIds state)
    (admitted : ∀ id ∈ names request, Beginnable state request.scope id ∧ Unclaimed state id) :
    WellFormed (state.beginOccurrence request role sourceType).1 :=
  (beginOccurrence_begins formed.activations request role sourceType).wellFormed formed stands admitted

/-- Such a begin leaves the request's start Event reservation beginnable and unclaimed where its occurrence runs. -/
theorem begin_entry {state : State} (formed : WellFormed state) (request : BeginRequest) (role : ActivationRole)
    (sourceType : String) (nodup : (names request).Nodup)
    (admitted : ∀ id ∈ names request, Beginnable state request.scope id ∧ Unclaimed state id) :
    ∀ id ∈ request.inner.toList, Beginnable (state.beginOccurrence request role sourceType).1
        (state.beginOccurrence request role sourceType).2.scope id ∧
      Unclaimed (state.beginOccurrence request role sourceType).1 id :=
  (beginOccurrence_begins formed.activations request role sourceType).entry nodup admitted

/-- A reservation in a scope occurrence that stands, which nothing queued names. -/
theorem reserve_wellFormed {state : State} (formed : WellFormed state) (element : ElementId)
    (scope : ScopeOccurrenceId) (stands : scope ∈ scopeIds state) :
    WellFormed (state.reserve element scope).1 ∧
      ∀ request, Queued (state.reserve element scope).1 request → (state.reserve element scope).2.id ∉ names request :=
  (reserve_reserves formed.activations element scope).wellFormed formed stands

/-- Starting an occurrence that no queued begin names. -/
theorem startReserved_wellFormed {state : State} (formed : WellFormed state) {occurrence : Occurrence}
    (sourceType : String) (member : occurrence ∈ state.occurrences)
    (unnamed : ∀ request, Queued state request → occurrence.id ∉ names request) :
    WellFormed (state.startReserved occurrence sourceType).1 := by
  cases begun : occurrence.begun
  · exact (startReserved_starts state sourceType begun).wellFormed formed member begun unnamed
  · rw [startReserved_begun state sourceType begun]
    exact formed

/-- The begin at the head of the signal queue may begin once it leaves the queue: what it names is beginnable, and
nothing left queued claims it. -/
theorem admitted_signal {state : State} (formed : WellFormed state) {request : BeginRequest} {rest : List Signal}
    (head : state.signals = .begin request :: rest) :
    (names request).Nodup ∧ ∀ id ∈ names request,
      Beginnable { state with signals := rest } request.scope id ∧ Unclaimed { state with signals := rest } id := by
  have queued : Queued state request := .inl (head ▸ List.mem_cons_self ..)
  obtain ⟨nodup, beginnable⟩ := formed.claimed.named request queued
  refine ⟨nodup, fun id named => ⟨(beginnable id named).congr rfl rfl rfl rfl (instanceOf_congr rfl rfl), ?_, ?_⟩⟩
  · intro other (claimed : Signal.begin other ∈ rest ∨ Token.begin other ∈ state.tokens)
    rcases claimed with signal | token
    · exact formed.claimed.signalsApart request other (head ▸ List.cons_sublist_cons.mpr (List.singleton_sublist.mpr signal))
        id named
    · exact formed.claimed.queuesApart request other (head ▸ List.mem_cons_self ..) token id named
  · intro leave writes rule completed
    exact formed.claimed.uncompleted request id leave writes rule queued named (head ▸ List.mem_cons_of_mem _ completed)

/-- The begin the closure takes from the work stack, from its top or its bottom, may begin once it leaves the stack. -/
theorem admitted_token {state : State} (formed : WellFormed state) {request : BeginRequest} {rest : List Token}
    (taken : state.tokens = .begin request :: rest ∨ state.tokens = rest ++ [.begin request]) :
    (names request).Nodup ∧ ∀ id ∈ names request,
      Beginnable { state with tokens := rest } request.scope id ∧ Unclaimed { state with tokens := rest } id := by
  have member : Token.begin request ∈ state.tokens := by
    rcases taken with top | bottom
    · exact top ▸ List.mem_cons_self ..
    · exact bottom ▸ List.mem_append_right _ (List.mem_singleton_self _)
  have queued : Queued state request := .inr member
  obtain ⟨nodup, beginnable⟩ := formed.claimed.named request queued
  refine ⟨nodup, fun id named => ⟨(beginnable id named).congr rfl rfl rfl rfl (instanceOf_congr rfl rfl), ?_, ?_⟩⟩
  · intro other (claimed : Signal.begin other ∈ state.signals ∨ Token.begin other ∈ rest) inOther
    rcases claimed with signal | token
    · exact formed.claimed.queuesApart other request signal member id inOther named
    · rcases taken with top | bottom
      · exact formed.claimed.tokensApart request other
          (top ▸ List.cons_sublist_cons.mpr (List.singleton_sublist.mpr token)) id named inOther
      · exact formed.claimed.tokensApart other request
          (by rw [bottom]; exact (List.singleton_sublist.mpr token).append (.refl [_])) id inOther named
  · intro leave writes rule completed
    exact formed.claimed.uncompleted request id leave writes rule queued named completed

/-- A queued completion completes nothing a queued begin names. -/
theorem complete_unnamed {state : State} (formed : WellFormed state) {id : Nat} {leave : Leave}
    {writes : List (String × Value)} {rule : WriteRule}
    (completed : Signal.complete id leave writes rule ∈ state.signals) :
    ∀ request, Queued state request → id ∉ names request :=
  fun request queued named => formed.claimed.uncompleted request id leave writes rule queued named completed

/-- An occurrence's scope occurrence stands. -/
theorem housed_wellFormed {s : State} (formed : WellFormed s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) : ∃ entry ∈ s.scopes, entry.id = occurrence.scope :=
  List.mem_map.mp (formed.owned.occurrenceScopes occurrence member)

/-- Clearing a present scope occurrence keeps a state well-formed under `Cleared.wellFormed`'s conditions on what it
keeps and what it leaves hanging. -/
theorem clearInside_wellFormed {s : State} (formed : WellFormed s) {scope : ScopeOccurrenceId} {keep : List Nat}
    (present : scope ∈ scopeIds s)
    (kept : ∀ occurrence ∈ s.occurrences, occurrence.id ∈ keep → ¬ StrictlyWithin s occurrence.scope scope)
    (attached : ∀ item ∈ s.openItems, (¬ Within s item.scope scope ∨ item.occurrence ∈ keep) → ∀ host,
      item.attachedTo = some host → ∀ occurrence ∈ s.occurrences, occurrence.id = host →
        ¬ Within s occurrence.scope scope ∨ host ∈ keep) :
    WellFormed (s.clearInside scope keep) :=
  (clearInside_cleared formed present keep).wellFormed formed present kept attached

/-- `Step.endInstance`: the instance root cleared, with a failure exactly when the instance fails. Every scope
occurrence lies within the root, so nothing is kept and nothing is left hanging. -/
theorem endInstance_wellFormed {s : State} (formed : WellFormed s) {status : InstanceStatus}
    {failure : Option InstanceFailure} (recorded : failure.isSome = true ↔ status = .failed) :
    WellFormed { s.clearInside State.root with status, failure } := by
  obtain ⟨rootPresent, _, reach⟩ := formed.rooted
  refine (clearInside_wellFormed formed rootPresent (fun _ _ none => by simp at none) ?_).withStatus (fun _ => by apply instanceOf_congr <;> rfl) recorded
  intro item member left
  obtain ⟨entry, inside, named⟩ := List.mem_map.mp (formed.owned.itemScopes item member)
  rcases left with outside | none
  · exact absurd (named ▸ reach entry inside) outside
  · simp at none

end Kernel.Laws.State

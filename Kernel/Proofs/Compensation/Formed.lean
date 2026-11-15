module

public import Kernel.Proofs.Compensation.Relation

/-! # Proofs: the Compensation lane relation carried by the state operations

What the state operations the hooks apply and `Step`'s phases keep of the lane relation `Formed` beside
`Laws.State.WellFormed` (`Proofs.Frame.FrameAlongside`, `OccursAlongside`, `StepAlongside`). Its read set is the
compensation slot, the issue and activation counters, the scope occurrences with their process instances, and the
queued compensations' triggers and resumes and Cancel raises' origins. Every operation here keeps the compensation slot
or keeps a sublist of its records and runs, issues only upward, counts only upward and keeps the process instance of
every issued scope occurrence that stands, so `Formed` carries over (`Formed.shrink`): the queued triggers it names
then shrink too, as a queued Cancel raise's scope occurrence was issued (`TriggersApart.issued`). The compensation
hooks themselves store runs and are proved directly (`Proofs.Step.CompensationKeeps`). It reads no feature, so it lies
in no feature's rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed scopeIds Counted)
open Kernel.Proofs.Frame (FrameAlongside OccursAlongside StepAlongside ClosureAlongside Unmoved)

/-! ## Carrying the relation -/

/-- The completion numbers of a sublist of records are a sublist of theirs. -/
theorem completionsIn_sublist {first second : List Compensable} (fewer : first.Sublist second) :
    (completionsIn first).Sublist (completionsIn second) := by
  induction fewer with
  | slnil => exact .refl _
  | cons record _ ih =>
    simp only [completionsIn]
    exact ih.trans (List.sublist_append_right _ _)
  | cons_cons record _ ih =>
    simp only [completionsIn]
    exact ih.append_left _

/-- A flat map over a sublist is a sublist of the flat map. -/
theorem flatMap_sublist {α β : Type} (f : α → List β) {first second : List α} (fewer : first.Sublist second) :
    (first.flatMap f).Sublist (second.flatMap f) := by
  induction fewer with
  | slnil => exact .refl _
  | cons a _ ih =>
    simp only [List.flatMap_cons]
    exact ih.trans (List.sublist_append_right _ _)
  | cons_cons a _ ih =>
    simp only [List.flatMap_cons]
    exact ih.append_left _

/-- Filtering by a map that agrees with another wherever it keeps something keeps a sublist. -/
theorem filterMap_sublist_of {α β : Type} {f g : α → Option β} :
    ∀ {items : List α}, (∀ a ∈ items, f a = g a ∨ f a = none) → (items.filterMap f).Sublist (items.filterMap g)
  | [], _ => .refl _
  | a :: rest, agree => by
    have tail := filterMap_sublist_of (f := f) (g := g) fun b inside => agree b (List.mem_cons_of_mem _ inside)
    rcases agree a (List.mem_cons_self ..) with same | dropped
    · simp only [List.filterMap_cons, same]
      split
      · exact tail
      · exact tail.cons_cons _
    · simp only [List.filterMap_cons, dropped]
      split
      · exact tail
      · exact tail.cons _

/-- The completions of a slot whose records and runs are sublists of another's are a sublist of its. -/
theorem completions_sublist {before after : Compensations} (retained : after.retained.Sublist before.retained)
    (runs : after.runs.Sublist before.runs) : (completions after).Sublist (completions before) :=
  (completionsIn_sublist retained).append (flatMap_sublist _ runs)

/-- `Formed` carries over to a state that keeps a sublist of the slot's records and runs, issues and counts only
upward, keeps every issued scope occurrence that stands standing in its process instance, keeps its retained records
in scope occurrences that stand, and queues the same triggers and resumes. -/
theorem Formed.shrink {precedes : Compensable → Compensable → Prop} {s t : State} (formed : Formed precedes s)
    (scopes : ∀ x ∈ scopeIds t, x.value < s.nextIssue → x ∈ scopeIds s ∧ t.instanceOf x = s.instanceOf x)
    (issued : s.nextIssue ≤ t.nextIssue) (counted : ∀ key, Counted s key → Counted t key)
    (retained : t.slots.compensation.retained.Sublist s.slots.compensation.retained)
    (runs : t.slots.compensation.runs.Sublist s.slots.compensation.runs) (present : RetainedPresent t)
    (triggers : (Laws.Step.triggersOf t.signals).Sublist (Laws.Step.triggersOf s.signals))
    (resumes : ∀ resume ∈ Laws.Step.resumesOf t.signals, resume ∈ Laws.Step.resumesOf s.signals) :
    Formed precedes t := by
  have queued : (queuedTriggers t).Sublist (queuedTriggers s) := by
    unfold queuedTriggers
    refine List.Sublist.trans (filterMap_sublist_of fun held inside => ?_) (triggers.filterMap _)
    rcases held with trigger | origin
    · exact .inl rfl
    · have below := formed.triggers.issued origin (triggers.subset inside)
      unfold queuedTrigger
      by_cases stands : origin.scope ∈ scopeIds t
      · obtain ⟨was, same⟩ := scopes _ stands below
        exact .inl (by simp [stands, was, same])
      · exact .inr (by simp [stands])
  have completed := completions_sublist retained runs
  refine ⟨fun run member record claimed held => formed.claims run (runs.subset member) record claimed
      (retained.subset held), present, fun run member => formed.unfinished run (runs.subset member),
    formed.completions.sublist completed,
    fun completion member => Nat.lt_of_lt_of_le (formed.issued completion (completed.subset member)) issued,
    fun run member => formed.settled run (runs.subset member), formed.keyed.sublist (runs.map _),
    fun run member => Nat.lt_of_lt_of_le (formed.runsIssued run (runs.subset member)) issued, ?_, ?_⟩
  · refine ⟨formed.triggers.apart.sublist (((runs.filter _).map _).append queued), fun run member grouped held =>
      formed.triggers.grouped run (runs.subset member) grouped (queued.subset held), fun trigger member => ?_,
      fun origin inside => ?_⟩
    · exact counted _ (formed.triggers.counted trigger ((((runs.map _).append queued)).subset member))
    · exact Nat.lt_of_lt_of_le (formed.triggers.issued origin (triggers.subset inside)) issued
  · intro scope activity trigger leave resume member
    obtain ⟨scope', activity', trigger', rest⟩ :=
      Laws.Step.mem_resumesOf.mp (resumes _ (Laws.Step.mem_resumesOf.mpr ⟨scope, activity, trigger, leave, member⟩))
    obtain ⟨leave', inside⟩ := rest
    exact formed.ungrouped scope' activity' trigger' leave' resume inside

/-- `Formed` reads nothing an `Unmoved` change moves. -/
theorem Formed.unmoved {precedes : Compensable → Compensable → Prop} {s t : State} (formed : Formed precedes s)
    (moved : Unmoved s t) : Formed precedes t :=
  formed.shrink (fun x present _ => ⟨by rwa [scopeIds, moved.scopes] at present,
      Laws.State.instanceOf_congr moved.scopes moved.instanceId x⟩)
    (Nat.le_of_eq moved.nextIssue.symm) (fun _ held => Laws.State.Counted.congr moved.activations held)
    (by rw [moved.compensation]; exact .refl _) (by rw [moved.compensation]; exact .refl _)
    (fun record member => by
      rw [moved.compensation] at member
      have stands := formed.retained record member
      rwa [scopeIds, ← moved.scopes] at stands)
    (by rw [moved.triggers]; exact .refl _) (fun _ inside => moved.resumes ▸ inside)

/-- `Formed` carries over to a state that keeps the slot, the counts, the scope occurrences and the instance identity,
issues only upward and keeps a sublist of the queue. -/
theorem Formed.same {precedes : Compensable → Compensable → Prop} {s t : State} (formed : Formed precedes s)
    (scopes : t.scopes = s.scopes) (instanceId : t.instanceId = s.instanceId) (issued : s.nextIssue ≤ t.nextIssue)
    (activations : t.activations = s.activations) (compensation : t.slots.compensation = s.slots.compensation)
    (signals : t.signals.Sublist s.signals) : Formed precedes t := by
  have ids : scopeIds t = scopeIds s := by rw [scopeIds, scopes]; rfl
  refine formed.shrink (fun x present _ => ⟨ids ▸ present, Laws.State.instanceOf_congr scopes instanceId x⟩) issued
    (fun _ held => Laws.State.Counted.congr activations held) (by rw [compensation]; exact .refl _)
    (by rw [compensation]; exact .refl _) (fun record member => ?_) (Laws.Step.triggersOf_sublist signals)
    fun _ inside => (Laws.Step.resumesOf_sublist signals).subset inside
  rw [compensation] at member
  exact ids ▸ formed.retained record member

/-- A queued signal that carries no trigger and no resume keeps `Formed`. -/
theorem Formed.signal {precedes : Compensable → Compensable → Prop} {s : State} (formed : Formed precedes s)
    (signal : Signal) (triggers : Laws.Step.triggersOf [signal] = [] := by exact rfl)
    (resumes : Laws.Step.resumesOf [signal] = [] := by exact rfl) : Formed precedes (s.signal signal) := by
  rw [Laws.State.signal_eq]
  refine formed.shrink (fun x present _ => ⟨present, Laws.State.instanceOf_congr (s := s)
      (t := { s with signals := s.signals ++ [signal] }) rfl rfl x⟩) (Nat.le_refl _)
    (fun _ held => held) (.refl _) (.refl _) formed.retained ?_ fun resume inside => ?_
  · rw [Laws.Step.triggersOf_append, triggers, List.append_nil]
    exact .refl _
  · rwa [Laws.Step.resumesOf_append, resumes, List.append_nil] at inside

/-- Entering a scope occurrence at the counter, below a parent, keeps `Formed` when it keeps the slot, the counts,
the instance identity and the queue: the new scope occurrence is issued at the counter, so no queued Cancel raise
names it, and the others keep their process instances. -/
theorem Formed.enter {precedes : Compensable → Compensable → Prop} {program : Program} {s t : State}
    {entry : ScopeOccurrence} (formed : Formed precedes s) (well : WellFormed program s)
    (scopes : t.scopes = s.scopes ++ [entry]) (named : entry.id = ⟨s.nextIssue⟩) (placed : entry.parent.isSome)
    (nextIssue : t.nextIssue = s.nextIssue + 1) (activations : t.activations = s.activations)
    (instanceId : t.instanceId = s.instanceId) (compensation : t.slots.compensation = s.slots.compensation)
    (signals : t.signals = s.signals) : Formed precedes t := by
  have ids : scopeIds t = scopeIds s ++ [entry.id] := by simp [scopeIds, scopes]
  have nodup : (scopeIds t).Nodup := by
    rw [ids]
    refine List.nodup_append.mpr ⟨well.distinct.scopes, List.nodup_cons.mpr ⟨by simp, .nil⟩, fun x inside y fresh same => ?_⟩
    obtain ⟨old, member, rfl⟩ := List.mem_map.mp inside
    rw [List.mem_singleton.mp fresh, named] at same
    exact Laws.State.scopes_fresh well old member same
  have parentless : ∀ other ∈ t.scopes, other.parent = none → other.id = State.root := fun other member orphan => by
    rw [scopes] at member
    rcases List.mem_append.mp member with old | fresh
    · exact (well.rooted.2.1 other old).mp orphan
    · obtain rfl := List.mem_singleton.mp fresh
      rw [orphan] at placed
      cases placed
  refine formed.shrink (fun x present below => ?_) (by omega) (fun _ held => Laws.State.Counted.congr activations held)
    (by rw [compensation]; exact .refl _) (by rw [compensation]; exact .refl _) (fun record member => ?_)
    (by rw [signals]; exact .refl _) (fun _ inside => signals ▸ inside)
  · have old : x ∈ scopeIds s := by
      rw [ids] at present
      rcases List.mem_append.mp present with old | fresh
      · exact old
      · rw [List.mem_singleton.mp fresh, named] at below
        exact absurd below (Nat.lt_irrefl _)
    exact ⟨old, Laws.State.instanceOf_kept well nodup parentless instanceId old fun other member _ => by
      rw [scopes]; exact List.mem_append_left _ member⟩
  · rw [compensation] at member
    rw [ids]
    exact List.mem_append_left _ (formed.retained record member)

/-- A reservation keeps `Formed`: it changes only the occurrences, the counter of its key and the issue counter. -/
theorem Formed.reserve {precedes : Compensable → Compensable → Prop} {program : Program} {s : State}
    (formed : Formed precedes s) (well : WellFormed program s) (element : ElementId) (scope : ScopeOccurrenceId) :
    Formed precedes (s.reserve element scope).1 := by
  have made := Laws.State.reserve_reserves s element scope
  refine formed.shrink (fun x present _ => ⟨by rwa [scopeIds, made.scopes] at present, made.instances x⟩) (by rw [made.nextIssue]; omega)
    (fun _ held => (made.activated well.activations).counted held) (by rw [made.slots]; exact .refl _)
    (by rw [made.slots]; exact .refl _) (fun record member => ?_) (by rw [made.signals]; exact .refl _)
    (fun _ inside => made.signals ▸ inside)
  rw [made.slots] at member
  have stands := formed.retained record member
  rwa [scopeIds, ← made.scopes] at stands

/-- A retained record outside the subtree a removal drops stands where it stood: the scope occurrence it lies in lies
outside that subtree. -/
theorem retained_outside {program : Program} {s : State} (well : WellFormed program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) {x : ScopeOccurrenceId} (outside : !(s.subtree scope).contains x = true) :
    ¬ Laws.State.Within s x scope := fun within => by
  have inside := (Laws.State.subtree_iff well present x).mpr within
  simp [inside] at outside

/-- Leaving a scope occurrence that stands keeps `Formed`: the slot keeps a sublist of its records and runs, those that
stay lie outside the left subtree, and every scope occurrence that stays keeps its process instance. -/
theorem Formed.leaveScope {precedes : Compensable → Compensable → Prop} {program : Program} {s : State}
    {scope : ScopeOccurrenceId} (formed : Formed precedes s) (well : WellFormed program s)
    (present : scope ∈ scopeIds s) : Formed precedes (s.leaveScope scope) := by
  have left := Laws.State.leaveScope_left well present
  obtain ⟨retained, runs, -⟩ := Laws.State.leaveScope_compensation s scope
  have kept : ∀ x ∈ scopeIds (s.leaveScope scope), x ∈ scopeIds s := fun x inside => by
    obtain ⟨entry, member, rfl⟩ := List.mem_map.mp inside
    exact List.mem_map.mpr ⟨entry, ((left.scopes entry).mp member).1, rfl⟩
  refine formed.shrink (fun x inside _ => ⟨kept x inside, left.instances x inside⟩) (Nat.le_of_eq left.nextIssue.symm)
    (fun _ held => Laws.State.Counted.congr left.activations held)
    (by rw [retained]; exact List.filter_sublist.trans List.filter_sublist) (by rw [runs]; exact List.filter_sublist)
    (fun record member => ?_) (by rw [left.signals]; exact .refl _) (fun _ inside => left.signals ▸ inside)
  rw [retained] at member
  obtain ⟨member, other⟩ := List.mem_filter.mp member
  obtain ⟨member, unnested⟩ := List.mem_filter.mp member
  obtain ⟨entry, stands, named⟩ := List.mem_map.mp (formed.retained record member)
  refine List.mem_map.mpr ⟨entry, (left.scopes entry).mpr ⟨stands, fun within => ?_⟩, named⟩
  have inside := (Laws.State.subtree_iff well present _).mpr within
  have distinct : entry.id ≠ scope := fun same => by simp [← named, same] at other
  rw [← named] at unnested
  simp [inside, distinct] at unnested

/-- Clearing a scope occurrence that stands keeps `Formed`: the slot keeps a sublist of its records and runs, those
that stay lie in no scope occurrence strictly within the cleared one, and every scope occurrence that stays keeps its
process instance. -/
theorem Formed.clearInside {precedes : Compensable → Compensable → Prop} {program : Program} {s : State}
    {scope : ScopeOccurrenceId} (formed : Formed precedes s) (well : WellFormed program s)
    (present : scope ∈ scopeIds s) (keep : List Nat) : Formed precedes (s.clearInside scope keep) := by
  have cleared := Laws.State.clearInside_cleared well present keep
  have slot := Laws.State.clearInside_compensation s scope keep
  have kept : ∀ x ∈ scopeIds (s.clearInside scope keep), x ∈ scopeIds s := fun x inside => by
    obtain ⟨entry, member, rfl⟩ := List.mem_map.mp inside
    exact List.mem_map.mpr ⟨entry, ((cleared.scopes entry).mp member).1, rfl⟩
  refine formed.shrink (fun x inside _ => ⟨kept x inside, cleared.instances x inside⟩)
    (Nat.le_of_eq cleared.nextIssue.symm) (fun _ held => Laws.State.Counted.congr cleared.activations held)
    (by rw [slot]; exact List.filter_sublist) (by rw [slot]; exact List.filter_sublist) (fun record member => ?_)
    (by rw [cleared.signals]; exact .refl _) (fun _ inside => cleared.signals ▸ inside)
  rw [slot] at member
  obtain ⟨member, unnested⟩ := List.mem_filter.mp member
  obtain ⟨entry, stands, named⟩ := List.mem_map.mp (formed.retained record member)
  refine List.mem_map.mpr ⟨entry, (cleared.scopes entry).mpr ⟨stands, fun strictly => ?_⟩, named⟩
  have inside := (Laws.State.subtree_iff well present _).mpr strictly.1
  rw [← named] at unnested
  simp [inside, strictly.2] at unnested

/-! ## The frame -/

/-- The state operations the hooks apply keep `Formed`. -/
theorem formed_frameAlongside (precedes : Compensable → Compensable → Prop) : FrameAlongside (Formed precedes) where
  frame _ _ moved kept := kept.unmoved moved
  signalBegin _ _ _ kept := kept.signal _
  issue s kept := by
    rw [Laws.State.issue_eq]
    exact kept.same rfl rfl (Nat.le_succ _) rfl rfl (.refl _)
  enterScope _ s element parent locals owner well kept := by
    rw [Laws.State.enterScope_eq]
    exact kept.enter well rfl rfl rfl rfl rfl rfl rfl rfl
  enterCalled _ s called call variables definition well kept := by
    rw [Laws.State.enterCalled_eq s called call variables definition (Laws.State.scopes_fresh well)]
    exact kept.enter well rfl rfl rfl rfl rfl rfl rfl rfl
  reserve _ s element scope well _ kept := kept.reserve well element scope
  leaveScope _ _ _ well present _ kept := kept.leaveScope well present
  clearInside _ _ _ keep well present _ kept := kept.clearInside well present keep
  disarm _ s host _ kept := by
    rw [Laws.State.disarm_eq]
    exact kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  setVariable _ s target name value _ kept :=
    have same := Laws.State.setVariable_same s target name value
    kept.same same.scopes same.instanceId (Nat.le_of_eq same.nextIssue.symm) same.activations (congrArg (·.compensation) same.slots)
      (by rw [same.signals]; exact .refl _)
  removeVariable _ s target name _ kept :=
    have same := Laws.State.removeVariable_same s target name
    kept.same same.scopes same.instanceId (Nat.le_of_eq same.nextIssue.symm) same.activations (congrArg (·.compensation) same.slots)
      (by rw [same.signals]; exact .refl _)

/-- `Step`'s own phases keep `Formed`: journalling, taking signals and tokens off, beginning, cancelling and ordering
the journal change nothing it reads but the queue, which they shorten, and a begin's counters, which grow. -/
theorem formed_stepAlongside (precedes : Compensable → Compensable → Prop) : StepAlongside (Formed precedes) where
  toFrameAlongside := formed_frameAlongside precedes
  journal _ _ _ _ kept _ _ := kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  runOrder _ _ _ kept := kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  dequeue _ _ _ _ fewer kept := kept.same rfl rfl (Nat.le_refl _) rfl rfl fewer
  untoken _ _ _ _ _ kept := kept.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)
  begin _ s request role sourceType well _ _ _ _ kept := by
    have begins := Laws.State.beginOccurrence_begins well.activations request role sourceType
    have counters : s.nextIssue ≤ (s.beginOccurrence request role sourceType).1.nextIssue ∧
        ∀ key, Counted s key → Counted (s.beginOccurrence request role sourceType).1 key := by
      rcases begins.source with ⟨_, reserved⟩ | issued
      · exact ⟨Nat.le_of_eq reserved.nextIssue.symm, fun _ held => Laws.State.Counted.congr reserved.activations held⟩
      · exact ⟨by rw [issued.nextIssue]; omega, fun _ held => issued.activated.counted held⟩
    refine kept.shrink (fun x present _ => ⟨by rwa [scopeIds, begins.scopes] at present, begins.instances x⟩)
      counters.1 counters.2 (by rw [begins.slots]; exact .refl _) (by rw [begins.slots]; exact .refl _)
      (fun record member => ?_) (by rw [begins.signals]; exact .refl _) (fun _ inside => begins.signals ▸ inside)
    rw [begins.slots] at member
    have stands := kept.retained record member
    rwa [scopeIds, ← begins.scopes] at stands
  cancel _ s id well kept := (formed_frameAlongside precedes).cancelOccurrence
    (fun _ _ _ held => held.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _))
    (fun _ _ _ held => held.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)) (id := id) well kept

/-! ## What the features' records queue -/

/-- Queuing a compensation keeps `Formed` when its trigger is held nowhere yet, is no group's nested run's, was
counted, and its resume resumes no group. -/
theorem Formed.queue {precedes : Compensable → Compensable → Prop} {s : State} (formed : Formed precedes s)
    {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef} {leave : Option Nat}
    {resume : Option Resume} (fresh : trigger ∉ heldTriggers s)
    (ungrouped : ∀ run ∈ s.slots.compensation.runs, resumesGroup run.resume = true → run.trigger ≠ trigger)
    (counted : Counted s (triggerKey trigger)) (unresumed : resumesGroup resume = false) :
    Formed precedes (s.signal (.compensate scope activity trigger leave resume)) := by
  rw [Laws.State.signal_eq]
  have same : queuedTrigger { s with signals := s.signals ++ [.compensate scope activity trigger leave resume] } =
      queuedTrigger s := by
    funext held
    rcases held with _ | origin
    · rfl
    · have named := Laws.State.instanceOf_congr (s := s)
        (t := { s with signals := s.signals ++ [.compensate scope activity trigger leave resume] }) rfl rfl origin.scope
      simp only [queuedTrigger, named]
      rfl
  have queued : queuedTriggers { s with signals := s.signals ++ [.compensate scope activity trigger leave resume] } =
      queuedTriggers s ++ [trigger] := by
    unfold queuedTriggers
    rw [same, Laws.Step.triggersOf_append, Laws.Step.triggersOf_compensate, List.filterMap_append]
    rfl
  have resumes : Laws.Step.resumesOf (s.signals ++ [.compensate scope activity trigger leave resume]) =
      Laws.Step.resumesOf s.signals ++ [resume] := by
    rw [Laws.Step.resumesOf_append]
    rfl
  refine ⟨formed.claims, formed.retained, formed.unfinished, formed.completions, formed.issued, formed.settled,
    formed.keyed, formed.runsIssued, ⟨?_, fun run member grouped held => ?_, fun held member => ?_,
      fun origin inside => ?_⟩, fun _ _ _ _ queuedResume member => ?_⟩
  · unfold heldTriggers
    rw [queued, ← List.append_assoc]
    refine List.nodup_append.mpr ⟨formed.triggers.apart, List.nodup_cons.mpr ⟨by simp, .nil⟩, ?_⟩
    intro held inside other named same
    rw [List.mem_singleton.mp named] at same
    exact fresh (same ▸ inside)
  · rw [queued] at held
    rcases List.mem_append.mp held with old | named
    · exact formed.triggers.grouped run member grouped old
    · exact ungrouped run member grouped (List.mem_singleton.mp named)
  · rw [queued, ← List.append_assoc] at member
    rcases List.mem_append.mp member with old | named
    · exact formed.triggers.counted held old
    · rw [List.mem_singleton.mp named]
      exact counted
  · rw [Laws.Step.triggersOf_append, Laws.Step.triggersOf_compensate] at inside
    rcases List.mem_append.mp inside with old | named
    · exact formed.triggers.issued origin old
    · simp at named
  · have carried := Laws.Step.mem_resumesOf.mpr ⟨_, _, _, _, member⟩
    rw [resumes] at carried
    rcases List.mem_append.mp carried with old | named
    · obtain ⟨scope', activity', trigger', rest⟩ := Laws.Step.mem_resumesOf.mp old
      obtain ⟨leave', inside⟩ := rest
      exact formed.ungrouped scope' activity' trigger' leave' queuedResume inside
    · rw [List.mem_singleton.mp named]
      exact unresumed

/-- A state whose issued scope occurrences that stand stood in `queue` in the same process instance names only
triggers `queue` names from the same queued compensations and Cancel raises. -/
theorem queuedTrigger_back {s queue : State}
    (chain : ∀ x ∈ scopeIds s, x ∈ scopeIds queue ∧ s.instanceOf x = queue.instanceOf x) {held : OccurrenceRef ⊕ Origin}
    {trigger : OccurrenceRef} (named : queuedTrigger s held = some trigger) : queuedTrigger queue held = some trigger := by
  rcases held with _ | origin
  · exact named
  · unfold queuedTrigger at named ⊢
    by_cases stands : origin.scope ∈ scopeIds s
    · obtain ⟨was, same⟩ := chain _ stands
      simp only [stands, ite_true] at named
      simp only [was, ite_true, ← same]
      exact named
    · simp [stands] at named

/-- What a caught Cancel's rollback keeps of the state its search reached: disarming the rolled-back Transaction's
boundaries changes only items and occurrences. -/
theorem rolledBack_frame {before searched : State}
    (terminated : before = searched ∨ ∃ host, before = searched.disarm host) :
    before.scopes = searched.scopes ∧ before.instanceId = searched.instanceId ∧
      before.activations = searched.activations ∧ before.slots = searched.slots ∧ before.signals = searched.signals := by
  rcases terminated with rfl | ⟨host, rfl⟩
  · exact ⟨rfl, rfl, rfl, rfl, rfl⟩
  · rw [Laws.State.disarm_eq]
    exact ⟨rfl, rfl, rfl, rfl, rfl⟩

/-- A caught Cancel's compensation keeps `Formed`: its trigger, the thrower of the raise taken off a queue that kept
`Formed`, was that queue's first queued trigger, so the queue held it once and as no group's nested run's and counted
it; the search, the disarming and the clearing since hold no trigger the queue did not (`queuedTrigger_back`) and no
run it did not, and keep its counts. -/
theorem formed_compensate (program : Program) (precedes : Compensable → Compensable → Prop) (s : State)
    (scope : ScopeOccurrenceId) (activity : Option ElementId) (trigger : OccurrenceRef) (leave : Option Nat)
    (element : ElementId) (at_ : ScopeOccurrenceId) (resumed : Leave)
    (source : ∃ before, s = before.clearInside scope ∧ WellFormed program before ∧ scope ∈ scopeIds before ∧
      Laws.State.RollsBack (fun t => WellFormed program t ∧ Formed precedes t) trigger before)
    (kept : Formed precedes s) :
    Formed precedes (s.signal (.compensate scope activity trigger leave (some (.occur element at_ resumed)))) := by
  obtain ⟨before, rfl, well, rest⟩ := source
  obtain ⟨present, rolls⟩ := rest
  obtain ⟨base, raised, origin, rest⟩ := rolls
  obtain ⟨searched, popped, standing, rest⟩ := rest
  obtain ⟨cancels, steady, terminated, named⟩ := rest
  obtain ⟨queue, holds, heads, made⟩ := popped
  have formedQueue := holds.2
  have baseScopes : base.scopes = queue.scopes := by rw [made]
  have baseId : base.instanceId = queue.instanceId := by rw [made]
  have frame := rolledBack_frame terminated
  have cleared := Laws.State.clearInside_cleared well present []
  -- the scope occurrences of the cleared state stood in the queue's, in the same process instance
  have chain : ∀ x ∈ scopeIds (before.clearInside scope), x ∈ scopeIds queue ∧
      (before.clearInside scope).instanceOf x = queue.instanceOf x := fun x inside => by
    obtain ⟨entry, member, rfl⟩ := List.mem_map.mp inside
    have stood := ((cleared.scopes entry).mp member).1
    rw [frame.1, steady.scopes, baseScopes] at stood
    refine ⟨List.mem_map.mpr ⟨entry, stood, rfl⟩, ?_⟩
    rw [cleared.instances _ inside, Laws.State.instanceOf_congr frame.1 frame.2.1, steady.instances,
      Laws.State.instanceOf_congr baseScopes baseId]
  -- the trigger is the queue's first queued one
  have first : queuedTriggers queue = trigger :: (Laws.Step.triggersOf base.signals).filterMap (queuedTrigger queue) := by
    have stood : origin.scope ∈ scopeIds queue := by rwa [scopeIds, ← baseScopes]
    unfold queuedTriggers
    rw [heads, ← List.singleton_append, Laws.Step.triggersOf_append, Laws.Step.triggersOf_raise, cancels,
      List.filterMap_append]
    simp only [↓reduceIte, List.filterMap_cons, List.filterMap_nil, queuedTrigger, stood, named,
      ← Laws.State.instanceOf_congr baseScopes baseId, ← steady.instances, List.singleton_append]
  have apart := formedQueue.triggers.apart
  unfold heldTriggers at apart
  rw [first] at apart
  obtain ⟨-, unrepeated, disjoint⟩ := List.nodup_append.mp apart
  have notLater := (List.nodup_cons.mp unrepeated).1
  have baseSlots : base.slots = queue.slots := by rw [made]
  have runsBack : ∀ run ∈ (before.clearInside scope).slots.compensation.runs, run ∈ queue.slots.compensation.runs :=
    fun run member => by
      rw [Laws.State.clearInside_compensation] at member
      have inside := (List.mem_filter.mp member).1
      rw [frame.2.2.2.1] at inside
      have earlier := steady.runs run inside
      rwa [baseSlots] at earlier
  have headed : trigger ∈ queuedTriggers queue := by
    rw [first]
    exact List.mem_cons_self ..
  refine kept.queue (fun inHeld => ?_) (fun run member grouped same => ?_) ?_ rfl
  · unfold heldTriggers at inHeld
    rcases List.mem_append.mp inHeld with inRuns | inQueued
    · obtain ⟨run, member, same⟩ := List.mem_map.mp inRuns
      obtain ⟨inside, ungrouped⟩ := List.mem_filter.mp member
      exact disjoint _ (List.mem_map.mpr ⟨run, List.mem_filter.mpr ⟨runsBack run inside, ungrouped⟩, rfl⟩) trigger
        (List.mem_cons_self ..) same
    · unfold queuedTriggers at inQueued
      obtain ⟨held, inside, carried⟩ := List.mem_filterMap.mp inQueued
      obtain ⟨more, appended, quiet⟩ := steady.signals
      rw [Laws.State.clearInside_signals, frame.2.2.2.2, appended, Laws.Step.triggersOf_append,
        Laws.Step.triggersOf_untriggered quiet, List.append_nil] at inside
      exact notLater (List.mem_filterMap.mpr ⟨held, inside, queuedTrigger_back chain carried⟩)
  · exact formedQueue.triggers.grouped run (runsBack run member) grouped (same ▸ headed)
  · have counted := formedQueue.triggers.counted trigger (List.mem_append_right _ headed)
    refine Laws.State.Counted.congr ?_ counted
    rw [cleared.activations, frame.2.2.1, steady.activations, made]

/-- The features' records keep `Formed` where they reserve, queue an occurrence or a caught Cancel's compensation; a
throw's compensation and raise (`throwCompensate`, `raise`) take a trigger from the thrower's occurrence, and that it
is held nowhere yet is no consequence of `Formed` and `BegunFrom`: a reservation `Step` begins keeps the activation it
was numbered with, which a held trigger may name, so the two are handed in. -/
theorem formed_occursAlongside (program : Program) (precedes : Compensable → Compensable → Prop)
    (throwCompensate : ∀ s occurrence scope activity trigger leave, WellFormed program s →
      Laws.State.BegunFrom (fun t => WellFormed program t ∧ Formed precedes t) s occurrence →
      trigger = { processInstanceId := s.instanceOf occurrence.scope, element := occurrence.element,
                  activation := occurrence.activation } → Formed precedes s →
      Formed precedes (s.signal (.compensate scope activity trigger none (some (.complete occurrence.id leave)))))
    (raise : ∀ s raised occurrence, WellFormed program s →
      Laws.State.RaisesFrom (fun t => WellFormed program t ∧ Formed precedes t) occurrence s → Formed precedes s →
      Formed precedes (s.signal (.raise raised { element := occurrence.element, scope := occurrence.scope,
                                                 activation := occurrence.activation }))) :
    OccursAlongside program (Formed precedes) where
  reserve s element scope well _ kept := kept.reserve well element scope
  occur _ _ _ _ _ _ _ kept := kept.signal _
  compensate s scope activity trigger leave element at_ resumed _ source kept :=
    formed_compensate program precedes s scope activity trigger leave element at_ resumed source kept
  throwCompensate := throwCompensate
  raise := raise

end Kernel.Proofs.Compensation

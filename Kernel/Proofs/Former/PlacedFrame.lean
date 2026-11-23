module

public import Kernel.Proofs.Former.PlacedSources
public import Kernel.Laws.Population
public import Kernel.Laws.State.Begin
public import Kernel.Proofs.Former.PlacedCompacts

/-! # Proofs: the former lanes, the placement lane's frame

The frame records of `Kernel.Proofs.Frame.Alongside` for the placement lane under its model premise (`Placing`): every
state operation the hooks apply and every phase `Step` runs keeps it, from where the frame's provenance says the work
it adds comes (`Kernel.Proofs.Former.PlacedSources`), and a start's fresh instance holds it. `Kernel.Proofs.Step`
composes them with the registered records of `WellFormed` into what a committed start and a population run keep
(`PlacedAtStart`, `PlacedInPopulation`). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed Within StrictlyWithin scopeIds)
open Kernel.Proofs.Frame

section Operations

variable {program : Program} {s : State}

/-- Scope identifiers read only the scope occurrences. -/
theorem scopeIds_congr {t : State} (scopes : t.scopes = s.scopes) : scopeIds t = scopeIds s := by
  unfold scopeIds; rw [scopes]

/-- A standing scope occurrence is a scope identifier. -/
theorem stands_present {x : ScopeOccurrenceId} (stands : Laws.Step.ScopeStands s x) : x ∈ scopeIds s := by
  obtain ⟨entry, member, named⟩ := stands
  exact List.mem_map.mpr ⟨entry, member, named⟩

/-- A reservation still to be made in a lane state is placed as the lane reads one. -/
theorem occurAt_placed (lane : PlacedLane program s) {element : ElementId} {x : ScopeOccurrenceId} {leave : Leave}
    (pending : OccurAt s element x leave) : OccurPlaced program s element x leave :=
  ⟨lane.occurs element x leave pending, lane.issued x (.inl ⟨element, leave, pending⟩)⟩

/-- A placed reservation stays placed in a state with the same scope occurrences and instance entries that issued no
less. -/
theorem OccurPlaced.same {t : State} {element : ElementId} {x : ScopeOccurrenceId} {leave : Leave}
    (placed : OccurPlaced program s element x leave) (scopes : t.scopes = s.scopes)
    (instances : t.slots.instances = s.slots.instances) (ordinals : t.scopeOrdinals = s.scopeOrdinals)
    (table : Laws.State.TableGrows s t := by exact .of_eq rfl) :
    OccurPlaced program t element x leave :=
  ⟨⟨fun stands => (placed.1.1 (scopeIds_congr scopes ▸ stands)).same scopes fun _ inside => instances ▸ inside,
    placed.1.2⟩, (Laws.State.ScopeGrows.of_same (scopeIds_congr scopes) ordinals table).issued placed.2⟩

/-- A placed begin stays placed in a state with the same scope occurrences, instance entries and occurrences. -/
theorem BeginPlaced.same {t : State} {request : BeginRequest} (placed : BeginPlaced program s request)
    (scopes : t.scopes = s.scopes) (instances : t.slots.instances = s.slots.instances)
    (occurrences : t.occurrences = s.occurrences) : BeginPlaced program t request :=
  ⟨placed.element.same scopes fun _ inside => instances ▸ inside, fun o member named =>
    (placed.reserved o (occurrences ▸ member) named).same scopes fun _ inside => instances ▸ inside, placed.incoming⟩

/-- A change of the variable sets alone keeps the lane. -/
theorem PlacedLane.sameBut {t : State} (lane : PlacedLane program s) (same : Laws.State.SameButVariables s t) :
    PlacedLane program t :=
  lane.queue same.scopes (by rw [same.slots]) same.scopeOrdinals (.of_eq same.issued) (fun _ member => same.occurrences ▸ member)
    same.tokens same.slots fun _ member => .inl (same.signals ▸ member)

/-- Flow tokens queued where a continuation says keep the lane (`Laws.Flow.LeavesFrom`). -/
theorem PlacedLane.emitted (refs : ReferencesPlaced program) (formed : WellFormed program s) (lane : PlacedLane program s)
    {occurrence : Occurrence} {flows : List FlowId} (stands : ∃ entry ∈ s.scopes, entry.id = occurrence.scope)
    (leaves : Laws.Flow.LeavesFrom (fun held => WellFormed program held ∧ Placing program held) program s occurrence
      (.flows flows)) : PlacedLane program (s.emit flows occurrence.scope) := by
  rw [Laws.State.emit_eq]
  refine lane.within formed rfl rfl rfl (.refl _) (fun _ member => .inl member) listKept
    (fun x inside => listExtended (list := Laws.State.allQueuedTokens s)
      (fun token member => ⟨fun flow scope same target ends => ?_, fun _ same => ?_⟩) x
      (by rwa [Laws.State.allQueuedTokens_append] at inside)) listKept listKept listKept listKept
  · obtain ⟨named, inside, rfl⟩ := List.mem_map.mp member
    obtain ⟨rfl, rfl⟩ := Token.flow.inj same
    exact (leavesFrom_placed refs formed stands leaves _ inside target ends).same rfl fun _ inside => inside
  · obtain ⟨_, _, rfl⟩ := List.mem_map.mp member
    exact Token.noConfusion same

/-- A join wait parked on the flow its begun occurrence arrived by, in its scope occurrence, keeps the lane. -/
theorem PlacedLane.parkedAt (formed : WellFormed program s) (lane : PlacedLane program s) {waiting : Parked}
    (found : ∃ occurrence ∈ s.occurrences, occurrence.id = waiting.occurrence ∧ occurrence.begun = true ∧
      occurrence.scope = waiting.scope ∧ occurrence.incoming = some waiting.flow) :
    PlacedLane program { s with slots := { s.slots with parked := s.slots.parked ++ [waiting] } } := by
  obtain ⟨occurrence, member, rest⟩ := found
  obtain ⟨named, -, lies, arrived⟩ := rest
  refine lane.within formed rfl rfl rfl (.refl _) (fun _ member => .inl member) listKept listKept listKept listKept
    listKept (listExtended fun x new o inside same => ?_)
  obtain rfl := List.mem_singleton.mp new
  obtain rfl := Laws.State.nodup_map_eq formed.distinct.occurrences inside member (same.trans named.symm)
  exact ⟨lies, fun target ends => ((occurrence_placed lane inside).alike
    (lane.incoming o inside _ target arrived ends)).same rfl fun _ inside => inside⟩

/-- A reservation taken off a queue that kept the lane is placed where it reserves (`Laws.State.Popped`). -/
theorem popped_placed (refs : ReferencesPlaced program) {element : ElementId} {scope : ScopeOccurrenceId}
    (popped : ∃ leave writes rule, Laws.State.Popped (fun t => WellFormed program t ∧ Placing program t)
      (.occur element scope leave writes rule) s) (stands : scope ∈ scopeIds s) : PlacedIn program s element scope := by
  obtain ⟨leave, writes, rule, popped⟩ := popped
  obtain ⟨queue, _, held, rest₁⟩ := popped
  obtain ⟨found, same⟩ := rest₁
  have scopes : s.scopes = queue.scopes := by rw [same]
  have instances : s.slots.instances = queue.slots.instances := by rw [same]
  have queued : Signal.occur element scope leave writes rule ∈ (Laws.State.allSignals queue) :=
    Laws.State.mem_allSignals_of found
  exact (((held.2 refs).occurs element scope leave (.inl ⟨writes, rule, queued⟩)).1 (scopeIds_congr scopes ▸ stands)).same
    scopes fun _ inside => instances ▸ inside

/-- A reservation of an element placed where it reserves, in a standing scope occurrence, keeps the lane: its record
takes the identity issued next. -/
theorem PlacedLane.reserved (formed : WellFormed program s) (lane : PlacedLane program s) {element : ElementId}
    {scope : ScopeOccurrenceId} (stands : scope ∈ scopeIds s) (placed : PlacedIn program s element scope) :
    PlacedLane program (s.reserve element scope).1 := by
  have reserves := Laws.State.reserve_reserves s element scope
  have instances : (s.reserve element scope).1.slots.instances = s.slots.instances := by rw [reserves.slots]
  refine lane.within formed reserves.scopes instances reserves.scopeOrdinals (reserves.table formed.issuer)
    (fun o member => ?_) (fun _ member => .inl (reserves.signals ▸ member)) (fun _ member => .inl (reserves.tokens ▸ member))
    (fun _ member => .inl (reserves.slots ▸ member)) (fun _ member => .inl (reserves.slots ▸ member))
    (fun _ member => .inl (reserves.slots ▸ member)) (fun _ member => .inl (reserves.slots ▸ member))
  rw [reserves.occurrences] at member
  rcases List.mem_append.mp member with old | new
  · exact .inl old
  obtain rfl := List.mem_singleton.mp new
  refine .inr ⟨?_, by rw [reserves.placed]; exact stands, fun _ _ named => ?_, .inr (.inr (reserves.fresh formed.issuer (by rw [reserves.placed]; exact stands)))⟩
  · rw [reserves.kind, reserves.placed]
    exact placed.same reserves.scopes fun _ inside => instances ▸ inside
  · rw [Laws.State.reserve_incoming] at named
    cases named

/-- A clearing keeps the instance entries rooted outside the scope occurrence it clears, and only entries it held. -/
theorem clearInside_entries (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (keep : List OccurrenceId) : (s.clearInside scope keep).slots.instances.Sublist s.slots.instances ∧
      (∀ entry ∈ s.slots.instances, ¬ StrictlyWithin s entry.root scope →
        entry ∈ (s.clearInside scope keep).slots.instances) ∧
      ∀ entry ∈ (s.clearInside scope keep).slots.instances, ¬ StrictlyWithin s entry.root scope := by
  obtain ⟨draft, cleared⟩ := Laws.State.clearInside_eq s scope keep
  rw [cleared]
  refine ⟨List.filter_sublist, fun entry member free => List.mem_filter.mpr ⟨member, ?_⟩, fun entry member strictly => ?_⟩
  · have outside : ¬ entry.root ∈ s.subtree scope ∨ entry.root = scope := by
      by_cases sub : entry.root ∈ s.subtree scope
      · exact .inr (Classical.byContradiction fun other => free ⟨(Laws.State.subtree_iff formed present _).mp sub, other⟩)
      · exact .inl sub
    simpa using outside
  · have inside := (Laws.State.subtree_iff formed present _).mpr strictly.1
    have kept := (List.mem_filter.mp member).2
    simp [inside, strictly.2] at kept

/-- A standing scope occurrence with a parent is not the root: the process root is the one without one (`Rooted`). -/
theorem notRoot_of_parent (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (parented : ∀ entry ∈ s.scopes, entry.id = scope → ∃ parent, entry.parent = some parent) : scope ≠ State.root :=
  fun same => by
    obtain ⟨entry, member, named⟩ := List.mem_map.mp present
    obtain ⟨parent, link⟩ := parented entry member named
    simp [(formed.rooted.2.1 entry member).mpr (named.trans same)] at link

/-- What a frame leaves is not the root: an owned scope occurrence lies below its owner's (`OwnedBelow`), and a running
compensation context below its run's (`RunPlaced`). -/
theorem LeavesOwned.notRoot (formed : WellFormed program s) {scope : ScopeOccurrenceId} (present : scope ∈ scopeIds s)
    (leaves : LeavesOwned s scope) : scope ≠ State.root := by
  refine notRoot_of_parent formed present fun entry member named => ?_
  rcases leaves with ⟨owned, inside, same, owning⟩ | ⟨run, running, context⟩
  · obtain ⟨owner, owns⟩ := owning
    obtain ⟨occurrence, found, id, _⟩ := formed.owned.scopeOwners owned inside owner owns
    have := formed.ownedBelow owned inside occurrence found (by rw [id]; exact owns)
    rw [Laws.State.nodup_map_eq formed.distinct.scopes member inside (named.trans same.symm)]
    exact ⟨_, this⟩
  · exact ⟨_, ((formed.settled.runsPlaced run running).2 scope context).2 entry member named⟩

/-- Leaving a standing scope occurrence other than the root keeps the lane. -/
theorem PlacedLane.left (formed : WellFormed program s) (lane : PlacedLane program s) {scope : ScopeOccurrenceId}
    (present : scope ∈ scopeIds s) (notRoot : scope ≠ State.root) : PlacedLane program (s.leaveScope scope) := by
  have left := Laws.State.leaveScope_left formed present
  have slots := Laws.State.leaveScope_slots_eq s scope
  have entries := clearInside_entries formed present []
  obtain ⟨draft, cleared⟩ := Laws.State.clearInside_eq s scope []
  refine lane.shrink formed (Within s · scope) (fun _ _ _ within out => within.trans out)
    (fun within => notRoot (Laws.State.root_within formed within).symm) left.scopesSublist left.scopes
    (by rw [slots]; exact List.filter_sublist.trans entries.1)
    (fun entry member free => by
      rw [slots]
      exact List.mem_filter.mpr ⟨entries.2.1 entry member fun within => free within.1,
        by simpa using fun (same : entry.root = scope) => free (same ▸ .refl _)⟩)
    (fun entry member within => by
      rw [slots] at member
      obtain ⟨inside, other⟩ := List.mem_filter.mp member
      exact entries.2.2 entry inside ⟨within, by simpa using other⟩)
    (Laws.State.leaveScope_grows s scope)
    (fun o member => (left.occurrences o).mp member) (fun token member => (left.tokens token).mp member)
    (fun _ member => left.signals ▸ member) left.slots.runs (fun record member => ?_) left.slots.bodies
    left.slots.parked
  rw [slots, cleared] at member
  exact (List.mem_filter.mp (List.mem_filter.mp member).1).1

/-- Clearing a standing scope occurrence, keeping only occurrences outside the scope occurrences strictly within it,
keeps the lane. -/
theorem PlacedLane.cleared (formed : WellFormed program s) (lane : PlacedLane program s) {scope : ScopeOccurrenceId}
    {keep : List OccurrenceId} (present : scope ∈ scopeIds s)
    (kept : ∀ o ∈ s.occurrences, o.id ∈ keep → ¬ StrictlyWithin s o.scope scope) :
    PlacedLane program (s.clearInside scope keep) := by
  have cleared := Laws.State.clearInside_cleared formed present keep
  have entries := clearInside_entries formed present keep
  obtain ⟨draft, shape⟩ := Laws.State.clearInside_eq s scope keep
  refine lane.shrink formed (StrictlyWithin s · scope) (fun _ _ stands within ⟨up, other⟩ =>
      ⟨within.trans up, fun same => other (Laws.State.Within.antisymm formed stands up (same ▸ within))⟩)
    (fun within => within.2 (Laws.State.root_within formed within.1)) cleared.scopesSublist cleared.scopes entries.1
    entries.2.1 entries.2.2
    (Laws.State.clearInside_grows s scope keep)
    (fun o member => ?_) (fun token member => ?_) (fun _ member => cleared.signals ▸ member) cleared.slots.runs
    (fun record member => ?_) cleared.slots.bodies cleared.slots.parked
  · obtain ⟨old, how⟩ := (cleared.occurrences o).mp member
    exact ⟨old, fun within => how.elim (fun outside => outside within.1) fun inside => kept o old inside within⟩
  · obtain ⟨old, outside⟩ := (cleared.tokens token).mp member
    exact ⟨old, fun within => outside within.1⟩
  · rw [shape] at member
    exact (List.mem_filter.mp member).1

/-- Entering a scope occurrence of an element anchored where it is entered keeps the lane (`Laws.Flow.Anchored`). -/
theorem PlacedLane.entered (refs : ReferencesPlaced program) (formed : WellFormed program s) (lane : PlacedLane program s)
    {element : ElementId} {parent : ScopeOccurrenceId} {locals : List (String × Value)} {owner : Option OccurrenceId}
    (stands : parent ∈ scopeIds s)
    (anchored : Laws.Flow.Anchored (fun t => WellFormed program t ∧ Placing program t) program s element parent) :
    PlacedLane program (s.enterScope element parent locals owner).1 := by
  have fresh := Laws.State.enterScope_fresh formed.historic formed.issuer element stands locals owner
  rw [Laws.State.enterScope_eq] at fresh ⊢
  exact lane.grown formed (added := none) rfl fresh (List.append_nil _).symm (fun _ same => by cases same)
    (fun called => by cases called)
    (fun _ link => by simp only [Laws.State.ScopeOccurrence.parent_eq, Laws.State.ScopeOccurrenceId.parent?_child, Option.some.injEq] at link; exact link ▸ anchored_issued refs formed lane anchored)
    (fun _ _ named link stands => by
      simp only [Laws.State.ScopeOccurrence.parent_eq, Laws.State.ScopeOccurrenceId.parent?_child, Option.some.injEq] at link
      cases named; subst link
      exact anchored_placed refs formed lane (anchored.mono (placing_held refs)) stands)
    (fun called => by cases called) (by simp) rfl rfl rfl rfl rfl rfl

/-- A Call's entry of its called root keeps the lane: the root is entered below the Call's scope occurrence, with an
instance entry of the definition it binds, and an Activity is no Scope element. -/
theorem PlacedLane.calledEntered (formed : WellFormed program s) (lane : PlacedLane program s) {call : Occurrence}
    (member : call ∈ s.occurrences) (activity : ((program.element? call.element).bind (·.activity?)).isSome)
    (variables : List (String × Value)) (definition : DefinitionRef) :
    PlacedLane program (s.enterCalled program call variables definition).1 := by
  have notScope : ((program.element? call.element).bind (·.scope?)).isNone := by
    revert activity
    cases program.element? call.element with
    | none => intro _; rfl
    | some element =>
      intro activity
      show element.scope?.isNone = true
      rw [Laws.Step.activity?_scope? activity]
      rfl
  have fresh := Laws.State.enterCalled_fresh formed program (formed.owned.occurrenceScopes call member) variables definition
  rw [Laws.State.enterCalled_eq _ _ _ _ _ (Laws.State.scopes_fresh formed)] at fresh ⊢
  exact lane.grown formed
    (added := some { root := call.scope.child call.element (.fresh s.issuing s.issueNext)
                     definition := some definition }) rfl fresh rfl
    (fun _ same => by cases same; exact ⟨rfl, rfl⟩) (fun _ => rfl)
    (fun _ link => by simp only [Laws.State.ScopeOccurrence.parent_eq, Laws.State.ScopeOccurrenceId.parent?_child, Option.some.injEq] at link; exact link ▸ present_issued formed (formed.owned.occurrenceScopes call member))
    (fun _ _ named link _ => by simp only [Laws.State.ScopeOccurrence.parent_eq, Laws.State.ScopeOccurrenceId.parent?_child, Option.some.injEq] at link; cases named; subst link; exact occurrence_placed lane member)
    (fun _ => ⟨fun _ named => by cases named; exact notScope, fun owner inside owns => by
      obtain rfl := Laws.State.nodup_map_eq formed.distinct.occurrences inside member (Option.some.inj owns).symm
      exact notScope⟩) (by simp) rfl rfl rfl rfl rfl rfl

/-- Begins deferred from where `Laws.Flow.BeginAnchored` says keep the lane. -/
theorem PlacedLane.deferred (refs : ReferencesPlaced program) (formed : WellFormed program s)
    (lane : PlacedLane program s) {requests : List BeginRequest}
    (anchored : ∀ request ∈ requests,
      Laws.Flow.BeginAnchored (fun t => WellFormed program t ∧ Placing program t) program s request) :
    PlacedLane program (s.deferBegins requests) := by
  rw [Laws.State.deferBegins_eq]
  refine lane.within formed rfl rfl rfl (.refl _) (fun _ member => .inl member) listKept
    (fun x inside => listExtended (list := Laws.State.allQueuedTokens s)
      (fun token member => ⟨fun _ _ same => ?_, fun request same stands => ?_⟩) x
      (by rwa [Laws.State.allQueuedTokens_append] at inside)) listKept listKept listKept listKept
  · obtain ⟨_, _, rfl⟩ := List.mem_map.mp (List.mem_reverse.mp member)
    exact Token.noConfusion same
  · obtain ⟨other, inside, rfl⟩ := List.mem_map.mp (List.mem_reverse.mp member)
    obtain rfl := Token.begin.inj same
    exact (beginAnchored_placed refs formed lane (anchored _ inside) stands).same rfl rfl rfl

/-- Multi-Instance runs anchored at their scope occurrences keep the lane. -/
theorem PlacedLane.bodied (refs : ReferencesPlaced program) (formed : WellFormed program s) (lane : PlacedLane program s)
    {runs : List MultiInstanceRun}
    (anchored : ∀ run ∈ runs,
      Laws.Flow.Anchored (fun t => WellFormed program t ∧ Placing program t) program s run.element run.scope) :
    PlacedLane program { s with slots := { s.slots with multiInstances := runs } } :=
  lane.within formed rfl rfl rfl (.refl _) (fun _ member => .inl member) listKept listKept listKept listKept
    (fun run member => .inr ⟨fun stands => (anchored_placed refs formed lane ((anchored run member).mono
      (placing_held refs)) stands).same rfl fun _ inside => inside, anchored_issued refs formed lane (anchored run member)⟩)
    listKept

/-- Compensation records and runs stored from where `Laws.Compensation.StoredFrom` says keep the lane. -/
theorem PlacedLane.stored (refs : ReferencesPlaced program) (formed : WellFormed program s) (lane : PlacedLane program s)
    {compensation : Compensations}
    (stored : Laws.Compensation.StoredFrom program s
      (Laws.Compensation.ResumeQueued (fun t => WellFormed program t ∧ Placing program t) s) compensation) :
    PlacedLane program { s with slots := { s.slots with compensation } } := by
  have move : ∀ {element x}, PlacedIn program s element x →
      PlacedIn program { s with slots := { s.slots with compensation } } element x :=
    fun placed => placed.same rfl fun _ inside => inside
  have record : ∀ {record x}, Laws.Compensation.RecordFrom program s record x →
      (x ∈ scopeIds s → ∀ element ∈ Laws.Compensation.recordElements record,
        PlacedIn program { s with slots := { s.slots with compensation } } element x) ∧ Laws.State.ScopeIssued s x :=
    fun from_ => ⟨fun stands element inside => move (recordFrom_placed refs formed lane from_ stands element inside),
      recordFrom_issued formed lane from_⟩
  refine lane.within formed rfl rfl rfl (.refl _) (fun _ member => .inl member) listKept listKept
    (fun run member => .inr ?_) (fun record' member => .inr (record (stored.1 record' member))) listKept listKept
  obtain ⟨pending, resumes⟩ := stored.2 run member
  refine ⟨fun stands record' inside => (record (pending record' inside)).1 stands,
    ⟨fun _ _ _ resumed => ?_, fun _ _ resumed => ?_⟩, fun nonempty => ?_⟩
  · rcases resumes _ resumed with ⟨held, kept, same⟩ | ⟨_, same⟩ | ⟨queue, holds, issued, rest⟩
    · exact (occurAt_placed lane (.inr (.inr ⟨held, kept, same⟩))).same rfl rfl rfl
    · exact Resume.noConfusion same
    · obtain ⟨queued, scopes, instances⟩ := rest
      obtain ⟨⟨there, listed⟩, below⟩ := occurAt_placed (holds.2 refs) (.inr (.inl queued))
      exact ⟨⟨fun stands => move ((there (scopeIds_congr scopes.symm ▸ stands)).same scopes.symm
        fun _ inside => instances ▸ inside), listed⟩, issued.issued below⟩
  · rcases resumes _ resumed with ⟨held, kept, same⟩ | ⟨_, same⟩ | ⟨queue, holds, -, rest⟩
    · exact lane.resumes held kept _ _ same
    · exact Resume.noConfusion same
    · exact (holds.2 refs).compensates _ _ rest.1
  · obtain ⟨record', inside⟩ := List.exists_mem_of_ne_nil _ nonempty
    exact (record (pending record' inside)).2

/-- A begin `Step` runs is placed where it begins (`Laws.Step.BeginOrigin`): a token's arrival at the element its flow
ends at, a start in the process root of a root-process start Event, or a begin a queue that kept the lane held. -/
theorem beginOrigin_placed (refs : ReferencesPlaced program) (formed : WellFormed program s) (lane : PlacedLane program s)
    {request : BeginRequest} (stands : request.scope ∈ scopeIds s)
    (origin : Laws.Step.BeginOrigin (fun program' t => WellFormed program' t ∧ Placing program t) program s request) :
    BeginPlaced program s request := by
  rcases origin with ⟨-, fresh, source⟩ | ⟨queue, held, dequeued⟩
  · have unreserved : ∀ o ∈ s.occurrences, request.reserved = some o.id → PlacedIn program s o.element request.scope :=
      fun _ _ named => by rw [fresh] at named; cases named
    rcases source with ⟨queue, flow, held, rest⟩ | ⟨root, unnamed, found⟩
    · obtain ⟨⟨ends, arrived⟩, taken⟩ := rest
      obtain ⟨_, found, same⟩ := taken.found
      have member : Token.flow flow request.scope ∈ (Laws.State.allQueuedTokens queue) :=
        Laws.State.mem_allQueuedTokens_of found
      have placed := (held.2 refs).tokens flow request.scope request.element member ends
      have scopes : s.scopes = queue.scopes := by rw [same]
      have instances : s.slots.instances = queue.slots.instances := by rw [same]
      refine ⟨placed.same scopes fun _ inside => instances ▸ inside, unreserved, fun _ _ named ends' => ?_⟩
      rw [arrived] at named
      cases named
      rw [ends] at ends'
      cases ends'
      rfl
    · obtain ⟨element, member, named⟩ := found
      refine ⟨fun entry inside rooted => ?_, unreserved, fun _ _ named' => by rw [unnamed] at named'; cases named'⟩
      rw [root, instanceRoot_root formed] at rooted
      rw [← named, refs.rootChildren element member]
      exact ((lane.rootDefinition entry inside).mp rooted).symm
  · have taken : Laws.State.Queued queue request ∧ s.scopes = queue.scopes ∧ s.slots.instances = queue.slots.instances ∧
        s.occurrences = queue.occurrences := by
      rcases dequeued.queued with ⟨_, found, same⟩ | ⟨_, found, same⟩
      · subst same
        exact ⟨.inl (Laws.State.mem_allSignals_of found), rfl, rfl, rfl⟩
      · subst same
        exact ⟨.inr (Laws.State.mem_allQueuedTokens_of found), rfl, rfl, rfl⟩
    obtain ⟨queued, scopes, instances, occurrences⟩ := taken
    exact ((held.2 refs).begins request queued (scopeIds_congr scopes ▸ stands)).same scopes instances occurrences

/-- A begin of an admitted request, from where `Laws.Step.BeginOrigin` says, keeps the lane: the begun record is placed
where it begins, arrives by a flow of its element's process, and takes a reservation's identity nothing claims or the
one issued next. -/
theorem PlacedLane.begun (refs : ReferencesPlaced program) (formed : WellFormed program s) (lane : PlacedLane program s)
    {request : BeginRequest} {role : ActivationRole} {sourceType : String}
    (stands : Laws.Step.ScopeStands s request.scope) (admitted : Laws.Step.Admitted s request)
    (origin : Laws.Step.BeginOrigin (fun program' t => WellFormed program' t ∧ Placing program t) program s request) :
    PlacedLane program (s.beginOccurrence request role sourceType).1 := by
  have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
  have present := stands_present stands
  have placed := beginOrigin_placed refs formed lane present origin
  have incoming := Laws.State.beginOccurrence_incoming s request role sourceType
  have instances : (s.beginOccurrence request role sourceType).1.slots.instances = s.slots.instances := by
    rw [begins.slots]
  have move : ∀ {element}, PlacedIn program s element request.scope →
      PlacedIn program (s.beginOccurrence request role sourceType).1 element request.scope :=
    fun placed => placed.same begins.scopes fun _ inside => instances ▸ inside
  have fits : OccurrenceFits program s (s.beginOccurrence request role sourceType).1
      (s.beginOccurrence request role sourceType).2 := by
    rcases begins.source with ⟨reserved, reservation⟩ | ⟨reserved, reservation⟩ | issued
    · have here := placed.reserved reserved reservation.member reservation.named
      have claim := admitted.2.1 reserved.id (by simp [Laws.State.names, reservation.named])
      refine ⟨by rw [begins.scope, reservation.element]; exact move here, begins.scope ▸ present,
        fun flow target named ends => ?_, .inr (.inl ⟨reservation.id ▸ claim.2, fun old member same =>
          (claim.1.2 old member (same.trans reservation.id)).1⟩)⟩
      rw [reservation.element, placed.incoming flow target (incoming.symm.trans named) ends]
      exact PlacedIn.unique formed lane present placed.element here
    · have here := placed.reserved reserved reservation.member reservation.named
      refine ⟨by rw [begins.scope, reservation.element]; exact move here, begins.scope ▸ present,
        fun flow target named ends => ?_, .inr (.inr (reservation.fresh formed.issuer present))⟩
      rw [reservation.element, placed.incoming flow target (incoming.symm.trans named) ends]
      exact PlacedIn.unique formed lane present placed.element here
    · refine ⟨by rw [begins.scope, issued.element]; exact move placed.element, begins.scope ▸ present,
        fun flow target named ends => ?_, .inr (.inr (issued.fresh formed.issuer present))⟩
      rw [issued.element]
      exact placed.incoming flow target (incoming.symm.trans named) ends
  refine lane.within formed begins.scopes instances ?_ (begins.table formed.issuer) (fun o member => ?_)
    (fun _ member => .inl (begins.signals ▸ member)) (fun _ member => .inl (begins.tokens ▸ member))
    (fun _ member => .inl (begins.slots ▸ member)) (fun _ member => .inl (begins.slots ▸ member))
    (fun _ member => .inl (begins.slots ▸ member)) (fun _ member => .inl (begins.slots ▸ member))
  · exact begins.scopeOrdinals
  · rw [begins.occurrences] at member
    rcases List.mem_append.mp member with old | new
    · exact .inl (List.mem_filter.mp old).1
    · exact .inr (List.mem_singleton.mp new ▸ fits)

/-- Starting a reservation's occurrence keeps the lane: its record keeps its identity, element, scope occurrence and
incoming flow. -/
theorem PlacedLane.started (formed : WellFormed program s) (lane : PlacedLane program s) {occurrence : Occurrence}
    (member : occurrence ∈ s.occurrences) (sourceType : String) :
    PlacedLane program (s.startReserved occurrence sourceType).1 := by
  cases begun : occurrence.begun with
  | true => rw [Laws.State.startReserved_begun s sourceType begun]; exact lane
  | false =>
    have starts := Laws.State.startReserved_starts s sourceType begun
    have instances : (s.startReserved occurrence sourceType).1.slots.instances = s.slots.instances := by
      rw [starts.slots]
    refine lane.within formed starts.scopes instances starts.scopeOrdinals (.of_eq starts.issued) (fun o inside => ?_)
      (fun _ member => .inl (starts.signals ▸ member)) (fun _ member => .inl (starts.tokens ▸ member))
      (fun _ member => .inl (starts.slots ▸ member)) (fun _ member => .inl (starts.slots ▸ member))
      (fun _ member => .inl (starts.slots ▸ member)) (fun _ member => .inl (starts.slots ▸ member))
    rw [starts.occurrences] at inside
    obtain ⟨other, present, made⟩ := List.mem_map.mp inside
    split at made
    · subst made
      exact .inr ⟨(occurrence_placed lane member).same starts.scopes fun _ inside => instances ▸ inside,
        formed.owned.occurrenceScopes occurrence member, lane.incoming occurrence member,
        .inl ⟨occurrence, member, rfl, rfl, rfl⟩⟩
    · subst made
      exact .inl present

end Operations

/-! ## The frame records -/

/-- The state operations the hooks apply keep the placement lane under its premise. -/
theorem placedAlongside (program : Program) : Alongside program (Placing program) where
  frame _ _ moved held refs := (held refs).frame moved
  emit _ _ _ formed stands leaves held refs := (held refs).emitted refs formed stands leaves
  complete _ _ _ _ _ source held refs :=
    (held refs).signalled (.ofComplete (completesFrom_placed refs (held refs) source))
  park _ _ formed found held refs := (held refs).parkedAt formed found
  arm _ _ _ _ _ found held refs := (held refs).signalled (.ofArm fun _ => by
    obtain ⟨o, member, rest⟩ := found
    obtain ⟨-, rfl, rfl⟩ := rest
    exact occurrence_placed (held refs) member)
  armGateway _ _ _ _ _ member gateway held refs :=
    (held refs).signalled (.ofArmGateway fun _ => gatewayOf_placed (held refs) member gateway)
  raise _ _ _ formed _ found held refs := (held refs).signalled (.ofRaise (by
    obtain ⟨o, member, element, scope⟩ := found
    rw [← element, ← scope]
    exact ⟨fun _ => occurrence_placed (held refs) member, present_issued formed (formed.owned.occurrenceScopes o member)⟩))
  signalBegin _ _ formed _ anchored held refs :=
    (held refs).signalled (.ofBegin (beginAnchored_placed refs formed (held refs) anchored))
  takeCompletion _ held refs := (held refs).takeCompletion
  enterScope _ _ _ _ _ formed stands anchored held refs := (held refs).entered refs formed stands anchored
  reserve _ _ _ formed stands _ popped held refs :=
    (held refs).reserved formed (stands_present stands) (popped_placed refs popped (stands_present stands))
  leaveScope _ _ formed present leaves held refs :=
    (held refs).left formed present (LeavesOwned.notRoot formed present leaves)
  clearInside _ _ _ formed present kept held refs := (held refs).cleared formed present kept
  disarm _ _ _ held refs := by
    rw [Laws.State.disarm_eq]
    exact (held refs).queue rfl rfl rfl (.refl _) (fun _ member => (List.mem_filter.mp member).1) rfl rfl listKept
  setVariable s target name value _ held refs := (held refs).sameBut (Laws.State.setVariable_same s target name value)
  removeVariable s target name _ held refs := (held refs).sameBut (Laws.State.removeVariable_same s target name)
  instanceBegin _ _ formed anchored held refs :=
    (held refs).signalled (.ofBegin (beginAnchored_placed refs formed (held refs) anchored))
  defer _ _ formed anchored held refs := (held refs).deferred refs formed anchored
  leaveInstance _ run scope formed member active present held refs := (held refs).left formed present
    (notRoot_of_parent formed present fun entry inside named =>
      ⟨_, (formed.settled.placed run member scope active).2 entry inside named⟩)
  runs _ _ formed anchored held refs := (held refs).bodied refs formed anchored

/-- Storing compensation records and runs keeps the placement lane under its premise. -/
theorem placedStores (program : Program) : StoresAlongside program (Placing program) :=
  { (placedAlongside program).toFrameAlongside with
    storeRuns := fun _ _ formed _ _ stored held refs => (held refs).stored refs formed stored }

/-- The features' reservations, queued triggers and a Call's entry of its called root keep the placement lane under
its premise. -/
theorem placedOccursAlongside (program : Program) : OccursAlongside program (Placing program) where
  reserve _ _ _ formed stands _ anchored held refs := (held refs).reserved formed (stands_present stands)
    (anchored_placed refs formed (held refs) (anchored.mono (placing_held refs)) (stands_present stands))
  occur _ _ _ _ _ _ formed _ anchored held refs :=
    (held refs).signalled (.ofOccur (occurAnchored_placed refs formed (held refs) anchored))
  compensate s _ _ _ _ _ _ _ _ cleared anchored held refs := by
    obtain ⟨before, same, formedBefore, rest⟩ := cleared
    have formed : WellFormed program s := same ▸ Laws.State.clearAll_wellFormed formedBefore rest.1
    exact (held refs).signalled (.ofCompensate ⟨fun _ _ _ resumed => by
      obtain ⟨rfl, rfl, rfl⟩ := Resume.occur.inj (Option.some.inj resumed)
      exact occurAnchored_placed refs formed (held refs) anchored,
      fun _ _ same => Resume.noConfusion (Option.some.inj same)⟩)
  throwCompensate _ _ _ _ _ _ _ _ _ unnamed held refs := (held refs).signalled (.ofCompensate
    ⟨fun _ _ _ same => Resume.noConfusion (Option.some.inj same), fun _ _ same => by
      obtain ⟨rfl, rfl⟩ := Resume.complete.inj (Option.some.inj same)
      exact unnamed⟩)
  raise s _ occurrence formed raises held refs := (held refs).signalled (.ofRaise (by
    obtain ⟨base, begun, how⟩ := raises
    obtain ⟨before, request, role, rest⟩ := begun
    obtain ⟨sourceType, -, -, ran⟩ := rest
    have made : occurrence ∈ base.occurrences := by
      have made := (Laws.State.beginOccurrence_mem before request role sourceType).1
      rwa [ran] at made
    have member : occurrence ∈ s.occurrences := by
      rcases how with rfl | ⟨_, rfl⟩
      · exact made
      · rw [Laws.State.signal_eq]; exact made
    exact ⟨fun _ => occurrence_placed (held refs) member,
      present_issued formed (formed.owned.occurrenceScopes _ member)⟩))
  enterCalled _ _ variables definition formed member _ _ activity _ held refs :=
    (held refs).calledEntered formed member activity variables definition

/-- `Step`'s own phases keep the placement lane under its premise; cancelling is
`Proofs.Frame.FrameAlongside.cancelOccurrence`. -/
theorem placedStepAlongside (program : Program) : StepAlongside program (Placing program) where
  toFrameAlongside := (placedAlongside program).toFrameAlongside
  journal _ _ _ _ held _ _ _ refs := (held refs).queue rfl rfl rfl (.refl _) (fun _ member => member) rfl rfl listKept
  queueBatch s unit formed held refs := by
    have tokens := Laws.State.allQueuedTokens_queueBatch s unit
    have signals := Laws.State.allSignals_queueBatch s unit
    rw [Laws.State.queueBatch_eq] at tokens signals ⊢
    exact (held refs).within formed rfl rfl rfl (.refl _) (fun _ member => .inl member)
      (fun _ member => .inl (signals.subset member)) (fun _ member => .inl (tokens.subset member)) listKept listKept
      listKept listKept
  dequeue _ _ _ fewer held refs := (held refs).queue rfl rfl rfl (.refl _) (fun _ member => member) rfl rfl
    fun _ member => .inl (Laws.State.allSignals_batch fewer _ member)
  unqueue _ _ _ held refs := (held refs).queue rfl rfl rfl (.refl _) (fun _ member => member) rfl rfl
    fun _ member => .inl (Laws.State.allSignals_unqueue _ member)
  untoken _ _ formed held refs := (held refs).within formed rfl rfl rfl (.refl _) (fun _ member => .inl member)
    listKept (fun _ member => .inl (Laws.State.allQueuedTokens_untoken _ member)) listKept listKept listKept listKept
  begin _ _ _ _ formed stands admitted _ origin held refs := (held refs).begun refs formed stands admitted origin
  cancel _ _ formed held := (placedAlongside program).toFrameAlongside.cancelOccurrence
    (fun _ id _ kept refs => (kept refs).withoutRecord id)
    (fun _ _ _ kept refs => (kept refs).queue rfl rfl rfl (.refl _) (fun _ member => member) rfl rfl listKept) formed held
  runOrder _ _ _ formed held counted batches keys _ made :=
    orderJournal_placing formed counted batches keys held made

/-! ## The lane beside `WellFormed` -/

/-- `WellFormed` and the placement lane under its premise. -/
def PlacedForm (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ Placing program s

/-- An input starts from an empty journal, intents, draft and write log (`Step.onRunning`), which keeps `PlacedForm`. -/
theorem placed_reset {program : Program} {s : State} (holds : PlacedForm program s) (committed : Laws.State.Committed s) :
    PlacedForm program { s with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := s.nextCompletion } :=
  ⟨Laws.State.reset_wellFormed holds.1 committed, fun refs => (holds.2 refs).queue rfl rfl rfl (.refl _) (fun _ member => member)
    rfl rfl listKept⟩

/-- Moving the issuer keeps the placement lane. -/
theorem placing_reissue (program : Program) (s : State) (unit : UnitKey) (held : Placing program s) :
    Placing program { s with issuing := unit, issueNext := 0 } :=
  fun refs => (held refs).queue rfl rfl rfl (.refl _) (fun _ member => member) rfl rfl listKept

/-- The completion pipeline's own phases keep the placement lane where they keep `WellFormed`. -/
theorem placed_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) : Laws.Step.PipelinePhases PlacedForm where
  startReserved _ _ occurrence sourceType holds member unnamed :=
    ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, fun refs => by
      rw [Laws.State.closeOwnItems_eq]
      exact ((holds.2 refs).started holds.1 member sourceType).queue rfl rfl rfl (.refl _) (fun _ inside => inside)
        rfl rfl listKept⟩
  removeOccurrence program _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ _ occurrence holds.1 member free
    ⟨⟨removed.1, (placedAlongside program).toFrameAlongside.removeOccurrence
      (fun _ id _ kept refs => (kept refs).withoutRecord id) holds.1 holds.2⟩, removed.2⟩
  recordEnd _ _ key terminal holds :=
    ⟨pipeline.recordEnd _ _ key terminal holds.1, fun refs => by
      rw [Laws.State.recordEnd_eq]
      exact (holds.2 refs).queue rfl rfl rfl (.refl _) (fun _ inside => inside) rfl rfl listKept⟩

/-- A start's fresh instance holds the placement lane: it holds the process root alone, rooted at an entry of the root
process, and queues only the root's arming. -/
theorem placedLane_initial (program : Program) (instanceId : String) (variables : List (String × Value))
    (businessKey : Option String) :
    PlacedLane program ((State.initial instanceId variables businessKey).signal (.armScope State.root)) := by
  have lane : PlacedLane program (State.initial instanceId variables businessKey) := by
    rw [Laws.State.initial_eq]
    refine ⟨⟨⟨⟨_, List.mem_singleton_self _, rfl⟩, ?_, ?_⟩, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_,
      ?_, ?_, ?_, ?_, ?_, ?_, ?_, fun entry member => by
        simp at member; subst member; simp [Laws.State.scopeIds]⟩ <;>
      simp [OccurAt, CalledApart, Laws.State.Queued, Laws.State.allSignals, Laws.State.allQueuedTokens,
        Laws.Step.mem_resumesOf, Laws.State.root_eq]
    exact Laws.State.Historic.issued_key (Laws.State.historic_of_standing (by simp)
      (by simp) (by simp) (by simp [Laws.State.Layered]))
      (by simp)
  exact lane.signalled ⟨fun _ same => Signal.noConfusion same, fun _ _ _ _ _ same => Signal.noConfusion same,
    fun _ _ _ _ _ same => Signal.noConfusion same, fun _ _ _ same => Signal.noConfusion same,
    fun _ _ _ same => Signal.noConfusion same, fun _ _ _ _ same => Signal.noConfusion same,
    fun _ _ same => Signal.noConfusion same⟩

/-- A committed start keeps the placement lane of a program whose references stay in one process. -/
def PlacedAtStart (hooks : Hooks) : Prop :=
  ∀ (program : Program) (input : Input) (after : State), ReferencesPlaced program →
    Step.step hooks program none input = .ok after → PlacedLane program after

/-- Every instance a committed population run holds keeps the placement lane under its deployment's program, when that
program's references stay in one process. -/
def PlacedInPopulation (hooks : Hooks) : Prop :=
  ∀ (admission : Program → Option String) (stimuli : List Population.Stimulus) (result : Population.Result),
    Population.runStimuli hooks admission stimuli = .ok result →
    ∀ instance_ ∈ result.instances, ReferencesPlaced instance_.deployment.program →
      PlacedLane instance_.deployment.program instance_.state

end Kernel.Proofs.Former

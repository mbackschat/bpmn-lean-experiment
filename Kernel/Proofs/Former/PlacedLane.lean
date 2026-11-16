module

public import Kernel.Proofs.Former.Placement
public import Kernel.Proofs.Frame.Alongside

/-! # Proofs: the former lanes, the placement lane

`Placed` carried beside `Laws.State.WellFormed` (`PlacedLane`): besides every occurrence, the work a state queues or
holds is placed where it will run, so that what a step begins, reserves or enters there is placed too. The instance
entries keep apart roots that were issued; a scope occurrence that calls no instance is placed by its element; an
occurrence's incoming flow ends at an element of its own process, and a join wait's gateway lies where its occurrence
does (`PlacedCore`, what a queued completion's flows are read under); a flow token's target, a queued or deferred begin,
a reservation still to be made, an arming, a compensation record and a run's pending records are placed where they will
run, a queued completion's named flows come from where its occurrence lies (`Proofs.Frame.CompletesFrom`), and a
compensation resumes a completion by no named flow. The model premise is `ReferencesPlaced`. Nothing executable imports
this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel
open Kernel.Laws.State (WellFormed Within scopeIds Queued)
open Kernel.Laws.Compensation (recordElements recordsElements)

/-- A leave names no flow. -/
def Unnamed (leave : Leave) : Prop := ∀ selected, leave = .flows selected → selected = []

/-- A reservation of `element` still to be made in `scope`, leaving by `leave`: a queued `Signal.occur`, or the resume
of a queued compensation or of a compensation run that reserves it there. -/
def OccurAt (s : State) (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave) : Prop :=
  (∃ writes rule, Signal.occur element scope leave writes rule ∈ s.signals) ∨
    some (Resume.occur element scope leave) ∈ Laws.Step.resumesOf s.signals ∨
    ∃ run ∈ s.slots.compensation.runs, run.resume = some (.occur element scope leave)

/-- A begin request is placed where it begins: its element, the reservation it begins, and the element its incoming
flow ends at, which shares its element's process. -/
structure BeginPlaced (program : Program) (s : State) (request : BeginRequest) : Prop where
  element : PlacedIn program s request.element request.scope
  reserved : ∀ occurrence ∈ s.occurrences, request.reserved = some occurrence.id →
    PlacedIn program s occurrence.element request.scope
  incoming : ∀ flow target, request.incoming = some flow → program.target? flow = some target →
    definitionAt program target = definitionAt program request.element

/-- What a queued completion's named flows are read under (`Proofs.Frame.CompletesFrom`): `Placed`, instance entries
with apart and issued roots, the process root's running the root process, scope occurrences placed by their elements, incoming flows within their occurrence's
process, a join wait's gateway placed where its occurrence lies, and compensation runs that resume a completion by no
named flow. -/
structure PlacedCore (program : Program) (s : State) : Prop where
  placed : Placed program s
  rootsApart : (s.slots.instances.map (·.root)).Nodup
  rootsIssued : ∀ entry ∈ s.slots.instances, entry.root.value < s.nextIssue
  rootDefinition : ∀ entry ∈ s.slots.instances, entry.root = State.root ↔ entry.definition = none
  scopes : ∀ entry ∈ s.scopes, ∀ element parent, entry.element = some element → entry.parent = some parent →
    PlacedIn program s element parent
  incoming : ∀ occurrence ∈ s.occurrences, ∀ flow target, occurrence.incoming = some flow →
    program.target? flow = some target → definitionAt program target = definitionAt program occurrence.element
  parked : ∀ waiting ∈ s.slots.parked, ∀ occurrence ∈ s.occurrences, occurrence.id = waiting.occurrence →
    ∀ target, program.target? waiting.flow = some target → PlacedIn program s target occurrence.scope
  resumes : ∀ run ∈ s.slots.compensation.runs, ∀ id leave, run.resume = some (.complete id leave) → Unnamed leave

/-- A scope occurrence that calls an instance, a Call's called root, is of no Scope element and owned by no occurrence
of one, so a path of `Laws.Compensation.InstanceLinked`, whose edges leave a scope occurrence that calls no instance, is
of a Scope element or is owned by an occurrence of one, stays in one instance (`Proofs.Former.called_link_rejected`). -/
def CalledApart (program : Program) (s : State) : Prop :=
  ∀ entry ∈ s.scopes, entry.calledInstance.isSome →
    (∀ element, entry.element = some element → ((program.element? element).bind (·.scope?)).isNone) ∧
      ∀ owner ∈ s.occurrences, entry.occurrence = some owner.id →
        ((program.element? owner.element).bind (·.scope?)).isNone

/-- The placement lane: `PlacedCore` and the queued and held work placed where it will run. -/
structure PlacedLane (program : Program) (s : State) : Prop extends PlacedCore program s where
  tokens : ∀ flow scope target, Token.flow flow scope ∈ s.tokens → program.target? flow = some target →
    PlacedIn program s target scope
  begins : ∀ request, Queued s request → request.scope ∈ scopeIds s → BeginPlaced program s request
  occurs : ∀ element scope leave, OccurAt s element scope leave → (scope ∈ scopeIds s → PlacedIn program s element scope) ∧
    ∀ selected, leave = .flows selected → ∀ flow ∈ selected, Laws.Flow.Lists program element flow
  arms : ∀ host element scope, Signal.arm host element scope ∈ s.signals → scope ∈ scopeIds s →
    PlacedIn program s element scope
  gateways : ∀ occurrence gateway scope, Signal.armGateway occurrence gateway scope ∈ s.signals → scope ∈ scopeIds s →
    PlacedIn program s gateway scope
  completes : ∀ id leave writes rule, Signal.complete id leave writes rule ∈ s.signals →
    Proofs.Frame.CompletesFrom (PlacedCore program) program s id leave
  compensates : ∀ id leave, some (Resume.complete id leave) ∈ Laws.Step.resumesOf s.signals → Unnamed leave
  records : ∀ record ∈ s.slots.compensation.retained, record.scope ∈ scopeIds s →
    ∀ element ∈ recordElements record, PlacedIn program s element record.scope
  pending : ∀ run ∈ s.slots.compensation.runs, run.scope ∈ scopeIds s → ∀ record ∈ run.pending,
    ∀ element ∈ recordElements record, PlacedIn program s element run.scope
  calledApart : CalledApart program s
  /-- Only the process root, the scope occurrence without a parent, has no element. -/
  rootBare : ∀ entry ∈ s.scopes, entry.element = none ↔ entry.parent = none
  /-- A Multi-Instance run's element is placed where it holds its instances. -/
  runs : ∀ run ∈ s.slots.multiInstances, run.scope ∈ scopeIds s → PlacedIn program s run.element run.scope
  /-- A queued raise's origin is placed where it was raised. -/
  raises : ∀ raised origin, Signal.raise raised origin ∈ s.signals → origin.scope ∈ scopeIds s →
    PlacedIn program s origin.element origin.scope

/-- A completion's source covers a later state whose occurrences of its identity, scope occurrences and instance entries
are among the state's. -/
theorem completesFrom_carry {rel : State → Prop} {program : Program} {s t : State} {id : Nat} {leave : Leave}
    (source : Proofs.Frame.CompletesFrom rel program s id leave)
    (occurrences : ∀ occurrence ∈ t.occurrences, occurrence.id = id → occurrence ∈ s.occurrences)
    (scopes : ∀ entry ∈ t.scopes, entry ∈ s.scopes)
    (instances : ∀ entry ∈ t.slots.instances, entry ∈ s.slots.instances) :
    Proofs.Frame.CompletesFrom rel program t id leave := by
  refine source.imp (fun offered selected same flow member => ?_) fun resumed => resumed
  obtain ⟨held, holds, kept, rest⟩ := offered selected same flow member
  obtain ⟨wider, more, rest⟩ := rest
  exact ⟨held, holds, fun occurrence inside named => kept occurrence (occurrences occurrence inside named) named,
    fun entry inside => wider entry (scopes entry inside), fun entry inside => more entry (instances entry inside), rest⟩

/-- An update of nothing the lane reads keeps it (`Proofs.Frame.Unmoved`). -/
theorem PlacedLane.frame {program : Program} {s t : State} (moved : Proofs.Frame.Unmoved s t)
    (held : PlacedLane program s) : PlacedLane program t := by
  have instances : ∀ entry ∈ t.slots.instances, entry ∈ s.slots.instances := fun _ inside => moved.instances ▸ inside
  have place : ∀ {element scope}, PlacedIn program s element scope → PlacedIn program t element scope :=
    fun placed => placed.same moved.scopes instances
  have present : ∀ {scope}, scope ∈ scopeIds t → scope ∈ scopeIds s := fun inside => by
    simpa [scopeIds, moved.scopes] using inside
  have signal : ∀ signal ∈ t.signals, Laws.Step.placing signal = true → signal ∈ s.signals := moved.placings
  have resumed : ∀ resume, resume ∈ Laws.Step.resumesOf t.signals → resume ∈ Laws.Step.resumesOf s.signals :=
    fun _ inside => moved.resumes ▸ inside
  refine ⟨⟨⟨?_, ?_, ?_⟩, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_⟩
  · rw [moved.instances]; exact held.placed.rooted
  · intro root member called
    rw [moved.instances]
    exact held.placed.entered root (moved.scopes ▸ member) called
  · intro occurrence member entry inside root
    exact place (held.placed.occurrences occurrence (moved.occurrences ▸ member)) entry inside root
  · rw [moved.instances]; exact held.rootsApart
  · rw [moved.instances, moved.nextIssue]; exact held.rootsIssued
  · rw [moved.instances]; exact held.rootDefinition
  · intro entry member element parent named link
    exact place (held.scopes entry (moved.scopes ▸ member) element parent named link)
  · intro occurrence member
    exact held.incoming occurrence (moved.occurrences ▸ member)
  · intro waiting member occurrence inside named target ends
    exact place (held.parked waiting (moved.parked waiting member) occurrence (moved.occurrences ▸ inside) named target ends)
  · intro run member
    exact held.resumes run (moved.compensation ▸ member)
  · intro flow scope target member ends
    exact place (held.tokens flow scope target (Laws.Step.mem_flowsOf.mp (moved.flows _
      (Laws.Step.mem_flowsOf.mpr member))) ends)
  · intro request queued stands
    have old : Queued s request := by
      rcases queued with signalled | deferred
      · exact .inl (Laws.Step.mem_beginsOf.mp (moved.begins ▸ Laws.Step.mem_beginsOf.mpr signalled))
      · exact .inr (Laws.Step.mem_deferredOf.mp (moved.deferred ▸ Laws.Step.mem_deferredOf.mpr deferred))
    have placed := held.begins request old (present stands)
    exact ⟨place placed.element, fun occurrence member same =>
      place (placed.reserved occurrence (moved.occurrences ▸ member) same), placed.incoming⟩
  · intro element scope leave pending
    have old : OccurAt s element scope leave := by
      rcases pending with ⟨writes, rule, queued⟩ | queued | ⟨run, member, resumes⟩
      · exact .inl ⟨writes, rule, signal _ queued rfl⟩
      · exact .inr (.inl (resumed _ queued))
      · exact .inr (.inr ⟨run, moved.compensation ▸ member, resumes⟩)
    obtain ⟨placed, listed⟩ := held.occurs element scope leave old
    exact ⟨fun stands => place (placed (present stands)), listed⟩
  · intro host element scope queued stands
    exact place (held.arms host element scope (signal _ queued rfl) (present stands))
  · intro occurrence gateway scope queued stands
    exact place (held.gateways occurrence gateway scope (signal _ queued rfl) (present stands))
  · intro id leave writes rule queued
    by_cases named : ∃ selected, leave = .flows selected ∧ selected ≠ []
    · obtain ⟨selected, rfl, nonempty⟩ := named
      have old := signal _ queued (Laws.Step.placing_named nonempty)
      exact completesFrom_carry (held.completes id _ writes rule old)
        (fun occurrence inside _ => moved.occurrences ▸ inside) (fun entry inside => moved.scopes ▸ inside) instances
    · exact .unnamed fun selected same => Classical.byContradiction fun nonempty => named ⟨selected, same, nonempty⟩
  · intro id leave queued
    exact held.compensates id leave (resumed _ queued)
  · intro record member stands element inside
    exact place (held.records record (moved.compensation ▸ member) (present stands) element inside)
  · intro run member stands record inside element named
    exact place (held.pending run (moved.compensation ▸ member) (present stands) record inside element named)
  · unfold CalledApart
    rw [moved.scopes, moved.occurrences]
    exact held.calledApart
  · rw [moved.scopes]
    exact held.rootBare
  · intro run member stands
    exact place (held.runs run (moved.multiInstances ▸ member) (present stands))
  · intro raised origin queued stands
    exact place (held.raises raised origin (signal _ queued rfl) (present stands))

/-! ## Boundaries under `ReferencesPlaced` -/

/-- `Program.boundary?` finds every boundary an envelope of the program declares under its host, since no two envelopes
declare one boundary identifier (`ReferencesPlaced.boundaryIds`). -/
theorem ReferencesPlaced.boundary?_declared {program : Program} (refs : ReferencesPlaced program) {host : Element}
    {envelope : Envelope} {boundary : Boundary} (member : host ∈ program.elements) (has : host.envelope? = some envelope)
    (inside : boundary ∈ envelope.boundaries) : program.boundary? boundary.id = some (host, boundary) := by
  obtain ⟨⟨found, declared⟩, same⟩ := Option.isSome_iff_exists.mp (Laws.IL.boundary?_isSome member has inside)
  obtain ⟨present, envelope', declaration⟩ := Laws.IL.boundary?_declared same
  obtain ⟨has', inside', named⟩ := declaration
  obtain ⟨rfl, rfl⟩ := refs.boundaryIds found present host member envelope' envelope has' has declared inside' boundary
    inside named
  exact same

/-- A boundary an envelope of the program declares lies in its host's process. -/
theorem ReferencesPlaced.declared_placed {program : Program} (refs : ReferencesPlaced program) {host : Element}
    {envelope : Envelope} {boundary : Boundary} (member : host ∈ program.elements) (has : host.envelope? = some envelope)
    (inside : boundary ∈ envelope.boundaries) : definitionAt program boundary.id = definitionAt program host.header.id :=
  refs.boundaries _ _ _ (refs.boundary?_declared member has inside)

/-- Every outgoing flow of a boundary an envelope of the program declares leaves that boundary. -/
theorem ReferencesPlaced.declared_leaves {program : Program} (refs : ReferencesPlaced program) {host : Element}
    {envelope : Envelope} {boundary : Boundary} (member : host ∈ program.elements) (has : host.envelope? = some envelope)
    (inside : boundary ∈ envelope.boundaries) : ∀ flow ∈ boundary.outgoing, program.source? flow = some boundary.id :=
  refs.boundaryOutgoing _ _ _ (refs.boundary?_declared member has inside)

/-! ## Rejection witnesses

Each clause rejects a state holding work of a program without elements, so of the root process, inside a called
instance that runs another definition; the instance clauses reject entries that break them, and the leave clauses a
named resume. -/

section Witnesses

variable (program : Program) (definition : DefinitionRef)

/-- The called root of the witnesses. -/
def placedCalled : ScopeOccurrence :=
  { id := ⟨1⟩, element := some ⟨"Call"⟩, parent := some State.root, occurrence := some 0, calledInstance := some "I-call" }

/-- A process instance holding one called instance, which runs `definition`. -/
def placedState : State :=
  { instanceId := "I", nextIssue := 2, scopes := [{ id := State.root, element := none, parent := none }, placedCalled]
    slots := { instances := [{ root := State.root }, { root := ⟨1⟩, definition := some definition }] } }

/-- A program without elements finds no element. -/
theorem empty_element? (element : ElementId) : ({ program with elements := [] } : Program).element? element = none := by
  cases found : ({ program with elements := [] } : Program).element? element with
  | none => rfl
  | some _ => exact absurd (Laws.IL.element?_mem found) (by simp)

/-- A program without elements finds no boundary. -/
theorem empty_boundary? (element : ElementId) : ({ program with elements := [] } : Program).boundary? element = none := by
  cases found : ({ program with elements := [] } : Program).boundary? element with
  | none => rfl
  | some pair =>
    obtain ⟨⟨_, member, _⟩, _⟩ := Laws.IL.boundary?_boundaryOf found
    exact absurd member (by simp)

/-- A program without elements places everything in the root process. -/
theorem definitionAt_empty (element : ElementId) : definitionAt { program with elements := [] } element = none := by
  simp [definitionAt, empty_element?, empty_boundary?]

/-- A program without elements lists no flow. -/
theorem empty_lists (element : ElementId) (flow : FlowId) : ¬ Laws.Flow.Lists { program with elements := [] } element flow
  | .inl ⟨_, found, _⟩ => by rw [empty_element?] at found; cases found
  | .inr ⟨_, member, _⟩ => by simp at member

/-- A program without elements offers no flow. -/
theorem empty_offered (s : State) (scope : ScopeOccurrenceId) (flow : FlowId) :
    ¬ Laws.Flow.Offered { program with elements := [] } s scope flow := fun ⟨occurrence, _, _, offered⟩ => by
  rcases offered with listed | ⟨_, found, _⟩ | ⟨waiting, _, _, rest⟩
  · exact empty_lists program occurrence.element flow listed
  · rw [empty_element?] at found; cases found
  · obtain ⟨_, found, _⟩ := rest
    cases ends : ({ program with elements := [] } : Program).target? _ with
    | none => rw [ends] at found; cases found
    | some target => rw [ends, Option.bind_some, empty_element?] at found; cases found

variable {program definition}

/-- What lies below the witnesses' called root, `s` holding that root as the witnesses do, has it as instance root. -/
theorem placed_root {s : State} {x : ScopeOccurrenceId} {chain : List ScopeOccurrence}
    (reading : Laws.State.InstanceIn s x "I-call" chain) (distinct : (chain.map (·.id)).Nodup)
    (nodup : (scopeIds s).Nodup) (last : chain.getLast? = some placedCalled) : s.instanceRoot x = ⟨1⟩ := by
  rw [instanceRoot_chain reading distinct nodup reading.mem]
  simp [chainRoot, last, placedCalled]

/-- Nothing of a program without elements is placed in the witnesses' called root. -/
theorem placed_misplaced {s : State} {element : ElementId} {x : ScopeOccurrenceId}
    (placed : PlacedIn { program with elements := [] } s element x) (root : s.instanceRoot x = ⟨1⟩)
    (entry : { root := ⟨1⟩, definition := some definition } ∈ s.slots.instances) : False := by
  have := placed _ entry root.symm
  rw [definitionAt_empty] at this
  cases this

/-- The witnesses' called root is its own instance root. -/
theorem placed_calledRoot {s : State} (scopes : s.scopes = (placedState definition).scopes) : s.instanceRoot ⟨1⟩ = ⟨1⟩ :=
  placed_root (.called placedCalled "I-call" (by simp [scopes, placedState]) rfl) (by simp)
    (by simp [scopeIds, scopes, placedState, placedCalled, Laws.State.root_eq]) rfl

variable (program definition)

/-- The witnesses' called root stands. -/
theorem placed_present : (⟨1⟩ : ScopeOccurrenceId) ∈ scopeIds (placedState definition) := by
  simp [scopeIds, placedState, placedCalled]

/-- An occurrence of the root process inside a called instance breaks `Placed`. -/
theorem misplaced_occurrence_rejected :
    ¬ PlacedLane { program with elements := [] } { placedState definition with
        occurrences := [{ id := 3, element := ⟨"A"⟩, scope := ⟨1⟩, activation := 1 }] } := fun lane =>
  placed_misplaced (definition := definition) (lane.placed.occurrences _ (List.mem_singleton_self _))
    (placed_calledRoot (definition := definition) rfl) (by simp [placedState])

/-- A process root without an instance entry breaks `Placed`. -/
theorem unrooted_rejected : ¬ PlacedLane program { placedState definition with slots := {} } := fun lane => by
  simpa using lane.placed.rooted

/-- A called root without an instance entry breaks `Placed`. -/
theorem unentered_rejected :
    ¬ PlacedLane program { placedState definition with slots := { instances := [{ root := State.root }] } } :=
  fun lane => by simpa [placedState, placedCalled, Laws.State.root_eq] using
    lane.placed.entered placedCalled (by simp [placedState]) rfl

/-- Two instance entries of one root break `PlacedLane.rootsApart`. -/
theorem shared_root_rejected :
    ¬ PlacedLane program { placedState definition with
        slots := { instances := [{ root := State.root }, { root := State.root }] } } := fun lane => by
  simpa using lane.rootsApart

/-- An instance entry not yet issued breaks `PlacedLane.rootsIssued`. -/
theorem unissued_root_rejected : ¬ PlacedLane program { placedState definition with nextIssue := 1 } := fun lane => by
  simpa [placedState] using lane.rootsIssued _ (List.mem_of_mem_tail (List.mem_singleton_self _))

/-- A process root entry running a called definition breaks `PlacedLane.rootDefinition`. -/
theorem called_root_rejected :
    ¬ PlacedLane program { placedState definition with
        slots := { instances := [{ root := State.root, definition := some definition }] } } := fun lane => by
  simpa using (lane.rootDefinition _ (List.mem_singleton_self _)).mp rfl

/-- A Sub-Process occurrence of the root process inside a called instance breaks `PlacedLane.scopes`. -/
theorem misplaced_scope_rejected :
    ¬ PlacedLane { program with elements := [] } { placedState definition with
        scopes := (placedState definition).scopes ++ [{ id := ⟨2⟩, element := some ⟨"S"⟩, parent := some ⟨1⟩ }] } :=
  fun lane => placed_misplaced (definition := definition)
    (lane.scopes _ (List.mem_append_right _ (List.mem_singleton_self _)) _ _ rfl rfl)
    (placed_root (.called placedCalled "I-call" (by simp [placedState]) rfl) (by simp)
      (by simp [scopeIds, placedState, placedCalled, Laws.State.root_eq]) rfl)
    (by simp [placedState])

/-- A flow token of the root process inside a called instance breaks `PlacedLane.tokens`. -/
theorem misplaced_token_rejected (flow : FlowId) (target : ElementId)
    (ends : ({ program with elements := [] } : Program).target? flow = some target) :
    ¬ PlacedLane { program with elements := [] } { placedState definition with tokens := [.flow flow ⟨1⟩] } :=
  fun lane => placed_misplaced (definition := definition) (lane.tokens _ _ _ (List.mem_singleton_self _) ends)
    (placed_calledRoot (definition := definition) rfl) (by simp [placedState])

/-- A queued begin of the root process inside a called instance breaks `PlacedLane.begins`. -/
theorem misplaced_begin_rejected :
    ¬ PlacedLane { program with elements := [] } { placedState definition with
        signals := [.begin { element := ⟨"A"⟩, scope := ⟨1⟩ }] } := fun lane =>
  placed_misplaced (definition := definition)
    (lane.begins _ (.inl (List.mem_singleton_self _)) (placed_present definition)).element
    (placed_calledRoot (definition := definition) rfl) (by simp [placedState])

/-- A queued reservation of the root process inside a called instance breaks `PlacedLane.occurs`. -/
theorem misplaced_occur_rejected :
    ¬ PlacedLane { program with elements := [] } { placedState definition with
        signals := [.occur ⟨"A"⟩ ⟨1⟩ .outgoing [] .outward] } := fun lane =>
  placed_misplaced (definition := definition)
    ((lane.occurs _ _ _ (.inl ⟨_, _, List.mem_singleton_self _⟩)).1 (placed_present definition))
    (placed_calledRoot (definition := definition) rfl) (by simp [placedState])

/-- A queued reservation leaving by a flow its element does not list breaks `PlacedLane.occurs`. -/
theorem unlisted_occur_rejected (flow : FlowId) :
    ¬ PlacedLane { program with elements := [] } { placedState definition with
        signals := [.occur ⟨"A"⟩ State.root (.flows [flow]) [] .outward] } := fun lane =>
  empty_lists program _ flow
    ((lane.occurs _ _ _ (.inl ⟨_, _, List.mem_singleton_self _⟩)).2 _ rfl flow (List.mem_singleton_self _))

/-- A queued arming of the root process inside a called instance breaks `PlacedLane.arms`. -/
theorem misplaced_arm_rejected :
    ¬ PlacedLane { program with elements := [] } { placedState definition with signals := [.arm 3 ⟨"A"⟩ ⟨1⟩] } :=
  fun lane => placed_misplaced (definition := definition)
    (lane.arms _ _ _ (List.mem_singleton_self _) (placed_present definition)) (placed_calledRoot (definition := definition) rfl)
    (by simp [placedState])

/-- A queued gateway arming of the root process inside a called instance breaks `PlacedLane.gateways`. -/
theorem misplaced_gateway_rejected :
    ¬ PlacedLane { program with elements := [] } { placedState definition with signals := [.armGateway 3 ⟨"G"⟩ ⟨1⟩] } :=
  fun lane => placed_misplaced (definition := definition)
    (lane.gateways _ _ _ (List.mem_singleton_self _) (placed_present definition)) (placed_calledRoot (definition := definition) rfl)
    (by simp [placedState])

/-- A queued completion by a flow nothing offers breaks `PlacedLane.completes`. -/
theorem sourceless_complete_rejected (flow : FlowId) :
    ¬ PlacedLane { program with elements := [] } { placedState definition with
        signals := [.complete 3 (.flows [flow]) [] .outward] } := fun lane => by
  rcases lane.completes _ _ _ _ (List.mem_singleton_self _) with offered | ⟨held, _, core, resumed⟩
  · obtain ⟨held, _, _, rest⟩ := offered _ rfl flow (List.mem_singleton_self _)
    obtain ⟨_, _, source⟩ := rest
    rcases source with ⟨occurrence, _, _, offers⟩ | ⟨waiting, _, _, offers⟩
    · exact empty_offered program held _ flow offers
    · exact empty_offered program held _ flow offers
  · obtain ⟨run, member, resumes⟩ := resumed
    cases core.resumes run member 3 _ resumes _ rfl

/-- A queued compensation resuming a completion by a named flow breaks `PlacedLane.compensates`. -/
theorem named_compensate_rejected (flow : FlowId) (thrown : OccurrenceRef) :
    ¬ PlacedLane program { placedState definition with
        signals := [.compensate State.root none thrown none (some (.complete 3 (.flows [flow])))] } := fun lane => by
  cases lane.compensates 3 (.flows [flow]) (Laws.Step.mem_resumesOf.mpr ⟨_, _, _, _, List.mem_singleton_self _⟩) _ rfl

/-- The witnesses' compensation slot holding `compensation`. -/
def placedCompensating (compensation : Compensations) : State :=
  { placedState definition with slots := { (placedState definition).slots with compensation := compensation } }

/-- A compensation run of the witnesses. -/
def placedRun (thrown : OccurrenceRef) (scope : ScopeOccurrenceId) (pending : List Compensable)
    (resume : Option Resume) : CompensationRun :=
  { trigger := thrown, scope := scope, pending := pending, leave := none, resume := resume }

/-- A compensation run resuming a completion by a named flow breaks `PlacedLane.resumes`. -/
theorem named_resume_rejected (flow : FlowId) (thrown : OccurrenceRef) :
    ¬ PlacedLane program (placedCompensating definition
        { runs := [placedRun thrown State.root [] (some (.complete 3 (.flows [flow])))] }) := fun lane => by
  cases lane.resumes _ (List.mem_singleton_self _) 3 (.flows [flow]) rfl _ rfl

/-- A retained compensation record of the root process inside a called instance breaks `PlacedLane.records`. -/
theorem misplaced_record_rejected :
    ¬ PlacedLane { program with elements := [] }
      (placedCompensating definition { retained := [{ subject := ⟨"A"⟩, handler := none, scope := ⟨1⟩ }] }) :=
  fun lane => placed_misplaced (definition := definition)
    (lane.records _ (List.mem_singleton_self _) (placed_present definition) ⟨"A"⟩
      (by simp [recordElements, recordsElements]))
    (placed_calledRoot (definition := definition) rfl) (by simp [placedCompensating, placedState])

/-- A run's pending record of the root process inside a called instance breaks `PlacedLane.pending`. -/
theorem misplaced_pending_rejected (thrown : OccurrenceRef) :
    ¬ PlacedLane { program with elements := [] } (placedCompensating definition
        { runs := [placedRun thrown ⟨1⟩ [{ subject := ⟨"A"⟩, handler := none, scope := ⟨1⟩ }] none] }) :=
  fun lane => placed_misplaced (definition := definition)
    (lane.pending _ (List.mem_singleton_self _) (placed_present definition) _ (List.mem_singleton_self _) ⟨"A"⟩
      (by simp [recordElements, recordsElements]))
    (placed_calledRoot (definition := definition) rfl) (by simp [placedCompensating, placedState])

/-- A called root anchors no element of a program that declares no process (`Laws.Flow.CalledAnchor`). -/
theorem unprocessed_calledAnchor_rejected (anchor : ElementId) :
    ¬ Laws.Flow.CalledAnchor { program with processes := [] } (placedState definition) anchor ⟨1⟩ := fun anchored => by
  obtain ⟨_, entry⟩ := anchored
  obtain ⟨_, _, _, process⟩ := entry
  obtain ⟨found, member, _⟩ := process
  simp at member

/-- A state without Multi-Instance runs anchors nothing by one (`Laws.Flow.RunAnchor`). -/
theorem unrun_runAnchor_rejected (anchor : ElementId) (scope : ScopeOccurrenceId) :
    ¬ Laws.Flow.RunAnchor (placedState definition) anchor scope := fun ⟨_, member, _⟩ => by
  simp [placedState] at member

/-- A state without compensation runs anchors nothing by a pending record (`Laws.Flow.RecordAnchor`). -/
theorem unrun_recordAnchor_rejected (anchor : ElementId) (scope : ScopeOccurrenceId) :
    ¬ Laws.Flow.RecordAnchor (placedState definition) anchor scope := fun ⟨_, member, _⟩ => by
  simp [placedState] at member

/-- A state none of whose compensation runs resumes by a reservation is the source of none (`Laws.Flow.ResumedBy`). -/
theorem unresumed_resumedBy_rejected (state : State) (element : ElementId) (scope : ScopeOccurrenceId) (leave : Leave) :
    ¬ Laws.Flow.ResumedBy (fun held => held.slots.compensation.runs = []) state element scope leave := by
  intro resumed
  obtain ⟨held, empty, rest⟩ := resumed
  obtain ⟨_, _, found⟩ := rest
  obtain ⟨run, member, _⟩ := found
  simp [empty] at member

/-- The Cancel boundary both of `sharedBoundary`'s hosts declare. -/
def sharedX : Boundary :=
  { id := ⟨"X"⟩, sourceId := "X", subscription := { trigger := .cancel }, interrupting := true, outgoing := [] }

/-- A parentless Scope declaring `sharedX`. -/
def sharedHost (id : String) : Element :=
  .scope { id := ⟨id⟩, origin := { sourceId := id }, sourceType := "subProcess", parent := none }
    { kind := .embedded, children := [], envelope := { boundaries := [sharedX] } }

/-- Two hosts declaring `sharedX`: `A` in the root process and `B` at the top level of the called process of
`definition`. -/
def sharedBoundary : Program :=
  { program with elements := [sharedHost "A", sharedHost "B"], processes := [{ definition, children := [⟨"B"⟩] }] }

/-- Two envelopes in different processes declaring one boundary identifier break `ReferencesPlaced.boundaryIds`:
`Program.boundary?` resolves the identifier to the first, so the second declaration is not found under its host, and
`definitionAt` reads the boundary in the root process although `B` lies in the called one. -/
theorem shared_boundaryId_rejected :
    (sharedBoundary program definition).boundary? sharedX.id = some (sharedHost "A", sharedX) ∧
      (sharedBoundary program definition).boundary? sharedX.id ≠ some (sharedHost "B", sharedX) ∧
      definitionAt (sharedBoundary program definition) sharedX.id ≠
        definitionAt (sharedBoundary program definition) (sharedHost "B").header.id := by
  have first : (sharedBoundary program definition).boundary? sharedX.id = some (sharedHost "A", sharedX) :=
    Laws.IL.boundary?_first rfl (Laws.IL.envelope?_scope _ _) rfl
  have hosts : ∀ element ∈ (sharedBoundary program definition).elements,
      element = sharedHost "A" ∨ element = sharedHost "B" := fun _ member => by simpa [sharedBoundary] using member
  have unboundary : (sharedBoundary program definition).element? sharedX.id = none :=
    Laws.IL.element?_none fun element member => by
      rcases hosts element member with rfl | rfl <;> simp [sharedHost, sharedX, Laws.IL.header_scope]
  have second : (sharedBoundary program definition).element? (sharedHost "B").header.id = some (sharedHost "B") :=
    Laws.IL.element?_unique (by simp [sharedBoundary]) rfl fun other member named => by
      rcases hosts other member with rfl | rfl
      · simp [sharedHost, Laws.IL.header_scope] at named
      · rfl
  have top := fun header => Laws.IL.processOf_parentless (program := sharedBoundary program definition)
    (header := header) fun element member => by
      rcases hosts element member with rfl | rfl <;> simp [sharedHost, Laws.IL.header_scope]
  refine ⟨first, fun found => ?_, fun same => ?_⟩
  · rw [first] at found
    have named := congrArg (fun found : Element × Boundary => found.1.header.id) (Option.some.inj found)
    simp [sharedHost, Laws.IL.header_scope] at named
  · simp only [definitionAt, unboundary, second, first, top, Option.map_none, Option.map_some, Option.orElse_none,
      Option.orElse_some, Option.bind_some] at same
    simp [sharedBoundary, sharedHost, Laws.IL.header_scope] at same

/-- A called root's instance entry without a definition breaks `PlacedLane.rootDefinition`. -/
theorem undefined_called_rejected :
    ¬ PlacedLane program { placedState definition with
        slots := { instances := [{ root := State.root }, { root := ⟨1⟩ }] } } := fun lane => by
  have := (lane.rootDefinition _ (List.mem_of_mem_tail (List.mem_singleton_self _))).mpr rfl
  simp [Laws.State.root_eq] at this

/-- A process root with an element breaks `PlacedLane.rootBare`. -/
theorem elemented_root_rejected :
    ¬ PlacedLane program { placedState definition with
        scopes := [{ id := State.root, element := some ⟨"R"⟩, parent := none }, placedCalled] } := fun lane => by
  simpa using (lane.rootBare _ (List.mem_cons_self ..)).mpr rfl

/-- A Multi-Instance run of the root process inside a called instance breaks `PlacedLane.runs`. -/
theorem misplaced_run_rejected :
    ¬ PlacedLane { program with elements := [] } { placedState definition with
        slots := { (placedState definition).slots with
          multiInstances := [{ scope := ⟨1⟩, element := ⟨"A"⟩, occurrence := 0, collection := .null, instances := [] }] } } :=
  fun lane => placed_misplaced (definition := definition) (lane.runs _ (List.mem_singleton_self _) (placed_present definition))
    (placed_calledRoot (definition := definition) rfl) (by simp [placedState])

/-- A raise from the root process inside a called instance breaks `PlacedLane.raises`. -/
theorem misplaced_raise_rejected :
    ¬ PlacedLane { program with elements := [] } { placedState definition with
        signals := [.raise .cancel { element := ⟨"A"⟩, scope := ⟨1⟩, activation := 1 }] } := fun lane =>
  placed_misplaced (definition := definition) (lane.raises _ _ (List.mem_singleton_self _) (placed_present definition))
    (placed_calledRoot (definition := definition) rfl) (by simp [placedState])

/-- `placedState`'s program with its called root's element, `Call`, a Scope. -/
def calledScope : Program := { program with elements := [sharedHost "Call"] }

theorem calledScope_found : (calledScope program).element? ⟨"Call"⟩ = some (sharedHost "Call") := by
  have named : (sharedHost "Call").header.id = ⟨"Call"⟩ := by simp [sharedHost, Laws.IL.header_scope]
  exact named ▸ Laws.IL.element?_unique (by simp [calledScope]) rfl fun other member _ => by
    simpa [calledScope] using member

/-- A called root of a Scope element breaks `PlacedLane.calledApart`. -/
theorem called_scope_rejected : ¬ PlacedLane (calledScope program) (placedState definition) := fun lane => by
  have apart := (lane.calledApart placedCalled (by simp [placedState]) rfl).1 ⟨"Call"⟩ rfl
  simp [calledScope_found, sharedHost, Laws.IL.scope?_scope] at apart

/-- The witnesses' process root is its own instance root. -/
theorem placed_rootRoot : (placedState definition).instanceRoot State.root = State.root := by
  have reading : Laws.State.InstanceIn (placedState definition) State.root (placedState definition).instanceId
      [{ id := State.root, element := none, parent := none }] :=
    .root { id := State.root, element := none, parent := none } (by simp [placedState]) rfl rfl
  rw [instanceRoot_chain reading (by simp) (by simp [scopeIds, placedState, placedCalled, Laws.State.root_eq])
    reading.mem]
  simp [chainRoot]

/-- An `InstanceLinked` edge through a called root breaks instance-root equality: under `calledScope`, `placedCalled`
is of a Scope element, so it links to its parent, the process root, although it roots an instance of its own; the lane
refuses such a called root (`called_scope_rejected`). -/
theorem called_link_rejected :
    Laws.Compensation.InstanceLinked (calledScope program) (placedState definition) ⟨1⟩ State.root ∧
      (placedState definition).instanceRoot ⟨1⟩ ≠ (placedState definition).instanceRoot State.root := by
  refine ⟨.parent placedCalled State.root (by simp [placedState]) rfl
    (.inr (.inl ⟨⟨"Call"⟩, rfl, by simp [calledScope_found, sharedHost, Laws.IL.scope?_scope]⟩)), ?_⟩
  rw [placed_calledRoot rfl, placed_rootRoot]
  simp [Laws.State.root_eq]

end Witnesses

end Kernel.Proofs.Former

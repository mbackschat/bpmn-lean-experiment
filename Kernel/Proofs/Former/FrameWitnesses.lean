module

public import Kernel.Proofs.Former.PlacedLane

/-! # Proofs: the former lanes, witnesses of the frame's premises

Each witness is a state the placement lane (`Kernel.Proofs.Former.PlacedLane`) holds of, or one a premise of the frame
(`Kernel.Proofs.Frame.Alongside`) admits, and an operation after which the lane breaks: what the premise had to say
for the lane to be kept. They are read under `topCalled`, whose element `T` lies at the top level of a called process,
so that a scope occurrence of the root process places nothing of it.

- `unpaired_emit_rejected`: a continuation whose occurrence a queued reservation justifies, but whose named flow a
  stale completion of the same number does, queues a token of another process (`Laws.Flow.LeavesFrom` pairs them).
- `unissued_enter_rejected`: a reservation queued for the identifier not yet issued is read once a scope occurrence is
  entered there (`Laws.Flow.Anchored` bounds a held state's counter; the lane's `issued` clause).
- `unstood_reserve_rejected` and `unstood_subscription_rejected`: a reservation in a scope occurrence that no longer
  stands lies under the process root (`FrameAlongside.reserve`, `OccursAlongside.reserve` ask it to stand).

Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Former

open Kernel

section FrameWitnesses

variable (program : Program) (definition : DefinitionRef)

/-- `T`, declaring `sharedX`, at the top level of the called process `definition`. -/
def topCalled : Program :=
  { program with elements := [sharedHost "T"], processes := [{ definition, children := [⟨"T"⟩] }] }

theorem topCalled_T : (topCalled program definition).element? ⟨"T"⟩ = some (sharedHost "T") := by
  have named : (sharedHost "T").header.id = ⟨"T"⟩ := by simp [sharedHost, Laws.IL.header_scope]
  exact named ▸ Laws.IL.element?_unique (by simp [topCalled]) rfl fun other member _ => by
    simpa [topCalled] using member

theorem topCalled_top : (topCalled program definition).processOf (sharedHost "T").header =
    (topCalled program definition).processes.find? (·.children.contains (sharedHost "T").header.id) :=
  Laws.IL.processOf_parentless fun element member => by
    have : element = sharedHost "T" := by simpa [topCalled] using member
    subst this; simp [sharedHost, Laws.IL.header_scope]

/-- `T` runs the called process. -/
theorem topCalled_placed : definitionAt (topCalled program definition) ⟨"T"⟩ = some definition := by
  simp only [definitionAt, topCalled_T, Option.map_some, Option.orElse_some, Option.bind_some, topCalled_top]
  simp [topCalled, sharedHost, Laws.IL.header_scope]

/-- `sharedX`, `T`'s boundary, runs the called process too. -/
theorem topCalled_boundary : definitionAt (topCalled program definition) sharedX.id = some definition := by
  have unfound : (topCalled program definition).element? sharedX.id = none := Laws.IL.element?_none fun element member => by
    have : element = sharedHost "T" := by simpa [topCalled] using member
    subst this; simp [sharedHost, sharedX, Laws.IL.header_scope]
  have found : (topCalled program definition).boundary? sharedX.id = some (sharedHost "T", sharedX) :=
    Laws.IL.boundary?_first rfl (Laws.IL.envelope?_scope _ _) rfl
  simp only [definitionAt, unfound, found, Option.map_none, Option.map_some, Option.orElse_none, Option.bind_some,
    topCalled_top]
  simp [topCalled, sharedHost, Laws.IL.header_scope]

/-- The process root is its own instance root in every state holding only it. -/
theorem rootOnly_root {s : State} (scopes : s.scopes = [{ id := State.root, element := none, parent := none }]) :
    s.instanceRoot State.root = State.root := by
  have reading : Laws.State.InstanceIn s State.root s.instanceId [{ id := State.root, element := none, parent := none }] :=
    .root { id := State.root, element := none, parent := none } (by simp [scopes]) rfl rfl
  rw [instanceRoot_chain reading (by simp) (by simp [Laws.State.scopeIds, scopes]) reading.mem]
  simp [chainRoot]

/-- What runs the called process is misplaced where a scope occurrence's instance root is the process root. -/
theorem rootOnly_misplaced {s : State} {element : ElementId} {scope : ScopeOccurrenceId}
    (placed : PlacedIn (topCalled program definition) s element scope) (root : s.instanceRoot scope = State.root)
    (entry : { root := State.root } ∈ s.slots.instances)
    (called : definitionAt (topCalled program definition) element = some definition) : False := by
  have := placed _ entry root.symm
  rw [called] at this
  cases this

/-- The process root only, a reservation of `E` queued there, and a stale completion of `5` by the flow `f`. -/
def staleComplete (f : FlowId) : State :=
  { instanceId := "I", nextIssue := 6, scopes := [{ id := State.root, element := none, parent := none }]
    signals := [.occur ⟨"E"⟩ State.root .outgoing [] .outward, .complete 5 (.flows [f]) [] .outward]
    slots := { instances := [{ root := State.root }] } }

/-- The removed occurrence's number, the reservation's element and scope occurrence. -/
def staleOccurrence : Occurrence := { id := 5, element := ⟨"E"⟩, scope := State.root, activation := 1 }

/-- Read independently, as `Laws.Flow.LeavesFrom` read them before it paired them, the queued reservation justifies the
occurrence and the stale completion the flow `f` to `T`, and the token queued breaks `PlacedLane.tokens`. -/
theorem unpaired_emit_rejected (f : FlowId) (ends : (topCalled program definition).target? f = some ⟨"T"⟩) :
    (∃ named writes rule, Signal.occur staleOccurrence.element staleOccurrence.scope named writes rule ∈
        (staleComplete f).signals) ∧
      (∃ writes rule, Signal.complete staleOccurrence.id (.flows [f]) writes rule ∈ (staleComplete f).signals) ∧
      ¬ PlacedLane (topCalled program definition) ((staleComplete f).emit [f] staleOccurrence.scope) := by
  refine ⟨⟨.outgoing, [], .outward, List.mem_cons_self ..⟩,
    ⟨[], .outward, List.mem_cons_of_mem _ (List.mem_singleton_self _)⟩,
    fun lane => ?_⟩
  rw [Laws.State.emit_eq] at lane
  exact rootOnly_misplaced program definition
    (lane.tokens f State.root ⟨"T"⟩ (by simp [staleComplete, staleOccurrence]) ends)
    (rootOnly_root (by simp [staleComplete])) (by simp [staleComplete]) (topCalled_placed program definition)

/-- The process root holding an occurrence of `Y`, and a reservation of `T` queued for the next identifier. -/
def pendingFresh : State :=
  { instanceId := "I", nextIssue := 1, scopes := [{ id := State.root, element := none, parent := none }]
    occurrences := [{ id := 0, element := ⟨"Y"⟩, scope := State.root, activation := 1 }]
    signals := [.occur ⟨"T"⟩ ⟨1⟩ .outgoing [] .outward]
    slots := { instances := [{ root := State.root }] } }

/-- `Y` is anchored at the process root by its occurrence there. -/
theorem pendingFresh_anchored (inv : State → Prop) :
    Laws.Flow.Anchored inv (topCalled program definition) pendingFresh ⟨"Y"⟩ State.root :=
  Laws.Flow.Anchored.occurrence (occurrence := { id := 0, element := ⟨"Y"⟩, scope := State.root, activation := 1 })
    (by simp [pendingFresh])

/-- The scope occurrence `pendingFresh` enters for `Y`. -/
def freshEntry : ScopeOccurrence := { id := ⟨1⟩, element := some ⟨"Y"⟩, parent := some State.root }

/-- Entering `Y` below the process root issues `⟨1⟩`, where the reservation of `T` queued before is now read and lies
under the process root. -/
theorem unissued_enter_rejected :
    ¬ PlacedLane (topCalled program definition) (pendingFresh.enterScope ⟨"Y"⟩ State.root [] none).1 := fun lane => by
  have entered := Laws.State.enterScope_eq pendingFresh ⟨"Y"⟩ State.root [] none
  have scopes : (pendingFresh.enterScope ⟨"Y"⟩ State.root [] none).1.scopes =
      [{ id := State.root, element := none, parent := none }, freshEntry] := by
    rw [entered]; rfl
  have placed := (lane.occurs ⟨"T"⟩ ⟨1⟩ .outgoing (.inl ⟨[], .outward, by rw [entered]; simp [pendingFresh]⟩)).1
    (by simp [Laws.State.scopeIds, scopes, freshEntry])
  have reading : Laws.State.InstanceIn (pendingFresh.enterScope ⟨"Y"⟩ State.root [] none).1 ⟨1⟩
      (pendingFresh.enterScope ⟨"Y"⟩ State.root [] none).1.instanceId
      [freshEntry, { id := State.root, element := none, parent := none }] :=
    .up freshEntry State.root _ _ (by rw [scopes]; simp) rfl rfl
      (.root { id := State.root, element := none, parent := none } (by rw [scopes]; exact List.mem_cons_self ..) rfl
        rfl)
  have root := instanceRoot_chain reading (by simp [freshEntry, Laws.State.root_eq])
    (by unfold Laws.State.scopeIds; rw [scopes]; simp [freshEntry, Laws.State.root_eq]) reading.mem
  exact rootOnly_misplaced program definition placed (by rw [root]; simp [chainRoot])
    (by rw [entered]; simp [pendingFresh]) (topCalled_placed program definition)

/-- A queued reservation, read through `Laws.Step`'s projections, which tell it from every other signal without matching
one here: it resumes nothing and reserves its element. -/
theorem occur_apart {signal : Signal} {element : ElementId} {scope : ScopeOccurrenceId} {leave : Leave}
    {writes : List (String × Value)} {rule : WriteRule} (same : signal = .occur element scope leave writes rule) :
    Laws.Step.resumesOf [signal] = [] ∧ Laws.Step.occursOf [signal] = [element] := by
  subst same
  exact ⟨rfl, rfl⟩

/-- A state holding only the process root, nothing in it, and only reservations queued for scope occurrences that do not
stand and Multi-Instance runs held in such, keeps the lane: each clause reads its work only where it stands. -/
theorem rootOnly_lane {s : State} (scopes : s.scopes = [{ id := State.root, element := none, parent := none }])
    (instances : s.slots.instances = [{ root := State.root }]) (issued : 0 < s.nextIssue) (occurrences : s.occurrences = [])
    (tokens : s.tokens = []) (parked : s.slots.parked = []) (compensation : s.slots.compensation = {})
    (signals : ∀ signal ∈ s.signals, ∃ element scope, signal = .occur element scope .outgoing [] .outward ∧
      scope ≠ State.root ∧ scope.value < s.nextIssue)
    (runs : ∀ run ∈ s.slots.multiInstances, run.scope ≠ State.root ∧ run.scope.value < s.nextIssue) :
    PlacedLane (topCalled program definition) s := by
  have only : ∀ x : ScopeOccurrenceId, x ∈ Laws.State.scopeIds s → x = State.root := fun x inside => by
    simpa [Laws.State.scopeIds, scopes] using inside
  refine ⟨⟨⟨⟨{ root := State.root }, by simp [instances], rfl⟩, ?_, by simp [occurrences]⟩, by simp [instances],
    by simpa [instances, Laws.State.root_eq] using issued, by simp [instances, Laws.State.root_eq], ?_, by simp [occurrences], by simp [parked],
    by simp [compensation]⟩, by simp [tokens], ?_, ?_, ?_, ?_, ?_, ?_, by simp [compensation], by simp [compensation],
    ?_, ?_, fun run member stands => absurd (only _ stands) (runs run member).1, ?_, ?_⟩
  · intro entry member called; simp [scopes] at member; subst member; simp at called
  · intro entry member element parent named; simp [scopes] at member; subst member; simp at named
  · intro request queued
    rcases queued with queued | queued
    · obtain ⟨_, _, same, _⟩ := signals _ queued
      have reserves := (occur_apart same).2
      change [] = _ at reserves
      cases reserves
    · simp [tokens] at queued
  · intro element scope leave pending
    rcases pending with ⟨writes, rule, queued⟩ | queued | ⟨run, member, _⟩
    · obtain ⟨_, _, same, apart⟩ := signals _ queued
      cases same
      exact ⟨fun stands => absurd (only _ stands) apart.1, fun _ named => by cases named⟩
    · obtain ⟨_, compensates⟩ := Laws.Step.mem_resumesOf.mp queued
      obtain ⟨_, _, _, inside⟩ := compensates
      obtain ⟨_, _, same, _⟩ := signals _ inside
      have resumes := (occur_apart same).1
      change [_] = [] at resumes
      cases resumes
    · simp [compensation] at member
  · intro host element scope queued; obtain ⟨_, _, same, _⟩ := signals _ queued
    have reserves := (occur_apart same).2
    change [] = _ at reserves
    cases reserves
  · intro occurrence gateway scope queued; obtain ⟨_, _, same, _⟩ := signals _ queued
    have reserves := (occur_apart same).2
    change [] = _ at reserves
    cases reserves
  · intro _ _ _ _ _ occurrence member; simp [occurrences] at member
  · intro id leave queued
    obtain ⟨_, compensates⟩ := Laws.Step.mem_resumesOf.mp queued
    obtain ⟨_, _, _, inside⟩ := compensates
    obtain ⟨_, _, same, _⟩ := signals _ inside
    have resumes := (occur_apart same).1
    change [_] = [] at resumes
    cases resumes
  · intro entry member; simp [scopes] at member; subst member; simp
  · intro entry member; simp [scopes] at member; subst member; simp
  · intro raised origin queued; obtain ⟨_, _, same, _⟩ := signals _ queued
    have reserves := (occur_apart same).2
    change [] = _ at reserves
    cases reserves
  · intro x work
    rcases work with ⟨element, leave, pending⟩ | ⟨raised, origin, queued, _⟩ | ⟨record, member, _⟩ | ⟨run, member, _⟩ |
        ⟨run, member, rfl⟩
    · rcases pending with ⟨writes, rule, queued⟩ | queued | ⟨run, member, _⟩
      · obtain ⟨_, _, same, apart⟩ := signals _ queued
        cases same
        exact apart.2
      · obtain ⟨_, compensates⟩ := Laws.Step.mem_resumesOf.mp queued
        obtain ⟨_, _, _, inside⟩ := compensates
        obtain ⟨_, _, same, _⟩ := signals _ inside
        have resumes := (occur_apart same).1
        change [_] = [] at resumes
        cases resumes
      · simp [compensation] at member
    · obtain ⟨_, _, same, _⟩ := signals _ queued
      have reserves := (occur_apart same).2
      change [] = _ at reserves
      cases reserves
    · simp [compensation] at member
    · simp [compensation] at member
    · exact (runs run member).2

/-- The process root and a reservation of `T` queued for `⟨5⟩`, issued and left. -/
def leftReservation : State :=
  { instanceId := "I", nextIssue := 6, scopes := [{ id := State.root, element := none, parent := none }]
    signals := [.occur ⟨"T"⟩ ⟨5⟩ .outgoing [] .outward]
    slots := { instances := [{ root := State.root }] } }

/-- Taken off `leftReservation`'s queue, the reservation of `T` in the left `⟨5⟩` places an occurrence of the called
process under the process root, although the lane held, the reservation was pending and the queue kept the lane. -/
theorem unstood_reserve_rejected :
    PlacedLane (topCalled program definition) leftReservation ∧ ¬ Laws.Step.ScopeStands leftReservation ⟨5⟩ ∧
      Laws.State.Popped (PlacedLane (topCalled program definition)) (.occur ⟨"T"⟩ ⟨5⟩ .outgoing [] .outward)
        { leftReservation with signals := [] } ∧
      ¬ PlacedLane (topCalled program definition) ({ leftReservation with signals := [] }.reserve ⟨"T"⟩ ⟨5⟩).1 := by
  have lane : PlacedLane (topCalled program definition) leftReservation :=
    rootOnly_lane program definition rfl rfl (by decide +kernel) rfl rfl rfl rfl
      (fun signal member => ⟨_, _, by simpa [leftReservation] using member, by simp [Laws.State.root_eq],
        by simp [leftReservation]⟩)
      (by simp [leftReservation])
  refine ⟨lane, fun ⟨entry, member, named⟩ => ?_, ⟨leftReservation, lane, rfl, rfl⟩, fun after => ?_⟩
  · simp [leftReservation] at member; subst member; simp [Laws.State.root_eq] at named
  · have reserves := Laws.State.reserve_reserves { leftReservation with signals := [] } ⟨"T"⟩ ⟨5⟩
    have root : ({ leftReservation with signals := [] }.reserve ⟨"T"⟩ ⟨5⟩).1.instanceRoot ⟨5⟩ = State.root := by
      obtain ⟨go, start, _, step⟩ := Laws.State.instanceRoot_go ({ leftReservation with signals := [] }.reserve ⟨"T"⟩ ⟨5⟩).1
      rw [start, reserves.scopes, show ({ leftReservation with signals := [] } : State).scopes.length = 0 + 1 from rfl, step,
        Laws.State.calledRoot_eq, reserves.scopes]
      simp [leftReservation, Laws.State.root_eq]
    exact rootOnly_misplaced program definition
      (reserves.placed ▸ reserves.kind ▸ after.placed.occurrences _ (by rw [reserves.occurrences]; simp))
      (reserves.placed ▸ root) (by rw [reserves.slots]; simp [leftReservation]) (topCalled_placed program definition)

/-- A Multi-Instance run of `T`'s boundary held in `⟨5⟩`. -/
def leftRunRecord : MultiInstanceRun :=
  { scope := ⟨5⟩, element := sharedX.id, occurrence := 0, collection := .null, instances := [] }

/-- The process root and `leftRunRecord`, whose `⟨5⟩` was issued and left. -/
def leftRun : State :=
  { instanceId := "I", nextIssue := 6, scopes := [{ id := State.root, element := none, parent := none }]
    slots := { instances := [{ root := State.root }], multiInstances := [leftRunRecord] } }

/-- A subscription of `T`'s boundary anchored by the run in the left `⟨5⟩` reserves under the process root, although
the lane held and the boundary is reservable and anchored there. -/
theorem unstood_subscription_rejected :
    PlacedLane (topCalled program definition) leftRun ∧ ¬ Laws.Step.ScopeStands leftRun ⟨5⟩ ∧
      Laws.IL.Reservable (topCalled program definition) sharedX.id ∧
      Laws.Flow.Anchored (PlacedLane (topCalled program definition)) (topCalled program definition) leftRun sharedX.id ⟨5⟩ ∧
      ¬ PlacedLane (topCalled program definition) (leftRun.reserve sharedX.id ⟨5⟩).1 := by
  have lane : PlacedLane (topCalled program definition) leftRun :=
    rootOnly_lane program definition rfl rfl (by decide +kernel) rfl rfl rfl rfl (by simp [leftRun])
      (by simp [leftRun, leftRunRecord, Laws.State.root_eq])
  refine ⟨lane, fun ⟨entry, member, named⟩ => ?_,
    .inl ⟨sharedHost "T", by simp [topCalled], _, Laws.IL.envelope?_scope _ _, sharedX, by simp, rfl⟩,
    ⟨sharedX.id, .inl rfl, .inl (.inr (.inr (.inr (.inr (.inl ⟨leftRunRecord, by simp [leftRun], rfl, rfl⟩)))))⟩, fun after => ?_⟩
  · simp [leftRun] at member; subst member; simp [Laws.State.root_eq] at named
  · have reserves := Laws.State.reserve_reserves leftRun sharedX.id ⟨5⟩
    have root : (leftRun.reserve sharedX.id ⟨5⟩).1.instanceRoot ⟨5⟩ = State.root := by
      obtain ⟨go, start, _, step⟩ := Laws.State.instanceRoot_go (leftRun.reserve sharedX.id ⟨5⟩).1
      rw [start, reserves.scopes, show leftRun.scopes.length = 0 + 1 from rfl, step, Laws.State.calledRoot_eq,
        reserves.scopes]
      simp [leftRun, Laws.State.root_eq]
    exact rootOnly_misplaced program definition
      (reserves.placed ▸ reserves.kind ▸ after.placed.occurrences _ (by rw [reserves.occurrences]; simp))
      (reserves.placed ▸ root) (by rw [reserves.slots]; simp [leftRun]) (topCalled_boundary program definition)

end FrameWitnesses

end Kernel.Proofs.Former

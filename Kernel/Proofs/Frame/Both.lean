module

public import Kernel.Proofs.Frame.Keys

/-! # Proofs: two properties carried beside `WellFormed` together

The records of `Kernel.Proofs.Frame.Alongside` for two properties give them for both at once (`frameAlongside_both` and
its siblings): each operation keeps each half, and a premise read off states that kept both is one read off states
that kept either. The walk's start-relative property (`Proofs.State.KeysAux`) carries the closure's counters
(`Laws.State.CountersFrom`) and the occurrence keys (`Keyed`) this way. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Frame

open Kernel
open Kernel.Laws.State (WellFormed)

section Weaken

variable {inv weaker : State → Prop} (implies : ∀ s, inv s → weaker s)
include implies

private theorem popped_mono {signal : Signal} {state : State} (popped : Laws.State.Popped inv signal state) :
    Laws.State.Popped weaker signal state :=
  let ⟨queue, unit, held, ⟨found, same⟩⟩ := popped
  ⟨queue, unit, implies queue held, found, same⟩

private theorem rollsBack_mono {trigger : OccurrenceRef} {state : State} (back : Laws.State.RollsBack inv trigger state) :
    Laws.State.RollsBack weaker trigger state :=
  let ⟨base, raised, origin, ⟨searched, popped, rest⟩⟩ := back
  ⟨base, raised, origin, searched, popped_mono implies popped, rest⟩

private theorem begunFrom_mono {state : State} {occurrence : Occurrence} (begun : Laws.State.BegunFrom inv state occurrence) :
    Laws.State.BegunFrom weaker state occurrence :=
  let ⟨before, request, role, ⟨sourceType, held, rest⟩⟩ := begun
  ⟨before, request, role, sourceType, implies before held, rest⟩

private theorem raisesFrom_mono {occurrence : Occurrence} {state : State} (raises : Laws.State.RaisesFrom inv occurrence state) :
    Laws.State.RaisesFrom weaker occurrence state :=
  let ⟨base, begun, rest⟩ := raises
  ⟨base, begunFrom_mono implies begun, rest⟩

private theorem pendingIn_mono {element : ElementId} (pending : Laws.Step.PendingIn inv element) :
    Laws.Step.PendingIn weaker element :=
  let ⟨held, holds, queued⟩ := pending
  ⟨held, implies held holds, queued⟩

private theorem resumeQueued_mono {state : State} {resume : Resume}
    (queued : Laws.Compensation.ResumeQueued inv state resume) : Laws.Compensation.ResumeQueued weaker state resume :=
  let ⟨queue, holds, rest⟩ := queued
  ⟨queue, implies queue holds, rest⟩

private theorem resumesPending_mono {s : State} {compensation : Compensations} (pending : ResumesPending inv s compensation) :
    ResumesPending weaker s compensation :=
  fun run member element at_ leave resumes => (pending run member element at_ leave resumes).imp_right (pendingIn_mono implies)

end Weaken

section Both

variable {program : Program} {A B : State → Prop}

private theorem left : ∀ s, (WellFormed program s ∧ (A s ∧ B s)) → WellFormed program s ∧ A s := fun _ held => ⟨held.1, held.2.1⟩

private theorem right : ∀ s, (WellFormed program s ∧ (A s ∧ B s)) → WellFormed program s ∧ B s := fun _ held => ⟨held.1, held.2.2⟩

/-- The state operations of `FrameAlongside` keep two properties together that they keep each. -/
theorem frameAlongside_both (a : FrameAlongside program A) (b : FrameAlongside program B) :
    FrameAlongside program fun s => A s ∧ B s where
  frame s t moved held := ⟨a.frame s t moved held.1, b.frame s t moved held.2⟩
  emit s o flows formed scope' leaves held :=
    ⟨a.emit s o flows formed scope' (leaves.mono left) held.1, b.emit s o flows formed scope' (leaves.mono right) held.2⟩
  complete s id leave writes rule source held :=
    ⟨a.complete s id leave writes rule (source.mono fun _ both => both.1) held.1,
      b.complete s id leave writes rule (source.mono fun _ both => both.2) held.2⟩
  park s waiting formed found held := ⟨a.park s waiting formed found held.1, b.park s waiting formed found held.2⟩
  arm s host element scope formed found held :=
    ⟨a.arm s host element scope formed found held.1, b.arm s host element scope formed found held.2⟩
  armGateway s o header payload formed member gateway held :=
    ⟨a.armGateway s o header payload formed member gateway held.1, b.armGateway s o header payload formed member gateway held.2⟩
  raise s raised origin formed uncancel found held :=
    ⟨a.raise s raised origin formed uncancel found held.1, b.raise s raised origin formed uncancel found held.2⟩
  signalBegin s request formed fits anchored held :=
    ⟨a.signalBegin s request formed fits (anchored.mono left) held.1,
      b.signalBegin s request formed fits (anchored.mono right) held.2⟩
  takePosition s held := ⟨a.takePosition s held.1, b.takePosition s held.2⟩
  enterScope s element parent locals owner formed stands anchored held :=
    ⟨a.enterScope s element parent locals owner formed stands (anchored.mono left) held.1,
      b.enterScope s element parent locals owner formed stands (anchored.mono right) held.2⟩
  reserve s element scope formed stands pending popped held :=
    ⟨a.reserve s element scope formed stands (pendingIn_mono (fun _ both => both.1) pending)
        (popped.imp fun _ => .imp fun _ => .imp fun _ => popped_mono left) held.1,
      b.reserve s element scope formed stands (pendingIn_mono (fun _ both => both.2) pending)
        (popped.imp fun _ => .imp fun _ => .imp fun _ => popped_mono right) held.2⟩
  leaveScope s scope formed stands owned held :=
    ⟨a.leaveScope s scope formed stands owned held.1, b.leaveScope s scope formed stands owned held.2⟩
  clearInside s scope keep formed stands outside held :=
    ⟨a.clearInside s scope keep formed stands outside held.1, b.clearInside s scope keep formed stands outside held.2⟩
  disarm s host formed held := ⟨a.disarm s host formed held.1, b.disarm s host formed held.2⟩
  setVariable s target name value formed held :=
    ⟨a.setVariable s target name value formed held.1, b.setVariable s target name value formed held.2⟩
  removeVariable s target name formed held :=
    ⟨a.removeVariable s target name formed held.1, b.removeVariable s target name formed held.2⟩

/-- `StoresAlongside` of two properties together. -/
theorem storesAlongside_both (a : StoresAlongside program A) (b : StoresAlongside program B) :
    StoresAlongside program fun s => A s ∧ B s :=
  { frameAlongside_both a.toFrameAlongside b.toFrameAlongside with
    storeRuns := fun s compensation formed stores pending stored held =>
      ⟨a.storeRuns s compensation formed stores (resumesPending_mono (fun _ both => both.1) pending)
          (stored.mono fun _ => resumeQueued_mono left) held.1,
        b.storeRuns s compensation formed stores (resumesPending_mono (fun _ both => both.2) pending)
          (stored.mono fun _ => resumeQueued_mono right) held.2⟩ }

/-- `Alongside` of two properties together. -/
theorem alongside_both (a : Alongside program A) (b : Alongside program B) : Alongside program fun s => A s ∧ B s :=
  { frameAlongside_both a.toFrameAlongside b.toFrameAlongside with
    instanceBegin := fun s request formed anchored held =>
      ⟨a.instanceBegin s request formed (anchored.mono left) held.1, b.instanceBegin s request formed (anchored.mono right) held.2⟩
    defer := fun s requests formed anchored held =>
      ⟨a.defer s requests formed (fun request member => (anchored request member).mono left) held.1,
        b.defer s requests formed (fun request member => (anchored request member).mono right) held.2⟩
    leaveInstance := fun s run scope formed member active stands held =>
      ⟨a.leaveInstance s run scope formed member active stands held.1, b.leaveInstance s run scope formed member active stands held.2⟩
    runs := fun s runs formed anchored held =>
      ⟨a.runs s runs formed (fun run member => (anchored run member).mono left) held.1,
        b.runs s runs formed (fun run member => (anchored run member).mono right) held.2⟩ }

/-- `OccursAlongside` of two properties together. -/
theorem occursAlongside_both (a : OccursAlongside program A) (b : OccursAlongside program B) :
    OccursAlongside program fun s => A s ∧ B s where
  reserve s element scope formed stands reservable anchored held :=
    ⟨a.reserve s element scope formed stands reservable (anchored.mono left) held.1,
      b.reserve s element scope formed stands reservable (anchored.mono right) held.2⟩
  occur s element scope leave writes rule formed origin anchored held :=
    ⟨a.occur s element scope leave writes rule formed (origin.imp_right (pendingIn_mono fun _ both => both.1))
        (anchored.mono left) held.1,
      b.occur s element scope leave writes rule formed (origin.imp_right (pendingIn_mono fun _ both => both.2))
        (anchored.mono right) held.2⟩
  compensate s scope activity trigger leave element at_ resumed origin rolled anchored held :=
    ⟨a.compensate s scope activity trigger leave element at_ resumed
        (origin.imp_right (pendingIn_mono fun _ both => both.1))
        (rolled.imp fun _ ⟨same, formed, stands, back⟩ => ⟨same, formed, stands, rollsBack_mono left back⟩)
        (anchored.mono left) held.1,
      b.compensate s scope activity trigger leave element at_ resumed
        (origin.imp_right (pendingIn_mono fun _ both => both.2))
        (rolled.imp fun _ ⟨same, formed, stands, back⟩ => ⟨same, formed, stands, rollsBack_mono right back⟩)
        (anchored.mono right) held.2⟩
  throwCompensate s occurrence scope activity trigger leave formed begun same unnamed held :=
    ⟨a.throwCompensate s occurrence scope activity trigger leave formed (begunFrom_mono left begun) same unnamed held.1,
      b.throwCompensate s occurrence scope activity trigger leave formed (begunFrom_mono right begun) same unnamed held.2⟩
  raise s raised occurrence formed raises held :=
    ⟨a.raise s raised occurrence formed (raisesFrom_mono left raises) held.1,
      b.raise s raised occurrence formed (raisesFrom_mono right raises) held.2⟩
  enterCalled s call variables definition formed member begun roled activity unowned held :=
    ⟨a.enterCalled s call variables definition formed member begun roled activity unowned held.1,
      b.enterCalled s call variables definition formed member begun roled activity unowned held.2⟩

/-- `ClosureAlongside` of two properties together. -/
theorem closureAlongside_both (a : ClosureAlongside program A) (b : ClosureAlongside program B) :
    ClosureAlongside program fun s => A s ∧ B s :=
  { frameAlongside_both a.toFrameAlongside b.toFrameAlongside with
    dequeue := fun s signals formed fewer held =>
      ⟨a.dequeue s signals formed fewer held.1, b.dequeue s signals formed fewer held.2⟩
    unqueue := fun s unit formed held => ⟨a.unqueue s unit formed held.1, b.unqueue s unit formed held.2⟩
    untoken := fun s unit formed held => ⟨a.untoken s unit formed held.1, b.untoken s unit formed held.2⟩
    begin := fun s request role sourceType formed stands admitted roled origin held =>
      ⟨a.begin s request role sourceType formed stands admitted roled (origin.mono fun _ both => ⟨both.1, both.2.1⟩) held.1,
        b.begin s request role sourceType formed stands admitted roled (origin.mono fun _ both => ⟨both.1, both.2.2⟩) held.2⟩
    cancel := fun s id formed held => ⟨a.cancel s id formed held.1, b.cancel s id formed held.2⟩
    journal := fun s unit transition formed held unjournalled started ended =>
      ⟨a.journal s unit transition formed held.1 unjournalled started ended,
        b.journal s unit transition formed held.2 unjournalled started ended⟩
    queueBatch := fun s unit formed held => ⟨a.queueBatch s unit formed held.1, b.queueBatch s unit formed held.2⟩ }

end Both

/-- The completion pipeline's phases keep two properties beside `WellFormed` together that they keep beside it each. -/
theorem pipelinePhases_both {A B : Program → State → Prop}
    (a : Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ A program s)
    (b : Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ B program s) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ (A program s ∧ B program s) where
  startReserved program s occurrence sourceType holds member unnamed :=
    have one := a.startReserved program s occurrence sourceType ⟨holds.1, holds.2.1⟩ member unnamed
    have two := b.startReserved program s occurrence sourceType ⟨holds.1, holds.2.2⟩ member unnamed
    ⟨one.1, one.2, two.2⟩
  removeOccurrence program s occurrence holds member free :=
    have one := a.removeOccurrence program s occurrence ⟨holds.1, holds.2.1⟩ member free
    have two := b.removeOccurrence program s occurrence ⟨holds.1, holds.2.2⟩ member free
    ⟨⟨one.1.1, one.1.2, two.1.2⟩, one.2⟩
  recordEnd program s key terminal holds :=
    have one := a.recordEnd program s key terminal ⟨holds.1, holds.2.1⟩
    have two := b.recordEnd program s key terminal ⟨holds.1, holds.2.2⟩
    ⟨one.1, one.2, two.2⟩

/-- Moving the issuer keeps a closure's counters relative to its start and the occurrence keys. -/
theorem countersKeyed_reissue {start : State} (_program : Program) (s : State) (unit : UnitKey)
    (held : Laws.State.CountersFrom start s ∧ Keyed s) :
    Laws.State.CountersFrom start { s with issuing := unit, issueNext := 0 } ∧ Keyed { s with issuing := unit, issueNext := 0 } :=
  ⟨held.1.same rfl rfl rfl, held.2⟩

end Kernel.Proofs.Frame

module

public import BpmnSemantics.SemanticProcessContract

/-! Per-work facts of the Activity host, the one place outside the step owner that dispatches on its work, per the
[Activity host specification](../../docs/capsules/ACTIVITY-HOST-FLOW-LISTS-SPEC.md#per-work-accessors). A host arriving
on one input behaves, waits and publishes exactly as the legacy operation of its work with that input. Transcribed
independently by the TypeScript `activity-host-work` module. -/

public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- The kind of wait a host's work opens. It fixes the host's published kind, resumption cut and cardinality class: a
User Task host is each of these as the legacy User Task, an effect host as the legacy Service or Send Task. -/
inductive ActivityHostWaitKind where
  | userTask
  | effect
  deriving Repr, DecidableEq

def ActivityHost.waitKind (host : ActivityHost) : ActivityHostWaitKind :=
  match host.work with
  | .userTask _ => .userTask
  | .effect _ => .effect

/-- Whether the host's wait is a resumption cut, as the legacy User Task's is and the legacy effect's is not. -/
def ActivityHost.isResumptionCut (host : ActivityHost) : Bool :=
  match host.waitKind with
  | .userTask => true
  | .effect => false

/-- The User Task the host's wait declares, which its declarers match on by task identity. -/
def ActivityHost.userTask? (host : ActivityHost) : Option UserTaskDefinition :=
  match host.work with
  | .userTask task => some task
  | .effect _ => none

/-- The effect the host's wait declares; its declarers match on the host's origin element, as the legacy effect's do. -/
def ActivityHost.effect? (host : ActivityHost) : Option EffectDefinition :=
  match host.work with
  | .userTask _ => none
  | .effect effect => some effect

/-- The legacy operation a host arrival on `input` equals; `none` without a single output, which the host Program
rules refuse, so no admitted Program reaches it. -/
def ActivityHost.projection? (host : ActivityHost) (input : ControlPlaceId) : Option SemanticOperation :=
  match host.outputs with
  | [output] => some (match host.work with
      | .userTask task => .awaitUserTask host.id host.origin input output.place task
      | .effect effect => .awaitEffect host.id host.origin input output.place effect none)
  | _ => none

/-- The legacy operation of the host's work between one input and one output. Work validity checks it for every pair,
so a splitting host's work, which has no single-output projection, is checked once per output (ACSP-HOST-01). -/
def ActivityHost.workAt (host : ActivityHost) (input output : ControlPlaceId) : SemanticOperation :=
  match host.work with
  | .userTask task => .awaitUserTask host.id host.origin input output task
  | .effect effect => .awaitEffect host.id host.origin input output effect none

/-! Laws of the per-work accessors. Bodies stay hidden, so a consumer proves through these and rebuilds only when an
accessor's meaning changes. `dsimp` unfolds without realizing equation lemmas, so the module exports none
([build modularity spec](../../docs/LEAN-BUILD-MODULARITY-SPEC.md#module-rules)). -/

theorem ActivityHost.userTask?_eq (host : ActivityHost) :
    host.userTask? = match host.work with
      | .userTask task => some task
      | .effect _ => none := by
  dsimp only [ActivityHost.userTask?]; cases host.work <;> rfl

theorem ActivityHost.effect?_eq (host : ActivityHost) :
    host.effect? = match host.work with
      | .userTask _ => none
      | .effect effect => some effect := by
  dsimp only [ActivityHost.effect?]; cases host.work <;> rfl

end BpmnSemantics.SemanticProcess

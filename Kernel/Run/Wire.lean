module

public import Kernel.IL.Codec

/-! # Kernel runner wire

Reading the runner's JSON inputs, and the occurrence reference both runner modes publish. -/

public section

namespace Kernel.Run

open Lean (Json toJson)

/-- An already public reference (`Host.publicRef`, `Population.occurrence`): the schema's `occurrenceId`. -/
def referenceJson (ref : OccurrenceRef) : Json :=
  Json.mkObj [("processInstanceId", Json.str ref.processInstanceId), ("elementId", Json.str ref.element.value),
    ("activation", toJson ref.activation)]

/-- A present value, or JSON null: the schema's nullable members. -/
def nullable {α : Type} (value : Option α) (encode : α → Json) : Json :=
  match value with
  | some value => encode value
  | none => Json.null

def readJson (path : String) : IO Json := do
  match Codec.parseStrict (← IO.FS.readFile path) with
  | .ok json => pure json
  | .error message => throw (IO.userError s!"{path}: {message}")

def orFail {α : Type} (path : String) : Except String α → IO α
  | .ok value => pure value
  | .error message => throw (IO.userError s!"{path}: {message}")

end Kernel.Run

module

public import Kernel.State.Key

/-! # State: the call depth of an instance name

How many Calls a process instance's name nests below its process root, read from the identifier it resolves to, so a
pending name and the name the commit resolves it to share it (`Laws.State.callDepth_rename`). The commit numbers activations
in this depth's order (`Step.activationOrder`). `State.calledInstanceId` prefixes each part with its UTF-8 byte length,
so the depth reads back through every caller whatever its characters.
-/

public section

namespace Kernel

/-- The prefix of `chars` spelled in exactly `bytes` UTF-8 bytes, with the rest; `none` where no prefix is. -/
def State.takeBytes : Nat → List Char → Option (List Char × List Char)
  | 0, rest => some ([], rest)
  | _ + 1, [] => none
  | bytes + 1, char :: rest =>
    if char.utf8Size ≤ bytes + 1 then
      (State.takeBytes (bytes + 1 - char.utf8Size) rest).map fun split => (char :: split.1, split.2)
    else none

/-- The caller's identifier `State.calledInstanceId` spells into `chars`: after `call:`, the decimal byte length up to
the first `:`, then that many bytes, then `:`; `none` where `chars` spells no called identifier. -/
def State.calledCaller? (chars : List Char) : Option (List Char) :=
  if ['c', 'a', 'l', 'l', ':'].isPrefixOf chars then
    let rest := chars.drop 5
    match rest.dropWhile Char.isDigit with
    | ':' :: body =>
      match State.takeBytes (Nat.ofDigitChars 10 (rest.takeWhile Char.isDigit) 0) body with
      | some (caller, ':' :: _) => some caller
      | _ => none
    | _ => none
  else none

/-- The callers `State.calledCaller?` reads in turn from `chars`, within `fuel` levels. Every caller is shorter than its
callee, so the identifier's length is fuel enough (`Laws.State.spelledDepth_calledInstanceId`). -/
def State.spelledDepthWithin : Nat → List Char → Nat
  | 0, _ => 0
  | fuel + 1, chars =>
    match State.calledCaller? chars with
    | some caller => State.spelledDepthWithin fuel caller + 1
    | none => 0

/-- The Calls the identifier `id` nests below its process root: one more than its caller's for an identifier
`State.calledInstanceId` spells, 0 for any other. -/
def State.spelledDepth (id : String) : Nat := State.spelledDepthWithin id.length id.toList

/-- The Calls a name nests below its process root, as the identifier it resolves to spells them: a named instance's
read from its identifier (`State.spelledDepth`), a pending one's one more than its caller's. A name and the name the commit
resolves it to share it (`Laws.State.callDepth_rename`), and a callee's is one more than its caller's, so the commit numbers
callers first and one resolved slot's activations in their own order (`Step.activationOrder`). -/
def InstanceName.callDepth : InstanceName → Nat
  | .named id => State.spelledDepth id
  | .called caller _ _ => caller.callDepth + 1

end Kernel

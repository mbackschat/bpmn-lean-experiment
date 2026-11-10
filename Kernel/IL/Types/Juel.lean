module

/-! # The JUEL node table

The reader's meaning-preserving parse of one JUEL text at the Core level
([expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#il-shape-and-placement)): a flat
table in post-order, each child the index of an earlier node, the root last. Part of `Kernel.IL.Types`, which
re-exports it.
-/

public section

namespace Kernel

/-- EL 2.2 binary operators at the pinned grammar (`Parser.java` `or` to `mul`). -/
inductive JuelBinary where
  | or | and | eq | ne | lt | gt | le | ge | add | sub | mul | div | mod
  deriving DecidableEq, Repr

inductive JuelUnary where
  | not | neg | empty
  deriving Repr

/-- The closed read-only method list of the Core level, each a Java method name; the constructor names are the Java
names, so the codecs decode a call target through `JuelMethod`'s own wire names. -/
inductive JuelMethod where
  | length | isEmpty | size | equals | contains | startsWith | endsWith | indexOf | lastIndexOf
  | substring | toUpperCase | toLowerCase | trim | concat | replace | get
  | containsKey | containsValue
  deriving DecidableEq, Repr

/-- Whether a listed method has an overload of `count` arguments; any other count is an unlisted call. -/
def JuelMethod.admits (method : JuelMethod) (count : Nat) : Bool :=
  match method with
  | .length | .isEmpty | .size | .toUpperCase | .toLowerCase | .trim => count == 0
  | .equals | .contains | .startsWith | .endsWith | .indexOf | .lastIndexOf | .concat | .get
  | .containsKey | .containsValue => count == 1
  | .substring => count == 1 || count == 2
  | .replace => count == 2

/-- A method call's target: a listed method, or another name, which admission refuses (`expression.juel.method`). -/
inductive JuelCall where
  | listed (method : JuelMethod)
  | other (name : String)
  deriving Repr

/-- A function call `qualifier:name(args)`, which the Core level refuses whole. -/
structure JuelFunctionNode where
  qualifier : Option String
  name : String
  args : List Nat
  deriving Repr

/-- A method call on `receiver` by a written name. -/
structure JuelCallNode where
  receiver : Nat
  target : JuelCall
  args : List Nat
  deriving Repr

/-- A method call whose name is computed (`receiver[name](args)`), which the Core level refuses. -/
structure JuelComputedCallNode where
  receiver : Nat
  name : Nat
  args : List Nat
  deriving Repr

structure JuelBinaryNode where
  op : JuelBinary
  left : Nat
  right : Nat
  deriving Repr

structure JuelChoiceNode where
  condition : Nat
  whenTrue : Nat
  whenFalse : Nat
  deriving Repr

/-- One node of a parsed JUEL text; a child is the index of an earlier node. -/
inductive JuelNode where
  | text (value : String)
  | composite (parts : List Nat)
  | null
  | bool (value : Bool)
  | integer (digits : String)
  | float (lexeme : String)
  -- A quoted literal, kept apart from the unquoted `text` around an eval.
  | stringLiteral (value : String)
  | identifier (name : String)
  | function (payload : JuelFunctionNode)
  | dot (base : Nat) (property : String)
  | bracket (base property : Nat)
  | call (payload : JuelCallNode)
  | computedCall (payload : JuelComputedCallNode)
  | unary (op : JuelUnary) (operand : Nat)
  | binary (payload : JuelBinaryNode)
  | choice (payload : JuelChoiceNode)
  deriving Repr

end Kernel

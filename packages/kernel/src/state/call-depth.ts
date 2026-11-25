/**
 * The call depth of an instance name, transcribed from `Kernel/State/CallDepth.lean`: how many Calls a process
 * instance's name nests below its process root, read from the identifier it resolves to, so a pending name and the name
 * the commit resolves it to share it. `step/commit.ts` numbers activations in this depth's order.
 */
import { utf8ByteSize } from "../il/types.js";
import type { InstanceName } from "../state.js";

/**
 * Lean's `State.spelledDepth`: the Calls `calledInstanceId` nests in the identifier `id`, read through each length-prefixed
 * caller; 0 where it spells no called identifier. Lean bounds the reading by the identifier's length, which every level
 * shortens, so plain recursion reads the same.
 */
export function spelledDepth(id: string): number {
  return spelledDepthOf([...id]);
}

function spelledDepthOf(chars: readonly string[]): number {
  if (chars.slice(0, 5).join("") !== "call:") return 0;
  const rest = chars.slice(5);
  let digits = 0;
  while (digits < rest.length && /^[0-9]$/u.test(rest[digits] ?? "")) digits += 1;
  if (rest[digits] !== ":") return 0;
  const bytes = rest.slice(0, digits).reduce((sofar, digit) => sofar * 10 + (digit.charCodeAt(0) - 48), 0);
  const body = rest.slice(digits + 1);
  let taken = 0;
  let used = 0;
  while (used < bytes) {
    const char = body[taken];
    if (char === undefined) return 0;
    const size = utf8ByteSize(char);
    if (size > bytes - used) return 0;
    used += size;
    taken += 1;
  }
  return body[taken] === ":" ? spelledDepthOf(body.slice(0, taken)) + 1 : 0;
}

/** Lean's `InstanceName.callDepth`: the Calls a name nests below its process root, as the identifier it resolves to spells them. */
export function instanceCallDepth(name: InstanceName): number {
  return typeof name === "string" ? spelledDepth(name) : 1 + instanceCallDepth(name.caller);
}

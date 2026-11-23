/**
 * DC12's compaction at commit (`Kernel.Step.compact`, `packages/kernel/src/step/commit.ts`): inside a closure every
 * identity is its unit's issue, and the commit renames each, in the order the units ran, to the ordinal its slot's
 * counter gives, so the committed keys do not depend on the order the issue table was written in. The test reaches
 * `compact` in the built kernel directly, because no stimulus can write the issue table in an order other than the
 * run's; Lean's side is `Kernel.Laws.Step.Compaction`. The oracle is the base's counter at issue: the unit that ran first
 * takes the slot's next ordinal.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import type { ScopeOccurrenceId, State } from "@bpmn-lean/kernel";

import { projectRoot } from "./pipeline-target-support.ts";

type Module = Readonly<Record<string, any>>;

const kernelModule = async (relative: string): Promise<Module> =>
  await import(path.join(projectRoot, "packages/kernel/dist", relative)) as Module;

const root = "" as ScopeOccurrenceId;

test("two units issuing in the opposite order compact to the same committed keys", async () => {
  const state = await kernelModule("state.js");
  const key = await kernelModule("state/key.js");
  const order = await kernelModule("step/order.js");
  const { compact } = await kernelModule("step/commit.js");
  assert.equal(typeof compact, "function", "Step.compact is missing");

  const input = key.unitRoot({ tag: key.UnitRootTag.Input });
  const [first, second] = [key.tokenUnit(input, 1), key.tokenUnit(input, 0)];
  const log = [input, first, second].reduce((recorded, unit) => order.runRecord(recorded, unit), order.emptyRunLog);
  // Two Sub-Processes entered before this closure: the slot's committed counter is 2.
  const base: State = { ...state.initial("I", []), scopeOrdinals: [[{ parent: root, element: "Sub" }, 2]] };

  /** `unit` enters a `Sub` scope occurrence at the root and reserves a `Task` occurrence inside it. */
  const run = (current: State, unit: unknown, ran: number): State => {
    const issuing = { unit, text: key.issuerText(unit, ran) };
    const [entered, scope] = state.enterScope({ ...current, issuing, issueNext: 0 }, "Sub", root, [], null);
    return state.reserve(entered, "Task", scope)[0];
  };
  const runOrder = run(run(base, first, 1), second, 2);
  const reversed = run(run(base, second, 2), first, 1);

  const committed = (written: State): Readonly<Record<string, unknown>> => {
    const compacted = compact(base, log, written);
    assert.ok(compacted.ok, JSON.stringify(compacted));
    const after = compacted.value as State;
    assert.equal(after.issued, null, "the issue table empties");
    return {
      scopes: after.scopes.map((scope) => scope.id).sort(),
      occurrences: after.occurrences.map((occurrence) => occurrence.id).sort(),
      scopeOrdinals: after.scopeOrdinals,
      occurrenceOrdinals: after.occurrenceOrdinals,
    };
  };
  const expected = {
    scopes: ["", "3:Sub#2/", "3:Sub#3/"],
    occurrences: ["4:Task#0@3:Sub#2/", "4:Task#0@3:Sub#3/"],
    scopeOrdinals: [[{ parent: root, element: "Sub" }, 4]],
    occurrenceOrdinals: [[{ parent: "3:Sub#2/", element: "Task" }, 1], [{ parent: "3:Sub#3/", element: "Task" }, 1]],
  };
  assert.deepEqual(committed(runOrder), expected);
  assert.deepEqual(committed(reversed), expected);
  // `first` entered its scope occurrence first in `runOrder`, `second` in `reversed`; `first` ran first in both.
  assert.equal(compact(base, log, runOrder).value.scopes[1].id, "3:Sub#2/", "the unit that ran first takes the slot's next ordinal");
  assert.equal(compact(base, log, reversed).value.scopes[1].id, "3:Sub#3/");
});

/**
 * A closure that issues a child of a committed scope occurrence and then leaves that scope occurrence prunes its
 * counters with it (`leaveScope`), so a base read at commit would number the child from 0 again and reuse an identity
 * the journal already published. The oracle is the base 1294037ce's counter at issue: `sub#0` had entered one `Inner`
 * child, so the closure's child is `Inner#1`, and the left `sub#0` keeps no counter.
 */
test("a child issued under a scope occurrence the closure then leaves takes the counter it had at the closure's start", async () => {
  const state = await kernelModule("state.js");
  const removal = await kernelModule("state/removal.js");
  const key = await kernelModule("state/key.js");
  const journal = await kernelModule("state/journal.js");
  const order = await kernelModule("step/order.js");
  const { compact } = await kernelModule("step/commit.js");
  const input = key.unitRoot({ tag: key.UnitRootTag.Input });
  const log = order.runRecord(order.emptyRunLog, input);
  const issuing = { unit: input, text: key.issuerText(input, 1) };
  // An earlier command: enter `Sub`, enter and leave one `Inner` child in it, commit.
  const opening = { ...state.initial("I", []), issuing, issueNext: 0 };
  const [opened, fresh] = state.enterScope(opening, "Sub", root, [], null);
  const [entered, earlier] = state.enterScope(opened, "Inner", fresh, [], null);
  const before = compact(opening, log, removal.leaveScope(entered, earlier));
  assert.ok(before.ok, JSON.stringify(before));
  const start = before.value as State;
  const sub = "3:Sub#0/" as ScopeOccurrenceId;
  assert.deepEqual(start.scopeOrdinals, [[{ parent: root, element: "Sub" }, 1], [{ parent: sub, element: "Inner" }, 1]],
    "`Inner#0` was published below `Sub#0`");

  const [issued, inner] = state.enterScope({ ...start, issuing, issueNext: 0 }, "Inner", sub, [], null);
  const owned = { cause: { tag: journal.CauseTag.Idle, scope: inner }, element: "Inner", owner: inner, started: [], ended: [], ready: [] };
  const outcome = compact(start, log, removal.leaveScope({ ...issued, journal: [owned] }, sub));
  assert.ok(outcome.ok, JSON.stringify(outcome));
  const after = outcome.value as State;
  assert.deepEqual(after.journal.map((transition) => transition.owner), ["5:Inner#1/3:Sub#0/"]);
  assert.deepEqual(after.scopeOrdinals, [[{ parent: root, element: "Sub" }, 1]]);
});

/**
 * Two distinct units of one closure that share depth, fingerprint and root order by path in Lean but by run in the
 * kernel's issue text (`IssuerText`), so the commit refuses them. Distinct steps have distinct fingerprint codes
 * (`UnitStep.stepCode`), so only a 64-bit accident makes such a pair, and the witness sets its fingerprint by hand.
 */
const issuing = async (pairs: readonly (readonly [unknown, number])[]): Promise<unknown> => {
  const state = await kernelModule("state.js");
  const key = await kernelModule("state/key.js");
  const order = await kernelModule("step/order.js");
  const { compact } = await kernelModule("step/commit.js");
  const input = key.unitRoot({ tag: key.UnitRootTag.Input });
  const log = [input, ...pairs.map(([unit]) => unit)].reduce((recorded, unit) => order.runRecord(recorded, unit), order.emptyRunLog);
  const written = pairs.reduce((current: State, [unit, ran]) => {
    const issuer = { unit, text: key.issuerText(unit, ran) };
    return state.enterScope({ ...current, issuing: issuer, issueNext: 0 }, "Sub", root, [], null)[0];
  }, state.initial("I", []));
  return compact(state.initial("I", []), log, written);
};

test("two issuing units of one closure that share depth, fingerprint and root are refused at commit", async () => {
  const key = await kernelModule("state/key.js");
  const input = key.unitRoot({ tag: key.UnitRootTag.Input });
  const signal = key.pushUnit(input, { tag: key.UnitStepTag.Signal, index: 1 });
  const forged = { ...key.pushUnit(input, { tag: key.UnitStepTag.Idle, index: 0 }), fingerprint: signal.fingerprint };
  assert.deepEqual(await issuing([[signal, 1], [forged, 2]]),
    { ok: false, failure: { tag: "unsupported", code: "unit-fingerprint-collision" } });
});

test("two issuing units that differ in fingerprint commit", async () => {
  const key = await kernelModule("state/key.js");
  const input = key.unitRoot({ tag: key.UnitRootTag.Input });
  const signal = key.pushUnit(input, { tag: key.UnitStepTag.Signal, index: 1 });
  for (const other of [{ tag: key.UnitStepTag.Token, index: 0 }, { tag: key.UnitStepTag.Idle, index: 0 }]) {
    const outcome = await issuing([[signal, 1], [key.pushUnit(input, other), 2]]) as { ok: boolean; value: State };
    assert.ok(outcome.ok, JSON.stringify(other));
    assert.deepEqual(outcome.value.scopes.map((scope) => scope.id), ["", "3:Sub#0/", "3:Sub#1/"]);
  }
});

/**
 * Lean's `SpineStep UnitStep` code is `4 * cantorPair index round + rank` (`Kernel/State/Key.lean`), mixed into a
 * fingerprint as `(fingerprint ^ code) * 0x9E3779B97F4A7C15` mod 2^64; the oracle computes it here, beside the kernel's.
 */
test("a unit step's fingerprint code is Lean's Cantor code, distinct for distinct steps", async () => {
  const key = await kernelModule("state/key.js");
  const input = key.unitRoot({ tag: key.UnitRootTag.Input });
  const tags = [key.UnitStepTag.Signal, key.UnitStepTag.Token, key.UnitStepTag.Idle, key.UnitStepTag.Offer];
  const seen = new Map<bigint, string>();
  for (const [rank, tag] of tags.entries()) {
    for (let index = 0; index < 12; index += 1) {
      for (let round = 0; round < (tag === key.UnitStepTag.Offer ? 12 : 1); round += 1) {
        const step = tag === key.UnitStepTag.Offer ? { tag, index, round } : { tag, index };
        const code = 4n * BigInt((index + round) * (index + round + 1) / 2 + round) + BigInt(rank);
        const { fingerprint } = key.pushUnit(input, step);
        assert.equal(fingerprint, BigInt.asUintN(64, code * 0x9E3779B97F4A7C15n), JSON.stringify(step));
        assert.equal(seen.get(fingerprint), undefined, `${JSON.stringify(step)} collides with ${seen.get(fingerprint)}`);
        seen.set(fingerprint, JSON.stringify(step));
      }
    }
  }
});

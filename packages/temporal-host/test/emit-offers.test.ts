/**
 * A chain's bookkeeping of the hand-offs it offers the population ingress (the cold audit's A1): its emit barrier waits
 * for the ingress's answer, accepted or deferred, never for room, so no Update stays in flight while the ingress is full;
 * it offers every unanswered emit in commit order, a deferral included; and a Run that hands its deferred emits back names
 * them, so exactly those are offered again, while a stale deferral from that Run leaves its emit unanswered.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { UnsettledEmit } from "../src/population-contract.ts";

const offers = await import(new URL("../dist/emit-offers.js", import.meta.url).href) as typeof import("../src/emit-offers.ts");
const { chainCapacity, chainRolloverDue } = await import(new URL("../dist/capacity.js", import.meta.url).href) as
  typeof import("../src/capacity.ts");

const emit = (commandId: string, accepted = false): UnsettledEmit =>
  ({ commandId, held: { instanceId: "I", intents: [] }, accepted });
const ids = (emits: readonly UnsettledEmit[]) => emits.map((held) => held.commandId);

test("a deferral answers the emit barrier, and every later emit is still offered, in commit order", () => {
  const emits = [emit("a"), emit("b"), emit("c")];
  assert.equal(offers.allAnswered(emits, offers.noOffers), false);
  const first = offers.offered(emits, offers.noOffers, "a", { kind: "deferred", run: "X" });
  assert.deepEqual(ids(offers.dueOffers(first.emits, first.offers)), ["b", "c"], "the deferral holds back no later emit");
  const second = offers.offered(first.emits, first.offers, "b", { kind: "accepted" });
  const third = offers.offered(second.emits, second.offers, "c", { kind: "deferred", run: "X" });
  assert.ok(offers.allAnswered(third.emits, third.offers), "every emit answered, one accepted and two deferred");
  assert.deepEqual(third.emits.map((held) => held.accepted), [false, true, false], "only acceptance is carried");
});

test("a hand-back names the emits it returns, and only those are offered again, to the next Run", () => {
  const emits = [emit("a"), emit("b")];
  let state = offers.offered(emits, offers.noOffers, "a", { kind: "deferred", run: "X" });
  state = offers.offered(state.emits, state.offers, "b", { kind: "deferred", run: "X" });
  // Run X accepted *a* before it rolled over, so it hands back *b* only.
  const handed = offers.handedBack(state.offers, { run: "X", commandIds: ["b"] });
  assert.deepEqual(handed.handedBack, "X");
  assert.deepEqual(ids(offers.dueOffers(state.emits, handed)), ["b"]);
  const stale = offers.offered(state.emits, handed, "b", { kind: "deferred", run: "X" });
  assert.deepEqual(ids(offers.dueOffers(stale.emits, stale.offers)), ["b"], "a deferral by the Run that handed it back is void");
  const next = offers.offered(stale.emits, stale.offers, "b", { kind: "deferred", run: "Y" });
  assert.ok(offers.allAnswered(next.emits, next.offers), "the next Run's deferral answers it");
});

test("a verdict for an emit that settled or was accepted meanwhile changes nothing", () => {
  const emits = [emit("a", true)];
  assert.deepEqual(offers.offered(emits, offers.noOffers, "a", { kind: "deferred", run: "X" }), { emits, offers: offers.noOffers });
  assert.deepEqual(offers.offered([], offers.noOffers, "a", { kind: "accepted" }), { emits: [], offers: offers.noOffers });
});

test("a chain Run continues as new by its Update count alone, so settlements and wakes never take it to Temporal's limit", () => {
  const usage = { historyEvents: 10, historyBytes: 0, continueAsNewSuggested: false, updates: chainCapacity.updatesPerRun, retainedPublicationBytes: 0 };
  assert.equal(chainRolloverDue(0, usage, 1_000), true, "a Run that committed nothing still rolls over at the Update fence");
  assert.equal(chainRolloverDue(0, { ...usage, updates: chainCapacity.updatesPerRun - 1, historyEvents: 1_000 }, 1_000), false,
    "a Run that committed nothing never rolls over for its own history, which would chain Runs without progress");
  assert.equal(chainRolloverDue(1, { ...usage, updates: 0, historyEvents: 1_000 }, 1_000), true);
});

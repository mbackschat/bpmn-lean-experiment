import assert from "node:assert/strict";
import test from "node:test";

import {
  FakeActorResolver,
  InvalidActorContextError,
} from "../dist/index.js";

test("snapshots and freezes configured identity values", () => {
  const configured = { id: "demo-user", groups: ["reviewers"] };
  const resolver = new FakeActorResolver(configured);
  configured.id = "mutated-user";
  configured.groups[0] = "mutated-group";
  configured.groups.push("late-group");

  const resolved = resolver.resolveActor();
  assert.deepEqual(resolved, { id: "demo-user", groups: ["reviewers"] });
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.groups), true);
  assert.throws(() => {
    (resolved.groups as string[]).push("injected-group");
  }, TypeError);
  assert.deepEqual(resolver.resolveActor(), resolved);
});

test("rejects exact duplicate groups instead of deduplicating them", () => {
  assert.throws(
    () => new FakeActorResolver({
      id: "demo-user",
      groups: ["reviewers", "reviewers"],
    }),
    InvalidActorContextError,
  );
});

test("preserves distinct exact Unicode and case variants", () => {
  const resolver = new FakeActorResolver({
    id: " demo-user ",
    groups: ["Reviewers", "reviewers", "é", "e\u0301"],
  });

  assert.deepEqual(resolver.resolveActor(), {
    id: " demo-user ",
    groups: ["Reviewers", "reviewers", "é", "e\u0301"],
  });
});

test("rejects empty or ill-formed actor and group identifiers", () => {
  assert.throws(
    () => new FakeActorResolver({ id: "", groups: [] }),
    InvalidActorContextError,
  );
  assert.throws(
    () => new FakeActorResolver({ id: "demo-user", groups: ["\uD800"] }),
    InvalidActorContextError,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import {
  WorkAuditForbiddenError,
  WorkAuditService,
} from "@bpmn-lean/platform-work";

test("reconciles pending audit before a self-only read", async () => {
  const calls: string[] = [];
  const service = createService(calls);

  assert.deepEqual(await service.search({ actionKind: "claim", limit: 50 }), {
    events: [],
    nextCursor: null,
  });
  assert.deepEqual(calls, ["reconcile", "search:demo-user:claim"]);
});

test("forbids another actor before repository search", async () => {
  const calls: string[] = [];
  const service = createService(calls);

  await assert.rejects(
    service.search({ actorId: "other-user", limit: 50 }),
    WorkAuditForbiddenError,
  );
  assert.deepEqual(calls, ["reconcile"]);
});

function createService(calls: string[]): WorkAuditService {
  return new WorkAuditService({
    actors: new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] }),
    authorization: new TaskAuthorizationPolicy(),
    outbox: { reconcileAll: async () => { calls.push("reconcile"); } },
    audit: {
      search: async (request) => {
        calls.push(`search:${request.actorId}:${request.actionKind ?? "all"}`);
        return { events: [], nextCursor: null };
      },
    },
  });
}

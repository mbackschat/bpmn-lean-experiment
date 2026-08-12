import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FakeActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";

import {
  WorkAuditForbiddenError,
  WorkAuditService,
} from "../dist/work-audit-service.js";

test("reconciles pending audit before a self-only read", () => {
  const calls: string[] = [];
  const service = createService(calls);

  assert.deepEqual(service.search({ actionKind: "claim", limit: 50 }), {
    events: [],
    nextCursor: null,
  });
  assert.deepEqual(calls, ["reconcile", "search:demo-user:claim"]);
});

test("forbids another actor before repository search", () => {
  const calls: string[] = [];
  const service = createService(calls);

  assert.throws(
    () => service.search({ actorId: "other-user", limit: 50 }),
    WorkAuditForbiddenError,
  );
  assert.deepEqual(calls, ["reconcile"]);
});

function createService(calls: string[]): WorkAuditService {
  return new WorkAuditService({
    actors: new FakeActorResolver({ id: "demo-user", groups: ["reviewers"] }),
    authorization: new TaskAuthorizationPolicy(),
    outbox: { reconcileAll: () => { calls.push("reconcile"); } },
    audit: {
      search: (request) => {
        calls.push(`search:${request.actorId}:${request.actionKind ?? "all"}`);
        return { events: [], nextCursor: null };
      },
    },
  });
}

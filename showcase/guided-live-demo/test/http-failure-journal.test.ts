import assert from "node:assert/strict";
import test from "node:test";

import {
  HttpFailureJournal,
} from "../dist/http-failure-journal.js";

test("records the failed endpoint and closed public error code without query or body detail", () => {
  const journal = new HttpFailureJournal();
  journal.recordResponse({
    method: "GET",
    url: "http://127.0.0.1:3000/api/v1/incidents/private-id?token=secret",
    status: 500,
    body: JSON.stringify({
      error: { code: "internalFailure", message: "postgresql://user:secret@host/db" },
    }),
  });

  assert.deepEqual(journal.snapshot(), [{
    kind: "http",
    method: "GET",
    path: "/api/v1/incidents/private-id",
    status: 500,
    publicErrorCode: "internalFailure",
  }]);
  assert.doesNotMatch(JSON.stringify(journal.snapshot()), /token|secret|postgresql/u);
});

test("bounds the journal and records only safe network failure atoms", () => {
  const journal = new HttpFailureJournal(2);
  journal.recordRequestFailure({
    method: "GET",
    url: "http://127.0.0.1:3000/api/v1/definitions?credential=private",
    errorText: "net::ERR_CONNECTION_RESET",
  });
  journal.recordRequestFailure({
    method: "POST",
    url: "http://127.0.0.1:3000/api/v1/start",
    errorText: "credential-bearing free text",
  });
  journal.recordRequestFailure({
    method: "PUT",
    url: "http://127.0.0.1:3000/api/v1/ignored",
    errorText: "net::ERR_FAILED",
  });

  assert.deepEqual(journal.snapshot(), [
    {
      kind: "network",
      method: "GET",
      path: "/api/v1/definitions",
      errorCode: "net::ERR_CONNECTION_RESET",
    },
    {
      kind: "network",
      method: "POST",
      path: "/api/v1/start",
      errorCode: "requestFailed",
    },
  ]);
});

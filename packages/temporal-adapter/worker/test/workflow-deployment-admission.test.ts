import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkflowDeploymentPollerKind,
  admitWorkflowDeployment,
  workflowBundleIdentity,
  workflowDeploymentPollerIdentity,
} from "../dist/index.js";
import type {
  BpmnWorkflowBundle,
  WorkflowDeploymentAdmissionOperations,
  WorkflowDeploymentPlan,
  WorkflowDeploymentPoller,
  WorkflowDeploymentPollerIdentity,
} from "../dist/index.js";

const currentBundle = bundle("old Workflow bundle");
const candidateBundle = bundle("candidate Workflow bundle");
const currentBundleIdentity = workflowBundleIdentity(currentBundle);
const candidateBundleIdentity = workflowBundleIdentity(candidateBundle);
const currentWorkerIdentity = workflowDeploymentPollerIdentity(
  currentBundleIdentity,
  "worker-old-1",
);
const candidateWorkerIdentity = workflowDeploymentPollerIdentity(
  candidateBundleIdentity,
  "worker-candidate-1",
);

test("admits only the replayed candidate after an exact stop-the-world sequence", async () => {
  const events: string[] = [];
  const candidatePollers = pollers(candidateWorkerIdentity);
  let inventoryRead = 0;
  const receipt = await admitWorkflowDeployment(plan(), {
    async fenceIngress() {
      events.push("fence");
    },
    async stopCurrentWorkers() {
      events.push("stop-current");
    },
    async readPollers() {
      inventoryRead += 1;
      events.push(`inventory-${inventoryRead}`);
      return inventoryRead === 1 ? [] : candidatePollers;
    },
    async replayCandidate() {
      events.push("replay-candidate");
    },
    async startCandidateWorkers() {
      events.push("start-candidate");
      return { shutdown: async () => events.push("stop-candidate") };
    },
    async reopenIngress() {
      events.push("reopen");
    },
  });

  assert.deepEqual(events, [
    "fence",
    "stop-current",
    "inventory-1",
    "replay-candidate",
    "start-candidate",
    "inventory-2",
    "reopen",
  ]);
  assert.deepEqual(receipt, {
    format: "bpmn-lean.workflow-deployment-admission.v1",
    taskQueue: "bpmn-production",
    currentBundleIdentity,
    candidateBundleIdentity,
    candidateWorkerIdentities: [candidateWorkerIdentity],
  });
});

test("rejects substituted bundle identity before fencing ingress", async () => {
  const events: string[] = [];
  await assert.rejects(
    admitWorkflowDeployment({
      ...plan(),
      candidate: {
        ...plan().candidate,
        bundleIdentity: currentBundleIdentity,
      },
    }, operations(events, [])),
    /candidate bundle identity does not match its exact code bytes/,
  );
  assert.deepEqual(events, []);
});

test("keeps ingress fenced when candidate replay fails", async () => {
  const events: string[] = [];
  const dependencies = operations(events, []);
  dependencies.replayCandidate = async () => {
    events.push("replay-candidate");
    throw new Error("candidate cannot replay retained history");
  };

  await assert.rejects(
    admitWorkflowDeployment(plan(), dependencies),
    /candidate cannot replay retained history/,
  );
  assert.deepEqual(events, [
    "fence",
    "stop-current",
    "inventory",
    "replay-candidate",
  ]);
});

test("rejects mixed old and candidate pollers and stops the candidate", async () => {
  const events: string[] = [];
  let inventoryRead = 0;
  const dependencies = operations(events, []);
  dependencies.readPollers = async () => {
    inventoryRead += 1;
    events.push(`inventory-${inventoryRead}`);
    return inventoryRead === 1
      ? []
      : [...pollers(candidateWorkerIdentity), ...pollers(currentWorkerIdentity)];
  };

  await assert.rejects(
    admitWorkflowDeployment(plan(), dependencies),
    /candidate-only poller inventory/,
  );
  assert.deepEqual(events, [
    "fence",
    "stop-current",
    "inventory-1",
    "replay-candidate",
    "start-candidate",
    "inventory-2",
    "stop-candidate",
  ]);
});

test("requires both Workflow and Activity pollers before reopening ingress", async () => {
  const events: string[] = [];
  let inventoryRead = 0;
  const dependencies = operations(events, []);
  dependencies.readPollers = async () => {
    inventoryRead += 1;
    events.push(`inventory-${inventoryRead}`);
    return inventoryRead === 1
      ? []
      : [{
        kind: WorkflowDeploymentPollerKind.Workflow,
        identity: candidateWorkerIdentity,
      }];
  };

  await assert.rejects(
    admitWorkflowDeployment(plan(), dependencies),
    /candidate-only poller inventory/,
  );
  assert.equal(events.at(-1), "stop-candidate");
  assert.equal(events.includes("reopen"), false);
});

test("bundle and poller identities are exact and content-bound", () => {
  assert.match(
    currentBundleIdentity,
    /^bpmn-lean\.workflow-bundle-sha256:[0-9a-f]{64}$/u,
  );
  assert.notEqual(currentBundleIdentity, candidateBundleIdentity);
  assert.notEqual(
    workflowDeploymentPollerIdentity(currentBundleIdentity, "worker-1"),
    workflowDeploymentPollerIdentity(candidateBundleIdentity, "worker-1"),
  );
  assert.throws(
    () => workflowDeploymentPollerIdentity(candidateBundleIdentity, " worker-1"),
    /worker instance identity/,
  );
});

test("rejects a poller identity with a valid bundle prefix and surplus suffix", async () => {
  const events: string[] = [];
  await assert.rejects(
    admitWorkflowDeployment({
      ...plan(),
      candidate: {
        ...plan().candidate,
        workerIdentities: [
          `${candidateWorkerIdentity}:shadow` as WorkflowDeploymentPollerIdentity,
        ],
      },
    }, operations(events, [])),
    /candidate Worker identity must use the exact bundle-bound format/,
  );
  assert.deepEqual(events, []);
});

function plan(): WorkflowDeploymentPlan {
  return {
    taskQueue: "bpmn-production",
    current: {
      bundle: currentBundle,
      bundleIdentity: currentBundleIdentity,
      workerIdentities: [currentWorkerIdentity],
    },
    candidate: {
      bundle: candidateBundle,
      bundleIdentity: candidateBundleIdentity,
      workerIdentities: [candidateWorkerIdentity],
    },
  };
}

function operations(
  events: string[],
  inventory: ReadonlyArray<WorkflowDeploymentPoller>,
): WorkflowDeploymentAdmissionOperations {
  return {
    async fenceIngress() {
      events.push("fence");
    },
    async stopCurrentWorkers() {
      events.push("stop-current");
    },
    async readPollers() {
      events.push("inventory");
      return inventory;
    },
    async replayCandidate() {
      events.push("replay-candidate");
    },
    async startCandidateWorkers() {
      events.push("start-candidate");
      return { shutdown: async () => events.push("stop-candidate") };
    },
    async reopenIngress() {
      events.push("reopen");
    },
  };
}

function pollers(identity: string): ReadonlyArray<WorkflowDeploymentPoller> {
  return [
    { kind: WorkflowDeploymentPollerKind.Workflow, identity },
    { kind: WorkflowDeploymentPollerKind.Activity, identity },
  ];
}

function bundle(code: string): BpmnWorkflowBundle {
  return { code, sourceMap: "" };
}

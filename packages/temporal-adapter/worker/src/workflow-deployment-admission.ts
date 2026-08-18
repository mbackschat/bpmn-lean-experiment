/**
 * Owns stop-the-world admission for one exact BPMN Workflow bundle replacement.
 *
 * The caller owns the fleet and ingress implementations. This owner fixes their order and keeps
 * ingress fenced after every failure. It never restarts the old bundle or maps a deployment defect
 * to a BPMN result.
 */
import { createHash } from "node:crypto";

import type { BpmnWorkflowBundle } from "./workflow-bundle.js";

const bundleIdentityPrefix = "bpmn-lean.workflow-bundle-sha256:";
const pollerIdentityPrefix = "bpmn-lean.workflow-poller.v1:";
const sha256Pattern = /^[0-9a-f]{64}$/u;
const workerInstancePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const pollerIdentityPattern =
  /^bpmn-lean\.workflow-poller\.v1:([0-9a-f]{64}):([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/u;

export type WorkflowBundleIdentity =
  `bpmn-lean.workflow-bundle-sha256:${string}`;
export type WorkflowDeploymentPollerIdentity =
  `bpmn-lean.workflow-poller.v1:${string}:${string}`;

export enum WorkflowDeploymentPollerKind {
  Workflow = "workflow",
  Activity = "activity",
}

export type WorkflowDeploymentBundle = Readonly<{
  bundle: BpmnWorkflowBundle;
  bundleIdentity: WorkflowBundleIdentity;
  workerIdentities: ReadonlyArray<WorkflowDeploymentPollerIdentity>;
}>;

export type WorkflowDeploymentPlan = Readonly<{
  taskQueue: string;
  current: WorkflowDeploymentBundle;
  candidate: WorkflowDeploymentBundle;
}>;

export type WorkflowDeploymentPoller = Readonly<{
  kind: WorkflowDeploymentPollerKind;
  identity: string;
}>;

export type WorkflowDeploymentAdmissionReceipt = Readonly<{
  format: "bpmn-lean.workflow-deployment-admission.v1";
  taskQueue: string;
  currentBundleIdentity: WorkflowBundleIdentity;
  candidateBundleIdentity: WorkflowBundleIdentity;
  candidateWorkerIdentities: ReadonlyArray<WorkflowDeploymentPollerIdentity>;
}>;

export interface WorkflowDeploymentCandidateRuntime {
  shutdown(): Promise<void>;
}

export interface WorkflowDeploymentAdmissionOperations {
  /** Completes only after every Product 1 start and command entry point refuses new work. */
  fenceIngress(plan: WorkflowDeploymentPlan): Promise<void>;
  /** Gracefully stops every current-bundle Worker owned by the affected Task Queue. */
  stopCurrentWorkers(current: WorkflowDeploymentBundle): Promise<void>;
  /** Returns the authoritative, normalized set of currently live Workflow and Activity pollers. */
  readPollers(taskQueue: string): Promise<ReadonlyArray<WorkflowDeploymentPoller>>;
  /** Replays the complete retained compatibility-history set against these exact bundle bytes. */
  replayCandidate(candidate: WorkflowDeploymentBundle): Promise<void>;
  /** Starts only the candidate identities and returns their shared shutdown capability. */
  startCandidateWorkers(
    candidate: WorkflowDeploymentBundle,
  ): Promise<WorkflowDeploymentCandidateRuntime>;
  /** Reopens all fenced Product 1 ingress only after candidate-only inventory succeeds. */
  reopenIngress(receipt: WorkflowDeploymentAdmissionReceipt): Promise<void>;
}

/** Returns the exact identity of the executable bytes supplied to Temporal's Worker. */
export function workflowBundleIdentity(
  bundle: BpmnWorkflowBundle,
): WorkflowBundleIdentity {
  requireBundle(bundle);
  const digest = createHash("sha256").update(bundle.code, "utf8").digest("hex");
  return `${bundleIdentityPrefix}${digest}`;
}

/** Binds one fleet-visible Worker identity to the exact executable bundle it polls with. */
export function workflowDeploymentPollerIdentity(
  bundleIdentity: WorkflowBundleIdentity,
  workerInstanceIdentity: string,
): WorkflowDeploymentPollerIdentity {
  const digest = requireBundleIdentity(bundleIdentity, "bundle");
  if (!workerInstancePattern.test(workerInstanceIdentity)) {
    throw new TypeError(
      "Workflow deployment worker instance identity must match [A-Za-z0-9][A-Za-z0-9._-]{0,127}",
    );
  }
  return `${pollerIdentityPrefix}${digest}:${workerInstanceIdentity}`;
}

/**
 * Performs the only approved old-to-candidate transition.
 *
 * A failure after fencing intentionally has no automatic reopen or rollback path. If candidate
 * Workers were started, they are stopped before the original deployment error is rethrown.
 */
export async function admitWorkflowDeployment(
  plan: WorkflowDeploymentPlan,
  operations: WorkflowDeploymentAdmissionOperations,
): Promise<WorkflowDeploymentAdmissionReceipt> {
  validatePlan(plan);
  const receipt = deploymentReceipt(plan);
  await operations.fenceIngress(plan);
  await operations.stopCurrentWorkers(plan.current);
  requireNoPollers(await operations.readPollers(plan.taskQueue));
  await operations.replayCandidate(plan.candidate);

  let candidateRuntime: WorkflowDeploymentCandidateRuntime | undefined;
  try {
    candidateRuntime = await operations.startCandidateWorkers(plan.candidate);
    requireCandidatePollers(
      await operations.readPollers(plan.taskQueue),
      plan.candidate.workerIdentities,
    );
    await operations.reopenIngress(receipt);
    return receipt;
  } catch (error: unknown) {
    if (candidateRuntime === undefined) throw error;
    try {
      await candidateRuntime.shutdown();
    } catch (shutdownError: unknown) {
      throw new AggregateError(
        [error, shutdownError],
        "Workflow deployment failed and candidate Worker shutdown also failed",
      );
    }
    throw error;
  }
}

function validatePlan(plan: WorkflowDeploymentPlan): void {
  requireExactString(plan.taskQueue, "taskQueue");
  validateDeploymentBundle(plan.current, "current");
  validateDeploymentBundle(plan.candidate, "candidate");
  if (plan.current.bundleIdentity === plan.candidate.bundleIdentity) {
    throw new TypeError(
      "Workflow deployment current and candidate bundle identities must differ",
    );
  }
  const currentWorkers = new Set(plan.current.workerIdentities);
  if (plan.candidate.workerIdentities.some((identity) => currentWorkers.has(identity))) {
    throw new TypeError(
      "Workflow deployment current and candidate Worker identities must be disjoint",
    );
  }
}

function validateDeploymentBundle(
  value: WorkflowDeploymentBundle,
  label: "current" | "candidate",
): void {
  const observed = workflowBundleIdentity(value.bundle);
  if (observed !== value.bundleIdentity) {
    throw new TypeError(
      `Workflow deployment ${label} bundle identity does not match its exact code bytes`,
    );
  }
  if (!Array.isArray(value.workerIdentities) || value.workerIdentities.length === 0) {
    throw new TypeError(
      `Workflow deployment ${label} worker identities must be a nonempty array`,
    );
  }
  const digest = requireBundleIdentity(value.bundleIdentity, label);
  const seen = new Set<string>();
  for (const identity of value.workerIdentities) {
    const identityDigest = requirePollerIdentity(identity, label);
    if (identityDigest !== digest) {
      throw new TypeError(
        `Workflow deployment ${label} Worker identity is not bound to its bundle`,
      );
    }
    if (seen.has(identity)) {
      throw new TypeError(
        `Workflow deployment ${label} Worker identities must be unique`,
      );
    }
    seen.add(identity);
  }
}

function requirePollerIdentity(value: string, label: string): string {
  requireExactString(value, `${label} worker identity`);
  const match = pollerIdentityPattern.exec(value);
  if (match === null || match[1] === undefined) {
    throw new TypeError(
      `Workflow deployment ${label} Worker identity must use the exact bundle-bound format`,
    );
  }
  return match[1];
}

function requireBundle(bundle: BpmnWorkflowBundle): void {
  if (
    typeof bundle !== "object" || bundle === null ||
    typeof bundle.code !== "string" || bundle.code.length === 0 ||
    !bundle.code.isWellFormed()
  ) {
    throw new TypeError(
      "Workflow deployment bundle code must be a well-formed nonempty string",
    );
  }
}

function requireBundleIdentity(value: string, label: string): string {
  requireExactString(value, `${label} bundle identity`);
  if (!value.startsWith(bundleIdentityPrefix)) {
    throw new TypeError(
      `Workflow deployment ${label} bundle identity must use the SHA-256 format`,
    );
  }
  const digest = value.slice(bundleIdentityPrefix.length);
  if (!sha256Pattern.test(digest)) {
    throw new TypeError(
      `Workflow deployment ${label} bundle identity must use the SHA-256 format`,
    );
  }
  return digest;
}

function requireExactString(value: string, label: string): void {
  if (
    typeof value !== "string" || value.length === 0 ||
    value.trim() !== value || !value.isWellFormed()
  ) {
    throw new TypeError(
      `Workflow deployment ${label} must be an exact well-formed nonempty string`,
    );
  }
}

function requireNoPollers(
  pollers: ReadonlyArray<WorkflowDeploymentPoller>,
): void {
  const normalized = normalizePollers(pollers);
  if (normalized.length !== 0) {
    throw new Error(
      "Workflow deployment requires an empty poller inventory after stopping current Workers",
    );
  }
}

function requireCandidatePollers(
  pollers: ReadonlyArray<WorkflowDeploymentPoller>,
  workerIdentities: ReadonlyArray<WorkflowDeploymentPollerIdentity>,
): void {
  const observed = normalizePollers(pollers).map(pollerKey).sort();
  const expected = workerIdentities.flatMap((identity) => [
    pollerKey({ kind: WorkflowDeploymentPollerKind.Workflow, identity }),
    pollerKey({ kind: WorkflowDeploymentPollerKind.Activity, identity }),
  ]).sort();
  if (
    observed.length !== expected.length ||
    observed.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      "Workflow deployment requires the exact candidate-only poller inventory before reopening ingress",
    );
  }
}

function normalizePollers(
  pollers: ReadonlyArray<WorkflowDeploymentPoller>,
): ReadonlyArray<WorkflowDeploymentPoller> {
  if (!Array.isArray(pollers)) {
    throw new TypeError("Workflow deployment poller inventory must be an array");
  }
  const seen = new Set<string>();
  return pollers.map((poller) => {
    requireExactString(poller.identity, "poller identity");
    const key = pollerKey(poller);
    if (seen.has(key)) {
      throw new TypeError("Workflow deployment poller inventory must be unique");
    }
    seen.add(key);
    return poller;
  });
}

function pollerKey(poller: WorkflowDeploymentPoller): string {
  switch (poller.kind) {
    case WorkflowDeploymentPollerKind.Workflow:
    case WorkflowDeploymentPollerKind.Activity:
      return `${poller.kind}\u0000${poller.identity}`;
    default:
      throw new TypeError("Workflow deployment poller kind is unsupported");
  }
}

function deploymentReceipt(
  plan: WorkflowDeploymentPlan,
): WorkflowDeploymentAdmissionReceipt {
  return Object.freeze({
    format: "bpmn-lean.workflow-deployment-admission.v1",
    taskQueue: plan.taskQueue,
    currentBundleIdentity: plan.current.bundleIdentity,
    candidateBundleIdentity: plan.candidate.bundleIdentity,
    candidateWorkerIdentities: Object.freeze([
      ...plan.candidate.workerIdentities,
    ]),
  });
}

const controlOrigin = process.env.M4_SHOWCASE_CONTROL_ORIGIN ??
  "http://127.0.0.1:3205";

export type ShowcaseEvidence = Readonly<{
  retry: ProcessEvidence;
  cancellation: ProcessEvidence;
}>;

type ProcessEvidence = Readonly<{
  status: "completed" | "cancelled";
  activityCompletions: number;
  acceptedUpdates: number;
  completedUpdates: number;
  openIncidents: number;
  replayed: true;
}>;

export function restartPlatform(): Promise<unknown> {
  return control("/platform/restart");
}

export function stopWorker(): Promise<unknown> {
  return control("/worker/stop");
}

export function startWorker(): Promise<unknown> {
  return control("/worker/start");
}

export function verifyAndReplay(
  retryProcessInstanceId: string,
  cancelledProcessInstanceId: string,
): Promise<ShowcaseEvidence> {
  return control("/verify", {
    retryProcessInstanceId,
    cancelledProcessInstanceId,
  }) as Promise<ShowcaseEvidence>;
}

async function control(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(new URL(path, controlOrigin), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: body === undefined ? "{}" : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const value = await response.json() as unknown;
  if (!response.ok) {
    throw new Error(`M4 showcase control ${path} failed: ${JSON.stringify(value)}`);
  }
  return value;
}

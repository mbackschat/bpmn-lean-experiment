import { parentPort, workerData } from "node:worker_threads";

import {
  ProcessInstanceIdentityIntegrityError,
  SqliteProcessInstanceRepository,
} from "@bpmn-lean/platform-operate";
import type { PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";

type RaceWorkerData = Readonly<{
  databaseFile: string;
  gate: SharedArrayBuffer;
  instance: PublicProcessInstanceIdentity;
}>;

const data = workerData as RaceWorkerData;
const gate = new Int32Array(data.gate);
Atomics.add(gate, 1, 1);
Atomics.notify(gate, 1);
Atomics.wait(gate, 0, 0);

const repository = new SqliteProcessInstanceRepository(data.databaseFile);
try {
  const ordinal = await repository.recordConfirmed({
    instance: data.instance,
    locator: `bpmn-process-work-v1:${data.instance.processInstanceId}`,
  });
  parentPort?.postMessage({ outcome: "recorded", ordinal });
} catch (error: unknown) {
  if (error instanceof ProcessInstanceIdentityIntegrityError) {
    parentPort?.postMessage({ outcome: "integrity" });
  } else {
    throw error;
  }
} finally {
  repository.close();
}

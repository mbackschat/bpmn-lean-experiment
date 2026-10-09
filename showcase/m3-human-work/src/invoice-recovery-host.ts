import { createInvoiceRecoveryEffectActivities } from "@bpmn-lean/temporal-runner";

import { reportM3HostFailure } from "./host-log.ts";
import { runShowcaseHost } from "./host-runtime.ts";

await runShowcaseHost(createInvoiceRecoveryEffectActivities()).catch((error: unknown) => {
  reportM3HostFailure(error);
  process.exitCode = 1;
});

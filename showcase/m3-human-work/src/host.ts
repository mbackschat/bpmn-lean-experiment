import { createHostEffectActivities } from "@bpmn-lean/temporal-runner";

import { reportM3HostFailure } from "./host-log.ts";
import { runShowcaseHost } from "./host-runtime.ts";

await runShowcaseHost(createHostEffectActivities([])).catch((error: unknown) => {
  reportM3HostFailure(error);
  process.exitCode = 1;
});

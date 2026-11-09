import { noEffects } from "./host-worker.ts";
import { reportM3HostFailure } from "./host-log.ts";
import { runShowcaseHost } from "./host-runtime.ts";

await runShowcaseHost(noEffects).catch((error: unknown) => {
  reportM3HostFailure(error);
  process.exitCode = 1;
});

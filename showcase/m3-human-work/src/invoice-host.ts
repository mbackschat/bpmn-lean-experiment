import { reportM3HostFailure } from "./host-log.ts";
import { runShowcaseHost } from "./host-runtime.ts";
import { invoiceEffects } from "./invoice-effects.ts";

await runShowcaseHost(invoiceEffects).catch((error: unknown) => {
  reportM3HostFailure(error);
  process.exitCode = 1;
});

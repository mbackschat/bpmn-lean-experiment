import { createHash } from "node:crypto";

export const BPMN_AUTO_LAYOUT_EFFECTIVE_GENERATOR_SHA256 = createHash("sha256")
  .update(
    "bpmn-presentation-adapter-epoch@1\n" +
      "bpmn-auto-layout@1.3.0\n" +
      "bpmn-moddle@10.0.0\n" +
      "moddle@8.2.0\n" +
      "moddle-xml@12.1.0\n" +
      "min-dash@5.1.0\n" +
      "saxen@11.1.0\n",
  )
  .digest("hex");

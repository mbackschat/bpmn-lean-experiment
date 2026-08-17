export const screenshotTargetDirectory =
  "docs/assets/bpm-platform-browser-walkthrough" as const;

export type WalkthroughScreenshot = Readonly<{
  filename: string;
  alt: string;
}>;

function screenshot<const Entry extends WalkthroughScreenshot>(entry: Entry): Readonly<Entry> {
  return Object.freeze(entry);
}

/** Ordered documentation contract shared by capture automation and the maintained walkthrough. */
export const screenshotCatalog = Object.freeze([
  screenshot({
    filename: "01-about-capability-boundary.png",
    alt: "About workspace showing the versioned BPMN capability boundary and non-conformance notice",
  }),
  screenshot({
    filename: "02-expense-definition-diagram.png",
    alt: "Definitions workspace showing the deployed expense-exception Process and generated BPMN diagram",
  }),
  screenshot({
    filename: "03-expense-work-inbox.png",
    alt: "Work inbox showing the unclaimed Review exception task, candidate group, and priority",
  }),
  screenshot({
    filename: "04-expense-structured-form.png",
    alt: "Claimed Review exception task showing its completed structured approval form",
  }),
  screenshot({
    filename: "05-completed-process-history.png",
    alt: "Completed expense-exception Process showing its committed semantic History",
  }),
  screenshot({
    filename: "06-completed-process-diagram.png",
    alt: "Completed expense-exception Process showing its terminal committed Diagram",
  }),
  screenshot({
    filename: "07-definition-flow-node-metrics.png",
    alt: "Expense-exception definition showing exact-version flow-node frequency metrics",
  }),
  screenshot({
    filename: "08-current-incidents.png",
    alt: "Operations workspace showing Retry-only and cancellable current Service Task incidents",
  }),
  screenshot({
    filename: "09-cancel-process-confirmation.png",
    alt: "Incident detail showing the confirmation dialog for cancelling the incident-bearing root Process",
  }),
  screenshot({
    filename: "10-incident-action-audit.png",
    alt: "Incident action audit showing committed Retry and Cancel Process actions for demo-user",
  }),
] as const);

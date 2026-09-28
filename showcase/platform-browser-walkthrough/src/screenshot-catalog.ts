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
    filename: "02-about-capability-families.png",
    alt: "About workspace showing expandable BPMN families and a selected family with its supported variants",
  }),
  screenshot({
    filename: "03-process-showcases.png",
    alt: "Process showcase catalog offering interactive human-work examples and explicit Explore buttons",
  }),
  screenshot({
    filename: "04-showcase-description.png",
    alt: "Expense-exception showcase explaining its business purpose, BPMN identity and human-work journey",
  }),
  screenshot({
    filename: "05-deploy-definition-dialog.png",
    alt: "Add BPMN definition dialog showing the selected XML file, semantic profile and explicit dismissal",
  }),
  screenshot({
    filename: "06-definition-start-and-diagram.png",
    alt: "Definitions workspace showing the start action above the expense-exception BPMN diagram",
  }),
  screenshot({
    filename: "07-definition-triggers.png",
    alt: "Definitions workspace showing expanded message and schedule controls below the diagram",
  }),
  screenshot({
    filename: "08-expense-work-inbox.png",
    alt: "Work inbox showing the unclaimed Review exception task, candidate group, and priority",
  }),
  screenshot({
    filename: "09-expense-structured-form.png",
    alt: "Claimed Review exception task showing its completed structured approval form",
  }),
  screenshot({
    filename: "09b-expense-approval-action.png",
    alt: "Expense review form showing the selected risk flags, approval decision and explicit Approve action",
  }),
  screenshot({
    filename: "10-task-action-history.png",
    alt: "Operations Action history showing the current user’s task claim and completion with expanded labelled details",
  }),
  screenshot({
    filename: "11-process-instances.png",
    alt: "Operations process-instance list showing labelled definition and instance identities with explicit View details buttons",
  }),
  screenshot({
    filename: "12-completed-process-history.png",
    alt: "Completed expense-exception Process showing its committed semantic History",
  }),
  screenshot({
    filename: "13-completed-process-diagram.png",
    alt: "Completed expense-exception Process showing its terminal committed Diagram",
  }),
  screenshot({
    filename: "14-operations-process-metrics.png",
    alt: "Operations workspace showing exact-version flow-node frequency metrics for the expense-exception process",
  }),
  screenshot({
    filename: "15-current-incidents.png",
    alt: "Operations workspace showing Retry-only and cancellable current Service Task incidents",
  }),
  screenshot({
    filename: "16-cancel-process-confirmation.png",
    alt: "Incident detail showing the confirmation dialog for cancelling the incident-bearing root Process",
  }),
  screenshot({
    filename: "17-incident-action-history.png",
    alt: "Operations Action history showing committed Retry and Cancel process outcomes with full-width incident details",
  }),
] as const);

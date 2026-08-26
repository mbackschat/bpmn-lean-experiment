import { Button, ButtonVariant } from "@bpmn-lean/platform-ui-kit";

import styles from "./audience-demo-panel.module.css";

export const AudienceDemoStep = {
  Expense: "expense",
  Deadline: "deadline",
  Incidents: "incidents",
  Correctness: "correctness",
} as const;

export type AudienceDemoStep = typeof AudienceDemoStep[keyof typeof AudienceDemoStep];

const steps: ReadonlyArray<Readonly<{
  id: AudienceDemoStep;
  number: string;
  label: string;
  duration: string;
  summary: string;
}>> = [{
  id: AudienceDemoStep.Expense,
  number: "01",
  label: "Expense exception",
  duration: "2 min",
  summary: "Claim a realistic approval task, complete its typed form, and inspect the Process diagram.",
}, {
  id: AudienceDemoStep.Deadline,
  number: "02",
  label: "Deadline behavior",
  duration: "2 min",
  summary: "Compare exact sequential batch-review runs that complete naturally or take the lifetime deadline route.",
}, {
  id: AudienceDemoStep.Incidents,
  number: "03",
  label: "Incident recovery",
  duration: "2 min",
  summary: "Show retry-safe recovery after an uncertain response, then safely cancel a different root Process.",
}, {
  id: AudienceDemoStep.Correctness,
  number: "04",
  label: "Correctness stack",
  duration: "1 min",
  summary: "Explain what Lean proves, what differential evidence checks, and what Temporal and PostgreSQL preserve.",
}];

export type AudienceDemoPanelProps = Readonly<{
  activeStep: AudienceDemoStep;
  onExit: () => void;
  onSelectStep: (step: AudienceDemoStep) => void;
}>;

/** Optional presenter guidance over the existing Product 2 workspaces. */
export function AudienceDemoPanel({
  activeStep,
  onExit,
  onSelectStep,
}: AudienceDemoPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="audience-demo-title">
      <div className={styles.introduction}>
        <div>
          <p className={styles.eyebrow}>Audience mode</p>
          <h2 id="audience-demo-title">Seven-minute verified walkthrough</h2>
          <p>One real business story, prepared deterministically from reviewed engine capabilities.</p>
        </div>
        <Button variant={ButtonVariant.Plain} onPress={onExit}>Exit audience mode</Button>
      </div>
      <ol className={styles.steps} aria-label="Audience walkthrough">
        {steps.map((step) => (
          <li key={step.id}>
            <Button
              className={styles.step!}
              variant={ButtonVariant.Plain}
              data-audience-step={step.id}
              {...(activeStep === step.id ? { "aria-current": "step" } : {})}
              onPress={() => { onSelectStep(step.id); }}
            >
              <span className={styles.stepNumber}>{step.number}</span>
              <span className={styles.stepCopy}>
                <strong>{step.label}</strong>
                <span>{step.summary}</span>
              </span>
              <span className={styles.duration}>{step.duration}</span>
            </Button>
          </li>
        ))}
      </ol>
      {activeStep === AudienceDemoStep.Correctness ? <CorrectnessSummary /> : null}
    </section>
  );
}

function CorrectnessSummary() {
  return (
    <div className={styles.correctness} aria-label="Project correctness stack">
      <p><strong>Lean reference</strong><span>Executable meaning and reusable proofs for the bounded BPMN profile.</span></p>
      <p><strong>Independently written TypeScript core</strong><span>Production transitions compared against retained Lean results.</span></p>
      <p><strong>Temporal durability</strong><span>Replay-tested hosting for commands, waits, timers, effects, and recovery.</span></p>
      <p><strong>PostgreSQL projections</strong><span>Public Product 2 state built only from committed engine publications.</span></p>
      <small>This is bounded evidence, not a general BPMN conformance claim.</small>
    </div>
  );
}

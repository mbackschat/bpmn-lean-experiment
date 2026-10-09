import { test } from "@playwright/test";

import { completeInvoiceJourney } from "./business-invoice-journey.ts";

test("reviewed invoice is validated, classified and finalized through public Work", async ({ page }) => {
  await completeInvoiceJourney(page, {
    fixture: "serial-invoice",
    scenario: "serial-business-task-composition",
    profile: "cibseven-2.2.0-serial-business-tasks-draft",
    processId: "Process_InvoiceValidation",
    initialVariables: [["payload", "parent-payload"], ["request", "initial"], ["result", "parent-result"]],
    tasks: [
      { elementId: "Review", activation: 1, name: "Review invoice details", initial: "initial", submitted: "INV-42" },
      { elementId: "Finalize", activation: 1, name: "Record validation decision", initial: "INV-42", submitted: "INV-42" },
    ],
    effects: [["Validate", 1, "success"], ["Classify", 1, "success"]],
    finalVariables: [["classification", "standard"], ["decision", "valid"], ["payload", "parent-payload"], ["request", "INV-42"], ["result", "parent-result"]],
  });
});

test("invoice rework creates a fresh review occurrence before finalization", async ({ page }) => {
  await completeInvoiceJourney(page, {
    fixture: "invoice-rework",
    scenario: "mixed-task-control-flow",
    profile: "cibseven-2.2.0-mixed-task-control-flow-draft",
    processId: "Invoice",
    initialVariables: [["request", "initial"]],
    tasks: [
      { elementId: "Review", activation: 1, name: "Review", initial: "initial", submitted: "draft" },
      { elementId: "Review", activation: 2, name: "Review", initial: "draft", submitted: "INV-42" },
      { elementId: "Finalize", activation: 1, name: "Finalize", initial: "INV-42", submitted: "INV-42" },
    ],
    effects: [["Validate", 1, "success"], ["Validate", 2, "success"]],
    finalVariables: [["decision", "valid"], ["request", "INV-42"]],
  });
});

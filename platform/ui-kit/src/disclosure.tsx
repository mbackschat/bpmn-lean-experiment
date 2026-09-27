import { useState } from "react";
import type { ReactNode } from "react";
import { Disclosure, DisclosurePanel } from "react-aria-components/Disclosure";

import { Button, ButtonVariant } from "./button.js";
import styles from "./disclosure.module.css";

export type InlineDisclosureProps = Readonly<{
  title: string;
  children: ReactNode;
}>;

export function InlineDisclosure({ title, children }: InlineDisclosureProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Disclosure className={styles.disclosure!} data-ui="inline-disclosure" isExpanded={expanded} onExpandedChange={setExpanded}>
      <Button className={styles.trigger!} slot="trigger" variant={ButtonVariant.Secondary}>
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        {expanded ? "Hide" : "Show"} {title}
      </Button>
      <DisclosurePanel className={styles.panel!}><div className={styles.content}>{children}</div></DisclosurePanel>
    </Disclosure>
  );
}

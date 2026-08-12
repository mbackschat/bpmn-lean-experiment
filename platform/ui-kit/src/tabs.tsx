import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "react-aria-components/Tabs";
import type { ReactNode } from "react";

import styles from "./tabs.module.css";

export type WorkspaceTab = Readonly<{
  id: string;
  label: ReactNode;
  content: ReactNode;
}>;

export type WorkspaceTabsProps = Readonly<{
  "aria-label": string;
  tabs: readonly WorkspaceTab[];
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
}>;

/** Shared object-detail tabs with native arrow-key and focus behavior. */
export function WorkspaceTabs({
  "aria-label": ariaLabel,
  tabs,
  selectedKey,
  onSelectionChange,
}: WorkspaceTabsProps) {
  return (
    <Tabs
      className={styles.tabs!}
      {...(selectedKey === undefined ? {} : { selectedKey })}
      {...(onSelectionChange === undefined
        ? {}
        : { onSelectionChange: (key) => { onSelectionChange(String(key)); } })}
    >
      <TabList className={styles.list!} aria-label={ariaLabel} items={tabs}>
        {(tab) => <Tab className={styles.tab!} id={tab.id}>{tab.label}</Tab>}
      </TabList>
      <div className={styles.content}>
        {tabs.map((tab) => (
          <TabPanel className={styles.panel!} id={tab.id} key={tab.id}>
            {tab.content}
          </TabPanel>
        ))}
      </div>
    </Tabs>
  );
}

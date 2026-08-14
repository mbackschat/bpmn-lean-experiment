import { Dialog, Heading } from "react-aria-components/Dialog";
import { Modal, ModalOverlay } from "react-aria-components/Modal";
import type { ReactNode } from "react";

import { Button, ButtonVariant } from "./button.js";
import styles from "./dialog.module.css";

export type ConfirmationDialogProps = Readonly<{
  cancelLabel: string;
  children: ReactNode;
  confirmLabel: string;
  isOpen: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}>;

/** Destructive-action confirmation with containment, dismissal, and focus restoration. */
export function ConfirmationDialog({
  cancelLabel,
  children,
  confirmLabel,
  isOpen,
  title,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <ModalOverlay
      className={styles.overlay!}
      isDismissable
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onCancel(); }}
    >
      <Modal className={styles.modal!}>
        <Dialog className={styles.dialog!}>
          <Heading slot="title" className={styles.heading!}>{title}</Heading>
          <div className={styles.content}>{children}</div>
          <div className={styles.actions}>
            <Button autoFocus variant={ButtonVariant.Secondary} onPress={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant={ButtonVariant.Danger} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

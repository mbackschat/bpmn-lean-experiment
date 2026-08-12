import {
  FieldError,
  Input,
  Label,
  TextField as AriaTextField,
} from "react-aria-components/TextField";
import { Checkbox as AriaCheckbox } from "react-aria-components/Checkbox";
import type {
  TextFieldProps as AriaTextFieldProps,
} from "react-aria-components/TextField";
import type {
  CheckboxProps as AriaCheckboxProps,
} from "react-aria-components/Checkbox";
import type { ReactNode } from "react";

export type TextFieldProps = Omit<AriaTextFieldProps, "children"> & Readonly<{
  label: ReactNode;
  errorMessage?: ReactNode;
}>;

export function TextField({ label, errorMessage, ...props }: TextFieldProps) {
  return (
    <AriaTextField {...props} className="uiTextField">
      <Label>{label}</Label>
      <Input />
      {errorMessage === undefined ? null : <FieldError>{errorMessage}</FieldError>}
    </AriaTextField>
  );
}

export type CheckboxProps = AriaCheckboxProps;

export function Checkbox(props: CheckboxProps) {
  return <AriaCheckbox {...props} className="uiCheckbox" />;
}

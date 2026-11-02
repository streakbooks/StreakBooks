import { useState, type ReactNode } from "react";
import { LookupSelect } from "./LookupSelect";
import { declaredLookupOptions } from "@/lib/lookup/declarations";

export function RecordLookupSelect({
  children,
  value,
  defaultValue = "",
  onValueChange,
  disabled,
  required,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": invalid,
  placeholder,
}: {
  children: ReactNode;
  value?: string | undefined;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  id?: string | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | undefined;
  placeholder?: string | undefined;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const declared = declaredLookupOptions(children);
  return (
    <LookupSelect
      options={declared.options}
      value={value ?? internal}
      onChange={(next) => {
        setInternal(next);
        onValueChange?.(next);
      }}
      disabled={disabled}
      required={required}
      id={id ?? declared.id}
      ariaLabel={ariaLabel ?? declared.ariaLabel ?? declared.placeholder ?? "Choose record"}
      placeholder={placeholder ?? declared.placeholder ?? "Select record"}
      invalid={invalid === true || invalid === "true"}
      allowClear={!required && declared.placeholder !== undefined}
      className={className}
    />
  );
}

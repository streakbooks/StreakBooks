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
  "aria-describedby": describedBy,
  "aria-labelledby": labelledBy,
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
  "aria-describedby"?: string | undefined;
  "aria-labelledby"?: string | undefined;
  placeholder?: string | undefined;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const declared = declaredLookupOptions(children);
  const validation = invalid ?? declared.invalid;
  return (
    <LookupSelect
      options={declared.options}
      value={value ?? internal}
      onChange={(next) => {
        setInternal(next);
        onValueChange?.(next);
      }}
      disabled={disabled ?? declared.disabled}
      required={required}
      id={id ?? declared.id}
      ariaLabel={ariaLabel ?? declared.ariaLabel ?? declared.placeholder ?? "Choose record"}
      describedBy={describedBy ?? declared.describedBy}
      labelledBy={labelledBy ?? declared.labelledBy}
      placeholder={placeholder ?? declared.placeholder ?? "Select record"}
      invalid={validation !== undefined && validation !== false && validation !== "false"}
      allowClear={!required && declared.placeholder !== undefined}
      className={className}
    />
  );
}

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { tryParseMinor, type MoneyInputOptions } from "@/lib/banking/money-input";
import { cn } from "@/lib/utils";

/**
 * Text money input that accepts what people type ("12,500.00", "£1 250,5", "(40.00)").
 * It never throws: invalid text shows an inline hint and parses to `null`.
 */
export function MoneyField({
  value,
  onChange,
  currency,
  label,
  placeholder,
  className,
  options,
  disabled,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  currency: string;
  label?: string;
  placeholder?: string;
  className?: string;
  options?: MoneyInputOptions;
  disabled?: boolean;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const trimmed = value.trim();
  const invalid = trimmed !== "" && tryParseMinor(trimmed, currency, options) === null;
  return (
    <div className={cn("space-y-1", className)}>
      <Input
        id={inputId}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder ?? "0.00"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("numeric", invalid && "border-destructive")}
      />
      {invalid ? (
        <p id={errorId} role="alert" className="text-xs text-destructive-ink">
          Not a valid amount
        </p>
      ) : null}
    </div>
  );
}

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function OtpCodeInput({
  id,
  value,
  onChange,
  onComplete,
  disabled,
  length = 6,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  length?: number;
}) {
  return (
    <InputOTP
      {...(id ? { id } : {})}
      {...(onComplete ? { onComplete } : {})}
      maxLength={length}
      value={value}
      onChange={onChange}
      disabled={Boolean(disabled)}
      inputMode="numeric"
      pattern="^[0-9]+$"
      autoComplete="one-time-code"
    >
      <InputOTPGroup>
        {Array.from({ length }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="size-10 text-base" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

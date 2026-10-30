import { Check, Circle } from "lucide-react";
import { scorePassword } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

const BAR_COLOURS = ["bg-muted", "bg-destructive", "bg-amber-500", "bg-sky-500", "bg-emerald-500"];

export function PasswordStrengthMeter({
  password,
  context = [],
}: {
  password: string;
  context?: string[];
}) {
  const strength = scorePassword(password, context);
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="grid flex-1 grid-cols-4 gap-1">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1 rounded-full transition-colors",
                i <= strength.score ? BAR_COLOURS[strength.score] : "bg-muted",
              )}
            />
          ))}
        </div>
        <span className="w-12 text-right text-xs font-medium text-muted-foreground">
          {strength.label}
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {strength.rules.map((r) => (
          <li
            key={r.id}
            className={cn(
              "inline-flex items-center gap-1",
              r.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
            )}
          >
            {r.met ? (
              <Check className="size-3" aria-hidden />
            ) : (
              <Circle className="size-3" aria-hidden />
            )}
            {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

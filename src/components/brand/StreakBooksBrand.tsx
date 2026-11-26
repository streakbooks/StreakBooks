import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type StreakBooksBrandProps = {
  collapsed?: boolean;
  /** Marketing-style tagline (sign-in panel). */
  showTagline?: boolean;
  toHome?: boolean;
  className?: string;
};

/** Wordmark on a white plate so navy/green reads on dark sidebars and headers. */
export function StreakBooksBrand({
  collapsed = false,
  showTagline = false,
  toHome = false,
  className,
}: StreakBooksBrandProps) {
  const plate = (
    <span
      className={cn(
        "inline-flex flex-col items-stretch rounded-lg bg-white shadow-[0_1px_3px_rgba(15,23,42,0.12)] ring-1 ring-[#5cba8a]/55",
        collapsed ? "p-1.5" : "px-2.5 py-1.5",
        className,
      )}
    >
      <img
        src={collapsed ? "/brand/streakbooks-mark.png" : "/brand/streakbooks-logo.png"}
        alt="StreakBooks"
        width={collapsed ? 32 : 152}
        height={collapsed ? 32 : 30}
        className={cn(
          "shrink-0 object-contain object-left",
          collapsed ? "size-8" : "h-7 w-[9.25rem] max-w-full",
        )}
      />
      {showTagline && !collapsed ? (
        <span className="mt-1 text-center text-[0.5rem] font-semibold tracking-[0.2em] text-[#1a7a52]">
          CLOUD ACCOUNTING SOFTWARE
        </span>
      ) : null}
    </span>
  );

  if (toHome) {
    return (
      <Link to="/" aria-label="StreakBooks dashboard" className="inline-flex max-w-full">
        {plate}
      </Link>
    );
  }

  return plate;
}

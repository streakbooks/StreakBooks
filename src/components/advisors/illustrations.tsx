import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type Props = SVGProps<SVGSVGElement> & { title?: string };

export function WeDoYourBooksIllustration({ className, title, ...props }: Props) {
  const label = title ?? "StreakBooks Advisors — We do your books";
  return (
    <svg
      viewBox="0 0 640 420"
      role="img"
      aria-label={label}
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <title>{label}</title>
      <desc>
        Original illustration of organized ledgers on a calm desk with navy and teal accents.
      </desc>
      <defs>
        <linearGradient id="lb-books-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0B1F3A" />
          <stop offset="55%" stopColor="#123B63" />
          <stop offset="100%" stopColor="#1F7A8C" />
        </linearGradient>
        <linearGradient id="lb-books-surface" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4F8FB" />
          <stop offset="100%" stopColor="#D7E6F0" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="28" fill="url(#lb-books-sky)" />
      <circle cx="520" cy="78" r="46" fill="#2BB0C5" opacity="0.35" />
      <circle cx="88" cy="330" r="70" fill="#2BB0C5" opacity="0.12" />
      <path
        d="M54 318h532c8 0 14 6 14 14v34c0 8-6 14-14 14H54c-8 0-14-6-14-14v-34c0-8 6-14 14-14z"
        fill="url(#lb-books-surface)"
      />
      <rect x="86" y="168" width="78" height="150" rx="8" fill="#0E2A4A" />
      <rect x="98" y="180" width="54" height="10" rx="3" fill="#7ED6E3" />
      <rect x="98" y="202" width="54" height="6" rx="2" fill="#C7D9E8" opacity="0.7" />
      <rect x="98" y="218" width="40" height="6" rx="2" fill="#C7D9E8" opacity="0.55" />
      <rect x="176" y="148" width="86" height="170" rx="8" fill="#15456F" />
      <rect x="190" y="162" width="58" height="10" rx="3" fill="#8BE0EA" />
      <rect x="190" y="186" width="58" height="6" rx="2" fill="#D5E7F3" opacity="0.7" />
      <rect x="190" y="202" width="46" height="6" rx="2" fill="#D5E7F3" opacity="0.55" />
      <rect x="274" y="128" width="96" height="190" rx="8" fill="#1B5F86" />
      <rect x="290" y="144" width="64" height="10" rx="3" fill="#A8ECF2" />
      <rect x="290" y="170" width="64" height="6" rx="2" fill="#E4F1F8" opacity="0.75" />
      <rect x="290" y="188" width="50" height="6" rx="2" fill="#E4F1F8" opacity="0.55" />
      <rect x="290" y="206" width="58" height="6" rx="2" fill="#E4F1F8" opacity="0.45" />
      <path
        d="M402 214c28-46 74-70 118-62 18 3 34 12 46 26"
        fill="none"
        stroke="#7ED6E3"
        strokeWidth="10"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M430 250h150"
        stroke="#F4F8FB"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M430 274h118"
        stroke="#F4F8FB"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.35"
      />
      <circle cx="500" cy="186" r="18" fill="#F4F8FB" />
      <path d="M492 186h16M500 178v16" stroke="#1F7A8C" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function WeCoachYouIllustration({ className, title, ...props }: Props) {
  const label = title ?? "StreakBooks Advisors — We coach you";
  return (
    <svg
      viewBox="0 0 640 420"
      role="img"
      aria-label={label}
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <title>{label}</title>
      <desc>
        Original illustration of two people reviewing a shared financial chart during coaching.
      </desc>
      <defs>
        <linearGradient id="lb-coach-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#08263B" />
          <stop offset="50%" stopColor="#0F4C6E" />
          <stop offset="100%" stopColor="#1C8A8C" />
        </linearGradient>
        <linearGradient id="lb-coach-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F7FBFD" />
          <stop offset="100%" stopColor="#CFE4EF" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="28" fill="url(#lb-coach-sky)" />
      <circle cx="96" cy="84" r="40" fill="#35C4C7" opacity="0.28" />
      <rect x="118" y="110" width="404" height="230" rx="22" fill="url(#lb-coach-panel)" />
      <path
        d="M168 278c34-58 70-88 108-88s78 36 118 88"
        fill="none"
        stroke="#1F7A8C"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle cx="168" cy="278" r="8" fill="#0B1F3A" />
      <circle cx="276" cy="190" r="8" fill="#0B1F3A" />
      <circle cx="394" cy="278" r="8" fill="#0B1F3A" />
      <rect x="430" y="148" width="54" height="8" rx="3" fill="#0F4C6E" opacity="0.55" />
      <rect x="430" y="168" width="40" height="8" rx="3" fill="#0F4C6E" opacity="0.35" />
      <circle cx="188" cy="328" r="28" fill="#123B63" />
      <rect x="164" y="356" width="48" height="36" rx="14" fill="#1B5F86" />
      <circle cx="292" cy="320" r="28" fill="#0E3A57" />
      <rect x="268" y="348" width="48" height="40" rx="14" fill="#17607F" />
      <path d="M220 334h44" stroke="#7ED6E3" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M470 318c22-18 48-18 70 0"
        fill="none"
        stroke="#A8ECF2"
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  );
}

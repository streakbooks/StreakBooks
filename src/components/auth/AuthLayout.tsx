import type { ReactNode } from "react";
import { CheckCircle2, Landmark, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import { StreakBooksBrand } from "@/components/brand/StreakBooksBrand";

/**
 * Brand panel copy must stay verifiable in the product: no customer counts,
 * testimonials, certifications or uptime claims.
 */
const POINTS = [
  {
    icon: Scale,
    title: "Double-entry, always balanced",
    body: "Every invoice, bill and payment posts to a ledger that must balance before it saves.",
  },
  {
    icon: Landmark,
    title: "Bank reconciliation with an audit trail",
    body: "Import statements, match them to your books and keep a record of each session.",
  },
  {
    icon: LockKeyhole,
    title: "Your organisation's data stays yours",
    body: "Access is enforced per organisation in the database, not just in the screen you see.",
  },
];

const TRUST = ["Encrypted in transit", "Row-level data isolation", "Two-step verification"];

/** Illustrative only: shows the product's balancing rule, not customer data. */
function LedgerPreview() {
  const rows = [
    { account: "1200 Accounts receivable", dr: "1,200.00", cr: "" },
    { account: "4000 Sales", dr: "", cr: "1,000.00" },
    { account: "2200 VAT payable", dr: "", cr: "200.00" },
  ];
  return (
    <div
      aria-hidden
      className="rounded-xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/30 backdrop-blur-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-white/80">Journal · INV-0042</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
          <CheckCircle2 className="size-3" />
          Balanced
        </span>
      </div>
      <table className="w-full font-mono text-[11px] text-white/70">
        <thead>
          <tr className="text-white/40">
            <th className="pb-1.5 text-left font-normal">Account</th>
            <th className="pb-1.5 text-right font-normal">Debit</th>
            <th className="pb-1.5 text-right font-normal">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.account} className="border-t border-white/5">
              <td className="py-1.5 pr-2 font-sans">{r.account}</td>
              <td className="py-1.5 text-right">{r.dr}</td>
              <td className="py-1.5 text-right">{r.cr}</td>
            </tr>
          ))}
          <tr className="border-t border-white/15 text-white">
            <td className="pt-2 font-sans font-medium">Total</td>
            <td className="pt-2 text-right">1,200.00</td>
            <td className="pt-2 text-right">1,200.00</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  headerAction,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Top-right switch, e.g. "New to StreakBooks? Create an account". */
  headerAction?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* overflow-clip (not hidden) keeps the panel at least as tall as its content. */}
      <aside className="relative hidden gap-10 overflow-clip bg-[oklch(0.2_0.05_262)] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,oklch(0.55_0.17_258/0.45),transparent_55%),radial-gradient(ellipse_at_bottom_right,oklch(0.6_0.14_200/0.3),transparent_50%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />

        <div className="relative">
          <StreakBooksBrand showTagline />
        </div>

        <div className="relative mx-auto w-full max-w-md space-y-10">
          <div className="space-y-4">
            <h2 className="text-balance text-[2rem] font-semibold leading-[1.15] tracking-tight">
              Accounting records you can trust.
            </h2>
            <p className="text-pretty text-sm leading-relaxed text-white/70">
              Bookkeeping, bank reconciliation and financial reporting for small businesses and the
              accountants who look after them.
            </p>
          </div>

          <div className="[@media(max-height:820px)]:hidden">
            <LedgerPreview />
          </div>

          <ul className="space-y-4">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <p.icon className="size-4 text-white/90" aria-hidden />
                </span>
                <div>
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-sm leading-relaxed text-white/60">{p.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/55">
          {TRUST.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" aria-hidden />
              {t}
            </span>
          ))}
        </div>
      </aside>

      <main className="flex min-h-screen flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <div className="lg:invisible">
            <StreakBooksBrand showTagline />
          </div>
          {headerAction ? (
            <div className="text-sm text-muted-foreground">{headerAction}</div>
          ) : null}
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">
            <h1 className="text-[1.75rem] font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-8 text-sm text-muted-foreground">{footer}</div> : null}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} StreakBooks
        </p>
      </main>
    </div>
  );
}

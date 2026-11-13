import { useRef, useState } from "react";
import { Calculator, Check, Copy, Delete, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculate } from "@/lib/calculator";
import { cn } from "@/lib/utils";

type Calculation = { expression: string; result: string };
const keys = [
  "AC",
  "(",
  ")",
  "÷",
  "7",
  "8",
  "9",
  "×",
  "4",
  "5",
  "6",
  "−",
  "1",
  "2",
  "3",
  "+",
  "±",
  "0",
  ".",
  "=",
];

export function CalculatorPopover() {
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Calculation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  let preview = "0";
  try {
    preview = String(calculate(expression));
  } catch {
    /* Incomplete input remains editable. */
  }
  const result = answer ?? preview;

  function evaluate() {
    try {
      const value = String(calculate(expression));
      setAnswer(value);
      setError("");
      setCopied(false);
      setHistory((previous) => [{ expression, result: value }, ...previous].slice(0, 30));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function press(key: string) {
    setError("");
    setCopied(false);
    if (key === "=") {
      evaluate();
      return;
    }
    if (key === "AC") {
      setExpression("");
      setAnswer(null);
    } else if (key === "±") {
      setExpression((current) => (current ? `-(${answer ?? current})` : "-"));
      setAnswer(null);
    } else {
      setExpression(
        (current) => (answer !== null ? (/^[+−×÷%]$/.test(key) ? answer : "") : current) + key,
      );
      setAnswer(null);
    }
    input.current?.focus();
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
    } catch {
      setError("Copy unavailable. Select the result to copy it.");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Open calculator"
          title="Calculator"
        >
          <Calculator className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        aria-label="Calculator"
        className="w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl p-0 shadow-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <Calculator className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Calculator</h2>
              <p className="text-xs text-muted-foreground">A little space to work it out</p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Calculation history"
              aria-pressed={showHistory}
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close calculator"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="bg-muted/40 px-4 py-4">
          <label htmlFor="calculator-expression" className="sr-only">
            Calculation
          </label>
          <input
            ref={input}
            id="calculator-expression"
            value={expression}
            placeholder="e.g. 1,250 × 1.2"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-right text-sm text-muted-foreground outline-none focus:border-primary/40"
            onChange={(event) => {
              setExpression(event.target.value.replace(/,/g, "").slice(0, 300));
              setAnswer(null);
              setError("");
              setCopied(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "=") {
                event.preventDefault();
                evaluate();
              }
            }}
          />
          <div className="mt-2 flex items-center gap-2">
            <output
              aria-live="polite"
              className="min-w-0 flex-1 overflow-x-auto text-right font-mono text-3xl font-semibold tracking-tight"
            >
              {result}
            </output>
            <Button
              variant="ghost"
              size="icon"
              aria-label={copied ? "Result copied" : "Copy result"}
              onClick={copy}
            >
              {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        {showHistory ? (
          <div className="max-h-72 overflow-y-auto p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground">RECENT CALCULATIONS</h3>
              <Button
                variant="ghost"
                size="sm"
                disabled={!history.length}
                onClick={() => setHistory([])}
              >
                Clear
              </Button>
            </div>
            {history.length ? (
              history.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  className="mb-1 w-full rounded-lg p-3 text-right hover:bg-muted focus-visible:outline-primary"
                  onClick={() => {
                    setExpression(item.expression);
                    setAnswer(item.result);
                    setError("");
                    setCopied(false);
                    setShowHistory(false);
                  }}
                >
                  <div className="truncate text-xs text-muted-foreground">{item.expression}</div>
                  <div className="mt-1 font-mono font-semibold">= {item.result}</div>
                </button>
              ))
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Your calculations will appear here.
              </p>
            )}
          </div>
        ) : (
          <div className="p-3">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-8 text-xs" onClick={() => press("%")}>
                % Percentage
              </Button>
              <Button
                variant="outline"
                className="h-8 text-xs"
                aria-label="Backspace"
                onClick={() => {
                  setExpression((value) => value.slice(0, -1));
                  setAnswer(null);
                  setError("");
                  input.current?.focus();
                }}
              >
                <Delete className="mr-2 size-3.5" />
                Delete
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {keys.map((key) => (
                <Button
                  key={key}
                  variant={key === "=" ? "default" : "ghost"}
                  className={cn(
                    "h-11 rounded-xl text-base font-medium",
                    key === "="
                      ? "shadow-sm"
                      : /^[÷×−+]$/.test(key)
                        ? "bg-primary/10 text-primary hover:bg-primary/20"
                        : key === "AC"
                          ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                          : "bg-muted/60 hover:bg-muted",
                  )}
                  onClick={() => press(key)}
                  aria-label={
                    key === "="
                      ? "Equals"
                      : key === "AC"
                        ? "Clear calculation"
                        : key === "±"
                          ? "Toggle sign"
                          : key
                  }
                >
                  {key}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="border-t px-4 py-2.5 text-center text-[11px] text-muted-foreground">
          Type a calculation · Enter to solve · Esc to close
        </div>
      </PopoverContent>
    </Popover>
  );
}

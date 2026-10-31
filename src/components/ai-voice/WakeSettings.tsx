import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { browserRecognition } from "@/lib/ai-voice/browser-recognition";
import { wakeCaptureSupported } from "@/lib/ai-voice/wake-capture";
import { useWakeController, useWakeSnapshot } from "./wake-context";
import type { WakeController } from "@/lib/ai-voice/wake-controller";
export function WakeSettings() {
  const wake = useWakeController();
  return wake ? <PersonalWakeSettings wake={wake} /> : null;
}
function PersonalWakeSettings({ wake }: { wake: WakeController }) {
  const state = useWakeSnapshot(wake),
    id = useId();
  const [phrase, setPhrase] = useState(state.phrase);
  useEffect(() => setPhrase(state.phrase), [state.phrase]);
  const commandsSupported = Boolean(browserRecognition());
  const supported = wakeCaptureSupported() && commandsSupported;
  return (
    <section
      aria-label="Personal wake phrase settings"
      className="space-y-3 rounded-lg border bg-background p-4 text-sm"
    >
      <h3 className="font-semibold">Personal wake phrase</h3>
      <p className="text-xs text-muted-foreground">
        Settings apply to your account and organisation on this browser. Manual activation is always
        available. Changing the phrase requires new voice enrollment.
      </p>
      {!state.available ? (
        <p>
          Enable Voice commands in Settings → Features and use an authorised company account to
          configure wake detection.
        </p>
      ) : null}
      <label htmlFor={id}>Activation phrase</label>
      <Input
        id={id}
        disabled={!state.available}
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        maxLength={60}
        placeholder="Hey LinkBooks"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!state.available}
          onClick={() => wake.configure(phrase, state.enabled)}
        >
          Save phrase
        </Button>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            disabled={!state.available}
            checked={state.enabled}
            onChange={(e) => wake.configure(state.phrase, e.target.checked)}
          />{" "}
          Enable wake detection
        </label>
      </div>
      {!commandsSupported ? (
        <p role="alert">
          Browser command speech recognition is unavailable. Use text commands or normal controls.
        </p>
      ) : null}
      {!supported ? (
        <p role="alert">
          Local wake detection is unsupported here. Use manual activation. HTTPS, microphone access,
          AudioWorklet and Web Workers are required.
        </p>
      ) : null}
      <p>
        Enroll the phrase in your own voice in a quiet room. Say it on its own, with a pause
        afterwards. This personal acoustic matcher can miss phrases or confuse similar sounds; it is
        not an authentication control.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!state.available || !supported || state.status === "enrolling"}
          onClick={() => void wake.enroll()}
        >
          {state.enrolled ? "Re-enroll phrase" : "Enroll phrase"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={
            !state.available ||
            !supported ||
            !state.enabled ||
            !state.enrolled ||
            state.armed ||
            state.status === "enrolling"
          }
          onClick={() => void wake.arm()}
        >
          Arm wake detection
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => wake.stopAll()}>
          Stop all microphones
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => wake.forget()}>
          Delete wake profile
        </Button>
      </div>
      <p role="status" data-testid="wake-message">
        {state.message}
        {state.status === "enrolling" ? ` ${state.recordings}/3 recorded.` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        Wake audio is processed locally and discarded. Only derived acoustic templates are retained
        in this browser until deleted; they are personal voice data. Templates are not synced or
        uploaded. Enabling the setting does not turn on the microphone: click Arm each time you open
        or reload LinkBooks. Hidden tabs pause detection. Command recognition starts only after
        activation and may send audio to your browser’s provider and require internet access.
      </p>
    </section>
  );
}

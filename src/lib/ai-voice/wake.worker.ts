import { acousticTemplate, detectsWake, PhraseSegmenter, type WakeProfile } from "./wake-acoustics";
let segmenter: PhraseSegmenter | undefined;
let profile: WakeProfile | null = null;
self.onmessage = (
  event: MessageEvent<{
    type: string;
    rate: number;
    profile: WakeProfile | null;
    pcm: Float32Array;
  }>,
) => {
  const data = event.data;
  if (data.type === "init") {
    profile = data.profile;
    segmenter = new PhraseSegmenter(data.rate, (pcm) => {
      const template = acousticTemplate(pcm, data.rate);
      if (!profile) self.postMessage({ type: "template", template });
      else if (detectsWake(template, profile)) self.postMessage({ type: "wake" });
    });
  } else if (data.type === "pcm") segmenter?.push(data.pcm);
};

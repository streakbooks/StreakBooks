export function voiceDestination(text: string): string | null {
  const phrase = text.toLowerCase().trim();
  if (!/^(open|show|go to|navigate to|take me to|view)\s/.test(phrase)) return null;
  if (phrase.includes("fixed asset") || phrase.includes("depreciation")) return "/fixed-assets";
  if (phrase.includes("dashboard") || phrase.includes("home")) return "/";
  if (phrase.includes("report")) return "/reports";
  return null;
}

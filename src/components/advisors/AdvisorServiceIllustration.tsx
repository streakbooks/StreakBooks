import { useState } from "react";
import {
  WeCoachYouIllustration,
  WeDoYourBooksIllustration,
} from "@/components/advisors/illustrations";
import { cn } from "@/lib/utils";

type IllustrationKey = "we-do-your-books" | "we-coach-you";

const RASTER: Record<IllustrationKey, { src: string; alt: string }> = {
  "we-do-your-books": {
    src: "/advisors/we-do-your-books.jpg",
    alt: "Original StreakBooks illustration of organized ledgers representing managed bookkeeping",
  },
  "we-coach-you": {
    src: "/advisors/we-coach-you.jpg",
    alt: "Original StreakBooks illustration of two people reviewing a financial chart during coaching",
  },
};

export function AdvisorServiceIllustration({
  illustrationKey,
  title,
  className,
}: {
  illustrationKey: IllustrationKey;
  title: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const raster = RASTER[illustrationKey];

  if (failed) {
    const Fallback =
      illustrationKey === "we-do-your-books" ? WeDoYourBooksIllustration : WeCoachYouIllustration;
    return <Fallback className={cn("rounded-2xl shadow-raised", className)} title={title} />;
  }

  return (
    <img
      src={raster.src}
      alt={raster.alt}
      title={title}
      loading="eager"
      decoding="async"
      fetchPriority="high"
      width={1280}
      height={720}
      onError={() => setFailed(true)}
      className={cn(
        "aspect-video h-auto w-full rounded-2xl bg-muted/40 object-cover shadow-raised",
        className,
      )}
    />
  );
}

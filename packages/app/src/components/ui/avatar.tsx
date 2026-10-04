import { UserRound } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils.ts";

export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  if (src && src !== brokenSrc) {
    return (
      <img
        src={src}
        alt={name}
        className={cn("size-8 shrink-0 rounded-full object-cover", className)}
        onError={() => setBrokenSrc(src)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
        className,
      )}
      role="img"
      aria-label={name}
    >
      <UserRound className="size-1/2" aria-hidden />
    </span>
  );
}

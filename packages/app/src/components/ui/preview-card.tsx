import { PreviewCard as P } from "@base-ui-components/react/preview-card";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

/**
 * Hover-card primitive (Base UI Preview Card): hovering the trigger opens a
 * rich preview after a short delay. The trigger stays a normal link — clicks
 * navigate as usual.
 */
export const PreviewCard = P.Root;
export const PreviewCardTrigger = P.Trigger;

export function PreviewCardContent({
  children,
  className,
  align = "start",
  side = "bottom",
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <P.Portal>
      <P.Positioner side={side} align={align} sideOffset={6} className="z-50">
        <P.Popup
          className={cn(
            "glass-strong max-w-sm rounded-2xl p-3 text-sm text-popover-foreground outline-none transition-all duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
        >
          {children}
        </P.Popup>
      </P.Positioner>
    </P.Portal>
  );
}

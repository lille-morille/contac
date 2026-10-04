import { Tooltip as T } from "@base-ui-components/react/tooltip";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

export const TooltipProvider = T.Provider;
export const Tooltip = T.Root;
export const TooltipTrigger = T.Trigger;

export function TooltipContent({
  children,
  className,
  side = "right",
  align = "center",
}: {
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  return (
    <T.Portal>
      <T.Positioner side={side} align={align} sideOffset={8} className="z-50">
        <T.Popup
          className={cn(
            "glass-strong rounded-xl px-2.5 py-1.5 text-xs font-medium text-foreground outline-none transition-all duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
        >
          {children}
        </T.Popup>
      </T.Positioner>
    </T.Portal>
  );
}

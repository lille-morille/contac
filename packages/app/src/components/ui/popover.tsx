import { Popover as P } from "@base-ui-components/react/popover";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({
  children,
  className,
  align = "start",
  side = "bottom",
  anchor,
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  anchor?: Element | null;
}) {
  return (
    <P.Portal>
      <P.Positioner
        side={side}
        align={align}
        anchor={anchor}
        sideOffset={8}
        collisionPadding={12}
        collisionAvoidance={{ side: "flip", align: "shift" }}
        className="z-50"
      >
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

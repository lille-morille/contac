import { Menu as M } from "@base-ui-components/react/menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({
  children,
  className,
  align = "end",
  side = "bottom",
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <M.Portal>
      <M.Positioner side={side} align={align} sideOffset={6} className="z-50">
        <M.Popup
          className={cn(
            "glass-strong min-w-52 rounded-2xl p-1.5 text-popover-foreground outline-none transition-all duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
        >
          {children}
        </M.Popup>
      </M.Positioner>
    </M.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none transition-colors data-[highlighted]:bg-primary-soft",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function MenuLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("px-2.5 py-1.5 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

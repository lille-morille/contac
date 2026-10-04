import { Dialog as D } from "@base-ui-components/react/dialog";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

export const Sheet = D.Root;
export const SheetClose = D.Close;
export const SheetTitle = D.Title;

/** Right-docked floating glass panel (Arc-style), slides in over the canvas. */
export function SheetContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <D.Portal>
      <D.Backdrop className="fixed inset-0 z-50 bg-foreground/35 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <D.Popup
        className={cn(
          "glass fixed inset-y-3 right-3 z-50 flex w-[min(44rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl outline-none transition-all duration-300 ease-out data-[ending-style]:translate-x-[calc(100%+0.75rem)] data-[starting-style]:translate-x-[calc(100%+0.75rem)]",
          className,
        )}
      >
        {children}
      </D.Popup>
    </D.Portal>
  );
}

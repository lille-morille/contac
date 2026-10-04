import { Dialog as D } from "@base-ui-components/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Backdrop className="fixed inset-0 z-50 bg-foreground/35 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <D.Popup
        className={cn(
          "glass fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 outline-none transition-all duration-200 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          className,
        )}
      >
        <D.Close className="absolute right-4 top-4 flex size-7 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
          <X className="size-4" />
        </D.Close>
        {children}
      </D.Popup>
    </D.Portal>
  );
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <D.Title className="text-base font-semibold">{children}</D.Title>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <D.Description className="mt-1 text-sm text-muted-foreground">{children}</D.Description>;
}

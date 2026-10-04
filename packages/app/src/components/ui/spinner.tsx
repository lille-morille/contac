import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils.ts";

/** Inherits the surrounding text color — stays visible on solid buttons. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} />;
}

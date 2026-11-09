import { Button } from "./ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog.tsx";

export function DiscardDraftDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Forkaste utkastet?</DialogTitle>
        <DialogDescription>
          Det du har skrevet er ikke lagt til i kontaktloggen, og blir slettet.
        </DialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" autoFocus onClick={() => onOpenChange(false)}>
            Fortsett å skrive
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onDiscard();
            }}
          >
            Forkast
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

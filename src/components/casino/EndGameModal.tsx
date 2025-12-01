import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

interface EndGameModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function EndGameModal({
  open,
  onClose,
  onConfirm,
  loading,
}: EndGameModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            End Game?
          </DialogTitle>
          <DialogDescription className="text-left">
            Are you sure you want to end the game and show final results?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
          <ul className="list-disc list-inside space-y-1">
            <li>Current hand will be terminated</li>
            <li>All pots will be finalized</li>
            <li>Final profit/loss will be calculated</li>
            <li>Game will be locked</li>
          </ul>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Ending...' : 'Yes, End Game'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Chip } from "./Chip";
import { Plus, Minus, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BuyingOption } from "@/types/casino";

interface BuyingModalProps {
  open: boolean;
  onClose: () => void;
  buyingOptions: BuyingOption[];
  chipUnitValue: number;
  currencyCode: string;
  currentBuyings: number;
  maxBuyings: number;
  onBuy: (optionId: string, quantity: number) => void;
}

export function BuyingModal({
  open,
  onClose,
  buyingOptions,
  chipUnitValue,
  currencyCode,
  currentBuyings,
  maxBuyings,
  onBuy,
}: BuyingModalProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(
    buyingOptions[0]?.id || null
  );
  const [quantity, setQuantity] = useState(1);

  const remainingBuyings = maxBuyings - currentBuyings;
  const maxQuantity = Math.min(remainingBuyings, 10);

  const selectedBuyingOption = buyingOptions.find(o => o.id === selectedOption);
  const totalChips = selectedBuyingOption 
    ? selectedBuyingOption.chipsPerBuying * quantity 
    : 0;
  const totalPrice = selectedBuyingOption 
    ? selectedBuyingOption.pricePerBuying * quantity 
    : 0;

  const handleBuy = () => {
    if (selectedOption && quantity > 0) {
      onBuy(selectedOption, quantity);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gradient-gold">
            Buy Chips
          </DialogTitle>
          <DialogDescription>
            Select a chip bundle and quantity. You have {remainingBuyings} buyings remaining.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Buying Options */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Select Bundle
            </label>
            <div className="grid gap-2">
              {buyingOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelectedOption(option.id)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border transition-all",
                    selectedOption === option.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Chip color="gold" size="sm" />
                    <div className="text-left">
                      <div className="font-semibold">
                        {option.chipsPerBuying.toLocaleString()} chips
                      </div>
                      <div className="text-xs text-muted-foreground">
                        1 chip = ₹{chipUnitValue.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gold">
                      ₹{option.pricePerBuying.toFixed(2)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Quantity (max {maxQuantity})
            </label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <span className="text-2xl font-bold w-12 text-center">
                {quantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))}
                disabled={quantity >= maxQuantity}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Chips you'll receive</span>
              <span className="font-semibold">{totalChips.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Value in {currencyCode}</span>
              <span className="font-semibold">
                ₹{(totalChips * chipUnitValue).toFixed(2)}
              </span>
            </div>
            <div className="border-t border-border pt-2 mt-2">
              <div className="flex justify-between">
                <span className="font-medium">Total to Pay</span>
                <span className="text-xl font-bold text-gold">
                  ₹{totalPrice.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="gold"
              className="flex-1"
              onClick={handleBuy}
              disabled={!selectedOption || quantity < 1 || quantity > maxQuantity}
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Pay ₹{totalPrice.toFixed(2)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

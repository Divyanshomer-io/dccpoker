import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Users, Coins, ArrowLeft } from "lucide-react";
import { useGameStore } from "@/store/gameStore";
import { useLobby } from "@/hooks/useLobby";
import { toast } from "@/hooks/use-toast";

export function CreateLobbyForm() {
  const navigate = useNavigate();
  const { currentUser } = useGameStore();
  const { createLobby, loading } = useLobby();
  
  const [lobbyName, setLobbyName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("6");
  const [minBlind, setMinBlind] = useState("2");
  const [buyingOptions, setBuyingOptions] = useState([
    { chipsPerBuying: 400, pricePerBuying: 100 }
  ]);

  // Auto-calculate chip unit value from first buying option
  const chipUnitValue = buyingOptions[0].chipsPerBuying > 0 
    ? buyingOptions[0].pricePerBuying / buyingOptions[0].chipsPerBuying 
    : 0.25;

  const addBuyingOption = () => {
    if (buyingOptions.length < 3) {
      setBuyingOptions([...buyingOptions, { chipsPerBuying: 200, pricePerBuying: 50 }]);
    }
  };

  const removeBuyingOption = (index: number) => {
    if (buyingOptions.length > 1) {
      setBuyingOptions(buyingOptions.filter((_, i) => i !== index));
    }
  };

  const updateBuyingOption = (index: number, field: 'chipsPerBuying' | 'pricePerBuying', value: number) => {
    const updated = [...buyingOptions];
    updated[index][field] = value;
    setBuyingOptions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      toast({ title: "Error", description: "Please set up your profile first", variant: "destructive" });
      return;
    }

    if (!lobbyName.trim()) {
      toast({ title: "Error", description: "Please enter a lobby name", variant: "destructive" });
      return;
    }

    const lobbyId = await createLobby({
      name: lobbyName.trim(),
      maxPlayers: parseInt(maxPlayers),
      chipUnitValue: chipUnitValue,
      minBlind: parseFloat(minBlind),
      buyingOptions,
    });

    if (lobbyId) {
      navigate(`/lobby/${lobbyId}`);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-gradient-gold">Create Lobby</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-gold" />
                Lobby Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lobbyName">Lobby Name</Label>
                <Input
                  id="lobbyName"
                  value={lobbyName}
                  onChange={(e) => setLobbyName(e.target.value)}
                  placeholder="e.g., Friday Night Poker"
                  maxLength={30}
                  className="h-12"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max Players</Label>
                  <Select value={maxPlayers} onValueChange={setMaxPlayers}>
                    <SelectTrigger className="h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n} players
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Min Blind</Label>
                  <Input
                    type="number"
                    value={minBlind}
                    onChange={(e) => setMinBlind(e.target.value)}
                    min="1"
                    step="1"
                    className="h-12"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Chip Configuration */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Coins className="w-5 h-5 text-gold" />
                Buying Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auto-calculated chip value display */}
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-muted-foreground">
                  Chip Value: <span className="text-gold font-semibold">₹{chipUnitValue.toFixed(4)}</span> per chip
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  (Auto-calculated from price ÷ chips)
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Buying Options</Label>
                  {buyingOptions.length < 3 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={addBuyingOption}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  )}
                </div>

                {buyingOptions.map((option, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 bg-muted rounded-lg"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Chips</Label>
                          <Input
                            type="number"
                            value={option.chipsPerBuying}
                            onChange={(e) => updateBuyingOption(index, 'chipsPerBuying', parseInt(e.target.value) || 0)}
                            min="1"
                            className="h-10"
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Price (₹)</Label>
                          <Input
                            type="number"
                            value={option.pricePerBuying}
                            onChange={(e) => updateBuyingOption(index, 'pricePerBuying', parseInt(e.target.value) || 0)}
                            min="1"
                            className="h-10"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Value: ₹{option.pricePerBuying.toFixed(2)}
                      </p>
                    </div>
                    {buyingOptions.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBuyingOption(index)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <Button type="submit" variant="gold" size="xl" className="w-full" disabled={loading}>
            {loading ? "Creating..." : "Create Lobby"}
          </Button>
        </form>
      </div>
    </div>
  );
}

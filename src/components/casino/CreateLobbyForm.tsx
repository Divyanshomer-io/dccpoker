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
import { useGameStore, generateId, generateLobbyPassword } from "@/store/gameStore";
import { toast } from "@/hooks/use-toast";
import type { Lobby, BuyingOption, LobbyPlayer } from "@/types/casino";

export function CreateLobbyForm() {
  const navigate = useNavigate();
  const { currentUser, setCurrentLobby, setPlayers } = useGameStore();
  
  const [lobbyName, setLobbyName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("6");
  const [minBlind, setMinBlind] = useState("2");
  const [chipUnitValue, setChipUnitValue] = useState("0.25");
  const [buyingOptions, setBuyingOptions] = useState([
    { chipsPerBuying: 400, pricePerBuying: 100 }
  ]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      toast({ title: "Error", description: "Please set up your profile first", variant: "destructive" });
      return;
    }

    if (!lobbyName.trim()) {
      toast({ title: "Error", description: "Please enter a lobby name", variant: "destructive" });
      return;
    }

    const lobbyId = generateId();
    const password = generateLobbyPassword();

    const lobby: Lobby = {
      id: lobbyId,
      name: lobbyName.trim(),
      hostUserId: currentUser.id,
      password,
      maxPlayers: parseInt(maxPlayers),
      status: 'open',
      currencyCode: 'INR',
      chipUnitValue: parseFloat(chipUnitValue),
      minBlind: parseFloat(minBlind),
      buyingOptions: buyingOptions.map((opt, i) => ({
        id: `${lobbyId}-opt-${i}`,
        lobbyId,
        chipsPerBuying: opt.chipsPerBuying,
        pricePerBuying: opt.pricePerBuying,
      })),
      createdAt: new Date(),
    };

    const hostPlayer: LobbyPlayer = {
      id: generateId(),
      lobbyId,
      userId: currentUser.id,
      user: currentUser,
      seatIndex: 0,
      chips: 0,
      buyingsBought: 0,
      isHost: true,
      joinedAt: new Date(),
      active: true,
      isConnected: true,
    };

    setCurrentLobby(lobby);
    setPlayers([hostPlayer]);

    toast({
      title: "Lobby Created!",
      description: `Password: ${password}`,
    });

    navigate(`/lobby/${lobbyId}`);
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
                Chip Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Chip Value (₹ per chip)</Label>
                <Input
                  type="number"
                  value={chipUnitValue}
                  onChange={(e) => setChipUnitValue(e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="h-12"
                />
                <p className="text-xs text-muted-foreground">
                  Example: 0.25 means 100 chips = ₹25
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
                        Value: ₹{(option.chipsPerBuying * parseFloat(chipUnitValue || "0")).toFixed(2)}
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
          <Button type="submit" variant="gold" size="xl" className="w-full">
            Create Lobby
          </Button>
        </form>
      </div>
    </div>
  );
}

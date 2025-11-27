import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Lobby, LobbyPlayer, GameRound, BuyingOption } from '@/types/casino';

interface GameState {
  // User state
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  
  // Lobby state
  currentLobby: Lobby | null;
  setCurrentLobby: (lobby: Lobby | null) => void;
  
  // Players in lobby
  players: LobbyPlayer[];
  setPlayers: (players: LobbyPlayer[]) => void;
  addPlayer: (player: LobbyPlayer) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (playerId: string, updates: Partial<LobbyPlayer>) => void;
  
  // Game round state
  currentRound: GameRound | null;
  setCurrentRound: (round: GameRound | null) => void;
  
  // Actions
  resetGame: () => void;
  leaveLobby: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),
      
      currentLobby: null,
      setCurrentLobby: (lobby) => set({ currentLobby: lobby }),
      
      players: [],
      setPlayers: (players) => set({ players }),
      addPlayer: (player) => set((state) => ({ 
        players: [...state.players, player] 
      })),
      removePlayer: (playerId) => set((state) => ({ 
        players: state.players.filter(p => p.id !== playerId) 
      })),
      updatePlayer: (playerId, updates) => set((state) => ({
        players: state.players.map(p => 
          p.id === playerId ? { ...p, ...updates } : p
        )
      })),
      
      currentRound: null,
      setCurrentRound: (round) => set({ currentRound: round }),
      
      resetGame: () => set({
        currentRound: null,
      }),
      
      leaveLobby: () => set({
        currentLobby: null,
        players: [],
        currentRound: null,
      }),
    }),
    {
      name: 'daddy-chill-casino-storage',
      partialize: (state) => ({ 
        currentUser: state.currentUser 
      }),
    }
  )
);

// Utility functions
export const formatCurrency = (amount: number, currencyCode: string = 'INR'): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const chipsToRupees = (chips: number, chipUnitValue: number): number => {
  return Number((chips * chipUnitValue).toFixed(2));
};

export const generateLobbyPassword = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

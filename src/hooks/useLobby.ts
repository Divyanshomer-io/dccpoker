import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useGameStore, generateId, generateLobbyPassword } from '@/store/gameStore';
import { toast } from '@/hooks/use-toast';
import type { Lobby, LobbyPlayer, BuyingOption } from '@/types/casino';

export function useLobby(lobbyId?: string) {
  const { currentUser, setCurrentLobby, setPlayers } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch lobby and players
  const fetchLobby = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch lobby
      const { data: lobbyData, error: lobbyError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('id', id)
        .single();

      if (lobbyError) throw lobbyError;
      if (!lobbyData) throw new Error('Lobby not found');

      // Fetch buying options
      const { data: optionsData } = await supabase
        .from('buying_options')
        .select('*')
        .eq('lobby_id', id);

      // Fetch players
      const { data: playersData } = await supabase
        .from('lobby_players')
        .select('*')
        .eq('lobby_id', id)
        .order('seat_index');

      const lobby: Lobby = {
        id: lobbyData.id,
        name: lobbyData.name,
        hostUserId: lobbyData.host_user_id,
        password: lobbyData.password,
        maxPlayers: lobbyData.max_players,
        status: lobbyData.status as Lobby['status'],
        currencyCode: lobbyData.currency_code,
        chipUnitValue: Number(lobbyData.chip_unit_value),
        minBlind: Number(lobbyData.min_blind),
        buyingOptions: (optionsData || []).map(o => ({
          id: o.id,
          lobbyId: o.lobby_id,
          chipsPerBuying: o.chips_per_buying,
          pricePerBuying: Number(o.price_per_buying),
        })),
        createdAt: new Date(lobbyData.created_at),
        startedAt: lobbyData.started_at ? new Date(lobbyData.started_at) : undefined,
        endedAt: lobbyData.ended_at ? new Date(lobbyData.ended_at) : undefined,
      };

      const players: LobbyPlayer[] = (playersData || []).map(p => ({
        id: p.id,
        lobbyId: p.lobby_id,
        userId: p.user_id,
        user: {
          id: p.user_id,
          name: p.user_name,
          avatar: p.user_avatar || undefined,
          createdAt: new Date(),
          lastSeenAt: new Date(),
        },
        seatIndex: p.seat_index,
        chips: p.chips,
        buyingsBought: p.buyings_bought,
        isHost: p.is_host,
        joinedAt: new Date(p.joined_at),
        active: p.active,
        isConnected: p.is_connected,
      }));

      setCurrentLobby(lobby);
      setPlayers(players);
      
      return { lobby, players };
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [setCurrentLobby, setPlayers]);

  // Create lobby
  const createLobby = async (lobbyData: {
    name: string;
    maxPlayers: number;
    chipUnitValue: number;
    minBlind: number;
    buyingOptions: { chipsPerBuying: number; pricePerBuying: number }[];
  }) => {
    if (!currentUser) {
      toast({ title: 'Error', description: 'Please set up your profile first', variant: 'destructive' });
      return null;
    }

    setLoading(true);
    try {
      const lobbyId = generateId();
      const password = generateLobbyPassword();

      // Insert lobby
      const { error: lobbyError } = await supabase
        .from('lobbies')
        .insert({
          id: lobbyId,
          name: lobbyData.name,
          host_user_id: currentUser.id,
          password,
          max_players: lobbyData.maxPlayers,
          chip_unit_value: lobbyData.chipUnitValue,
          min_blind: lobbyData.minBlind,
        });

      if (lobbyError) throw lobbyError;

      // Insert buying options
      const buyingOptionsToInsert = lobbyData.buyingOptions.map((opt, i) => ({
        id: `${lobbyId}-opt-${i}`,
        lobby_id: lobbyId,
        chips_per_buying: opt.chipsPerBuying,
        price_per_buying: opt.pricePerBuying,
      }));

      const { error: optionsError } = await supabase
        .from('buying_options')
        .insert(buyingOptionsToInsert);

      if (optionsError) throw optionsError;

      // Add host as first player
      const playerId = generateId();
      const { error: playerError } = await supabase
        .from('lobby_players')
        .insert({
          id: playerId,
          lobby_id: lobbyId,
          user_id: currentUser.id,
          user_name: currentUser.name,
          user_avatar: currentUser.avatar || null,
          seat_index: 0,
          is_host: true,
        });

      if (playerError) throw playerError;

      toast({ title: 'Lobby Created!', description: `Password: ${password}` });
      
      return lobbyId;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Join lobby
  const joinLobby = async (id: string, password: string) => {
    if (!currentUser) {
      toast({ title: 'Error', description: 'Please set up your profile first', variant: 'destructive' });
      return false;
    }

    setLoading(true);
    try {
      // Find lobby by ID
      const { data: lobbyData, error: lobbyError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('id', id.trim())
        .single();

      if (lobbyError || !lobbyData) {
        toast({ title: 'Error', description: 'Lobby not found', variant: 'destructive' });
        return false;
      }

      // Check password
      if (lobbyData.password !== password.trim().toUpperCase()) {
        toast({ title: 'Error', description: 'Invalid password', variant: 'destructive' });
        return false;
      }

      // Check if lobby is full
      const { data: playersData } = await supabase
        .from('lobby_players')
        .select('*')
        .eq('lobby_id', id);

      const playerCount = playersData?.length || 0;
      
      if (playerCount >= lobbyData.max_players) {
        toast({ title: 'Error', description: 'Lobby is full', variant: 'destructive' });
        return false;
      }

      // Check if already in lobby
      const existingPlayer = playersData?.find(p => p.user_id === currentUser.id);
      if (existingPlayer) {
        toast({ title: 'Info', description: "You're already in this lobby" });
        return true;
      }

      // Add player to lobby
      const playerId = generateId();
      const { error: playerError } = await supabase
        .from('lobby_players')
        .insert({
          id: playerId,
          lobby_id: id,
          user_id: currentUser.id,
          user_name: currentUser.name,
          user_avatar: currentUser.avatar || null,
          seat_index: playerCount,
          is_host: false,
        });

      if (playerError) throw playerError;

      toast({ title: 'Success', description: 'Joined lobby!' });
      return true;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Update player chips
  const updatePlayerChips = async (playerId: string, chips: number, buyingsBought: number) => {
    const { error } = await supabase
      .from('lobby_players')
      .update({ chips, buyings_bought: buyingsBought })
      .eq('id', playerId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    return true;
  };

  // Leave lobby
  const leaveLobby = async (playerId: string) => {
    const { error } = await supabase
      .from('lobby_players')
      .delete()
      .eq('id', playerId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    }
    return true;
  };

  // Subscribe to realtime updates
  useEffect(() => {
    if (!lobbyId) return;

    const channel = supabase
      .channel(`lobby-${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobby_players',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        () => {
          // Refetch when players change
          fetchLobby(lobbyId);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobbies',
          filter: `id=eq.${lobbyId}`,
        },
        () => {
          // Refetch when lobby changes
          fetchLobby(lobbyId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lobbyId, fetchLobby]);

  return {
    loading,
    error,
    fetchLobby,
    createLobby,
    joinLobby,
    updatePlayerChips,
    leaveLobby,
  };
}

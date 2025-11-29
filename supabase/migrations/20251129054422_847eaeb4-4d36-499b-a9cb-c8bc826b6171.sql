-- Add new columns to game_rounds table for proper poker tracking
ALTER TABLE public.game_rounds 
ADD COLUMN IF NOT EXISTS last_raise_amount integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS player_states jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS betting_round_start_seat integer,
ADD COLUMN IF NOT EXISTS last_aggressor_seat integer;
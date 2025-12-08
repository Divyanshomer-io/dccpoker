-- Drop and recreate the check constraint with all valid stages including awaiting_* stages
ALTER TABLE public.game_rounds DROP CONSTRAINT IF EXISTS valid_stage;
ALTER TABLE public.game_rounds ADD CONSTRAINT valid_stage 
CHECK (stage = ANY (ARRAY[
  'waiting'::text,
  'preflop'::text, 
  'awaiting_flop'::text,
  'flop'::text, 
  'awaiting_turn'::text,
  'turn'::text, 
  'awaiting_river'::text,
  'river'::text, 
  'showdown'::text, 
  'settled'::text,
  'game_finished'::text
]));
-- Migration 025: Extend meals table for MVP
-- Adds fields required by Decision Arbiter Contract

-- Add new columns
ALTER TABLE meals ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE meals ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER DEFAULT 0;
ALTER TABLE meals ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'medium';
ALTER TABLE meals ADD COLUMN IF NOT EXISTS cook_steps JSONB DEFAULT '[]';
ALTER TABLE meals ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'cook';

-- Add CHECK constraints
ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_difficulty_check;
ALTER TABLE meals ADD CONSTRAINT meals_difficulty_check 
  CHECK (difficulty IN ('easy', 'medium', 'hard'));

ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_mode_check;
ALTER TABLE meals ADD CONSTRAINT meals_mode_check 
  CHECK (mode IN ('cook', 'pickup', 'delivery', 'no_cook'));

-- Update existing seed meals with realistic MVP data
UPDATE meals SET 
  tags = ARRAY['pasta', 'italian', 'comfort'],
  estimated_cost_cents = 1200,
  difficulty = 'medium',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Boil water and cook pasta according to package", "duration_minutes": 10},
    {"step": 2, "instruction": "Season and cook chicken in pan", "duration_minutes": 8},
    {"step": 3, "instruction": "Add sauce and simmer", "duration_minutes": 5},
    {"step": 4, "instruction": "Combine pasta with sauce and chicken", "duration_minutes": 2},
    {"step": 5, "instruction": "Serve and enjoy", "duration_minutes": 1}
  ]'::jsonb
WHERE id = 1; -- Chicken Pasta

UPDATE meals SET 
  tags = ARRAY['fish', 'healthy', 'protein'],
  estimated_cost_cents = 1800,
  difficulty = 'medium',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Preheat oven to 400°F", "duration_minutes": 5},
    {"step": 2, "instruction": "Season salmon with salt, pepper, lemon", "duration_minutes": 2},
    {"step": 3, "instruction": "Bake salmon for 12-15 minutes", "duration_minutes": 15},
    {"step": 4, "instruction": "Rest and serve", "duration_minutes": 3}
  ]'::jsonb
WHERE id = 2; -- Grilled Salmon

UPDATE meals SET 
  tags = ARRAY['vegetarian', 'quick', 'healthy'],
  estimated_cost_cents = 800,
  difficulty = 'easy',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Chop vegetables into bite-sized pieces", "duration_minutes": 5},
    {"step": 2, "instruction": "Heat oil in wok or large pan", "duration_minutes": 2},
    {"step": 3, "instruction": "Stir fry vegetables until crisp-tender", "duration_minutes": 8},
    {"step": 4, "instruction": "Add sauce and serve over rice", "duration_minutes": 5}
  ]'::jsonb
WHERE id = 3; -- Vegetable Stir Fry

UPDATE meals SET 
  tags = ARRAY['mexican', 'quick', 'family'],
  estimated_cost_cents = 1000,
  difficulty = 'easy',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Season and brown ground beef", "duration_minutes": 8},
    {"step": 2, "instruction": "Warm taco shells", "duration_minutes": 3},
    {"step": 3, "instruction": "Prep toppings (lettuce, cheese, salsa)", "duration_minutes": 5},
    {"step": 4, "instruction": "Assemble tacos and serve", "duration_minutes": 5}
  ]'::jsonb
WHERE id = 4; -- Beef Tacos

UPDATE meals SET 
  tags = ARRAY['salad', 'quick', 'healthy'],
  estimated_cost_cents = 600,
  difficulty = 'easy',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Chop romaine lettuce", "duration_minutes": 3},
    {"step": 2, "instruction": "Make or add caesar dressing", "duration_minutes": 2},
    {"step": 3, "instruction": "Add croutons and parmesan", "duration_minutes": 2},
    {"step": 4, "instruction": "Toss and serve", "duration_minutes": 1}
  ]'::jsonb
WHERE id = 5; -- Caesar Salad

UPDATE meals SET 
  tags = ARRAY['soup', 'comfort', 'easy'],
  estimated_cost_cents = 500,
  difficulty = 'easy',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Sauté onion and garlic", "duration_minutes": 5},
    {"step": 2, "instruction": "Add canned tomatoes and broth", "duration_minutes": 2},
    {"step": 3, "instruction": "Simmer for 15 minutes", "duration_minutes": 15},
    {"step": 4, "instruction": "Blend and season to taste", "duration_minutes": 3}
  ]'::jsonb
WHERE id = 6; -- Tomato Soup

UPDATE meals SET 
  tags = ARRAY['breakfast', 'quick', 'easy'],
  estimated_cost_cents = 300,
  difficulty = 'easy',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Crack eggs into bowl and whisk", "duration_minutes": 1},
    {"step": 2, "instruction": "Heat butter in pan", "duration_minutes": 2},
    {"step": 3, "instruction": "Cook eggs, stirring gently", "duration_minutes": 4},
    {"step": 4, "instruction": "Season and serve", "duration_minutes": 1}
  ]'::jsonb
WHERE id = 7; -- Scrambled Eggs

UPDATE meals SET 
  tags = ARRAY['breakfast', 'family', 'comfort'],
  estimated_cost_cents = 400,
  difficulty = 'easy',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Mix pancake batter", "duration_minutes": 3},
    {"step": 2, "instruction": "Heat griddle to medium", "duration_minutes": 2},
    {"step": 3, "instruction": "Pour batter and flip when bubbles form", "duration_minutes": 10},
    {"step": 4, "instruction": "Serve with syrup and butter", "duration_minutes": 2}
  ]'::jsonb
WHERE id = 8; -- Pancakes

UPDATE meals SET 
  tags = ARRAY['breakfast', 'quick', 'healthy'],
  estimated_cost_cents = 350,
  difficulty = 'easy',
  mode = 'no_cook',
  cook_steps = '[
    {"step": 1, "instruction": "Add yogurt to bowl", "duration_minutes": 1},
    {"step": 2, "instruction": "Top with granola and fruit", "duration_minutes": 2},
    {"step": 3, "instruction": "Drizzle honey if desired", "duration_minutes": 1}
  ]'::jsonb
WHERE id = 9; -- Greek Yogurt Bowl

UPDATE meals SET 
  tags = ARRAY['pasta', 'italian', 'comfort', 'family'],
  estimated_cost_cents = 1400,
  difficulty = 'medium',
  mode = 'cook',
  cook_steps = '[
    {"step": 1, "instruction": "Brown ground beef with onion", "duration_minutes": 10},
    {"step": 2, "instruction": "Add tomato sauce and simmer", "duration_minutes": 20},
    {"step": 3, "instruction": "Cook spaghetti according to package", "duration_minutes": 10},
    {"step": 4, "instruction": "Combine and serve with parmesan", "duration_minutes": 2}
  ]'::jsonb
WHERE id = 10; -- Spaghetti Bolognese

-- Add zero-cook fallback meals for DRM
INSERT INTO meals (id, name, category, prep_time_minutes, tags, estimated_cost_cents, difficulty, mode, cook_steps)
VALUES 
  (11, 'Cereal with Milk', 'dinner', 2, ARRAY['no_cook', 'fallback', 'quick'], 200, 'easy', 'no_cook', 
   '[{"step": 1, "instruction": "Pour cereal into bowl", "duration_minutes": 1}, {"step": 2, "instruction": "Add milk", "duration_minutes": 1}]'::jsonb),
  (12, 'PB&J Sandwich', 'dinner', 5, ARRAY['no_cook', 'fallback', 'quick'], 150, 'easy', 'no_cook',
   '[{"step": 1, "instruction": "Spread peanut butter on bread", "duration_minutes": 1}, {"step": 2, "instruction": "Spread jelly on other slice", "duration_minutes": 1}, {"step": 3, "instruction": "Combine and cut", "duration_minutes": 1}]'::jsonb),
  (13, 'Cheese and Crackers', 'dinner', 3, ARRAY['no_cook', 'fallback', 'quick'], 300, 'easy', 'no_cook',
   '[{"step": 1, "instruction": "Slice cheese", "duration_minutes": 2}, {"step": 2, "instruction": "Arrange with crackers", "duration_minutes": 1}]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  tags = EXCLUDED.tags,
  estimated_cost_cents = EXCLUDED.estimated_cost_cents,
  difficulty = EXCLUDED.difficulty,
  mode = EXCLUDED.mode,
  cook_steps = EXCLUDED.cook_steps;

-- Update sequence
SELECT setval('meals_id_seq', COALESCE((SELECT MAX(id) FROM meals), 1));

-- Create index for tag searches
CREATE INDEX IF NOT EXISTS idx_meals_tags ON meals USING GIN(tags);

-- Comment
COMMENT ON COLUMN meals.tags IS 'Array of tags for taste matching (e.g., italian, quick, comfort)';
COMMENT ON COLUMN meals.estimated_cost_cents IS 'Estimated cost in cents for budget constraint checks';
COMMENT ON COLUMN meals.difficulty IS 'Difficulty level: easy, medium, hard - used for energy level constraint';
COMMENT ON COLUMN meals.cook_steps IS 'JSONB array of execution steps, max 7 steps per contract';
COMMENT ON COLUMN meals.mode IS 'Execution mode: cook, pickup, delivery, no_cook';

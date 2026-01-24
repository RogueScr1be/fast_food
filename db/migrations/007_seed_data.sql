-- Migration 007: Seed initial data
-- Part of Decision OS schema

-- Create a default test user if none exists
INSERT INTO user_profiles (id, external_id)
VALUES (1, 'default-test-user')
ON CONFLICT (id) DO NOTHING;

-- Seed some initial meals
INSERT INTO meals (id, name, category, prep_time_minutes) VALUES
  (1, 'Chicken Pasta', 'dinner', 30),
  (2, 'Grilled Salmon', 'dinner', 25),
  (3, 'Vegetable Stir Fry', 'dinner', 20),
  (4, 'Beef Tacos', 'dinner', 25),
  (5, 'Caesar Salad', 'lunch', 15),
  (6, 'Tomato Soup', 'lunch', 20),
  (7, 'Scrambled Eggs', 'breakfast', 10),
  (8, 'Pancakes', 'breakfast', 20),
  (9, 'Greek Yogurt Bowl', 'breakfast', 5),
  (10, 'Spaghetti Bolognese', 'dinner', 40)
ON CONFLICT (id) DO NOTHING;

-- Update sequences to avoid conflicts with seeded IDs
SELECT setval('user_profiles_id_seq', COALESCE((SELECT MAX(id) FROM user_profiles), 1));
SELECT setval('meals_id_seq', COALESCE((SELECT MAX(id) FROM meals), 1));

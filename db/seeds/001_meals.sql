-- ============================================================================
-- FAST FOOD: Decision OS Seed Data
-- Seed: 001_meals
-- 
-- 50 curated meals for v1
-- Composition:
--   - 18 easy (≤15 min)
--   - 20 medium (16-30 min)
--   - 12 longer (31-45 min)
--   - 15 pantry meals (shelf-stable, for DRM)
--   - Cuisines: American, Mexican, Italian, Asian, Mediterranean, Other
--
-- INVARIANT: tags_internal is NEVER exposed to UI
-- ============================================================================

-- Clear existing data (idempotent seeding)
TRUNCATE decision_os.meal_ingredients CASCADE;
TRUNCATE decision_os.meals CASCADE;

-- ============================================================================
-- EASY MEALS (≤15 min) - 18 meals
-- ============================================================================

INSERT INTO decision_os.meals (canonical_key, name, instructions_short, est_minutes, est_cost_band, tags_internal) VALUES
-- American
('quick-grilled-cheese', 'Quick Grilled Cheese', 'Butter bread, add cheese slices, grill in pan until golden on both sides. Serve with tomato soup if desired.', 10, '$', '["american", "vegetarian", "easy", "comfort", "pantry_friendly"]'),
('blt-sandwich', 'Classic BLT', 'Cook bacon until crispy. Toast bread, layer with mayo, lettuce, tomato, and bacon. Cut diagonally and serve.', 12, '$', '["american", "easy", "lunch"]'),
('scrambled-eggs-toast', 'Scrambled Eggs on Toast', 'Whisk eggs with salt and pepper, scramble in butter until just set. Serve on buttered toast.', 8, '$', '["american", "breakfast", "easy", "vegetarian", "pantry_friendly"]'),
('quesadilla-cheese', 'Cheese Quesadilla', 'Fill tortilla with shredded cheese, fold in half, cook in dry pan until cheese melts and tortilla is crispy.', 8, '$', '["mexican", "vegetarian", "easy", "pantry_friendly"]'),

-- Mexican
('quick-chicken-tacos', 'Quick Chicken Tacos', 'Season chicken with taco spices, cook 6-8 minutes. Warm tortillas, assemble with lettuce, tomato, cheese.', 15, '$', '["mexican", "easy", "protein"]'),
('bean-and-cheese-burrito', 'Bean & Cheese Burrito', 'Warm refried beans, spoon onto tortilla with cheese and salsa. Roll up and serve.', 10, '$', '["mexican", "vegetarian", "easy", "pantry_friendly"]'),

-- Italian
('spaghetti-aglio-olio', 'Spaghetti Aglio e Olio', 'Cook spaghetti. Saute garlic in olive oil until golden, add red pepper flakes. Toss with pasta and parsley.', 15, '$', '["italian", "vegetarian", "easy", "pantry_friendly"]'),
('caprese-salad', 'Caprese Salad', 'Slice fresh mozzarella and tomatoes. Layer alternating, drizzle with olive oil and balsamic, season with basil.', 8, '$$', '["italian", "vegetarian", "easy", "no_cook"]'),

-- Asian
('egg-fried-rice', 'Egg Fried Rice', 'Scramble eggs, set aside. Stir-fry cold rice with soy sauce, add peas and eggs. Season with sesame oil.', 12, '$', '["asian", "easy", "pantry_friendly"]'),
('instant-ramen-upgrade', 'Upgraded Instant Ramen', 'Cook ramen, add soft-boiled egg, green onions, and a drizzle of sesame oil. Optional: add leftover protein.', 10, '$', '["asian", "easy", "pantry_friendly", "comfort"]'),
('cucumber-sesame-salad', 'Cucumber Sesame Salad', 'Slice cucumbers thin, toss with rice vinegar, sesame oil, soy sauce, and sesame seeds. Chill briefly.', 8, '$', '["asian", "vegetarian", "easy", "no_cook"]'),

-- Mediterranean
('hummus-veggie-wrap', 'Hummus Veggie Wrap', 'Spread hummus on tortilla, add sliced cucumbers, tomatoes, feta, and spinach. Roll tightly and slice.', 8, '$', '["mediterranean", "vegetarian", "easy", "no_cook"]'),
('greek-salad', 'Greek Salad', 'Chop cucumber, tomato, red onion. Add olives and feta. Dress with olive oil, lemon, oregano.', 10, '$', '["mediterranean", "vegetarian", "easy", "no_cook"]'),

-- Other Quick
('avocado-toast', 'Avocado Toast', 'Toast bread, mash avocado with salt, lime, and red pepper flakes. Spread on toast, top with everything seasoning.', 8, '$', '["american", "vegetarian", "easy", "breakfast"]'),
('pb-banana-sandwich', 'Peanut Butter Banana Sandwich', 'Spread peanut butter on bread, add sliced banana and drizzle of honey. Close and slice.', 5, '$', '["american", "vegetarian", "easy", "pantry_friendly"]'),
('tuna-salad-crackers', 'Tuna Salad with Crackers', 'Mix canned tuna with mayo, celery, and lemon juice. Serve with crackers or on bread.', 10, '$', '["american", "easy", "pantry_friendly", "protein"]'),
('microwave-baked-potato', 'Microwave Baked Potato', 'Pierce potato, microwave 8-10 minutes. Split open, add butter, sour cream, chives, and cheese.', 12, '$', '["american", "vegetarian", "easy"]'),
('fruit-yogurt-bowl', 'Fruit & Yogurt Bowl', 'Spoon Greek yogurt into bowl, top with fresh berries, granola, and drizzle of honey.', 5, '$', '["american", "vegetarian", "easy", "breakfast", "no_cook"]');

-- ============================================================================
-- MEDIUM MEALS (16-30 min) - 20 meals
-- ============================================================================

INSERT INTO decision_os.meals (canonical_key, name, instructions_short, est_minutes, est_cost_band, tags_internal) VALUES
-- American
('pan-seared-chicken-breast', 'Pan-Seared Chicken Breast', 'Season chicken, sear in hot pan 6 min per side until golden and cooked through. Rest 5 minutes before slicing. Serve with steamed vegetables.', 25, '$$', '["american", "medium", "protein", "healthy"]'),
('turkey-burger', 'Turkey Burger', 'Form ground turkey into patties with seasoning. Grill or pan-fry 5 min per side. Serve on bun with fixings.', 20, '$$', '["american", "medium", "protein"]'),
('sheet-pan-sausage-veggies', 'Sheet Pan Sausage & Veggies', 'Toss sliced sausage and chopped vegetables with olive oil. Roast at 425°F for 20 minutes until caramelized.', 25, '$$', '["american", "medium", "one_pan"]'),

-- Mexican
('chicken-fajitas', 'Chicken Fajitas', 'Slice chicken and peppers, cook in hot skillet with fajita seasoning. Serve in warm tortillas with toppings.', 25, '$$', '["mexican", "medium", "protein"]'),
('black-bean-tacos', 'Black Bean Tacos', 'Saute onions and garlic, add black beans and spices. Mash slightly. Serve in tortillas with avocado and salsa.', 18, '$', '["mexican", "vegetarian", "medium", "pantry_friendly"]'),
('burrito-bowl', 'Burrito Bowl', 'Layer rice, black beans, seasoned chicken or beef, corn, salsa, cheese, and sour cream in bowl.', 25, '$$', '["mexican", "medium", "protein"]'),

-- Italian
('pasta-marinara', 'Pasta Marinara', 'Cook pasta al dente. Heat marinara sauce with garlic. Toss pasta with sauce, top with parmesan and basil.', 20, '$', '["italian", "vegetarian", "medium", "pantry_friendly"]'),
('chicken-parmesan', 'Chicken Parmesan', 'Bread chicken cutlets, pan-fry until golden. Top with marinara and mozzarella, broil until bubbly. Serve over pasta.', 30, '$$', '["italian", "medium", "protein", "comfort"]'),
('pesto-pasta-cherry-tomatoes', 'Pesto Pasta with Cherry Tomatoes', 'Cook pasta, toss with pesto and halved cherry tomatoes. Top with parmesan and pine nuts.', 18, '$$', '["italian", "vegetarian", "medium"]'),
('italian-sausage-peppers', 'Italian Sausage & Peppers', 'Brown sausages in pan. Add sliced peppers and onions, cook until tender. Serve in hoagie rolls or over rice.', 25, '$$', '["italian", "medium", "protein"]'),

-- Asian
('chicken-stir-fry', 'Chicken Stir-Fry', 'Slice chicken thin, stir-fry with vegetables in hot wok. Add soy sauce and garlic. Serve over rice.', 20, '$$', '["asian", "medium", "protein", "healthy"]'),
('beef-broccoli', 'Beef & Broccoli', 'Slice beef thin, stir-fry until browned. Add broccoli and sauce (soy, ginger, garlic). Serve over rice.', 25, '$$', '["asian", "medium", "protein"]'),
('teriyaki-salmon', 'Teriyaki Salmon', 'Brush salmon with teriyaki sauce, bake at 400°F for 12-15 minutes. Serve with rice and steamed vegetables.', 20, '$$', '["asian", "medium", "protein", "healthy", "seafood"]'),
('pad-thai-style-noodles', 'Pad Thai Style Noodles', 'Soak rice noodles, stir-fry with egg, tofu or shrimp, bean sprouts. Toss with pad thai sauce, top with peanuts and lime.', 25, '$$', '["asian", "medium"]'),
('fried-rice-shrimp', 'Shrimp Fried Rice', 'Stir-fry cold rice with shrimp, peas, carrots, and egg. Season with soy sauce and sesame oil.', 18, '$$', '["asian", "medium", "protein", "seafood"]'),

-- Mediterranean
('greek-chicken-rice-bowl', 'Greek Chicken Rice Bowl', 'Season chicken with Greek spices, grill or pan-sear. Serve over rice with cucumber, tomato, feta, and tzatziki.', 25, '$$', '["mediterranean", "medium", "protein", "healthy"]'),
('falafel-pita', 'Falafel Pita', 'Heat frozen or fresh falafel. Stuff pita with falafel, lettuce, tomato, cucumber, and tahini sauce.', 18, '$$', '["mediterranean", "vegetarian", "medium"]'),

-- Other
('french-omelette', 'French Omelette', 'Whisk eggs, cook in buttered pan while stirring. Add cheese and herbs, fold when just set. Serve immediately.', 15, '$', '["french", "vegetarian", "medium", "breakfast", "protein"]'),
('grilled-cheese-tomato-soup', 'Grilled Cheese & Tomato Soup', 'Make grilled cheese while heating tomato soup. A classic comfort combo ready in under 20 minutes.', 18, '$', '["american", "vegetarian", "medium", "comfort", "pantry_friendly"]'),
('fish-tacos', 'Fish Tacos', 'Season white fish, pan-fry 3-4 min per side. Serve in tortillas with cabbage slaw and lime crema.', 20, '$$', '["mexican", "medium", "protein", "seafood"]');

-- ============================================================================
-- LONGER MEALS (31-45 min) - 12 meals
-- ============================================================================

INSERT INTO decision_os.meals (canonical_key, name, instructions_short, est_minutes, est_cost_band, tags_internal) VALUES
('baked-chicken-thighs', 'Baked Chicken Thighs', 'Season chicken thighs, bake at 425°F for 35-40 minutes until skin is crispy and internal temp is 165°F. Serve with roasted vegetables.', 45, '$$', '["american", "longer", "protein", "one_pan"]'),
('spaghetti-bolognese', 'Spaghetti Bolognese', 'Brown ground beef with onions and garlic. Add crushed tomatoes and simmer 20 minutes. Serve over spaghetti with parmesan.', 40, '$$', '["italian", "longer", "protein", "comfort"]'),
('baked-salmon-vegetables', 'Baked Salmon with Vegetables', 'Arrange salmon and vegetables on sheet pan. Season and bake at 400°F for 25-30 minutes. One pan, minimal cleanup.', 35, '$$$', '["american", "longer", "protein", "healthy", "seafood", "one_pan"]'),
('homemade-pizza', 'Homemade Pizza', 'Roll out dough, top with sauce, cheese, and toppings. Bake at 475°F for 12-15 minutes until crust is golden and cheese bubbles.', 35, '$$', '["italian", "longer", "comfort"]'),
('chicken-curry', 'Chicken Curry', 'Saute onions and spices, add chicken and coconut milk. Simmer 25 minutes until chicken is cooked through. Serve over rice.', 40, '$$', '["indian", "longer", "protein"]'),
('beef-tacos-homemade', 'Beef Tacos from Scratch', 'Brown ground beef with onions, add taco seasoning and tomatoes. Simmer 15 minutes. Serve with all the fixings.', 35, '$$', '["mexican", "longer", "protein"]'),
('roasted-chicken-potatoes', 'Roasted Chicken & Potatoes', 'Arrange chicken pieces and quartered potatoes on sheet pan. Season well, roast at 425°F for 40 minutes.', 45, '$$', '["american", "longer", "protein", "one_pan", "comfort"]'),
('vegetable-lasagna', 'Vegetable Lasagna', 'Layer noodles, ricotta mixture, vegetables, and marinara. Bake covered 25 min, uncovered 15 min until bubbly.', 45, '$$', '["italian", "vegetarian", "longer", "comfort"]'),
('shrimp-scampi', 'Shrimp Scampi', 'Cook pasta. Saute shrimp in garlic butter and white wine. Toss with pasta, lemon juice, and parsley.', 35, '$$$', '["italian", "longer", "protein", "seafood"]'),
('stuffed-peppers', 'Stuffed Peppers', 'Fill bell peppers with rice, ground beef, tomatoes, and cheese. Bake at 375°F for 35-40 minutes until peppers are tender.', 45, '$$', '["american", "longer", "protein"]'),
('chicken-tikka-masala', 'Chicken Tikka Masala', 'Marinate chicken, grill or broil. Simmer in creamy tomato sauce with spices. Serve over basmati rice with naan.', 45, '$$', '["indian", "longer", "protein"]'),
('beef-stew-quick', 'Quick Beef Stew', 'Brown beef cubes, add vegetables and broth. Simmer 30 minutes until beef is tender. Serve with crusty bread.', 45, '$$', '["american", "longer", "protein", "comfort"]');

-- ============================================================================
-- ADD INGREDIENTS FOR ALL MEALS
-- ============================================================================

-- Quick Grilled Cheese
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bread', '2 slices', false FROM decision_os.meals WHERE canonical_key = 'quick-grilled-cheese';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cheese slices', '2 slices', false FROM decision_os.meals WHERE canonical_key = 'quick-grilled-cheese';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'butter', '1 tbsp', true FROM decision_os.meals WHERE canonical_key = 'quick-grilled-cheese';

-- BLT Sandwich
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bacon', '4 strips', false FROM decision_os.meals WHERE canonical_key = 'blt-sandwich';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bread', '2 slices', false FROM decision_os.meals WHERE canonical_key = 'blt-sandwich';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lettuce', '2 leaves', false FROM decision_os.meals WHERE canonical_key = 'blt-sandwich';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tomato', '2 slices', false FROM decision_os.meals WHERE canonical_key = 'blt-sandwich';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mayonnaise', '1 tbsp', true FROM decision_os.meals WHERE canonical_key = 'blt-sandwich';

-- Scrambled Eggs on Toast
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'eggs', '3', false FROM decision_os.meals WHERE canonical_key = 'scrambled-eggs-toast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bread', '2 slices', false FROM decision_os.meals WHERE canonical_key = 'scrambled-eggs-toast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'butter', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'scrambled-eggs-toast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'salt', 'to taste', true FROM decision_os.meals WHERE canonical_key = 'scrambled-eggs-toast';

-- Cheese Quesadilla
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'flour tortilla', '1 large', false FROM decision_os.meals WHERE canonical_key = 'quesadilla-cheese';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shredded cheese', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'quesadilla-cheese';

-- Quick Chicken Tacos
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken breast', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'quick-chicken-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'taco shells', '8', false FROM decision_os.meals WHERE canonical_key = 'quick-chicken-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lettuce', '1 cup shredded', false FROM decision_os.meals WHERE canonical_key = 'quick-chicken-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tomato', '1 diced', false FROM decision_os.meals WHERE canonical_key = 'quick-chicken-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shredded cheese', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'quick-chicken-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'taco seasoning', '1 packet', true FROM decision_os.meals WHERE canonical_key = 'quick-chicken-tacos';

-- Bean & Cheese Burrito
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'flour tortilla', '2 large', false FROM decision_os.meals WHERE canonical_key = 'bean-and-cheese-burrito';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'refried beans', '1 can', true FROM decision_os.meals WHERE canonical_key = 'bean-and-cheese-burrito';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shredded cheese', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'bean-and-cheese-burrito';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'salsa', '1/4 cup', true FROM decision_os.meals WHERE canonical_key = 'bean-and-cheese-burrito';

-- Spaghetti Aglio e Olio
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'spaghetti', '1/2 lb', true FROM decision_os.meals WHERE canonical_key = 'spaghetti-aglio-olio';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '6 cloves', false FROM decision_os.meals WHERE canonical_key = 'spaghetti-aglio-olio';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '1/3 cup', true FROM decision_os.meals WHERE canonical_key = 'spaghetti-aglio-olio';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'red pepper flakes', '1/2 tsp', true FROM decision_os.meals WHERE canonical_key = 'spaghetti-aglio-olio';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'parsley', '2 tbsp', false FROM decision_os.meals WHERE canonical_key = 'spaghetti-aglio-olio';

-- Caprese Salad
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'fresh mozzarella', '8 oz', false FROM decision_os.meals WHERE canonical_key = 'caprese-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tomato', '2 large', false FROM decision_os.meals WHERE canonical_key = 'caprese-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'fresh basil', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'caprese-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'caprese-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'balsamic vinegar', '1 tbsp', true FROM decision_os.meals WHERE canonical_key = 'caprese-salad';

-- Egg Fried Rice
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cooked rice', '3 cups', true FROM decision_os.meals WHERE canonical_key = 'egg-fried-rice';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'eggs', '2', false FROM decision_os.meals WHERE canonical_key = 'egg-fried-rice';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'frozen peas', '1/2 cup', true FROM decision_os.meals WHERE canonical_key = 'egg-fried-rice';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'soy sauce', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'egg-fried-rice';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'sesame oil', '1 tsp', true FROM decision_os.meals WHERE canonical_key = 'egg-fried-rice';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'green onions', '2', false FROM decision_os.meals WHERE canonical_key = 'egg-fried-rice';

-- Upgraded Instant Ramen
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'instant ramen', '1 packet', true FROM decision_os.meals WHERE canonical_key = 'instant-ramen-upgrade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'eggs', '1', false FROM decision_os.meals WHERE canonical_key = 'instant-ramen-upgrade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'green onions', '1', false FROM decision_os.meals WHERE canonical_key = 'instant-ramen-upgrade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'sesame oil', '1 tsp', true FROM decision_os.meals WHERE canonical_key = 'instant-ramen-upgrade';

-- Cucumber Sesame Salad
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cucumber', '2', false FROM decision_os.meals WHERE canonical_key = 'cucumber-sesame-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice vinegar', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'cucumber-sesame-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'sesame oil', '1 tbsp', true FROM decision_os.meals WHERE canonical_key = 'cucumber-sesame-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'soy sauce', '1 tbsp', true FROM decision_os.meals WHERE canonical_key = 'cucumber-sesame-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'sesame seeds', '1 tbsp', true FROM decision_os.meals WHERE canonical_key = 'cucumber-sesame-salad';

-- Hummus Veggie Wrap
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'flour tortilla', '1 large', false FROM decision_os.meals WHERE canonical_key = 'hummus-veggie-wrap';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'hummus', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'hummus-veggie-wrap';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cucumber', '1/2', false FROM decision_os.meals WHERE canonical_key = 'hummus-veggie-wrap';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tomato', '1/2', false FROM decision_os.meals WHERE canonical_key = 'hummus-veggie-wrap';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'feta cheese', '2 tbsp', false FROM decision_os.meals WHERE canonical_key = 'hummus-veggie-wrap';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'spinach', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'hummus-veggie-wrap';

-- Greek Salad
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cucumber', '1', false FROM decision_os.meals WHERE canonical_key = 'greek-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tomato', '2', false FROM decision_os.meals WHERE canonical_key = 'greek-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'red onion', '1/4', false FROM decision_os.meals WHERE canonical_key = 'greek-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'kalamata olives', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'greek-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'feta cheese', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'greek-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'greek-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lemon', '1/2', false FROM decision_os.meals WHERE canonical_key = 'greek-salad';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'dried oregano', '1/2 tsp', true FROM decision_os.meals WHERE canonical_key = 'greek-salad';

-- Avocado Toast
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bread', '2 slices', false FROM decision_os.meals WHERE canonical_key = 'avocado-toast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'avocado', '1', false FROM decision_os.meals WHERE canonical_key = 'avocado-toast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lime', '1/2', false FROM decision_os.meals WHERE canonical_key = 'avocado-toast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'red pepper flakes', 'pinch', true FROM decision_os.meals WHERE canonical_key = 'avocado-toast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'salt', 'to taste', true FROM decision_os.meals WHERE canonical_key = 'avocado-toast';

-- PB Banana Sandwich
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bread', '2 slices', false FROM decision_os.meals WHERE canonical_key = 'pb-banana-sandwich';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'peanut butter', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'pb-banana-sandwich';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'banana', '1', false FROM decision_os.meals WHERE canonical_key = 'pb-banana-sandwich';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'honey', '1 tsp', true FROM decision_os.meals WHERE canonical_key = 'pb-banana-sandwich';

-- Tuna Salad with Crackers
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'canned tuna', '1 can', true FROM decision_os.meals WHERE canonical_key = 'tuna-salad-crackers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mayonnaise', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'tuna-salad-crackers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'celery', '1 stalk', false FROM decision_os.meals WHERE canonical_key = 'tuna-salad-crackers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lemon juice', '1 tsp', true FROM decision_os.meals WHERE canonical_key = 'tuna-salad-crackers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'crackers', '1 sleeve', true FROM decision_os.meals WHERE canonical_key = 'tuna-salad-crackers';

-- Microwave Baked Potato
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'russet potato', '1 large', false FROM decision_os.meals WHERE canonical_key = 'microwave-baked-potato';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'butter', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'microwave-baked-potato';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'sour cream', '2 tbsp', false FROM decision_os.meals WHERE canonical_key = 'microwave-baked-potato';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shredded cheese', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'microwave-baked-potato';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chives', '1 tbsp', false FROM decision_os.meals WHERE canonical_key = 'microwave-baked-potato';

-- Fruit & Yogurt Bowl
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'Greek yogurt', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'fruit-yogurt-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mixed berries', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'fruit-yogurt-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'granola', '1/4 cup', true FROM decision_os.meals WHERE canonical_key = 'fruit-yogurt-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'honey', '1 tbsp', true FROM decision_os.meals WHERE canonical_key = 'fruit-yogurt-bowl';

-- Pan-Seared Chicken Breast
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken breast', '2', false FROM decision_os.meals WHERE canonical_key = 'pan-seared-chicken-breast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'pan-seared-chicken-breast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'salt', 'to taste', true FROM decision_os.meals WHERE canonical_key = 'pan-seared-chicken-breast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pepper', 'to taste', true FROM decision_os.meals WHERE canonical_key = 'pan-seared-chicken-breast';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mixed vegetables', '2 cups', false FROM decision_os.meals WHERE canonical_key = 'pan-seared-chicken-breast';

-- Turkey Burger
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'ground turkey', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'turkey-burger';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'burger buns', '4', false FROM decision_os.meals WHERE canonical_key = 'turkey-burger';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lettuce', '4 leaves', false FROM decision_os.meals WHERE canonical_key = 'turkey-burger';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tomato', '1', false FROM decision_os.meals WHERE canonical_key = 'turkey-burger';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'onion', '1/2', false FROM decision_os.meals WHERE canonical_key = 'turkey-burger';

-- Sheet Pan Sausage & Veggies
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'Italian sausage', '4 links', false FROM decision_os.meals WHERE canonical_key = 'sheet-pan-sausage-veggies';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bell peppers', '2', false FROM decision_os.meals WHERE canonical_key = 'sheet-pan-sausage-veggies';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'zucchini', '1', false FROM decision_os.meals WHERE canonical_key = 'sheet-pan-sausage-veggies';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'red onion', '1', false FROM decision_os.meals WHERE canonical_key = 'sheet-pan-sausage-veggies';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'sheet-pan-sausage-veggies';

-- Chicken Fajitas
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken breast', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'chicken-fajitas';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bell peppers', '2', false FROM decision_os.meals WHERE canonical_key = 'chicken-fajitas';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'onion', '1', false FROM decision_os.meals WHERE canonical_key = 'chicken-fajitas';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'flour tortillas', '8', false FROM decision_os.meals WHERE canonical_key = 'chicken-fajitas';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'fajita seasoning', '1 packet', true FROM decision_os.meals WHERE canonical_key = 'chicken-fajitas';

-- Black Bean Tacos
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'black beans', '1 can', true FROM decision_os.meals WHERE canonical_key = 'black-bean-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'onion', '1/2', false FROM decision_os.meals WHERE canonical_key = 'black-bean-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '2 cloves', false FROM decision_os.meals WHERE canonical_key = 'black-bean-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'taco shells', '8', false FROM decision_os.meals WHERE canonical_key = 'black-bean-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'avocado', '1', false FROM decision_os.meals WHERE canonical_key = 'black-bean-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'salsa', '1/2 cup', true FROM decision_os.meals WHERE canonical_key = 'black-bean-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cumin', '1 tsp', true FROM decision_os.meals WHERE canonical_key = 'black-bean-tacos';

-- Burrito Bowl
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice', '2 cups cooked', true FROM decision_os.meals WHERE canonical_key = 'burrito-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'black beans', '1 can', true FROM decision_os.meals WHERE canonical_key = 'burrito-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken breast', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'burrito-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'corn', '1/2 cup', true FROM decision_os.meals WHERE canonical_key = 'burrito-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'salsa', '1/2 cup', true FROM decision_os.meals WHERE canonical_key = 'burrito-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shredded cheese', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'burrito-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'sour cream', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'burrito-bowl';

-- Pasta Marinara
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pasta', '1/2 lb', true FROM decision_os.meals WHERE canonical_key = 'pasta-marinara';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'marinara sauce', '2 cups', true FROM decision_os.meals WHERE canonical_key = 'pasta-marinara';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '2 cloves', false FROM decision_os.meals WHERE canonical_key = 'pasta-marinara';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'parmesan cheese', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'pasta-marinara';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'fresh basil', '2 tbsp', false FROM decision_os.meals WHERE canonical_key = 'pasta-marinara';

-- Chicken Parmesan
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken breast', '2', false FROM decision_os.meals WHERE canonical_key = 'chicken-parmesan';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'breadcrumbs', '1 cup', true FROM decision_os.meals WHERE canonical_key = 'chicken-parmesan';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'eggs', '2', false FROM decision_os.meals WHERE canonical_key = 'chicken-parmesan';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'marinara sauce', '1 cup', true FROM decision_os.meals WHERE canonical_key = 'chicken-parmesan';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mozzarella cheese', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'chicken-parmesan';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pasta', '1/2 lb', true FROM decision_os.meals WHERE canonical_key = 'chicken-parmesan';

-- Pesto Pasta with Cherry Tomatoes
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pasta', '1/2 lb', true FROM decision_os.meals WHERE canonical_key = 'pesto-pasta-cherry-tomatoes';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pesto sauce', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'pesto-pasta-cherry-tomatoes';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cherry tomatoes', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'pesto-pasta-cherry-tomatoes';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'parmesan cheese', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'pesto-pasta-cherry-tomatoes';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pine nuts', '2 tbsp', false FROM decision_os.meals WHERE canonical_key = 'pesto-pasta-cherry-tomatoes';

-- Italian Sausage & Peppers
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'Italian sausage', '4 links', false FROM decision_os.meals WHERE canonical_key = 'italian-sausage-peppers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bell peppers', '3', false FROM decision_os.meals WHERE canonical_key = 'italian-sausage-peppers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'onion', '1', false FROM decision_os.meals WHERE canonical_key = 'italian-sausage-peppers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'hoagie rolls', '4', false FROM decision_os.meals WHERE canonical_key = 'italian-sausage-peppers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'italian-sausage-peppers';

-- Chicken Stir-Fry
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken breast', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'chicken-stir-fry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mixed vegetables', '3 cups', false FROM decision_os.meals WHERE canonical_key = 'chicken-stir-fry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'soy sauce', '3 tbsp', true FROM decision_os.meals WHERE canonical_key = 'chicken-stir-fry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '3 cloves', false FROM decision_os.meals WHERE canonical_key = 'chicken-stir-fry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice', '2 cups cooked', true FROM decision_os.meals WHERE canonical_key = 'chicken-stir-fry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'vegetable oil', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'chicken-stir-fry';

-- Beef & Broccoli
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'beef sirloin', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'beef-broccoli';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'broccoli', '4 cups', false FROM decision_os.meals WHERE canonical_key = 'beef-broccoli';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'soy sauce', '3 tbsp', true FROM decision_os.meals WHERE canonical_key = 'beef-broccoli';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '3 cloves', false FROM decision_os.meals WHERE canonical_key = 'beef-broccoli';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'ginger', '1 inch', false FROM decision_os.meals WHERE canonical_key = 'beef-broccoli';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice', '2 cups cooked', true FROM decision_os.meals WHERE canonical_key = 'beef-broccoli';

-- Teriyaki Salmon
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'salmon fillets', '2', false FROM decision_os.meals WHERE canonical_key = 'teriyaki-salmon';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'teriyaki sauce', '1/4 cup', true FROM decision_os.meals WHERE canonical_key = 'teriyaki-salmon';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice', '2 cups cooked', true FROM decision_os.meals WHERE canonical_key = 'teriyaki-salmon';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'steamed vegetables', '2 cups', false FROM decision_os.meals WHERE canonical_key = 'teriyaki-salmon';

-- Pad Thai Style Noodles
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice noodles', '8 oz', true FROM decision_os.meals WHERE canonical_key = 'pad-thai-style-noodles';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'eggs', '2', false FROM decision_os.meals WHERE canonical_key = 'pad-thai-style-noodles';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tofu', '8 oz', false FROM decision_os.meals WHERE canonical_key = 'pad-thai-style-noodles';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bean sprouts', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'pad-thai-style-noodles';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'peanuts', '1/4 cup', true FROM decision_os.meals WHERE canonical_key = 'pad-thai-style-noodles';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lime', '1', false FROM decision_os.meals WHERE canonical_key = 'pad-thai-style-noodles';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'fish sauce', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'pad-thai-style-noodles';

-- Shrimp Fried Rice
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shrimp', '1/2 lb', false FROM decision_os.meals WHERE canonical_key = 'fried-rice-shrimp';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cooked rice', '3 cups', true FROM decision_os.meals WHERE canonical_key = 'fried-rice-shrimp';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'eggs', '2', false FROM decision_os.meals WHERE canonical_key = 'fried-rice-shrimp';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'frozen peas', '1/2 cup', true FROM decision_os.meals WHERE canonical_key = 'fried-rice-shrimp';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'carrots', '1/2 cup diced', false FROM decision_os.meals WHERE canonical_key = 'fried-rice-shrimp';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'soy sauce', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'fried-rice-shrimp';

-- Greek Chicken Rice Bowl
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken breast', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'greek-chicken-rice-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice', '2 cups cooked', true FROM decision_os.meals WHERE canonical_key = 'greek-chicken-rice-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cucumber', '1', false FROM decision_os.meals WHERE canonical_key = 'greek-chicken-rice-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tomato', '1', false FROM decision_os.meals WHERE canonical_key = 'greek-chicken-rice-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'feta cheese', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'greek-chicken-rice-bowl';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tzatziki sauce', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'greek-chicken-rice-bowl';

-- Falafel Pita
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'falafel', '8 pieces', false FROM decision_os.meals WHERE canonical_key = 'falafel-pita';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pita bread', '4', false FROM decision_os.meals WHERE canonical_key = 'falafel-pita';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lettuce', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'falafel-pita';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tomato', '1', false FROM decision_os.meals WHERE canonical_key = 'falafel-pita';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cucumber', '1/2', false FROM decision_os.meals WHERE canonical_key = 'falafel-pita';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'tahini sauce', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'falafel-pita';

-- French Omelette
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'eggs', '3', false FROM decision_os.meals WHERE canonical_key = 'french-omelette';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'butter', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'french-omelette';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cheese', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'french-omelette';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'fresh herbs', '1 tbsp', false FROM decision_os.meals WHERE canonical_key = 'french-omelette';

-- Grilled Cheese & Tomato Soup
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bread', '4 slices', false FROM decision_os.meals WHERE canonical_key = 'grilled-cheese-tomato-soup';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cheese slices', '4', false FROM decision_os.meals WHERE canonical_key = 'grilled-cheese-tomato-soup';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'butter', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'grilled-cheese-tomato-soup';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'canned tomato soup', '1 can', true FROM decision_os.meals WHERE canonical_key = 'grilled-cheese-tomato-soup';

-- Fish Tacos
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'white fish fillets', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'fish-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'flour tortillas', '8', false FROM decision_os.meals WHERE canonical_key = 'fish-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cabbage', '2 cups shredded', false FROM decision_os.meals WHERE canonical_key = 'fish-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lime', '2', false FROM decision_os.meals WHERE canonical_key = 'fish-tacos';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'sour cream', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'fish-tacos';

-- Baked Chicken Thighs
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken thighs', '4', false FROM decision_os.meals WHERE canonical_key = 'baked-chicken-thighs';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'baked-chicken-thighs';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic powder', '1 tsp', true FROM decision_os.meals WHERE canonical_key = 'baked-chicken-thighs';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'paprika', '1 tsp', true FROM decision_os.meals WHERE canonical_key = 'baked-chicken-thighs';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mixed vegetables', '3 cups', false FROM decision_os.meals WHERE canonical_key = 'baked-chicken-thighs';

-- Spaghetti Bolognese
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'ground beef', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'spaghetti-bolognese';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'spaghetti', '1/2 lb', true FROM decision_os.meals WHERE canonical_key = 'spaghetti-bolognese';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'crushed tomatoes', '1 can', true FROM decision_os.meals WHERE canonical_key = 'spaghetti-bolognese';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'onion', '1', false FROM decision_os.meals WHERE canonical_key = 'spaghetti-bolognese';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '3 cloves', false FROM decision_os.meals WHERE canonical_key = 'spaghetti-bolognese';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'parmesan cheese', '1/4 cup', false FROM decision_os.meals WHERE canonical_key = 'spaghetti-bolognese';

-- Baked Salmon with Vegetables
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'salmon fillets', '2', false FROM decision_os.meals WHERE canonical_key = 'baked-salmon-vegetables';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'asparagus', '1 bunch', false FROM decision_os.meals WHERE canonical_key = 'baked-salmon-vegetables';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'cherry tomatoes', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'baked-salmon-vegetables';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'baked-salmon-vegetables';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lemon', '1', false FROM decision_os.meals WHERE canonical_key = 'baked-salmon-vegetables';

-- Homemade Pizza
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pizza dough', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'homemade-pizza';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'marinara sauce', '1/2 cup', true FROM decision_os.meals WHERE canonical_key = 'homemade-pizza';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mozzarella cheese', '2 cups', false FROM decision_os.meals WHERE canonical_key = 'homemade-pizza';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'pepperoni', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'homemade-pizza';

-- Chicken Curry
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken thighs', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'chicken-curry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'onion', '1', false FROM decision_os.meals WHERE canonical_key = 'chicken-curry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'coconut milk', '1 can', true FROM decision_os.meals WHERE canonical_key = 'chicken-curry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'curry powder', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'chicken-curry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '3 cloves', false FROM decision_os.meals WHERE canonical_key = 'chicken-curry';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice', '2 cups cooked', true FROM decision_os.meals WHERE canonical_key = 'chicken-curry';

-- Beef Tacos from Scratch
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'ground beef', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'beef-tacos-homemade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'onion', '1', false FROM decision_os.meals WHERE canonical_key = 'beef-tacos-homemade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'taco seasoning', '1 packet', true FROM decision_os.meals WHERE canonical_key = 'beef-tacos-homemade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'diced tomatoes', '1 can', true FROM decision_os.meals WHERE canonical_key = 'beef-tacos-homemade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'taco shells', '12', false FROM decision_os.meals WHERE canonical_key = 'beef-tacos-homemade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shredded cheese', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'beef-tacos-homemade';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lettuce', '2 cups', false FROM decision_os.meals WHERE canonical_key = 'beef-tacos-homemade';

-- Roasted Chicken & Potatoes
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken pieces', '2 lbs', false FROM decision_os.meals WHERE canonical_key = 'roasted-chicken-potatoes';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'potatoes', '1.5 lbs', false FROM decision_os.meals WHERE canonical_key = 'roasted-chicken-potatoes';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'olive oil', '3 tbsp', true FROM decision_os.meals WHERE canonical_key = 'roasted-chicken-potatoes';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rosemary', '2 sprigs', false FROM decision_os.meals WHERE canonical_key = 'roasted-chicken-potatoes';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '4 cloves', false FROM decision_os.meals WHERE canonical_key = 'roasted-chicken-potatoes';

-- Vegetable Lasagna
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lasagna noodles', '12', true FROM decision_os.meals WHERE canonical_key = 'vegetable-lasagna';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'ricotta cheese', '15 oz', false FROM decision_os.meals WHERE canonical_key = 'vegetable-lasagna';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'spinach', '10 oz frozen', false FROM decision_os.meals WHERE canonical_key = 'vegetable-lasagna';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'marinara sauce', '3 cups', true FROM decision_os.meals WHERE canonical_key = 'vegetable-lasagna';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'mozzarella cheese', '2 cups', false FROM decision_os.meals WHERE canonical_key = 'vegetable-lasagna';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'eggs', '1', false FROM decision_os.meals WHERE canonical_key = 'vegetable-lasagna';

-- Shrimp Scampi
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shrimp', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'shrimp-scampi';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'linguine', '1/2 lb', true FROM decision_os.meals WHERE canonical_key = 'shrimp-scampi';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garlic', '6 cloves', false FROM decision_os.meals WHERE canonical_key = 'shrimp-scampi';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'butter', '4 tbsp', true FROM decision_os.meals WHERE canonical_key = 'shrimp-scampi';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'white wine', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'shrimp-scampi';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'lemon', '1', false FROM decision_os.meals WHERE canonical_key = 'shrimp-scampi';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'parsley', '2 tbsp', false FROM decision_os.meals WHERE canonical_key = 'shrimp-scampi';

-- Stuffed Peppers
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'bell peppers', '4', false FROM decision_os.meals WHERE canonical_key = 'stuffed-peppers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'ground beef', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'stuffed-peppers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'rice', '1 cup cooked', true FROM decision_os.meals WHERE canonical_key = 'stuffed-peppers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'diced tomatoes', '1 can', true FROM decision_os.meals WHERE canonical_key = 'stuffed-peppers';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'shredded cheese', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'stuffed-peppers';

-- Chicken Tikka Masala
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'chicken breast', '1.5 lbs', false FROM decision_os.meals WHERE canonical_key = 'chicken-tikka-masala';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'plain yogurt', '1/2 cup', false FROM decision_os.meals WHERE canonical_key = 'chicken-tikka-masala';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'heavy cream', '1 cup', false FROM decision_os.meals WHERE canonical_key = 'chicken-tikka-masala';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'crushed tomatoes', '1 can', true FROM decision_os.meals WHERE canonical_key = 'chicken-tikka-masala';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'garam masala', '2 tbsp', true FROM decision_os.meals WHERE canonical_key = 'chicken-tikka-masala';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'basmati rice', '2 cups cooked', true FROM decision_os.meals WHERE canonical_key = 'chicken-tikka-masala';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'naan bread', '2', false FROM decision_os.meals WHERE canonical_key = 'chicken-tikka-masala';

-- Quick Beef Stew
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'beef stew meat', '1 lb', false FROM decision_os.meals WHERE canonical_key = 'beef-stew-quick';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'potatoes', '2 large', false FROM decision_os.meals WHERE canonical_key = 'beef-stew-quick';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'carrots', '3', false FROM decision_os.meals WHERE canonical_key = 'beef-stew-quick';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'onion', '1', false FROM decision_os.meals WHERE canonical_key = 'beef-stew-quick';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'beef broth', '4 cups', true FROM decision_os.meals WHERE canonical_key = 'beef-stew-quick';
INSERT INTO decision_os.meal_ingredients (meal_id, ingredient_name, qty_text, is_pantry_staple) 
SELECT id, 'crusty bread', '1 loaf', false FROM decision_os.meals WHERE canonical_key = 'beef-stew-quick';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    meal_count INTEGER;
    ingredient_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO meal_count FROM decision_os.meals;
    SELECT COUNT(*) INTO ingredient_count FROM decision_os.meal_ingredients;
    
    ASSERT meal_count = 50, 
           format('Expected 50 meals, got %s', meal_count);
    
    ASSERT ingredient_count > 200, 
           format('Expected >200 ingredients, got %s', ingredient_count);
    
    -- Verify all meals have at least 2 ingredients
    ASSERT NOT EXISTS (
        SELECT m.id 
        FROM decision_os.meals m
        LEFT JOIN decision_os.meal_ingredients mi ON m.id = mi.meal_id
        GROUP BY m.id
        HAVING COUNT(mi.id) < 2
    ), 'All meals must have at least 2 ingredients';
    
    RAISE NOTICE 'Seed verification passed: % meals, % ingredients', meal_count, ingredient_count;
END $$;

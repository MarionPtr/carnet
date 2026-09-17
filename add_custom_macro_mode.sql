-- Ajoute le mode de saisie des objectifs manuels (grammes, ou kcal + %)
alter table profile add column if not exists custom_mode text default 'grams';
alter table profile add column if not exists custom_pct_protein numeric default 30;
alter table profile add column if not exists custom_pct_carbs numeric default 40;
alter table profile add column if not exists custom_pct_fat numeric default 30;

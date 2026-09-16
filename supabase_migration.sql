-- 1. Table dédiée aux catégories d'ingrédients
create table if not exists categories (
  id text primary key,
  name text not null unique,
  created_at timestamptz default now()
);

insert into categories (id, name) values
  ('condiment', 'condiment'),
  ('dessert', 'dessert'),
  ('epice', 'epice'),
  ('feculent', 'feculent'),
  ('fromage', 'fromage'),
  ('fruit', 'fruit'),
  ('legume', 'legume'),
  ('legumineuse', 'legumineuse'),
  ('proteine', 'Proteine')
on conflict (id) do nothing;

-- 2. Séparer le journal (logs) par personne
alter table logs add column if not exists person_id text default 'person1';
update logs set person_id = 'person1' where person_id is null;

-- 3. Nom affichable pour chaque profil
alter table profile add column if not exists display_name text;

-- 4. Créer/écraser le profil person1 avec une copie de l'existant 'default'
--    (do update pour ne pas garder un person1 vide créé automatiquement par l'app avant cette migration)
insert into profile (id, weight, height, age, sex, activity, goal, use_custom, custom_kcal, custom_protein, custom_carbs, custom_fat, display_name)
select 'person1', weight, height, age, sex, activity, goal, use_custom, custom_kcal, custom_protein, custom_carbs, custom_fat, 'Personne 1'
from profile where id = 'default'
on conflict (id) do update set
  weight = excluded.weight,
  height = excluded.height,
  age = excluded.age,
  sex = excluded.sex,
  activity = excluded.activity,
  goal = excluded.goal,
  use_custom = excluded.use_custom,
  custom_kcal = excluded.custom_kcal,
  custom_protein = excluded.custom_protein,
  custom_carbs = excluded.custom_carbs,
  custom_fat = excluded.custom_fat,
  display_name = coalesce(profile.display_name, excluded.display_name);

insert into profile (id, weight, height, age, sex, activity, goal, use_custom, custom_kcal, custom_protein, custom_carbs, custom_fat, display_name)
values ('person2', 70, 175, 30, 'f', 1.375, 'maintain', false, 2000, 130, 220, 65, 'Personne 2')
on conflict (id) do update set display_name = coalesce(profile.display_name, excluded.display_name);

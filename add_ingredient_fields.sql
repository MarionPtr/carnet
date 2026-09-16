-- Ajoute l'unité (g ou ml) et les acides gras saturés aux ingrédients
alter table ingredients add column if not exists unit text default 'g';
alter table ingredients add column if not exists saturated_fat numeric default 0;

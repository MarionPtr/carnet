-- Permet de définir plusieurs portions par ingrédient (en plus de la portion principale)
alter table ingredients add column if not exists extra_portions jsonb default '[]'::jsonb;

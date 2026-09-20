-- Permet de marquer une recette comme favorite
alter table recipes add column if not exists is_favorite boolean default false;

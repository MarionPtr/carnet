-- Ajoute le statut favori aux ingrédients
alter table ingredients add column if not exists is_favorite boolean default false;

-- Ajoute le repas (petit-dej / dejeuner / diner / snacks) associé à chaque entrée du journal
alter table logs add column if not exists meal text default 'snacks';

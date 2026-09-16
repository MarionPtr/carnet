-- Ajoute le grammage numérique de la portion, exploitable pour le calcul
-- (le champ serving_size existant reste le libellé libre, ex: "1 yaourt")
alter table ingredients add column if not exists serving_size_grams numeric;

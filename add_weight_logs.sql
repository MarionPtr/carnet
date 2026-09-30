-- Suivi du poids : une ligne par pesée, par personne.
-- Une seule pesée par jour et par personne (ajouter une pesée un jour déjà
-- enregistré remplace l'ancienne valeur de ce jour-là, plutôt que d'en créer une deuxième).
create table if not exists weight_logs (
  id text primary key default gen_random_uuid()::text,
  person_id text not null,
  log_date date not null,
  weight numeric not null,
  created_at timestamptz default now(),
  unique (person_id, log_date)
);

-- Même politique d'accès que les autres tables de l'app (voir enable_rls.sql) :
-- usage strictement personnel, clé anon, pas de comptes séparés.
alter table weight_logs enable row level security;
drop policy if exists "allow anon all" on weight_logs;
create policy "allow anon all" on weight_logs for all to anon using (true) with check (true);

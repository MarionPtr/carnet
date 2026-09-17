-- Unifie la portion principale et les portions supplémentaires dans un seul champ "portions"
alter table ingredients add column if not exists portions jsonb default '[]'::jsonb;

update ingredients
set portions = (
  case when serving_size_grams is not null then
    jsonb_build_array(jsonb_build_object('name', coalesce(serving_size, '1 portion'), 'grams', serving_size_grams))
  else '[]'::jsonb
  end
) || coalesce(extra_portions, '[]'::jsonb)
where portions is null or portions = '[]'::jsonb;

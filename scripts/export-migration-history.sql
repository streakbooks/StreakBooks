begin read only;

select coalesce(
  json_agg(
    json_build_object('version', history.version, 'name', to_jsonb(history)->>'name')
    order by history.version
  ),
  '[]'::json
)
from supabase_migrations.schema_migrations as history;

commit;

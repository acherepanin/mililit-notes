alter table "users"
  add column if not exists "panel_opacity" integer not null default 78,
  add column if not exists "background_motion" boolean not null default true,
  add column if not exists "starfall" boolean not null default true,
  add column if not exists "editor_content_width" integer not null default 920,
  add column if not exists "editor_page_padding" integer not null default 24,
  add column if not exists "editor_block_spacing" integer not null default 12,
  add column if not exists "preferred_ai_model" text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_panel_opacity_check') then
    alter table "users" add constraint "users_panel_opacity_check" check ("panel_opacity" between 35 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_editor_content_width_check') then
    alter table "users" add constraint "users_editor_content_width_check" check ("editor_content_width" between 560 and 1200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_editor_page_padding_check') then
    alter table "users" add constraint "users_editor_page_padding_check" check ("editor_page_padding" between 8 and 64);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_editor_block_spacing_check') then
    alter table "users" add constraint "users_editor_block_spacing_check" check ("editor_block_spacing" between 4 and 32);
  end if;
end $$;

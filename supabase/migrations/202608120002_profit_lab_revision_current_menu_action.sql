-- Permit the audited Current Menu import revision without relaxing other actions.
alter table public.profit_lab_recipe_revisions
  drop constraint if exists profit_lab_recipe_revisions_action_check;

alter table public.profit_lab_recipe_revisions
  add constraint profit_lab_recipe_revisions_action_check
  check (action in ('saved','deleted','current_menu_import')) not valid;

alter table public.profit_lab_recipe_revisions
  validate constraint profit_lab_recipe_revisions_action_check;

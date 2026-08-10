-- PostgreSQL requires enum additions to commit before the value is referenced.
alter type public.app_role add value if not exists 'bar_lead';

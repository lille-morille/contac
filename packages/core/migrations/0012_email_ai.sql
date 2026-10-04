ALTER TABLE public.checkin_ai_settings
  ADD COLUMN email_draft_enabled boolean NOT NULL DEFAULT false;

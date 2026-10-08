ALTER TABLE public.inbound_suggestions
  ADD COLUMN recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN extracted_emails jsonb NOT NULL DEFAULT '[]'::jsonb;

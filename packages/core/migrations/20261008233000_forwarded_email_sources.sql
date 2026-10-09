ALTER TABLE public.inbound_emails
  ADD COLUMN raw_mime_base64 text,
  ADD COLUMN forwarded_message jsonb,
  ADD COLUMN forwarded_intent boolean NOT NULL DEFAULT false;

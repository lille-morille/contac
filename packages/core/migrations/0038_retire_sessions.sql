-- The unused pre-production check-in workflow is retired, while team AI settings remain.
DROP TABLE public.checkin_sessions;
ALTER TABLE public.organizations DROP COLUMN sessions_enabled;
ALTER TABLE public.checkin_ai_settings DROP COLUMN enabled;
UPDATE public.checkin_ai_settings SET modes = modes - 'checkin_summary';

-- Existing requests become readable; every subsequent shared-log read still checks a live match.
UPDATE public.log_access_requests
SET status = 'approved', approved_at = COALESCE(approved_at, now())
WHERE status = 'pending';
ALTER TABLE public.organizations DROP COLUMN auto_share_logs;

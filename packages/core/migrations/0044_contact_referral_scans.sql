CREATE UNIQUE INDEX ai_referral_scan_version_unique
  ON public.ai_suggestions(org_id, contact_id, source_version)
  WHERE feature = 'contact_referral_scan';

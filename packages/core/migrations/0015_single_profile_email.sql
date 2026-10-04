-- The profile email is the only sender identity and Bcc matching address.
-- Preserve an address for any pre-onboarding account that had a sender address only.
UPDATE public.profiles p
SET profile_email = source.normalized_email
FROM (
  SELECT DISTINCT ON (user_id) user_id, normalized_email
  FROM public.sender_addresses
  ORDER BY user_id, is_default DESC, created_at ASC
) source
WHERE p.id = source.user_id AND p.profile_email IS NULL;

DROP TABLE public.sender_addresses;

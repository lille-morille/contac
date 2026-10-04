ALTER TABLE public.profiles
  ADD COLUMN profile_email text,
  ADD COLUMN avatar_path text,
  ADD COLUMN onboarded_at timestamptz;

-- Existing accounts predate this onboarding flow and stay usable.
UPDATE public.profiles SET onboarded_at = now();

CREATE UNIQUE INDEX profiles_profile_email_unique
  ON public.profiles (lower(profile_email))
  WHERE profile_email IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('profile-avatars', 'profile-avatars', true, 5242880)
ON CONFLICT (id) DO NOTHING;

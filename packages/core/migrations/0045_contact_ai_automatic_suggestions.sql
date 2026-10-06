UPDATE public.checkin_ai_settings AS settings
SET modes = (
    SELECT jsonb_object_agg(
      item.key,
      CASE
        WHEN item.key IN ('stikkord', 'contact_fields', 'hierarchy', 'contact_referral')
          AND item.value = '"manual"'::jsonb
        THEN '"suggest"'::jsonb
        ELSE item.value
      END
    )
    FROM jsonb_each(settings.modes) AS item(key, value)
  ),
  updated_at = now()
WHERE settings.modes->>'stikkord' = 'manual'
  OR settings.modes->>'contact_fields' = 'manual'
  OR settings.modes->>'hierarchy' = 'manual'
  OR settings.modes->>'contact_referral' = 'manual';

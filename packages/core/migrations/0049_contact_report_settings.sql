CREATE TABLE public.contact_report_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_report_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY contact_report_settings_team_select ON public.contact_report_settings
  FOR SELECT TO authenticated USING (public.can_read_team(org_id));
GRANT SELECT ON public.contact_report_settings TO authenticated;

CREATE TRIGGER contac_signal AFTER INSERT OR UPDATE OR DELETE ON public.contact_report_settings
  FOR EACH ROW EXECUTE FUNCTION public.contac_team_change_signal('contact_report_settings');

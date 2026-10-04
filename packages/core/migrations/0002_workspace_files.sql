-- Generic private storage for tenant files; no product-specific document types.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('workspace-files', 'workspace-files', false, 26214400)
ON CONFLICT (id) DO NOTHING;
CREATE TABLE public.workspace_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workspace_files_org_idx ON public.workspace_files(org_id);
ALTER TABLE public.workspace_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_files_member_select ON public.workspace_files FOR SELECT TO authenticated USING (public.is_org_member(org_id));
GRANT SELECT ON public.workspace_files TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_files;

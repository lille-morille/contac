-- Organization category is independent of a signed LOI. Old funnel/LOI labels
-- cannot safely imply customer, competitor, or partner, so leave them uncategorized.
ALTER TABLE public.companies ALTER COLUMN status DROP DEFAULT;
CREATE TYPE public.company_status_new AS ENUM ('ingen', 'kunde', 'konkurrent', 'samarbeidspartner');
ALTER TABLE public.companies
  ALTER COLUMN status TYPE public.company_status_new
  USING 'ingen'::public.company_status_new;
DROP TYPE public.company_status;
ALTER TYPE public.company_status_new RENAME TO company_status;
ALTER TABLE public.companies ALTER COLUMN status SET DEFAULT 'ingen';

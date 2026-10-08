-- Each organization belongs to at most one domain. The join table remains so
-- existing read paths and team-scoped access policies keep their shape.
-- There is no creation timestamp on company_domains, so retain the lowest
-- domain UUID for organizations with multiple links.
WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY company_id ORDER BY domain_id) AS position
  FROM public.company_domains
), removed AS (
  DELETE FROM public.company_domains AS link
  USING ranked
  WHERE link.ctid = ranked.ctid AND ranked.position > 1
  RETURNING link.company_id
)
UPDATE public.companies AS company
SET domains_revision = company.domains_revision + 1
WHERE company.id IN (SELECT company_id FROM removed);

CREATE UNIQUE INDEX company_domains_company_unique
  ON public.company_domains(company_id);

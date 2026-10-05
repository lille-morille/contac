-- Pre-production simplification: organization directly owns each contact.
ALTER TABLE public.contacts DROP COLUMN department_id;
ALTER TABLE public.contacts DROP COLUMN position;
DROP TABLE public.departments;

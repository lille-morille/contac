-- Preserve existing role and department context in the remaining description.
UPDATE public.contacts AS contact
SET description = concat_ws(E'\n',
  NULLIF(BTRIM(contact.description), ''),
  CASE WHEN NULLIF(BTRIM(contact.position), '') IS NOT NULL
    THEN 'Stilling: ' || BTRIM(contact.position) END,
  (SELECT 'Avdeling: ' || department.name
   FROM public.departments AS department
   WHERE department.id = contact.department_id)
)
WHERE NULLIF(BTRIM(contact.position), '') IS NOT NULL
   OR contact.department_id IS NOT NULL;

-- Contacts link directly to an organization, without a department relation.
ALTER TABLE public.contacts DROP COLUMN department_id;
ALTER TABLE public.contacts DROP COLUMN position;
DROP TABLE public.departments;

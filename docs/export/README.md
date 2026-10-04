# YAML contact-log contract (v1)

Download `kontaktlogg.yaml` from any contact page. The file contains one team, a list of non-duplicate contacts, and a chronological list of activities. Each activity occurs exactly once. `exportOwnerContactId` is one of its `linkedContactIds`; all linked contacts remain listed even when the activity is printed under one owner.

The top-level keys are `schemaVersion`, `team`, `contacts`, and `activities`. `team` has `id` and `name`. Each contact carries identifying fields, organization/department, status, assignee ID, person tags, and organization domains. Each activity carries its kind and timestamps, creator ID, export owner, all linked IDs, complete summary and transcript, missed-call outcome, AI override, email headers when present, and attachment metadata (`id`, name, MIME type, size). Binary attachment bytes are not embedded in YAML. Shared research notes and confirmed duplicate contacts are excluded.

[`kontaktlogg.typ`](kontaktlogg.typ) is a minimal example of importing the YAML and constructing a table. Put it beside the exported file and run `typst compile kontaktlogg.typ kontaktlogg.pdf`. Adapt its columns and layout for the university's final document.

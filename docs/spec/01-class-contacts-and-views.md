# 01 — Class, teams, contacts, organizations, and views

**Status:** Chunk 01 implemented in the workspace. The detailed activity, email, AI/search, export, and LOI workflows remain in later chunks.

## Images for this chunk

- [Organization hierarchy wireframe](../wireframes/organization-map.png) — top-down layout with separate, color-matched domain links.
- [Linear board and saved-view reference](../references/linear-board-views.png) and [full status-board reference](../references/linear-board-all-statuses.png) — interaction and density references; their labels are not additional product statuses.
- [Linear contact-detail reference](../references/linear-contact-detail.png) — main activity area and right-hand Related layout.

## Purpose and roles

The class is the outer workspace. A class admin creates teams, sends the initial invite links, and has full permission to read, edit, and change settings across the class. Each team has an admin and members. Once a team exists, its admin can invite other members with secret join links. Team members can read and edit all of their team's contacts, organizations, public notes, and activities. Assignment denotes follow-up responsibility, not edit ownership. Invited people create accounts through a secret link and receive a recovery code. On first sign-in they must provide their name, a unique profile email address, and a profile photo before using the workspace. Existing accounts without photos show a default person icon until updated. Onboarding tells users to enter the address they send email to contacts from; it will match sent emails to their account and is not used for login. Recovery-code login remains in place. See spec 03 for sender attribution.

An account's recovery code must remain available for copying in profile settings. Losing a browser/device without the code may mean losing access. Class admin authority is intentionally broad for technical help to teams.

## Contact record

- Required: name and organization/institution/company. Choose an existing organization in a combobox or create a new organization inline.
- Optional: email, phone, position, department, short description, person tags (for example `Ildsjelen`, `Beslutningstaker`, `Portvokter`, `Bruker`).
- Team person tags have a name and a description explaining the concrete criteria for applying them. The team settings page lets administrators add tags with descriptions and fill in descriptions for older tags. Existing undescribed tags remain available for manual selection.
- Domain tags also have a description explaining which organizations belong there. Domain creation asks for this description, and team settings lets administrators describe older domains. People may still attach an older undescribed domain manually.
- Exactly one current organization; department may be absent. This is a static snapshot model, with no employment history or multiple simultaneous organizations.
- Each contact belongs to one team. A contact's third-party AI permission defaults to allowed, unless the team changes its default; see spec 04.
- Contact statuses are manually chosen, with quick activity actions allowed to make an explicit status change. The seven normal statuses are `Ikke kontaktet`, `Avsluttet`, `Kan kontaktes igjen`, `Skal ringe`, `Venter på svar`, `Follow up / Ring igjen`, and `Ikke kontakt igjen`. `Duplicate` is an eighth archival status reached only by the confirmed duplicate flow.
- New contacts start in `Ikke kontaktet` and have no assignee. The member who first changes the status out of `Ikke kontaktet` becomes assignee. Later activity or edits by another member do not reassign the contact. Assignment can be changed manually.
- No status-specific due date is required. Personal reminders are separate; see spec 02.

Quick creation from the home/board screen accepts pasted text. Detect email and phone and fill those fields. Remove detected email/phone from the string; if the remainder is at most 50 characters, show it as a clickable suggestion below the name and organization fields, without auto-filling either. If it is longer than 50 characters, drop that suggestion. Manual contact creation uses a simple form; tags are optional and may later be inferred by enabled AI.

The creation form has **Legg til** and **Legg til og åpne** actions. The first keeps the current page open. When its board or list shows the new contact, smoothly scroll both axes to its card or row and briefly highlight it; if the contact is hidden in that view, show a confirmation with an action to open it. The second action opens the new contact's detail page directly.

## Organizations, departments, and hierarchy

Organizations are database records, not free-text labels on every contact. An organization has a fixed, single-choice status list (examples given during discovery: `Ikke relevant`, `Relevant`, `Potensiell kunde`, `Signert intensjonsavtale`); the exact initial set needs review. Organizations may have multiple top-level domain tags, or none. Example domains: `Gruvedrift`, `Juridisk`, `Advokatfirmaer`, `Statlig`, `Helse`. Domain tags form a many-to-many relation with organizations. Departments are optional children of one organization; a person with no department appears directly beneath the organization.

On a contact page, the department field lists departments for that contact's organization and offers **Ny avdeling**. Creating one from there immediately assigns the contact to it. An exact existing name is reused rather than creating a duplicate.

The graphical hierarchy view browses **downward, from top to bottom**: domain → organization → optional department → contact. Nodes at successive levels sit below their parents; the layout must not fan outward from a central organization. Because an organization can have multiple domains, multiple domain nodes may point downward to the **same** organization node without creating duplicate records. Each domain gets a consistent assigned color from the existing design palette. Draw a separate, direct line from each domain node to the organization, colored to match that domain; do not merge domain links into a shared junction or use right-angle arrows for these links. Apply the same domain color to its filter and tag chips while retaining text labels. Connections below the organization can remain neutral. A contact without a department connects directly beneath its organization. Contacts are leaf nodes and never contain other contacts. The contact detail sidebar groups other contacts linked to the same organization under its name. Person tags are independent of domain tags.

The hierarchy graph fills the available page height. A toolbar above it has a searchable domain combobox, **Vis alt** reset, and searchable organization combobox. There is one selection at a time: all, one domain, or one organization. Selecting a domain shows every linked organization in the graph; selecting an organization shows its hierarchy. When switching selections, nodes and links that remain visible move to their new positions with spring motion. Entering and leaving items animate smoothly, with a slight overshoot. Respect reduced-motion preferences.

The organization combobox always lists every organization, even while a domain is selected; the domain only filters the graph. Organizations are created inline while adding a contact, so the hierarchy page has no separate organization creation form. Domain creation starts in the domain combobox and then opens a color-selection dialog.

When creating a domain, choose from ten fixed palette colors in an unlabeled visual grid of equal-width, equal-height square swatches. Keep the chosen swatch visibly outlined and give every swatch an accessible color name. The chosen color is used consistently for that domain's graph links and indicators.

Contact nodes show the person's name and a short second line from their description, position, or department. Contacts sharing a department appear beneath one department node, which shows its contact count. Clicking a contact or organization opens an anchored detail popover beside its node, initially on the right and flipping left near the viewport edge. It must not cover its own node. The contact popover shows organization, department, position, short description, status, and available contact details; **Gå til kontakt** opens the full contact view. The organization popover shows status, domain tags, contacts, department creation, group findings, and its LOI entry point. Clicking the graph background or pressing Escape closes a popover.

## Duplicate workflow

Duplicate suggestions run within a team only. A matching name plus organization, phone, **or** email can produce a suggestion; none marks a duplicate automatically. A member chooses the primary contact in a side-by-side comparison. The comparison offers blank-field fills and replacement suggestions; the member selects what to apply. It also lists activities from both contacts and allows selecting activities to **move** to the primary. If a moved activity has other linked contacts, those links stay; only the duplicate contact link changes. The duplicate contact is then linked to the primary and marked `Duplicate`.

Duplicate contacts are kept for inspection in a dedicated navbar view but excluded from ordinary board/list views, search, AI context, and export. There is no `Duplicate` board column. Cross-team matches are handled as overlap alerts, not this duplicate workflow.

## Views and interaction

- **Board:** seven normal status columns, counts, compact cards, assignee and tags. Filtering and sorting follow the interaction style of the supplied Linear reference. The supplied screenshots' `Lead` column is not a product status.
- **List:** spreadsheet-style rows with inline editing of contact fields, a short contact description, and `stikkord` when available. Without `stikkord`, show the latest meeting/call summary or notes. Overflow expands on click. An action opens the full contact page.
- **Contact detail:** full fields, editable activity timeline, shared note, related organization contacts, duplicate relation, and applicable quick actions. The deterministic full contact log can be read here; see spec 05.
- **Mine kontakter:** contacts assigned to the current member **or** unassigned.
- **Sist endret:** a sort option in the main board/list view, rather than a separate navigation destination. It orders normal-status contacts by last change, including field/status/assignee changes, new or edited linked activities, and shared-note edits.
- **Sist kontaktet:** a chronological feed of meeting and phone activities that shows their content directly. It defaults to completed conversations; a checkbox can include missed calls. Filter by the linked contact's assignee: the current member, another member, unassigned, or all. A shared activity appears once, lists every linked contact, and can open the selected contact at that activity. Emails are added to this feed when email activities are implemented in spec 03.
- Filter, search, sorting, and board/list changes are kept as a local browser draft for the current member and team. **Lagre visning** opens a naming dialog and publishes the view to every member of that team. When editing a published view, its name is prefilled; publishing with the same name updates it, while a different name creates a new team view. A member may also select another existing team view to overwrite. Unpublished edits remain local until published. The normal views above serve as built-in views.

## Acceptance examples

1. A new `Ikke kontaktet` contact has no assignee. Member A moves it to `Skal ringe`; A becomes assignee. Member B edits the phone and logs a call; the call saves and B is asked whether to take over. A remains assignee if B declines.
2. Two contacts under the same organization record appear together in Related, even if neither has a department.
3. A confirmed duplicate disappears from ordinary views and search, but remains in the dedicated duplicates view, linked to its primary.
4. A member's Mine kontakter view includes their assigned contacts and the unassigned backlog.

## Decisions made for chunk 01

- The class admin creates each team, then issues a one-use invitation with the `teamadministrator` role for its first team admin. Team admins issue member invitations.
- The initial fixed organization statuses are `Ikke relevant`, `Relevant`, `Potensiell kunde`, and `Signert intensjonsavtale`, in that order.
- A single account may join more than one team; team-scoped data remain separate. Email routing in spec 03 must handle this explicitly.
- Quick paste takes the first detected email and phone. All detected email/phone strings are removed before considering the remaining text as a name/organization suggestion.

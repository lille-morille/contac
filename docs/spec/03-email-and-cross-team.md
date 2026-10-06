# 03 — Email drafts, inbound capture, and class-wide coordination

**Status:** Chunk 03 implemented locally. Depends on class/team/contact/activity models in specs 01–02. The application does not send email itself. Public MX and port 25 setup remain deployment configuration.

## Images for this chunk

- [Unified inbox wireframe](../wireframes/inbox.png) — email suggestions and access requests alongside reminders.
- [Linear contact-detail reference](../references/linear-contact-detail.png) — right-hand area that can carry related contacts and cross-team overlap metadata.

## Email composition

From a contact, a member can create and save an email draft with From, To, Cc, Bcc, subject, and body. The contact's email is suggested for To. An **Open in email** action hands To, Cc, Bcc, subject, and body to the default mail app and includes the team's inbound capture address in Bcc automatically. The stored From address helps attribute the eventual Bcc copy; the member may need to choose the matching sending account in their mail app. Explain the Bcc feature briefly in the UI as an easy way to bring the sent copy back to the log. The member may still edit or remove Bcc in their mail app, so opening a draft is not proof it was sent. A saved draft does not enter conversation context until it is marked sent manually or reconciled with an inbound Bcc copy.

The member's required profile email prefills From for a new draft, but From remains editable so a member may prepare a draft for someone else. The mail app controls the actual sending account; a `mailto:` link cannot select it. Incoming Bcc copies are attributed to the account whose verified profile email matches the actual message From, independent of who prepared the draft. A saved sent draft with matching From and To can reconcile when the verified sender belongs to its team. Profile email remains unique across the class and can be changed in profile settings. Login uses the recovery code rather than email. Existing sent records retain their historical From address.

AI can generate a draft from a member's custom prompt plus allowed context from the contact. Follow-up prompts revise the saved draft in an agent-like flow. Use contact fields and the **latest eligible communication**, rather than the entire history, as default context. Generated body text has no sign-off or signature; the default mail app adds its configured signature. An unsent draft is excluded; an accepted email or manually marked-sent draft can count. External-AI rules and cost controls are in spec 04. AI never sends email.

## Inbound mailbox routing

The current setup uses the common Bcc address `contac@plingapp.no`, as selected for Contac. A receive-only SMTP process accepts only that recipient and stores messages before acknowledging delivery. A protected JSON webhook is also available for a future provider integration. Email entries can link to several contacts, including people on To and Cc. Accepting one message creates one shared activity linked to the selected contacts.

Contact matching for inbound mail uses email addresses in **From, To, or Cc**, as confirmed in review. Bcc is used for capture and team routing, not contact matching. Every team with a matching contact can receive its own independent suggestion when the sender is not registered to an account. Contact overlap alerts are distinct from full email suggestions.

| Sender address matches an account | A saved sent email has matching From and To | Result for sender's team | Result for other teams with matching contacts |
| --- | --- | --- | --- |
| No | Any | No sender team is identified | Independent pending suggestion for each matching team; no auto-accept |
| Exactly one | Yes | Reconcile with that saved sent record; mark it sent and accept one shared email activity for the sender's team | Overlap metadata alert only; do not expose email content by default |
| Exactly one | No | Pending suggestion for the sender's team, including an unmatched-email suggestion if it has no matching contact | Overlap metadata alert only; do not expose email content by default |

Sender addresses are unique per class, so an address matching several accounts is an invalid state to prevent or repair. If an inbound email matches no contact in any team and has no useful team destination, it goes to a **separate class-admin inbox**. Class admin can inspect and route it to a team or dismiss the inbox notification. Dismissing keeps the stored inbound email for audit and prevents it from appearing in the admin inbox again. Intake should avoid duplicate activities if a webhook retries or the same Bcc copy arrives more than once.

All relevant items surface in one user inbox: personal reminders, team email suggestions, cross-team log-access requests, and unmatched mail for the class admin. Each team handles its own email suggestions independently. A member decides whether to accept a suggestion into the team's contact log, unless the matching sent-record reconciliation rule above auto-accepts it.

The inbox entry point sits in the sidebar directly below **Ny kontakt**, following the later sidebar decision. It has an inbox icon and a count pill for pending items visible to the current user. The inbox implementation replaces the first chunk's `0` placeholder with the real count.

## Cross-team contact overlap

Teams maintain separate contact records. For an active contact (status other than `Ikke kontaktet`), match across teams by normalized email, normalized phone, **or** name plus organization. A match directly produces an alert; no manual confirmation step is required. Ignore `Ikke kontaktet` records for these overlap alerts so large backlogs do not generate noise. On a matched contact, show that another team has contacted the person, plus that team's name, its assignee's name, its contact status, and date of last contact. A known-sender email received via Bcc can update the alert without exposing its contents to other teams.

Another team's log is hidden by default. A member may request access to a particular contact log. Any member of the owning team can approve. Approval gives ongoing **read-only** access to current and future entries for that contact and cannot later be revoked. A team setting may change the default cross-team sharing behavior. The class admin can inspect, edit, and change settings regardless of team. Shared notes are team data; a cross-team log grant should expose only the granted log unless the sharing setting explicitly says otherwise.

## Acceptance examples

1. A member opens a saved draft in the default mail app. Its To, subject, body, and team Bcc are prefilled; the draft remains unsent in Contac until an inbound copy or manual Mark as sent.
2. A Bcc copy from a registered member reconciles with their matching sent record. Another team with the same engaged contact sees only the overlap alert.
3. An unknown sender's message matches contact emails in two teams. Each receives an independent suggestion; neither team auto-accepts.
4. An email with no matching team contact appears in the class-admin inbox.
5. A granted cross-team log view is read-only and includes later entries.

## Decisions made for chunk 03

- Match inbound messages to contacts in From, To, and Cc.
- Match a Bcc copy to a sent draft when normalized To recipients form the same set, regardless of order or case; extra recipients do not match.
- A registered sender's unmatched message stays a suggestion in the sender's team. If there is no team destination, it goes to the separate class-admin inbox.
- Team sharing defaults to approval requests. An admin may switch to automatic read-only access. A grant includes activities and attachments and remains effective for future entries; the shared research note is excluded. Access already granted is not revoked by changing the team setting.
- Email draft AI is separately off by default. A team admin must enable it and supply a token/model. Each request is manual and uses contact fields plus the latest eligible communication.

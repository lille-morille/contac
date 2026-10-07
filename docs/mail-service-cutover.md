# Mail service cutover runbook

This runbook records the production port handoff completed on 2026-10-07. The dedicated mail service now owns host TCP port 25, while the API and website use `start-first` updates. The steps below are retained as a reference for a future migration or rollback.

## Before touching the live port

1. Build the API and mail images from the same revision. Deploy the mail image with **no public port mapping** first. Set its reachable webhook URL, shared secret, address, and health check. Confirm `/health` on the API and the mail service's private health endpoint. Send a test SMTP message to the mail service's private port and verify it appears in the expected inbox. Keep the mail service at one replica.
2. Confirm the new API image still accepts the same webhook payload by posting a synthetic message with a unique Message ID to a nonproduction environment. Confirm duplicate submission does not create another suggestion. Verify mail-service behavior for API failure: it must return `451`, never `250`.
3. Record the old API and mail service configurations, image versions, and a rollback path. Keep MX and DNS unchanged. Confirm the mail service can reach the API at its configured webhook URL and that the same webhook secret is set on both. Start continuous checks of `https://api.contac.plingapp.no/health` and `https://contac.plingapp.no/`, and confirm an API-backed action in the website works before proceeding.

## Port handoff

1. Set the API update and rollback order to `start-first` while removing its host port 25 publishing. Wait for the API task to be running and healthy; confirm the public API, website, and an API-backed action still work before changing the mail service. Stop the cutover if HTTP availability drops. SMTP delivery may be delayed from this point until the mail service owns port 25.
2. Publish host port 25 to the already running mail service. From outside the VPS, send a test message to `contac@plingapp.no`; confirm SMTP completion and that exactly one inbox item appears. Check the mail and API logs for webhook or routing errors. Remote MTAs should retry temporary connection failures during the handoff.
3. Deploy the new API image with its `start-first` update order and no SMTP publishing. Keep checking the public API and website throughout the rollout, and verify an API-backed action after it. Confirm an end-to-end mail test and that the old API task has fully stopped. Do not advance based only on Dokploy's build-complete status.

## If a check fails

If the mail service fails but the API and website are healthy, leave their configuration alone and repair or roll back only the mail service. SMTP can remain unavailable briefly while this is resolved; messages that received `451` should be retried by their sending MTA. If the API or website fails during the port-removal update, restore the previous API configuration before assigning port 25 to mail. If it fails during the later API image rollout, restore the previous API image while keeping port 25 assigned to mail. Do not acknowledge messages in the mail service before the webhook succeeds.

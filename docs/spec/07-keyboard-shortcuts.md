# 07 — Keyboard shortcuts and contact context menu

**Status:** Implemented in code. Browser acceptance is pending a reachable local database. Progress and commits are tracked in [spec 06](06-workflow-and-settings-refresh.md).

## Purpose

Make common contact work fast from the keyboard while preserving ordinary text entry, browser behavior, and accessible pointer/keyboard alternatives. The same action must behave the same way whether opened by a shortcut, a visible button, or a contact context menu.

## Shortcut map

| Context | Keys | Action |
| --- | --- | --- |
| Workspace, when no dialog/menu or text editor owns input | `w` / `k` | Navigate to previous sidebar destination |
| Workspace, when no dialog/menu or text editor owns input | `s` / `j` | Navigate to next sidebar destination |
| Workspace | `c` | Open `Ny kontakt` |
| Workspace | `?` | Open shortcut help |
| Workspace, without a targeted contact | `i` | Open the sidebar Inbox panel from spec 06 |
| Hovered or keyboard-focused contact in list/board | `a` | Open assignee chooser for that contact |
| Hovered or keyboard-focused contact in list/board | `i` | Assign to current user; if already assigned to current user, clear assignee |
| Hovered or keyboard-focused contact in list/board | `l` | Open person-tag chooser for that contact |
| Hovered or keyboard-focused contact in list/board | `s` | Open status chooser for that contact |
| Hovered or keyboard-focused contact in list/board | `f` | Toggle favorite for that contact |
| Hovered or keyboard-focused contact in list/board | `r` | Start `Telefonsamtale` for that contact |
| Hovered or keyboard-focused contact in list/board | `e` | Open `Skriv e-post` for that contact |
| Hovered or keyboard-focused contact in list/board | `d` | Open delete confirmation for that contact |
| Contact detail | `r` | Start `Telefonsamtale` |
| Contact detail | `e` | Open `Skriv e-post` |
| Contact detail | `a` | Open assignee chooser |
| Contact detail | `s` | Open status chooser |
| Contact detail | `f` | Toggle favorite |
| Contact detail | `d` | Open delete confirmation |

`w/k` mean up and `s/j` mean down. Movement opens the next or previous destination immediately; the current-page indicator moves with it. The sequence follows all visible sidebar navigation links in their displayed order, including favorites and the single settings entry, and skips hidden destinations. It wraps at the top and bottom. Settings tabs remain directly clickable and linkable. The shortcut excludes `Ny kontakt`, Inbox, sign-out, theme toggle, and the team picker, which are actions or controls rather than sidebar navigation links. A shortcut targeting a contact uses exactly one contact, identified by hover or keyboard focus. A keyboard-focused contact wins if it differs from the hovered contact; otherwise hover is the target. No shortcut fires from a disabled/archived duplicate contact when the underlying action is unavailable.

## Command palette

Keep ⌘K/Ctrl+K as the global **open** shortcut. While the palette is open, the global listener must not turn the same chord into a close action. Escape closes it. Let the palette handle its existing arrow-key navigation and Ctrl+J/Ctrl+K movement; typing and selection stay inside the palette. Pressing ⌘K while it is already open must not close it or navigate the page.

## Contact targeting and menus

- Status choosers show the same colored status icons as contact cards. Status, assignee, and tag choosers support Arrow Up/Down, Ctrl+J/K, and Ctrl+N/P navigation. Compact select pickers support the same Ctrl navigation pairs. Global ⌘K/Ctrl+K is suspended while another dialog, picker, or menu is open.
- Hovering a board card or list row makes it the pointer shortcut target. Keyboard focus on a card/row makes it the keyboard shortcut target. Show a subtle target highlight so the user can see which contact will be changed before pressing a letter.
- A shortcut that opens a chooser or confirmation moves focus into that UI. Escape closes it and returns focus to the originating card, row, or detail action. Shortcuts are suspended while that UI is open, except for its own documented navigation keys.
- Right-click on a Kanban card or contact list row opens a contact context menu. Its actions mirror the currently available shortcut actions and show each key beside its label, including `r` for call and `e` for email. Also include useful actions without a shortcut, such as `Åpne kontakt` and favorite toggle. Support the keyboard context-menu key and Shift+F10 for the same menu; menus must fit the viewport and not interfere with board dragging.
- Invoking `r` or `e` from a card/row opens that exact contact's detail page with the call or email composer active. Back returns to the prior board/list view and its filters. If the action is unavailable for that contact, show a clear disabled state in the menu and do not silently act on another contact.
- On contact detail, add a visible `Slett kontakt` button immediately to the right of `Legg til i favoritter`/`Favoritt`. Both it and `d` open the same confirmation dialog. The current app has no delete-contact API, so soft deletion and restoration must be implemented consistently in the API, related data, search, and UI. Deletion never occurs on the first `d` press.

## Focus and conflict rules

1. Ignore single-letter shortcuts while focus is in an input, textarea, select, contenteditable region, combobox, editable note, or while IME composition is active. Do not suppress ordinary browser/OS modifier shortcuts.
2. Open modal, popover, and context-menu interactions take precedence over workspace shortcuts. The command palette takes precedence over all workspace shortcuts.
3. When a hovered or keyboard-focused contact is the active target, its `i` and `s` actions take precedence over Inbox and sidebar navigation. On contact detail, `s` changes that contact's status. `w`, `j`, and `k` can still move between sidebar destinations unless a chooser owns focus. The contact target is cleared on page or team change.
4. Do not register repeat-triggered create, inbox, assignment, favorite, call, email, or delete actions. Holding a navigation key may repeat movement at a controlled rate.
5. Give every action a visible pointer path. In help text and menus, render keys as hints; the app must remain usable without shortcuts. Respect reduced-motion preferences for highlight movement.

## Soft deletion and restoration

The confirmation identifies the contact by name and organization and explains that deletion is reversible. Confirmation records a deletion timestamp rather than removing the contact row or its history. Leave contact detail, remove the contact from ordinary board/list, favorites, search, duplicate matching, organization map, AI context, export, and MCP contact reads, and show a success message with an immediate Undo action. Keep activities and saved quotes intact. Shared activities remain visible for other linked contacts and are not duplicated. In deterministic export, a shared activity linked to a deleted export owner uses another active linked contact as its export owner; an activity linked only to deleted contacts is omitted. Restoring the contact brings back its fields, activity links, and prior status. A direct URL to a deleted contact shows a clear deleted state with a restore action for authorized team members.

Add a `Slettede kontakter` view under the contact destinations, showing deleted contacts with name, organization, deletion time, and Restore action. Include it in the linkable URL scheme from spec 06 and in W/S/J/K sidebar navigation whenever it is visible. Hide its sidebar link when there are no deleted contacts, while allowing an existing direct link to show an empty state.

## Acceptance examples

1. With a contact targeted on the board, `i` assigns it to the current user; pressing `i` again clears the assignment. With no targeted contact, `i` opens the sidebar Inbox panel.
2. `d` opens a confirmation and Escape cancels without changing data. The visible detail-page delete button opens the same confirmation. Confirming hides the contact from normal work; Undo or Restore brings it back with its history.
3. Right-clicking a card offers available actions with shortcut hints; Shift+F10 opens the same menu from a focused card.
4. ⌘K/Ctrl+K opens the palette. Ctrl+K while it is open moves within the palette or is handled there, and never closes it; Escape closes it.
5. Typing `c`, `d`, or `s` in a contact note inserts text and does not trigger an action.
6. Pressing `r` over a board card opens that contact's detail page with the call composer active; `e` does the same for email. Neither command acts on a different contact after navigation.
7. W/S/J/K navigates immediately through visible page links, favorites, and settings, wrapping at the ends. `?` opens shortcut help. A deleted contact can be restored from `Slettede kontakter` after the Undo message is gone.

## Shortcut help and standard keys

`?` opens a compact shortcut reference grouped by context and highlights actions available on the current page. Enter opens a focused contact card/row; Escape closes the topmost menu or dialog. Sidebar W/S/J/K navigation already opens destinations immediately. `f` works on a targeted card/row and on contact detail.

## Current implementation map

- Global ⌘K/Ctrl+K open action, page state, and contact shortcuts: [`packages/app/src/routes/index.tsx`](../../packages/app/src/routes/index.tsx).
- Command palette: [`packages/app/src/components/command-palette.tsx`](../../packages/app/src/components/command-palette.tsx).
- Board cards, list rows, contact detail, and activity composer: [`packages/app/src/routes/index.tsx`](../../packages/app/src/routes/index.tsx).
- Contact API has create/update/favorite/tag, soft-delete, and restore routes: [`packages/api/src/contacts.ts`](../../packages/api/src/contacts.ts).

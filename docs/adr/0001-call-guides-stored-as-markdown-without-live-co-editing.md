---
status: accepted
---

# Call guides are stored as Markdown without live co-editing

Call guides are edited in a rich text editor but stored as a Markdown text column, saved with a revision check like other scalar fields. Other shared text in Contac (notes, summaries, transcripts, LOI text) uses Yjs for live co-editing, so this is a deliberate exception: guides are written rarely and read often, Markdown keeps them readable by MCP clients and agents, and the existing collaboration path only materializes plain text. A stale save receives the newer version instead of merging.

## Considered Options

- **Yjs rich-text document mirrored to Markdown.** Rejected for now: it needs a new server materialization path for structured documents, for a feature where concurrent editing is uncommon.

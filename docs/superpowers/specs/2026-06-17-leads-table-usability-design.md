# Leads Table Usability Design (Sort, Resize, Filter, Multi-Select)

Date: 2026-06-17
Scope: Leads table only in Marketing Agents dashboard

## Context
The Leads table currently has fixed columns and no table-level sort/filter/select workflow. Long text (especially email values) can visually crowd neighboring columns.

## Goals
1. Add sortable columns for lead browsing.
2. Add drag-resizable columns to control readability by data shape.
3. Add text filter across core lead fields.
4. Add row multi-select and select-all for visible rows.
5. Keep all existing row actions intact.

## Non-Goals
1. No backend or schema changes.
2. No new bulk-action APIs.
3. No behavior changes to Approval Queue or Send Queue.

## UX Design
1. Sorting
- Click a sortable header to cycle Asc -> Desc -> None.
- Sort fields: Company, Status, Score, CMMC Level, Location, Email, Persona.

2. Resizing
- Each Leads table column has a right-edge resize handle.
- Dragging updates width in local component state with a minimum width guard.
- Table uses fixed layout so width changes are deterministic.

3. Filtering
- Add a single text input above the table.
- Case-insensitive contains match across company_name, status, cmmc_level_sought, location, contact_email, persona_slug.
- Status chips remain and combine with text filtering.

4. Selection
- Add leading checkbox column.
- Header checkbox toggles all currently visible rows.
- Row checkbox toggles individual selection.
- Show selected count near filter controls.

5. Overflow handling
- Cells use no-wrap + ellipsis for dense readability.
- Full values available via title tooltips.

## Data Flow
1. leads -> status-filtered list
2. status-filtered list -> text-filtered list
3. text-filtered list -> sorted list (visible rows)
4. visible rows -> render + select-all state

## Error Handling
1. All interactions are local state only and cannot fail through network calls.
2. Existing lead row action handlers are unchanged.

## Verification Plan
1. Sort each supported header and confirm cycle + deterministic order.
2. Drag resize handles and verify column widths update without overlap spill.
3. Filter by partial company/email/location/persona and verify row narrowing.
4. Use row checkboxes and select-all; confirm only visible rows are affected.
5. Run smoke check on row actions (Edit, Run AI, Sequence, History, Delete).

## Risks and Mitigations
1. Risk: Dense actions column clipping when narrow.
- Mitigation: Keep default width generous and allow resize.
2. Risk: Selection confusion across filter changes.
- Mitigation: select-all operates on visible rows only and selected count remains visible.

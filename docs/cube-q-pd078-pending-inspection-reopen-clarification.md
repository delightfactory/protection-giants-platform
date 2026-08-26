# Cube Q — PD-078 Pending Inspection Reopen Clarification

**Status:** BOUNDED IMPLEMENTATION CLARIFICATION — required to remove a lifecycle dead end  
**Applies to:** PD-078 and Cube Q only

PD-078 normally reopens a wrong `rejected` or ordinary pre-approval `cancelled` Claim to `under_review`.

There is one bounded exception:

- if the ordinary cancellation happened while the Claim was `awaiting_inspection`;
- and the single formal inspection still exists in `requested`;
- and no Resolution exists and all other PD-078 guards pass;

then the correction reopens the Claim to:

```text
awaiting_inspection
```

using the **same existing inspection row**.

This clarification is required because reopening that shape to `under_review` would leave a surviving `requested` inspection that blocks approval/rejection, cannot be submitted while the parent is not `awaiting_inspection`, and cannot be recreated because Cube Q permits only one formal inspection.

Rules:

1. No second inspection is created.
2. The original inspection request/history remains immutable.
3. The `decision_reopened_for_correction` event remains the correction audit event and records the resumed status/inspection privately.
4. If the assigned Center is no longer actionable, Admin uses the existing reassignment path after reopen.
5. A rejected Claim or an ordinary cancelled Claim with no pending requested inspection still reopens to `under_review`.
6. An approval-in-error cancellation with a historical Resolution remains non-reopenable.

This changes no Cube R responsibility and introduces no generic undo/reopen mechanism.

# UX-EVID-01 — Evidence Review Before Irreversible Submission

## Goal

Give every evidence-heavy irreversible flow a real review step before any newly selected file leaves the user's device.

## Frozen scope

Target surfaces:

1. Customer Warranty Claim.
2. Center Claim Inspection.
3. Center Claim Resolution Completion.
4. Admin Recovery Completion.

Reference behavior: the existing Pre-install Issue local image preview pattern.

## UX contract

- Selecting a file is local-only. Selection must not call a Server Action or write to Storage.
- Selected evidence is reviewed in one consistent surface before final submission.
- Previewable browser image formats receive a local object-URL thumbnail.
- PDF, HEIC, or any other non-previewable file receives a generic file card rather than a broken image preview.
- Every selected item shows its file name, media type, and size.
- Every selected item can be removed or replaced before submission.
- The surface shows selected count against the flow maximum.
- Before submission starts, the UI states explicitly that selected files remain private on the device until final confirmation.
- The irreversible confirmation summarizes the number of evidence files that will be submitted.
- If a confirmed submission attempt has already uploaded an item and the final business operation fails, the retained item remains visible as retained state so the user can remove/replace it deliberately before retrying.

## Backend invariants — unchanged

### Customer Claim

UX-EVID-01 does not migrate Cube P evidence into the operational Stage registry.

After final confirmation, Customer Claim continues to use the existing Cube P draft evidence actions and canonical `submitWarrantyClaim` path.

### Operational evidence

Claim Inspection, Center Completion, and Admin Recovery continue to use the UX-DATA-01 actions already qualified on `main`:

1. register Stage,
2. upload Storage object,
3. final canonical business RPC consumes the Stage atomically.

Replacing/removing an item that has already been retained by a failed confirmed attempt must use the existing explicit delete path. Local-only items are removed without any network call.

## Explicit non-goals

- No database migration.
- No Storage policy or MIME-policy expansion.
- No new evidence file types are accepted by the four business flows.
- No change to claim, inspection, resolution, warranty, allocation, or authorization state machines.
- No generic upload orchestration abstraction across Customer and operational evidence.
- No toast-only evidence flow.

## Acceptance

- All four target surfaces show review-before-upload.
- New selection does not invoke upload actions.
- Image thumbnails use local object URLs and revoke them.
- Generic fallback exists for non-previewable files.
- Remove and replace work for local selections; retained server evidence uses the existing delete boundary.
- Final confirmation contains the selected evidence count.
- Customer remains on Cube P draft evidence lifecycle.
- Operational flows preserve Stage-before-upload and canonical atomic consumption.

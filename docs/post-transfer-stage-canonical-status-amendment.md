# Protection Giants — Post-Transfer Stage Canonical Status Amendment

**Status:** Authoritative status amendment — 2026-08-22

**Applies after:** merge commit `26ab4d0700610a87552db2972ec0a98c58fb4f12` on `main`.

## 1. Purpose and precedence

This amendment corrects stale status wording that still describes Cube F, Cube G, or Cube H as current/future software work.

Where older README, roadmap, canonical-context, or Transfer-stage wording conflicts with this document on current implementation status or the next development step, this amendment controls.

No business rule, database behavior, authorization rule, Transfer behavior, label identity, Activation rule, or Warranty rule is changed here.

## 2. Confirmed merged software status

The following foundations and cubes are complete on `main`:

- platform/auth/user-management/design-system/Supabase foundations;
- Product Foundation;
- Production Order / Lot / Roll Foundation;
- Agent & Network Foundation;
- Center Foundation A/B/C: location, network approval, public directory/map;
- Cube D — Roll Custody Foundation;
- Cube E — Outer Roll Label & Print Foundation, with real printer/cutter physical validation still tracked separately;
- Cube F — Roll Transfer State & Reservation Engine;
- Cube G — Transfer Send UX: Transfer ID + Scan / Select / Lot;
- Cube H — Transfer Receipt, Partial Receipt & Resolution;
- QR Foundation Reliability closure used by the operational Transfer flows and outer Roll label.

PR #55 merged Cube G, Cube H, and QR reliability after successful PR Quality, Database Quality, independent QR decoding checks, outer-Roll PDF QR decoding, and manual multi-account development-server validation.

## 3. Macro-capability status

The software dependency chain required for **Roll Custody & Transfers** is now closed:

`D Custody → F Transfer state/reservation → G Send → H Receipt/Resolution`

Cube E provides the physical Roll QR/print identity used by scan workflows and remains software-complete. Its deferred printer/cutter/RIP physical acceptance is still mandatory before production operation depends on finalized physical print specifications.

The Transfer macro-capability must not be reopened merely because older documentation still presents F/G/H as future work.

## 4. Current product position

The platform now supports the operational path through:

`Product → Production Order → Lot → Roll → confirmed custody → Transfer → recipient receipt/partial receipt → confirmed custody movement`

The next product gap is no longer distribution. It is what happens when an installation Center legitimately holds an eligible Roll and begins using it for an installation.

## 5. Next software design/specification step

The next software design/specification step is:

**Roll Opening / Claiming**

The final cube number/name and implementation contract should be frozen only after the business flow is reviewed with the product owner.

The expected bounded responsibility is to let an authenticated active Center that is the confirmed current custodian identify an eligible Roll and record that the Roll has been opened/claimed for installation operations.

This step must remain separate from customer Warranty Activation.

It must not pull forward:

- customer/VIN activation data;
- public Warranty token/URL strategy;
- customer claims;
- replacement/reinstall workflows;
- speculative inventory consumption/accounting;
- unrelated remaining Production labels.

## 6. Later sequence remains

After Roll Opening / Claiming, the currently approved high-level sequence remains:

1. Pre-install Roll Issue Reporting;
2. Warranty Activation;
3. public Warranty access/verification and customer QR strategy;
4. claims and later replacement/reinstall flows.

Network approval remains a trust/public designation and is not an eligibility gate for Roll Opening or Warranty Activation.

## 7. Parallel/deferred print work

Cube I — Remaining Production-owned Label Package remains valid later work and must reuse Cube E print primitives.

It is not the next critical operational cube because it does not close the installation/warranty lifecycle gap.

Activation/Warranty labels remain behind the Activation/Warranty identity and lifecycle decision gate and must not reuse SKU, Roll serial, ERP serial, or Transfer ID as substitute identities.

## 8. Repository hygiene

Any still-open documentation-only PR that describes Cube H as not implemented is superseded by the merged Transfer-stage implementation and should be closed rather than merged.

Future sessions should read this amendment before interpreting older immediate-next-cube wording.

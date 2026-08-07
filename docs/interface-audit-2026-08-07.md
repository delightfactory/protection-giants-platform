# Interface Audit - 2026-08-07

## Scope reviewed

The review covers every current user-facing surface and shared UI component in the repository before user-administration development continues.

### Global and public surfaces

- root viewport and global styles;
- public layout;
- public header and footer;
- public home page;
- products public placeholder;
- approved-centers public placeholder;
- warranty public placeholder;
- shared public page intro;
- shared buttons, cards, typography, and empty/information panels.

### Authentication surfaces

- login page;
- access-denied page;
- authentication form controls and error state.

### Operations surfaces

- operations layout and shell;
- operations navigation;
- operations overview;
- products list, create, edit, and lifecycle controls;
- dealers list, create, edit, and lifecycle controls;
- installation-centers list, create, edit, and lifecycle controls;
- shared product, dealer, and center form-field components;
- shared record cards, action rows, status presentation, forms, and empty/error states.

## Material findings

1. The previous lime accent did not match the supplied Protection Giants visual reference.
2. The desktop sidebar degraded into a horizontally scrolling navigation row on phones; responsive, but not application-native.
3. Mobile navigation had no persistent app-oriented structure or active-destination feedback.
4. Operational forms were responsive but still read visually as desktop panels reduced to phone width.
5. Important mobile actions did not have a dedicated reachable action area.
6. Some operational status and metadata were presented as undifferentiated paragraphs rather than scannable mobile information.
7. The operations overview contained placeholder metrics with no real backing data.
8. Public products and centers pages contained stale development copy saying their cubes had not started even though operational entity foundations now exist.
9. Mobile safe-area and viewport-fit behavior was not explicitly configured.
10. Form fields needed small mobile keyboard/autocapitalization improvements for operational codes, country codes, email, slugs, and numeric warranty duration.

## Corrections implemented in this audit

- adopt provisional PG black/red/white visual tokens from the supplied company profile;
- provide a native-style phone app header and admin bottom navigation while preserving a desktop sidebar;
- highlight the active operational destination;
- hide bottom navigation during focused create/edit tasks;
- make mobile touch targets and inputs at least 44px, generally 48-54px for primary controls;
- make operational form actions sticky and reachable on phones;
- convert record metadata and lifecycle status into structured, scannable card content;
- distinguish reversible lifecycle actions visually from primary actions;
- replace placeholder overview metrics with entry points to real modules that already exist;
- remove stale public development wording while keeping unfinished public features honestly unavailable;
- configure `viewport-fit=cover`, dark theme color, and safe-area-aware mobile chrome;
- preserve tablet and desktop layouts as adaptive larger-screen compositions.

## Deliberately not included

This audit does not:

- change database schema, RLS, auth rules, or business logic;
- add user administration;
- introduce a generic design system or component library;
- add speculative animations or gesture systems;
- invent an official PG logo asset or font;
- activate public product, center, or warranty data before their public contracts exist.

## Validation gate

Before merge, this UI-only audit must pass the existing PR TypeScript/build checks. A runtime phone smoke check remains part of the mobile Definition of Done whenever an executable preview/runtime is available; absence of a hosted preview must not be represented as visual runtime verification.

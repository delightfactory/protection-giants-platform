# Mobile-Native Interface Standard

## Purpose

Protection Giants is an operational platform expected to be used primarily from phones. Mobile is therefore the primary product surface, not a reduced desktop layout.

Every new operational screen, flow, control, and reusable component must be designed to feel deliberate and natural on a modern mobile device first, while remaining fully usable on tablet and desktop.

## 1. Mobile is the primary design target

- Design the mobile interaction model first, then adapt it to larger viewports.
- Do not design a desktop screen and merely stack or shrink it for mobile.
- Core tasks must be completable comfortably at common phone widths without zooming or horizontal page scrolling.
- Desktop and tablet layouts may expose more space or parallel information, but must preserve the same business rules and task flow.

## 2. Native-app interaction model

Mobile operational UI should behave like a modern native application rather than a traditional responsive website.

Prefer, when appropriate:
- compact app bars with clear page titles and contextual actions;
- bottom navigation for a small set of high-frequency primary destinations;
- full-screen or sheet-style task flows instead of cramped desktop dialogs;
- sticky or bottom action areas for important confirmation actions;
- cards, lists, segmented controls, tabs, switches, and status chips sized for touch;
- progressive disclosure instead of dense screens;
- immediate visual feedback for taps, saves, validation, loading, and state changes.

The exact control is chosen by the task. Do not add mobile UI patterns merely for decoration.

## 3. Touch and one-handed use

- Interactive targets must be at least 44x44 CSS pixels; prefer approximately 48 pixels for primary operational controls.
- Important actions should remain reachable without precision tapping.
- Avoid placing frequent primary actions in awkward or crowded positions on phone screens.
- Destructive and reversible lifecycle actions must be visually distinct and resistant to accidental taps.
- Hover must never be required to discover or use an operational action.

## 4. Mobile information density

- Do not use wide desktop tables as the default mobile representation of operational data.
- Convert dense records into mobile-friendly cards, lists, grouped details, or drill-down views when that improves comprehension.
- Avoid displaying every available field on the first screen; show what is needed for the current task.
- Long identifiers, serials, VINs, phone numbers, and codes must wrap or truncate safely without breaking the viewport, while remaining accessible when needed.
- Horizontal scrolling is acceptable only for intentionally scrollable controls or exceptional data views, not as a fix for an oversized layout.

## 5. Forms and operational input

- Forms must use appropriate mobile input types and input modes.
- Keep field order aligned with the operator's real workflow.
- Group related fields and avoid very long undifferentiated forms.
- Validation must appear near the affected field and be understandable in Arabic.
- Preserve entered data on recoverable validation failures whenever practical.
- Scanner/camera-assisted entry should be preferred where a confirmed workflow benefits from it, but must not be introduced before the relevant module requires it.

## 6. Navigation and task continuity

- Mobile navigation must be designed as an application navigation system, not a collapsed desktop sidebar.
- The current destination and current operational context must always be clear.
- Back/cancel behavior must be predictable.
- Multi-step tasks must preserve context and must not force the operator to repeatedly return to a dashboard between steps.
- Avoid deeply nested navigation for frequent field workflows.

## 7. Responsive adaptation

Use three interaction classes conceptually:

- **Phone:** primary design target; touch-first, one-column by default, native-app navigation and task surfaces.
- **Tablet:** may use wider cards, split views, or two-column layouts when they improve the task.
- **Desktop:** may use persistent navigation, denser information, and multi-column composition where useful.

Responsive design is adaptive: larger screens may change composition, not merely scale the phone layout.

## 8. Device and browser realities

- Respect safe-area insets for devices with display cutouts and gesture bars where fixed UI touches screen edges.
- Avoid important controls being obscured by mobile browser chrome or the software keyboard.
- Fixed/sticky controls must not cover content.
- Loading, offline/interrupted submission, and retry behavior must be understandable in mobile network conditions for workflows where connectivity loss is realistic.

## 9. Visual quality

The platform must look current, premium, and professionally designed.

- Use consistent spacing, hierarchy, radii, typography, iconography, and interaction states.
- Avoid generic admin-dashboard appearance, excessive boxed sections, visual clutter, or desktop enterprise UI transplanted onto mobile.
- Animation and transitions may support orientation and feedback, but must remain restrained and functional.
- Accessibility, contrast, readability, and touch usability take priority over decorative effects.

## 10. Protection Giants brand DNA

The official Protection Giants website is a primary brand reference:

- https://protection-giants.com/

When designing or materially revising platform surfaces, use the official brand as the source for visual direction, tone, logo treatment, and public-facing identity where applicable.

The operational platform should clearly belong to Protection Giants without blindly copying the marketing website. Marketing surfaces and operational surfaces serve different tasks; brand DNA should be translated into an efficient application UI.

Do not invent permanent brand colors, fonts, imagery, claims, contact details, or identity rules when they have not been verified from an approved brand source.

## 11. Component rule

A reusable component may be introduced when multiple real screens need the same interaction. Do not build a speculative design system in advance.

When a component becomes shared, its mobile interaction behavior is part of its contract and must be verified before reuse.

## 12. Mobile Definition of Done

A UI-bearing block is not Done until, as applicable:

- the primary phone flow is intentionally designed, not merely responsive;
- the complete task works at phone widths without horizontal page overflow;
- touch targets are usable and actions are reachable;
- keyboard/input behavior does not obscure required actions;
- empty, loading, validation, success, and failure states work on mobile;
- navigation and back/cancel behavior are clear;
- tablet and desktop remain usable and coherent;
- no essential action depends on hover;
- the result visually fits the Protection Giants product experience;
- a mobile smoke check has been performed for the affected flow.

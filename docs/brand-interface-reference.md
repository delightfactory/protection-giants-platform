# Protection Giants Interface Brand Reference

## Purpose

This document records the currently approved visual direction for the platform interface. It is an implementation reference, not a replacement for a formal brand guideline.

## Approved references

1. The official brand website: `https://protection-giants.com/`.
2. The 15-page company-profile PDF supplied by the stakeholder on 2026-08-07.

The supplied PDF is treated as a provisional visual reference because it contains presentation copy inconsistencies. The platform keeps the project-approved canonical brand name **Protection Giants / عمالقة الحماية** rather than adopting inconsistent occurrences of "Protection Gains" from the PDF.

## Provisional visual DNA

The company profile consistently uses:

- deep black as the dominant background;
- high-contrast white typography;
- a strong PG red as the primary visual accent;
- dark red-to-black gradients;
- oversized low-contrast PG linework or monogram shapes in backgrounds;
- thin red rules and outlined geometry;
- rounded capsule/pill shapes for highlighted sections;
- heavy geometric headings with strong hierarchy;
- automotive imagery on public/marketing surfaces.

For the current UI foundation, the red sampled from the supplied profile is represented approximately by `#DF2526`. This is an engineering reference token, not a claim that an official brand color specification has been received.

## Translation into the operational application

The platform must clearly belong to Protection Giants without turning operational screens into catalogue pages.

Use:

- black and near-black app surfaces;
- white primary content and restrained gray secondary content;
- PG red for primary actions, active navigation, focus states, small structural accents, and selected brand moments;
- subtle dark-red gradients or line motifs only where they do not compete with operational information;
- strong headings with simpler body typography for Arabic readability;
- rounded controls and cards that echo the profile's capsule geometry while remaining touch-friendly.

Avoid:

- decorative starbursts, large automotive imagery, or heavy gradients inside dense operational tasks;
- using red on every card or control until hierarchy becomes unclear;
- copying marketing-page compositions directly into admin, dealer, or center workflows;
- inventing permanent fonts, claims, image rules, or logo treatments that are not supplied by an approved source.

## Logo treatment

The repository currently has no approved production-ready PG logo asset. The interface therefore retains a simple text `PG` mark styled with the brand color rather than drawing or approximating the official interlocking logo.

When an approved logo asset is supplied, it can replace the text mark as a contained visual update without changing navigation or application structure.

## Relationship to mobile-native standard

Brand expression is subordinate to task usability. All interface work must still satisfy `docs/mobile-native-interface-standard.md`, including touch target, navigation, safe-area, form, responsive, and phone smoke-check requirements.

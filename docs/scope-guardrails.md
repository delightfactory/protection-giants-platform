# Scope Guardrails

## Initial platform boundary

The first platform is for **Protection Giants** only.

Initial operational product family:
- Paint Protection Film (PPF).

Initial business rule:
- one physical PPF roll can create at most one customer warranty.

## Explicitly outside the initial scope

Do not add these without a recorded approval:

- multi-brand / multi-tenant operation in one deployment;
- window-film multi-activation logic;
- nano-ceramic workflows;
- accounting or general ERP;
- WooCommerce scope;
- customer account system;
- mandatory OTP flow;
- full commercial inventory/accounting;
- complex multi-level distribution trees beyond the approved operational chain;
- advanced production/shipping procurement tracking;
- heavy document-generation infrastructure before actual volume requires it.

## Approved operating chain

The current intended chain is:

`Brand Owner -> Country Dealer/Distributor -> Approved Installation Center -> Customer`

The implementation should support the minimum data and actions required by this chain without turning the platform into a general distribution ERP.

## Core platform modules

Modules are introduced incrementally in this order unless dependency analysis justifies a small adjustment:

1. platform shell and public site foundation;
2. products and product content;
3. production orders and lots;
4. physical rolls and serial identity;
5. label templates and print preparation;
6. dealers and approved installation centers;
7. roll transfer and custody;
8. roll opening/assignment by an approved center;
9. customer warranty activation;
10. customer warranty page and public verification;
11. pre-install roll issue reporting;
12. post-install warranty claims;
13. operational reports and audit views.

Each module is split further into small vertical slices before implementation.

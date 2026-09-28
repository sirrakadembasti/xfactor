# Management discovery and production quality design

## Goal

XFactor must proactively assess whether an application needs operational management, propose a concrete administration and role model to the user, generate the accepted workflows, and reject incomplete or unproven deliveries. This is independent of any one generated product.

## Contract

The Manager emits a structured `management` assessment for every project. It records `needed`, `reason`, managed resources and their permitted operations, roles, UI/API paths, and per-role journeys. An application with mutable domain records must receive a concrete management proposal even if the user does not use the words “admin”, “management”, or “tracking”. A no-management conclusion requires a reason. User approval of the project contract is the point at which the proposal becomes required scope.

For managed applications, the accepted contract identifies login and account provisioning, permission boundaries, each role's development/test demo account, and positive and negative journeys. Public registration is a separate project decision; it cannot grant an elevated role. Demo credentials live in isolated test/development setup and are not shipped as a shared production password.

## Workflow

Manager planning is validated before the user sees a contract. Director and task assignments inherit the management matrix as requirement IDs and must cover every required resource and role journey. Verification reads the approved contract, requires complete evidence for all applicable gates, and exercises the actual artifact. A missing management assessment, CRUD element, demo role, authorization denial, or interactive journey blocks verification.

## Quality pipeline

The final packaged artifact is the verification subject. Clean dependency installation, typecheck, lint where supported, substantive tests, framework build, Docker build and first-run for Docker projects, database writes and persistence, API mutation/readback, and interactive browser journeys produce explicit check evidence. Missing or unexecuted applicable checks are blocked, not passed. README and status reporting come from these same results.

## Compatibility and boundaries

Contracts for projects without persistent operations may declare management unnecessary with a concrete reason. Existing approved contracts remain readable; new Manager plans use the new schema. Role names, managed resources, and retention rules are project-specific. XFactor does not hardcode a library domain or universal delete behavior.

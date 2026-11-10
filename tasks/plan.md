# T16 plan — Hermes chat dan scoped business tools

## Scope
- Backend session-bound Hermes conversation endpoint.
- Scoped business tools: `clients.search`, `invoices.create_draft`, `invoices.preview`, `payments.list`, `deliveries.prepare`, `office.get_status`.
- Tool authorization enforces actor, owner, operation, and approval boundary.
- Client content remains data; no shell, credential, or arbitrary tool dispatch.
- Web Hermes drawer shows conversation, tool progress/result/error, session/profile, and available usage metadata.
- Final invoice issue, payment verification, and delivery send remain owner-only approval operations.

## Slices
1. Contract and service tests: define tool names, request/response schemas, authorization failures, prompt-injection-as-data behavior.
2. Backend Hermes service: session-bound conversation, deterministic scoped tool dispatcher, audit trail, no external inference dependency when unavailable.
3. Backend routes: authenticated GET status/history and POST message with CSRF, owner binding, bounded input, and error mapping.
4. Web Hermes panel: connect selected Hermes drawer to chat endpoint and render progress/results/errors.
5. Documentation sync: mark T16/TODO/index only after implementation and verification.
6. Static checks: typecheck, lint if configured, build, and all automated tests.
7. E2E: run real backend/web, authenticate through testable local session path, send draft request, verify UI result, verify unauthenticated/invalid tool path, inspect console/network, capture screenshot, clean data/processes/tabs.

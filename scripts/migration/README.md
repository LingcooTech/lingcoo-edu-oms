# Migration tooling

`identity-phase1.mjs` migrates legacy Edu identities plus safely provable runtime roles and education scope. It defaults to a read-only plan; apply requires `apply`, `--apply`, and the planned target fingerprint. Incomplete role evidence is staged without authorization and additionally requires `--allow-incomplete-roles`.

Password hashes are preserved verbatim. Legacy scrypt verification belongs to the target server's local identity password adapter, not the upstream security package. WeChat identities are staged for reconciliation only and do not enable login.

See [the phase 1 runbook](../../docs/migration/phase1-identity.md) for mapping rules, stop conditions, commands, exit statuses, and fixture setup.

`people-phase2.mjs` migrates institutions, organization-level student/guardian/teacher
profiles, and only the institution relationships supported by legacy contracts,
course providers, or parent assignments. Legacy guardian links are always imported
as unverified and cannot grant parent access before review. It is read-only by
default and refuses a non-empty target collision.

```sh
node --test scripts/migration/identity-phase1.test.mjs scripts/migration/people-phase2.test.mjs
```

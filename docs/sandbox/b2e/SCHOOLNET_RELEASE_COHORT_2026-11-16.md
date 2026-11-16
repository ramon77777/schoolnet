# SCHOOLNET Lot 5.C — Releasing progressively (REVIEW ONLY)
**Not deployed.** The existing production pilot is preserved.
The Admin server retains verify_jwt=true and checks current Supabase Auth user and profile role before every operation.
The login server retains Turnstile, strict production Origin, SQL global/phone/code rate limiting, Auth sign-in and token verification.
Both use the same authorization: existing PILOT request + optional CANARY request.
Only when SCHOOLNET_STUDENT_GENERAL_RELEASE_ENABLED=true is separately approved and enabled on Supabase does the scope extend to all eligible verified requests.
The general flag defaults to false. Admin creation still requires SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=true.
Emergency stops: SCHOOLNET_STUDENT_LOGIN_ENABLED=false and SCHOOLNET_STUDENT_ACCOUNTS_ENABLED=false.
Canary test must prove password -> Auth session -> enabled -> auto parent link without SQL intervention. Before that, do not deploy this release.
Test locally: node --experimental-strip-types --test scripts/test-schoolnet-student-rollout-guard.mjs scripts/test-schoolnet-student-login-production-release.mjs

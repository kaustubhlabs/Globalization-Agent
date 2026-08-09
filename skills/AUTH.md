# Skill: Authentication handling
1. Read `AUTH_TYPE` from `.env`.
2. Open a browser container using Playwright, navigate to `AUTH_LOGIN_URL`, and input variables from `AUTH_USERNAME_ENV` and `AUTH_PASSWORD_ENV`.
3. Wait for network idle state. Save state to a localized file: `storageState.json`.
4. Inject this state file directly into subsequent contexts.

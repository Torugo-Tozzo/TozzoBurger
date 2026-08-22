# Final fix wave — mobile

Date: 2026-08-22
Branch: `feat/fase-3-vendas-historico`
Commit: final fix wave mobile (SHA is reported in the handoff)

## Scope

- Add optional `timezoneOffsetMinutes` to `VendasFilters`.
- Send the offset from `buildVendasQueryParams` only when an hour filter is present; default to `Date.getTimezoneOffset()`.
- Keep decimal-comma query values such as `totalMin=10,50` unchanged for the API contract.
- Apply the same offset to SQLite hour predicates through bound modifiers such as `strftime('%H:%M', horario, ?)`.
- Validate offsets as integers in the safe range `-840..840` and preserve parameterized SQL.

## TDD evidence

### RED

Command:

```text
npx jest database/__tests__/useVendaDatabse.test.tsx services/__tests__/vendas.test.ts --runInBand
```

Observed output:

```text
Test Suites: 2 failed, 2 total
Tests:       3 failed, 15 passed, 18 total
```

The failures were expected: the HTTP query did not include `timezoneOffsetMinutes`, SQLite still used `strftime('%H:%M', horario)` without modifiers, and the default `Date.getTimezoneOffset()` was not present in query parameters.

### GREEN

Command:

```text
npx jest database/__tests__/useVendaDatabse.test.tsx services/__tests__/vendas.test.ts --runInBand
```

Observed output:

```text
Test Suites: 2 passed, 2 total
Tests:       18 passed, 18 total
```

The focused tests prove:

- `timezoneOffsetMinutes=180` is sent with hour filters and omitted without them.
- `totalMin=10,50` remains a query parameter rather than being interpolated or rewritten on the mobile side.
- Both hour predicates use bound `-03:00` modifiers for offset `+180`.
- `countParams` and `sumParams` receive the same modifiers.
- An omitted offset uses the device's `Date.getTimezoneOffset()`.

## Full validation

| Command | Result |
|---|---|
| `npx jest --watchAll=false --runInBand` | exit code 0; `14 passed` suites, `66 passed` tests, `1 passed` snapshot |
| `npx tsc --noEmit` | exit code 0; no diagnostics |
| `git diff --check` | exit code 0; no whitespace errors |
| `npx expo run:android` | could not start: `ANDROID_HOME` points to non-existing `C:\Users\lipoi\AppData\Local\Android\Sdk` and `adb` is not recognized |

## Files changed

- `services/vendas.ts`
- `database/vendasQuery.ts`
- `services/__tests__/vendas.test.ts`
- `database/__tests__/useVendaDatabse.test.tsx`

No screen behavior or unrelated repository was changed. No push or merge was performed.

## Concerns

- The native Android build was not validated because the local SDK/ADB environment is unavailable; this is an environment limitation, not a code decision.
- The SQLite modifier follows the JavaScript `Date.getTimezoneOffset()` convention: positive values subtract time from UTC (`+180` becomes `-03:00`).

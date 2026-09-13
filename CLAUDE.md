# Locator Pilot — working instructions

- After implementing or fixing any feature (source changes under `src/`), always
  run, in order, before reporting the work as done:
  1. `npm run typecheck`
  2. `npm test` (vitest)
  3. `npm run build` — rebuilds `dist/` so the user can load it as an unpacked
     extension (`chrome://extensions` → Developer Mode → Load unpacked → `dist/`)
     and test it manually right away.
- Don't consider a backlog item finished until `dist/` reflects it. If any of the
  three steps above fail, fix the failure before declaring the task complete.
- Update `BACKLOG.md` (check off the item, add a one-line pointer to the fix/files)
  as part of the same change, not as a separate follow-up.

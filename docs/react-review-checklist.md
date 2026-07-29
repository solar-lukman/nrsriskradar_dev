# React Hooks & State Management Review Checklist

Focus areas when reviewing frontend PRs. These are enforced by `npm run lint` and the reviewer checklist in the PR template.

## Rules of Hooks

- Hooks are called at the top of the component in the same order on every render.
- No hooks inside `if`, `for`, `try`, callbacks, or after an early `return`.
- Custom hooks start with `use…` and follow the same rules.
- Regressions of "Rendered more hooks than during the previous render" almost always mean an effect or state hook moved below a conditional return — see the fix that landed in `src/pages/AuditLogViewer.tsx`.

## `useEffect` dependencies

- `react-hooks/exhaustive-deps` is set to `error`. Do not silence it without a written reason on the same line.
- Prefer moving the derivation into `useMemo` or a pure helper rather than omitting dependencies.
- Always return a cleanup for subscriptions, `setTimeout`, `setInterval`, event listeners, and Supabase realtime channels.

```tsx
useEffect(() => {
  const channel = supabase.channel('risks').on(...).subscribe();
  return () => { supabase.removeChannel(channel); };
}, [supabase]);
```

## Data fetching

- Use React Query (`@tanstack/react-query`) — it is already the project standard. Add a new `useXxx` hook rather than a raw `useEffect + useState + supabase.from(...)` pair.
- Server data belongs in the query cache, not in component state.
- Invalidate the right key after mutations (`queryClient.invalidateQueries({ queryKey: ['risks'] })`).
- Ad-hoc `useEffect` fetches are acceptable only for one-shot boot-time reads that will never be re-fetched.

## Memoisation

- `useMemo` / `useCallback` are opt-in optimisations. Add them only when:
  - The value is passed to a memoised child (`React.memo`, `useMemo` in a downstream `useEffect` dep list), OR
  - Profiling shows the recomputation is expensive.
- Never memoise primitive values or trivial JSX — it costs more than it saves.

## State shape

- Colocate state with the component that uses it. Lift only when siblings need it.
- Avoid prop drilling deeper than two levels — use context (`AuthContext`, `NotificationContext` patterns already exist) or a query hook.
- Do not duplicate server data into local state. Read from React Query and derive.

## Component size

- Components over ~300 LOC or ~3 responsibilities should be split.
- Extract dialogs, tables, and forms into their own files (the project already does this — see `src/components/risk-register/` for the pattern).

## Cleanup and unmount safety

- Guard against `setState` after unmount for async work that cannot be cancelled. React Query handles this automatically — prefer it.
- Remove event listeners, observers, and portals in the effect cleanup.

## Accessibility & UX (secondary but blocking on UI PRs)

- Interactive elements have accessible names.
- Forms surface field-level errors inline; do not rely on a single toast.
- Loading and empty states are handled explicitly.

## Automated checks

```bash
npm run lint      # ESLint (includes rules-of-hooks + exhaustive-deps at error)
npm run test      # Vitest
```

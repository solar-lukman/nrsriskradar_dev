/**
 * Regenerates docs/permission-matrix.md from src/lib/permissions.ts.
 *
 *   bun run scripts/gen-permission-matrix.ts
 *
 * The generated file is the human-readable twin of the frozen snapshot in
 * src/test/permissionMatrix.test.ts — never edit it by hand.
 */
import { writeFileSync } from 'node:fs';
import {
  ACTION_ACCESS,
  ALL_ROLES,
  ROLE_PERMISSIONS,
  ROUTE_ACCESS,
  canAccessRoute,
  canPerformAction,
  canSeeInSidebar,
} from '../src/lib/permissions';

const tick = (v: boolean) => (v ? '✅' : '—');
const header = `| | ${ALL_ROLES.join(' | ')} |\n|---|${ALL_ROLES.map(() => '---').join('|')}|`;

const routeRows = ROUTE_ACCESS.map((r) => {
  const cells = ALL_ROLES.map((role) => {
    const guard = canAccessRoute(role, r.path);
    const nav = canSeeInSidebar(role, r.path);
    if (guard && nav) return '✅';
    if (guard) return '🔗'; // reachable by deep link, hidden from the sidebar
    return '—';
  });
  return `| \`${r.path}\` | ${cells.join(' | ')} |`;
}).join('\n');

const actionRows = ACTION_ACCESS.map((a) => {
  const cells = ALL_ROLES.map((role) => tick(canPerformAction(role, a.id)));
  return `| ${a.label} (\`${a.id}\`) | ${cells.join(' | ')} |`;
}).join('\n');

const serverRows = ACTION_ACCESS.map(
  (a) => `| \`${a.id}\` | ${a.label} | ${a.serverCounterpart} |`,
).join('\n');

const permissionRows = ALL_ROLES.map(
  (role) => `| ${role} | ${ROLE_PERMISSIONS[role].map((p) => `\`${p}\``).join(', ')} |`,
).join('\n');

const doc = `# Role → action permission matrix

> Generated from \`src/lib/permissions.ts\` by \`scripts/gen-permission-matrix.ts\`.
> Do not edit by hand — run \`bun run scripts/gen-permission-matrix.ts\` after changing the source.

Legend: ✅ allowed · 🔗 reachable by deep link only (no sidebar entry) · — denied.

## 1. Role → permission strings

| Role | Permissions |
|---|---|
${permissionRows}

## 2. Role → route

${header}
${routeRows}

## 3. Role → action

${header}
${actionRows}

## 4. Server-side counterpart for every gated action

Client gating is a convenience; the database is the boundary (ADR-0009).

| Action | Control | Server enforcement |
|---|---|---|
${serverRows}
`;

writeFileSync(new URL('../docs/permission-matrix.md', import.meta.url), doc);
console.log('docs/permission-matrix.md regenerated');

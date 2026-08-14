import { describe, it, expect } from "vitest";
// Raw source of the router, used to assert every route declares an access rule.
import appSource from "../App.tsx?raw";

import {
  ACTION_ACCESS,
  ALL_ROLES,
  ROUTE_ACCESS,
  buildActionMatrix,
  buildRouteMatrix,
  canAccessRoute,
  canPerformAction,
  canSeeInSidebar,
} from "@/lib/permissions";

/**
 * Tier 1 of the role-permission enforcement strategy.
 *
 * The full role x route and role x action grids are frozen as snapshots.
 * An intentional permission change requires updating the snapshot in the same
 * commit; an accidental one fails CI.
 */
describe("permission matrix — frozen truth table", () => {
  it("role x route (sidebar + guard) grid is unchanged", () => {
    expect(buildRouteMatrix()).toMatchSnapshot();
  });

  it("role x action grid is unchanged", () => {
    expect(buildActionMatrix()).toMatchSnapshot();
  });
});

describe("permission matrix — structural rules", () => {
  it("every authenticated route in App.tsx is declared in ROUTE_ACCESS", () => {
    const appSrc = appSource as string;
    const block = appSrc.slice(
      appSrc.indexOf("const protectedRoutes"),
      appSrc.indexOf("const App ="),
    );
    const declared = new Set(ROUTE_ACCESS.map((r) => r.path));
    const undeclared = [...block.matchAll(/path:\s*"([^"]+)"/g)]
      .map((m) => m[1])
      .filter((p) => !declared.has(p));
    expect(undeclared, "routes missing from ROUTE_ACCESS").toEqual([]);
  });

  it("every gated action names a server-side counterpart (ADR-0009)", () => {
    const missing = ACTION_ACCESS.filter((a) => !a.serverCounterpart?.trim()).map((a) => a.id);
    expect(missing, "actions with client-only gating").toEqual([]);
  });

  it("action ids and route paths are unique", () => {
    expect(new Set(ACTION_ACCESS.map((a) => a.id)).size).toBe(ACTION_ACCESS.length);
    expect(new Set(ROUTE_ACCESS.map((r) => r.path)).size).toBe(ROUTE_ACCESS.length);
  });
});

describe("permission matrix — hard invariants", () => {
  it("ADMIN can reach every route and perform every action", () => {
    for (const route of ROUTE_ACCESS) {
      expect(canAccessRoute("ADMIN", route.path), route.path).toBe(true);
    }
    for (const action of ACTION_ACCESS) {
      expect(canPerformAction("ADMIN", action.id), action.id).toBe(true);
    }
  });

  it("CRO never reaches /user-management (sidebar, route, or action)", () => {
    expect(canSeeInSidebar("CRO", "/user-management")).toBe(false);
    expect(canAccessRoute("CRO", "/user-management")).toBe(false);
    expect(canPerformAction("CRO", "user.manage")).toBe(false);
  });

  it("read-only roles cannot mutate risks", () => {
    for (const role of ["EC", "ERMSC", "RCB", "USER"] as const) {
      expect(canPerformAction(role, "risk.create"), role).toBe(false);
      expect(canPerformAction(role, "risk.edit_any"), role).toBe(false);
      expect(canPerformAction(role, "risk.delete"), role).toBe(false);
      expect(canPerformAction(role, "risk.approve"), role).toBe(false);
    }
  });

  it("only ADMIN may change roles, settings, or sample data", () => {
    for (const role of ALL_ROLES.filter((r) => r !== "ADMIN")) {
      expect(canPerformAction(role, "user.set_role"), role).toBe(false);
      expect(canPerformAction(role, "settings.manage"), role).toBe(false);
      expect(canPerformAction(role, "sampledata.manage"), role).toBe(false);
    }
  });

  it("whistleblow case management is limited to RMD, CRO, SUPERVISOR, ADMIN", () => {
    const allowed = ALL_ROLES.filter((r) => canPerformAction(r, "whistleblow.triage"));
    expect(allowed.sort()).toEqual(["ADMIN", "CRO", "RMD", "SUPERVISOR"]);
  });

  it("every role has at least one reachable route", () => {
    for (const role of ALL_ROLES) {
      const reachable = ROUTE_ACCESS.filter((r) => canAccessRoute(role, r.path));
      expect(reachable.length, `${role} has no reachable route`).toBeGreaterThan(0);
    }
  });
});

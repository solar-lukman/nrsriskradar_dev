import React, { useEffect, useState } from "react";
import { MainLayout } from "@/components/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AccessDenied } from "@/components/AccessDenied";
import { Lock, Unlock, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

interface OverviewRow {
  user_id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  role: string;
  is_locked: boolean;
  locked_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  assigned_roles: string[];
}

interface AuditRow {
  id: string;
  performed_at: string;
  user_id: string | null;
  action: string;
  severity: string;
  details: Record<string, unknown> | null;
}

export default function AuthVerification() {
  const { user, profile, session } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [myRoles, setMyRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [excludeWB, setExcludeWB] = useState(false);
  const [exportResult, setExportResult] = useState<{
    prefix: string;
    signed_urls: Array<{ path: string; signedUrl: string }>;
    results: Array<{ table: string; rows: number; path: string }>;
    expires_in_seconds: number;
  } | null>(null);

  const isAdminOrCRO = profile?.role === "ADMIN" || profile?.role === "CRO";

  useEffect(() => {
    if (!user || !isAdminOrCRO) return;
    (async () => {
      setLoading(true);
      const [{ data: overview }, { data: ev }, { data: ur }] = await Promise.all([
        supabase.rpc("get_admin_auth_overview"),
        supabase.from("system_audit_logs")
          .select("id, performed_at, user_id, action, severity, details")
          .eq("category", "authentication")
          .order("performed_at", { ascending: false })
          .limit(100),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
        setRows((overview as unknown as OverviewRow[]) ?? []);
        setEvents((ev as unknown as AuditRow[]) ?? []);
        setMyRoles(((ur as unknown as { role: string }[]) ?? []).map((r) => r.role));
      setLoading(false);
    })();
  }, [user, isAdminOrCRO]);

  if (!isAdminOrCRO) return <MainLayout><AccessDenied /></MainLayout>;

  const toggleLock = async (target: OverviewRow) => {
    const { error } = await supabase.rpc("admin_set_user_locked", {
      _user_id: target.user_id,
      _locked: !target.is_locked,
      _reason: target.is_locked ? null : "Locked from auth verification dashboard",
    });
    if (error) {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: target.is_locked ? "Account unlocked" : "Account locked" });
    setRows((prev) => prev.map((r) =>
      r.user_id === target.user_id ? { ...r, is_locked: !r.is_locked } : r));
  };

  const downloadCsv = () => {
    const header = ["email", "full_name", "department", "primary_role", "assigned_roles", "is_locked", "last_sign_in_at"];
    const csv = [header.join(",")].concat(
      rows.map((r) => [
        r.email, r.full_name ?? "", r.department ?? "", r.role,
        r.assigned_roles.join("|"), r.is_locked, r.last_sign_in_at ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `auth-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const runOnpremExport = async () => {
    setExportBusy(true);
    setExportResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "export-onprem-snapshot",
        { body: { excludeWhistleblow: excludeWB } },
      );
      if (error) throw error;
      setExportResult(data);
      toast({
        title: "Snapshot exported",
        description: `${data.results.length} tables written to bucket prefix ${data.prefix}`,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Export failed", description: msg, variant: "destructive" });
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Authentication & RBAC Verification</h1>
          <p className="text-muted-foreground text-sm">
            Inspect sessions, user roles, and recent authentication events.
          </p>
        </div>

        <Tabs defaultValue="my-session">
          <TabsList>
            <TabsTrigger value="my-session">My session</TabsTrigger>
            <TabsTrigger value="all-users">All users</TabsTrigger>
            <TabsTrigger value="events">Recent auth events</TabsTrigger>
            {profile?.role === "ADMIN" && (
              <TabsTrigger value="onprem-export">On-prem export</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="my-session">
            <Card>
              <CardHeader>
                <CardTitle>Current session</CardTitle>
                <CardDescription>What the app knows about you right now.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><b>Email:</b> {user?.email}</div>
                <div><b>User ID:</b> <code className="text-xs">{user?.id}</code></div>
                <div><b>Profile role:</b> <Badge>{profile?.role}</Badge></div>
                <div><b>Assigned roles (user_roles):</b>{" "}
                  {myRoles.length ? myRoles.map((r) => <Badge key={r} variant="secondary" className="mr-1">{r}</Badge>) : "—"}
                </div>
                <div><b>Effective sidebar role:</b> <Badge variant="outline">{user?.role}</Badge></div>
                <div><b>JWT expires:</b>{" "}
                  {session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString() : "—"}
                </div>
                <div><b>AAL (MFA level):</b> {(session as unknown as { user?: { aal?: string } })?.user?.aal ?? "aal1"}</div>
                {profile?.role === user?.role ? (
                  <div className="mt-3 p-3 rounded bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300">
                    Profile role and effective role match. RBAC is consistent.
                  </div>
                ) : (
                  <div className="mt-3 p-3 rounded bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300">
                    Mismatch between profile.role ({profile?.role}) and effective role ({user?.role}).
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all-users">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>All users ({rows.length})</CardTitle>
                  <CardDescription>Roles, lock status, and last sign-in.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={downloadCsv}>Export CSV</Button>
              </CardHeader>
              <CardContent>
                {loading ? "Loading…" : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Last sign-in</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.user_id}>
                          <TableCell className="font-medium">{r.email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{r.role}</Badge>
                            {r.assigned_roles.filter((x) => x !== r.role).map((x) => (
                              <Badge key={x} variant="outline" className="ml-1">{x}</Badge>
                            ))}
                          </TableCell>
                          <TableCell>{r.department ?? "—"}</TableCell>
                          <TableCell className="text-xs">
                            {r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleString() : "Never"}
                          </TableCell>
                          <TableCell>
                            {r.is_locked
                              ? <Badge variant="destructive">Locked</Badge>
                              : <Badge variant="outline">Active</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            {profile?.role === "ADMIN" && (
                              <Button size="sm" variant="ghost" onClick={() => toggleLock(r)}>
                                {r.is_locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>Recent authentication events</CardTitle>
                <CardDescription>Last 100 entries from system_audit_logs.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{new Date(e.performed_at).toLocaleString()}</TableCell>
                        <TableCell><code className="text-xs">{e.action}</code></TableCell>
                        <TableCell>
                          <Badge variant={e.severity === "high" ? "destructive" : "secondary"}>{e.severity}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{e.user_id ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {profile?.role === "ADMIN" && (
            <TabsContent value="onprem-export">
              <Card>
                <CardHeader>
                  <CardTitle>Export snapshot for on-premise clone</CardTitle>
                  <CardDescription>
                    Dumps every application table to newline-delimited JSON in the private
                    <code className="mx-1">onprem-exports</code> bucket, plus a manifest and
                    signed 1-hour download URLs. Auth users are exported without passwords —
                    on-prem users must reset via password-reset email on first login.
                    Every export is written to system_audit_logs at severity <b>high</b>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    <b>Sensitive data warning.</b> The snapshot contains every risk,
                    incident, BCP, and audit log in the system. Encrypt the downloaded
                    files before transferring (e.g. <code>gpg --symmetric</code>) and
                    delete them from the bucket after import.
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={excludeWB}
                      onCheckedChange={(v) => setExcludeWB(v === true)}
                    />
                    Exclude whistleblowing tables (cases, messages, audit log)
                  </label>
                  <Button onClick={runOnpremExport} disabled={exportBusy}>
                    {exportBusy ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting…</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" /> Run export</>
                    )}
                  </Button>

                  {exportResult && (
                    <div className="space-y-2">
                      <div className="text-sm">
                        Prefix: <code>{exportResult.prefix}</code> · Links expire in{" "}
                        {Math.round(exportResult.expires_in_seconds / 60)} min
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Table</TableHead>
                            <TableHead className="text-right">Rows</TableHead>
                            <TableHead>Download</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exportResult.signed_urls.map((u) => {
                            const table = u.path.split("/").pop()?.replace(/\.(ndjson|json)$/, "") ?? u.path;
                            const rowMatch = exportResult.results.find((r) => r.path === u.path);
                            return (
                              <TableRow key={u.path}>
                                <TableCell className="font-mono text-xs">{table}</TableCell>
                                <TableCell className="text-right text-xs">
                                  {rowMatch ? rowMatch.rows.toLocaleString() : "—"}
                                </TableCell>
                                <TableCell>
                                  <a
                                    className="text-primary underline text-xs"
                                    href={u.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Download
                                  </a>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
}

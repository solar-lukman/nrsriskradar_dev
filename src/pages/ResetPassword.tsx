import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SeoHead } from "@/components/SeoHead";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Supabase parses the recovery hash and emits PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // If user already has a session via the hash
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 12) {
      toast({ title: "Password too short", description: "Use at least 12 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    try { await supabase.rpc("log_password_change_event"); } catch { /* non-fatal */ }
    toast({ title: "Password updated", description: "You can now sign in with your new password." });
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-card flex items-center justify-center p-4">
      <SeoHead
        title="Set New Password"
        description="Complete your password reset for the NRS Risk Management Portal."
        path="/reset-password"
      />
      <Card className="w-full max-w-md shadow-enterprise">
        <CardHeader>
          <h1 className="sr-only">Set New Password</h1>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            {ready ? "Enter and confirm your new password." : "Validating recovery link…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} disabled={!ready} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} disabled={!ready} required />
            </div>
            <Button type="submit" variant="enterprise" className="w-full"
              disabled={!ready || loading}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, Mail, Building2, KeyRound, Camera, Info, Lock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartments } from '@/hooks/useDepartments';
import { z } from 'zod';

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
});

const passwordSchema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export default function ProfilePage() {
  const { user, profile, isLoading } = useAuth();
  const { toast } = useToast();

  const isAdmin = (profile?.role || user?.role) === 'ADMIN';
  const { departments, loading: deptsLoading } = useDepartments(true);

  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setDepartment(profile.department || '');
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  const initials = useMemo(() => {
    const source = profile?.full_name || profile?.email || user?.email || '?';
    return source
      .split(/\s+/)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [profile, user]);

  // Loading state
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading your profile…
        </div>
      </MainLayout>
    );
  }

  // Not signed in — friendly inline message
  if (!user) {
    return (
      <MainLayout>
        <div className="max-w-2xl">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>You are not signed in</AlertTitle>
            <AlertDescription>
              Please sign in to view and manage your profile.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  // Signed in but profile record missing — friendly inline message
  if (!profile) {
    return (
      <MainLayout>
        <div className="max-w-2xl space-y-4">
          <div>
            <h1 className="text-3xl font-bold">My Profile</h1>
            <p className="text-muted-foreground">Manage your personal information and account security.</p>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Your profile record is not set up yet</AlertTitle>
            <AlertDescription>
              We could not find a profile linked to your account ({user.email}). This is usually a one-time
              setup step. Please contact your administrator so they can finish creating your profile, then
              refresh this page.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      toast({ title: 'Unsupported image', description: 'Please upload a PNG, JPG, WEBP or GIF.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast({ title: 'Image too large', description: 'Maximum size is 2 MB.', variant: 'destructive' });
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = pub.publicUrl;

      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id);
      if (updErr) throw updErr;

      setAvatarUrl(publicUrl);
      toast({ title: 'Avatar updated', description: 'Your new profile picture has been saved.' });
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      toast({ title: 'Upload failed', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = profileSchema.safeParse({ full_name: fullName });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const k = i.path[0] as string;
        if (k && !errs[k]) errs[k] = i.message;
      });
      setProfileErrors(errs);
      return;
    }
    setProfileErrors({});
    setSavingProfile(true);
    try {
      // Only allow updating department when admin
      const update: { full_name: string; department?: string | null } = {
        full_name: fullName.trim(),
      };
      if (isAdmin) update.department = department.trim() || null;

      const { error } = await supabase.from('profiles').update(update).eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Profile updated', description: 'Your changes have been saved.' });
    } catch (err: any) {
      console.error('Profile update failed:', err);
      toast({ title: 'Update failed', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse({ newPassword, confirmPassword });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const k = i.path[0] as string;
        if (k && !errs[k]) errs[k] = i.message;
      });
      setPasswordErrors(errs);
      return;
    }
    setPasswordErrors({});
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // Best-effort audit log; don't block UX on failure
      const { error: auditErr } = await supabase.rpc('log_password_change_event');
      if (auditErr) console.warn('Password audit log failed:', auditErr);

      setNewPassword('');
      setConfirmPassword('');
      toast({ title: 'Password updated', description: 'Use your new password next time you sign in.' });
    } catch (err: any) {
      console.error('Password update failed:', err);
      toast({ title: 'Could not update password', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSavingPassword(false);
    }
  };

  const fieldErr = (errs: Record<string, string>, k: string) =>
    errs[k] ? <p className="text-xs text-destructive mt-1">{errs[k]}</p> : null;

  return (
    <MainLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold">My Profile</h1>
          <p className="text-muted-foreground">
            Manage your personal information and account security.
          </p>
        </div>

        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your identity and assigned role.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4 flex-wrap">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatarUrl || undefined} alt={profile.full_name || ''} />
                  <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xl">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 rounded-full bg-primary text-primary-foreground p-1.5 shadow hover:opacity-90 disabled:opacity-60"
                  aria-label="Change avatar"
                  title="Change avatar"
                >
                  {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={AVATAR_TYPES.join(',')}
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <div className="text-lg font-semibold">{profile.full_name || user.email}</div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" /> {profile.email || user.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="w-4 h-4" /> {profile.department || 'No department set'}
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                  <Badge variant="secondary">{profile.role || user.role}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Roles are managed by an administrator.
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, WEBP or GIF · max 2 MB
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Editable details */}
        <Card>
          <CardHeader>
            <CardTitle>Personal information</CardTitle>
            <CardDescription>Update how your name appears across the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name *</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={120}
                    required
                  />
                  {fieldErr(profileErrors, 'full_name')}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department" className="flex items-center gap-1">
                    Department
                    {!isAdmin && <Lock className="w-3 h-3 text-muted-foreground" aria-hidden />}
                  </Label>
                  <Select
                    value={department || '__none__'}
                    onValueChange={(v) => setDepartment(v === '__none__' ? '' : v)}
                    disabled={!isAdmin || deptsLoading}
                  >
                    <SelectTrigger id="department">
                      <SelectValue placeholder={deptsLoading ? 'Loading…' : 'Select a department'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {/* Ensure current value is always visible even if inactive/missing */}
                      {department && !departments.some((d) => d.name === department) && (
                        <SelectItem value={department}>{department} (current)</SelectItem>
                      )}
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.name}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      Department is managed by an administrator. Contact your admin to request a change.
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={profile.email || user.email} disabled readOnly />
                <p className="text-xs text-muted-foreground">
                  Contact an administrator to change your email address.
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" /> Change password
            </CardTitle>
            <CardDescription>
              Use a strong password of at least 8 characters. You will stay signed in after changing it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  {fieldErr(passwordErrors, 'newPassword')}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  {fieldErr(passwordErrors, 'confirmPassword')}
                </div>
              </div>
              <Separator />
              <div className="flex justify-end">
                <Button type="submit" disabled={savingPassword || !newPassword}>
                  {savingPassword && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

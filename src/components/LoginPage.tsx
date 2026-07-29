import React, { useState } from 'react';
import { Building2, Shield, Users, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Missing fields",
        description: "Please enter both email and password.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast({
          title: "Sign in failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "Successfully signed in to NRS Risk Management Portal",
        });
      }
    } catch (error) {
      toast({
        title: "Sign in failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password || !fullName) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await signUp(email, password, { full_name: fullName });
      if (error) {
        toast({
          title: "Sign up failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Account created!",
          description: "Please check your email for verification.",
        });
        setActiveTab('signin');
      }
    } catch (error) {
      toast({
        title: "Sign up failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const DEMO_PASSWORD = 'NrsDemo2026!';
  const SHOW_DEMO = (import.meta.env.VITE_SHOW_DEMO_ACCOUNTS ?? 'true') !== 'false';
  const PUBLIC_SIGNUP = (import.meta.env.VITE_DISABLE_PUBLIC_SIGNUP ?? 'false') !== 'true';

  const DEMO_ACCOUNTS: { role: string; email: string; label: string }[] = [
    { role: 'RC', email: 'rc@nrs-test.local', label: 'Risk Champion' },
    { role: 'RR', email: 'rr@nrs-test.local', label: 'Risk Reviewer' },
    { role: 'RO', email: 'ro@nrs-test.local', label: 'Risk Owner' },
    { role: 'RMD', email: 'rmd@nrs-test.local', label: 'Risk Mgmt Dept' },
    { role: 'CRO', email: 'cro@nrs-test.local', label: 'Chief Risk Officer' },
    { role: 'EC', email: 'ec@nrs-test.local', label: 'Exec. Chairman' },
    { role: 'ERMSC', email: 'ermsc@nrs-test.local', label: 'ERM Steering' },
    { role: 'RCB', email: 'rcb@nrs-test.local', label: 'Board Risk Cmte' },
    { role: 'SUPERVISOR', email: 'supervisor@nrs-test.local', label: 'Supervisor' },
    { role: 'ADMIN', email: 'admin@nrs-test.local', label: 'Administrator' },
    { role: 'USER', email: 'user@nrs-test.local', label: 'General User' },
  ];

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: 'Enter your email first', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: 'Could not send reset email', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Reset email sent', description: 'Check your inbox for the recovery link.' });
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setIsLoading(true);
    try {
      const { error } = await signIn(demoEmail, DEMO_PASSWORD);
      if (error) {
        toast({
          title: 'Demo sign-in failed',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Signed in',
          description: `Logged in as ${demoEmail}`,
        });
      }
    } catch (err) {
      console.error('Demo login error:', err);
      toast({
        title: 'Demo sign-in failed',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-card flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left Side - Branding */}
        <div className="hidden lg:flex flex-col justify-center space-y-6 text-center">
          <div className="space-y-4">
            <div className="flex justify-center">
              <img 
                src="/nrs-logo.jpg" 
                alt="NRS Risk Management Portal" 
                className="h-20 object-contain"
              />
            </div>
            <h1 className="text-4xl font-bold text-foreground">
              NRS Risk Management Portal
            </h1>
            <p className="text-lg text-muted-foreground max-w-md mx-auto">
              Nigeria Revenue Service — Digitize, centralize, and streamline enterprise risk management with ISO 31000 compliance.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 gap-4 max-w-md mx-auto">
            <div className="flex items-center space-x-3 text-sm">
              <Building2 className="w-5 h-5 text-primary" />
              <span>ISO 31000 Compliance</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <Users className="w-5 h-5 text-primary" />
              <span>Role-Based Access Control</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <AlertTriangle className="w-5 h-5 text-primary" />
              <span>Real-Time Risk Monitoring</span>
            </div>
          </div>
        </div>

        {/* Right Side - Auth Forms */}
        <div className="w-full max-w-md mx-auto lg:mx-0">
          <Card className="shadow-enterprise">
            <CardHeader className="space-y-1">
              <h2 className="sr-only">Access Portal</h2>
              <CardTitle className="text-2xl font-bold">Access Portal</CardTitle>
              <CardDescription>
                Sign in to your account or create a new one
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className={`grid w-full ${PUBLIC_SIGNUP ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  {PUBLIC_SIGNUP && <TabsTrigger value="signup">Sign Up</TabsTrigger>}
                </TabsList>

                <TabsContent value="signin" className="space-y-4">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="user@nrs.gov.ng"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="Your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11"
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      variant="enterprise"
                      size="lg"
                      className="w-full"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Signing In...' : 'Sign In'}
                    </Button>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="block w-full text-xs text-muted-foreground hover:text-primary text-center mt-2"
                    >
                      Forgot your password?
                    </button>
                  </form>
                </TabsContent>

                {PUBLIC_SIGNUP && (
                <TabsContent value="signup" className="space-y-4">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input id="signup-name" type="text" placeholder="Your full name"
                        value={fullName} onChange={(e) => setFullName(e.target.value)}
                        className="h-11" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" placeholder="user@nrs.gov.ng"
                        value={email} onChange={(e) => setEmail(e.target.value)}
                        className="h-11" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input id="signup-password" type="password" placeholder="Create a password"
                        value={password} onChange={(e) => setPassword(e.target.value)}
                        className="h-11" required />
                    </div>
                    <Button type="submit" variant="enterprise" size="lg" className="w-full" disabled={isLoading}>
                      {isLoading ? 'Creating Account...' : 'Create Account'}
                    </Button>
                  </form>
                </TabsContent>
                )}
              </Tabs>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                <p>Protected by enterprise security</p>
              </div>
            </CardContent>
          </Card>

          {SHOW_DEMO && (
          <div className="mt-6 space-y-2">
            <p className="text-sm text-muted-foreground text-center mb-1">Quick Demo Access</p>
            <p className="text-[11px] text-muted-foreground text-center mb-3">
              Test seeded accounts · password: <code className="font-mono">NrsDemo2026!</code>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <Button key={acc.role} variant="outline" size="sm"
                  onClick={() => handleDemoLogin(acc.email)} disabled={isLoading}
                  className="flex flex-col h-auto py-2 px-2 leading-tight" title={acc.email}>
                  <span className="text-xs font-semibold">{acc.role}</span>
                  <span className="text-[10px] text-muted-foreground">{acc.label}</span>
                </Button>
              ))}
            </div>
          </div>
          )}

          {/* Whistleblowing Link */}
          <div className="mt-4 text-center">
            <Link
              to="/whistleblow"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive font-bold text-sm hover:bg-destructive/20 transition-colors"
            >
              <Shield className="w-4 h-4" />
              Report Misconduct Anonymously
            </Link>
            <p className="text-xs text-muted-foreground mt-1.5">Secure, anonymous whistleblowing — no login required</p>
          </div>
        </div>
      </div>
    </div>
  );
}

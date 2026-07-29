import React, { useState, useEffect, useRef } from 'react';
import { Shield, ArrowRight, ArrowLeft, Check, Copy, Eye, EyeOff, Lock, Paperclip, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SeoHead } from '@/components/SeoHead';

const CATEGORIES = ['Fraud', 'Corruption', 'Harassment', 'Safety', 'Policy Violation', 'Financial Misconduct', 'Other'];

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

export default function WhistleblowSubmit() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [caseReference, setCaseReference] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    category: '',
    date_of_incident: '',
    location: '',
    subject: '',
    description: '',
    individuals_involved: '',
    evidence_description: '',
    passphrase: '',
    confirmPassphrase: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string>('');

  const MAX_FILES = 5;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_EXT = ['pdf','png','jpg','jpeg','gif','webp','txt','csv','doc','docx','xls','xlsx'];
  const ALLOWED_MIME = new Set([
    'application/pdf',
    'image/png','image/jpeg','image/gif','image/webp',
    'text/plain','text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]);
  const ACCEPTED = '.' + ALLOWED_EXT.join(',.');
  const formatBytes = (b: number) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`;

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFileError('');
    const next = [...files];
    const errors: string[] = [];
    for (const f of Array.from(incoming)) {
      if (next.length >= MAX_FILES) { errors.push(`Only ${MAX_FILES} files allowed — "${f.name}" skipped.`); break; }
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      const typeOk = ALLOWED_MIME.has(f.type) || (!f.type && ALLOWED_EXT.includes(ext)) || ALLOWED_EXT.includes(ext);
      if (!typeOk) { errors.push(`"${f.name}" — file type not allowed.`); continue; }
      if (f.size === 0) { errors.push(`"${f.name}" is empty.`); continue; }
      if (f.size > MAX_FILE_BYTES) { errors.push(`"${f.name}" is ${formatBytes(f.size)} — exceeds 10MB limit.`); continue; }
      if (next.some(x => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    if (errors.length) setFileError(errors.join(' '));
    setFiles(next);
  };
  const removeFile = (i: number) => setFiles(f => f.filter((_, idx) => idx !== i));


  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || '');
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  // --- Cloudflare Turnstile (lightweight human verification) ---
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Fetch the public site key from the config edge function once.
  useEffect(() => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    fetch(`https://${projectId}.supabase.co/functions/v1/whistleblow-config`)
      .then(r => r.json())
      .then(d => setSiteKey(d?.turnstile_site_key || ''))
      .catch(() => setSiteKey(''));
  }, []);

  // Inject the Turnstile script once we know a site key is configured.
  useEffect(() => {
    if (!siteKey) return;
    if (document.querySelector('script[data-turnstile]')) return;
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.setAttribute('data-turnstile', 'true');
    document.head.appendChild(s);
  }, [siteKey]);

  // Render the widget when step 4 mounts and the script is ready.
  useEffect(() => {
    if (step !== 4 || !siteKey || !widgetContainerRef.current) return;
    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile) { setTimeout(tryRender, 200); return; }
      if (widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(widgetContainerRef.current!, {
        sitekey: siteKey,
        callback: (token: string) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(''),
        'error-callback': () => setCaptchaToken(''),
        theme: 'auto',
      });
    };
    tryRender();
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
        widgetIdRef.current = null;
      }
    };
  }, [step, siteKey]);

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const captchaRequired = siteKey !== null && siteKey !== '';

  const canProceed = () => {
    switch (step) {
      case 1: return !!form.category;
      case 2: return form.subject.trim().length >= 3 && form.description.trim().length >= 10;
      case 3: return true;
      case 4:
        return (
          form.passphrase.length >= 6 &&
          form.passphrase === form.confirmPassphrase &&
          (!captchaRequired || !!captchaToken)
        );
      default: return false;
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setUploadProgress(0);
    try {
      const attachments = await Promise.all(
        files.map(async (f) => ({
          file_name: f.name,
          file_type: f.type || null,
          data: await fileToBase64(f),
        })),
      );

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const body = JSON.stringify({
        category: form.category,
        subject: form.subject,
        description: form.description,
        date_of_incident: form.date_of_incident || null,
        location: form.location || null,
        individuals_involved: form.individuals_involved || null,
        evidence_description: form.evidence_description || null,
        passphrase: form.passphrase,
        turnstile_token: captchaToken || undefined,
        attachments: attachments.length ? attachments : undefined,
      });

      const data = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://${projectId}.supabase.co/functions/v1/whistleblow-submit`);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.upload.onload = () => setUploadProgress(100);
        xhr.onerror = () => reject(new Error('Network error — please check your connection and try again.'));
        xhr.ontimeout = () => reject(new Error('Upload timed out. Please retry with fewer or smaller files.'));
        xhr.onload = () => {
          let parsed: any = {};
          try { parsed = JSON.parse(xhr.responseText || '{}'); } catch { /* noop */ }
          if (xhr.status >= 200 && xhr.status < 300) return resolve(parsed);
          if (xhr.status === 413) return reject(new Error('Upload too large. Please remove some attachments and try again.'));
          if (xhr.status === 429) return reject(new Error('Too many attempts. Please wait a few minutes before trying again.'));
          reject(new Error(parsed?.error || `Submission failed (HTTP ${xhr.status}).`));
        };
        xhr.send(body);
      });

      const failed = (data.attachments || []).filter((a: any) => !a.ok);
      setCaseReference(data.case_reference);
      setSubmitted(true);
      toast.success('Report submitted successfully');
      if (failed.length) {
        const names = failed.map((a: any) => a.file_name).filter(Boolean).slice(0, 3).join(', ');
        toast.warning(
          `${failed.length} attachment(s) could not be uploaded${names ? `: ${names}` : ''}. You can add them from the follow-up page.`,
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };


  const copyRef = () => {
    navigator.clipboard.writeText(caseReference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Report Submitted Successfully</CardTitle>
            <CardDescription>Your report has been securely received. Save the details below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted p-4 rounded-lg text-center">
              <p className="text-xs text-muted-foreground mb-1">Your Case Reference</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-mono font-bold text-foreground">{caseReference}</span>
                <Button variant="ghost" size="icon" onClick={copyRef} aria-label="Copy case reference">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="bg-destructive/10 border border-destructive/30 p-4 rounded-lg">
              <p className="text-sm font-semibold text-destructive mb-2">⚠️ Important — Save This Information</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Your <strong>case reference</strong> and <strong>passphrase</strong> are the only way to check your case status</li>
                <li>• We cannot recover your passphrase if lost</li>
                <li>• Write them down and store them securely</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link to="/whistleblow/status">Check Case Status</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/">Return to Homepage</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SeoHead
        title="Submit a Whistleblow Report"
        description="Anonymously report misconduct, fraud, or policy violations to the Nigeria Revenue Service. No login required — your identity is fully protected."
        path="/whistleblow/submit"
      />
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Confidential Whistleblowing Portal</h1>
              <p className="text-sm text-muted-foreground">Report misconduct securely and anonymously</p>
            </div>
          </div>
        </div>
      </div>

      {/* Anonymity guarantee banner */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-primary mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-foreground mb-1">Your Identity is Protected</p>
              <p className="text-muted-foreground">This form does not require login. We do not record your IP address, browser details, or any identifying information. Your report is completely anonymous.</p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s < step ? 'bg-primary text-primary-foreground' :
                s === step ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              }`}>
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 4 && <div className={`flex-1 h-0.5 mx-2 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <h2 className="sr-only">Step {step} of 4</h2>
            <CardTitle>
              {step === 1 && 'Incident Classification'}
              {step === 2 && 'Incident Details'}
              {step === 3 && 'Evidence & Supporting Information'}
              {step === 4 && 'Security Passphrase & Review'}
            </CardTitle>
            <CardDescription>
              {step === 1 && 'Select the category and provide basic incident info'}
              {step === 2 && 'Describe the incident in detail'}
              {step === 3 && 'Any additional evidence or context (optional)'}
              {step === 4 && 'Create a passphrase to securely follow up on your report'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <div>
                  <Label>Category *</Label>
                  <Select value={form.category} onValueChange={v => update('category', v)}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date of Incident</Label>
                  <Input type="date" value={form.date_of_incident} onChange={e => update('date_of_incident', e.target.value)} />
                </div>
                <div>
                  <Label>Location / Department</Label>
                  <Input placeholder="e.g., Lagos Branch, Finance Department" value={form.location} onChange={e => update('location', e.target.value)} />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <Label>Subject *</Label>
                  <Input placeholder="Brief title for the report" value={form.subject} onChange={e => update('subject', e.target.value)} maxLength={200} />
                  <div className="flex justify-between mt-1">
                    {form.subject.trim().length > 0 && form.subject.trim().length < 3 ? (
                      <p className="text-xs text-destructive">Subject must be at least 3 characters</p>
                    ) : <span />}
                    <p className="text-xs text-muted-foreground">{form.subject.length}/200 (min 3)</p>
                  </div>
                </div>
                <div>
                  <Label>Description *</Label>
                  <Textarea placeholder="Describe the incident in as much detail as possible (minimum 10 characters)..." value={form.description} onChange={e => update('description', e.target.value)} rows={6} maxLength={5000} />
                  <div className="flex justify-between mt-1">
                    {form.description.trim().length > 0 && form.description.trim().length < 10 ? (
                      <p className="text-xs text-destructive">Description must be at least 10 characters</p>
                    ) : <span />}
                    <p className="text-xs text-muted-foreground">{form.description.length}/5000 (min 10)</p>
                  </div>
                </div>
                <div>
                  <Label>Individuals Involved</Label>
                  <Textarea placeholder="Names, roles, or positions of people involved..." value={form.individuals_involved} onChange={e => update('individuals_involved', e.target.value)} rows={3} maxLength={2000} />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <Label>Evidence Description</Label>
                  <Textarea placeholder="Describe any documents, emails, or other evidence that support your report..." value={form.evidence_description} onChange={e => update('evidence_description', e.target.value)} rows={4} maxLength={3000} />
                </div>

                <div>
                  <Label>Attach Files (optional)</Label>
                  <label
                    htmlFor="wb-evidence-files"
                    className="mt-2 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:bg-muted/40 transition"
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                  >
                    <Upload className="w-6 h-6 text-muted-foreground" />
                    <p className="text-sm text-foreground">Click to upload or drag files here</p>
                    <p className="text-xs text-muted-foreground">
                      PDF, images, or Office documents · up to 10MB each · max {MAX_FILES} files
                    </p>
                    <input
                      id="wb-evidence-files"
                      type="file"
                      multiple
                      accept={ACCEPTED}
                      className="hidden"
                      onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                    />
                  </label>
                  {fileError && (
                    <div role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {fileError}
                    </div>
                  )}
                  {files.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        {files.length} of {MAX_FILES} file(s) selected · {formatBytes(files.reduce((a, f) => a + f.size, 0))} total
                      </p>
                      <ul className="space-y-2">

                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 bg-muted/40 rounded-md px-3 py-2 text-sm">
                          <span className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{f.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatBytes(f.size)}
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeFile(i)}
                            aria-label={`Remove ${f.name}`}
                            disabled={submitting}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </li>
                      ))}
                      </ul>
                    </div>
                  )}
                </div>


                <p className="text-sm text-muted-foreground">Files are encrypted in transit and only accessible to authorised investigators. You can share additional evidence through the follow-up page after submission.</p>
              </>
            )}



            {step === 4 && (
              <>
                <div className="bg-muted/50 p-4 rounded-lg mb-4">
                  <p className="text-sm font-medium text-foreground mb-2">Review Summary</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Category:</span><span className="font-medium">{form.category}</span>
                    <span className="text-muted-foreground">Subject:</span><span className="font-medium">{form.subject}</span>
                    {form.date_of_incident && <><span className="text-muted-foreground">Date:</span><span>{form.date_of_incident}</span></>}
                    {form.location && <><span className="text-muted-foreground">Location:</span><span>{form.location}</span></>}
                  </div>
                </div>
                <div>
                  <Label>Create Passphrase * (min 6 characters)</Label>
                  <div className="relative">
                    <Input
                      type={showPassphrase ? 'text' : 'password'}
                      placeholder="Choose a memorable passphrase"
                      value={form.passphrase}
                      onChange={e => update('passphrase', e.target.value)}
                      maxLength={100}
                    />
                    <Button variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPassphrase(!showPassphrase)} aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}>
                      {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>Confirm Passphrase *</Label>
                  <Input
                    type="password"
                    placeholder="Re-enter your passphrase"
                    value={form.confirmPassphrase}
                    onChange={e => update('confirmPassphrase', e.target.value)}
                    maxLength={100}
                  />
                  {form.confirmPassphrase && form.passphrase !== form.confirmPassphrase && (
                    <p className="text-xs text-destructive mt-1">Passphrases do not match</p>
                  )}
                </div>
                {captchaRequired && (
                  <div>
                    <Label>Human Verification *</Label>
                    <div ref={widgetContainerRef} className="mt-2" />
                    {!captchaToken && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Please complete the challenge above to enable submission.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {step === 4 && submitting && (
              <div className="pt-2" role="status" aria-live="polite">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>
                    {files.length > 0
                      ? (uploadProgress < 100 ? `Uploading evidence… ${uploadProgress}%` : 'Finalising submission…')
                      : 'Submitting report…'}
                  </span>
                  {files.length > 0 && <span>{uploadProgress}%</span>}
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${files.length > 0 ? uploadProgress : (submitting ? 60 : 0)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={submitting}>
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              ) : (
                <Button variant="outline" asChild><Link to="/">Cancel</Link></Button>
              )}
              {step < 4 ? (
                <Button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
                  Next <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={!canProceed() || submitting}>
                  {submitting
                    ? (files.length > 0 && uploadProgress < 100 ? `Uploading ${uploadProgress}%…` : 'Submitting…')
                    : 'Submit Report'}
                </Button>
              )}
            </div>

          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Link to="/whistleblow/status" className="text-sm text-primary hover:underline">
            Already submitted a report? Check your case status →
          </Link>
        </div>
      </div>
    </div>
  );
}

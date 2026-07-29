import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertCircle, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const DOCUMENT_TYPES = ['Policy', 'SOP', 'Risk Framework', 'Procedure', 'Guideline', 'Standard'];
const ISO_CATEGORIES = [
  'Strategic', 'Operational', 'Financial', 'Compliance',
  'Technology', 'Reputational', 'Environmental', 'Human Resources',
];
const STORAGE_BUCKET = 'control-documents';

// File validation
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'xlsx', 'xls', 'pptx', 'ppt'];
const ALLOWED_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'text/plain',
];

const formSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  description: z.string().trim().max(2000, 'Description too long').optional().or(z.literal('')),
  documentType: z.string().min(1, 'Document type is required'),
  documentNumber: z.string().trim().max(50, 'Document number too long').optional().or(z.literal('')),
  version: z.string().trim().min(1, 'Version is required').max(20, 'Version too long'),
  department: z.string().trim().max(100).optional().or(z.literal('')),
  effectiveDate: z.string().optional().or(z.literal('')),
  nextReviewDate: z.string().optional().or(z.literal('')),
}).refine(
  (d) => !d.effectiveDate || !d.nextReviewDate || new Date(d.nextReviewDate) >= new Date(d.effectiveDate),
  { message: 'Next review date must be on or after effective date', path: ['nextReviewDate'] },
);

export interface ControlDocumentFormValue {
  id?: string;
  title?: string | null;
  description?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  version?: string | null;
  department?: string | null;
  effective_date?: string | null;
  next_review_date?: string | null;
  file_url?: string | null;
  file_extension?: string | null;
  file_size?: number | null;
  status?: string | null;
  owner_id?: string | null;
  created_by?: string | null;
  metadata?: Record<string, any> | null;
}

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** When provided, dialog runs in edit mode for an existing draft. */
  editingDocument?: ControlDocumentFormValue | null;
  /** Whether the current user has manager-level permissions (RMD/CRO/ADMIN). */
  canManage?: boolean;
}

function validateFile(f: File): string | null {
  if (f.size > MAX_FILE_BYTES) {
    return `File exceeds the ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB limit.`;
  }
  if (f.size === 0) return 'File appears to be empty.';
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Unsupported file type ".${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
  }
  if (f.type && !ALLOWED_MIME_PREFIXES.some((p) => f.type.startsWith(p))) {
    // MIME may be empty on some browsers — extension check above is the fallback.
    return `Unsupported file content type "${f.type}".`;
  }
  return null;
}

export function UploadDocumentDialog({
  open,
  onOpenChange,
  onSuccess,
  editingDocument,
  canManage = false,
}: UploadDocumentDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);

  const isEditing = !!editingDocument?.id;

  // Permission check for editing existing documents
  const isOwner = !!user && (
    editingDocument?.owner_id === user.id || editingDocument?.created_by === user.id
  );
  const isDraft = (editingDocument?.status ?? 'Draft') === 'Draft';
  const canEdit = isEditing
    ? (canManage || isOwner) && isDraft
    : canManage;
  const readOnly = isEditing && !canEdit;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [version, setVersion] = useState('1.0');
  const [department, setDepartment] = useState('');
  const [isoCategory, setIsoCategory] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Hydrate form when editing
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFileError(null);
    if (editingDocument) {
      setTitle(editingDocument.title ?? '');
      setDescription(editingDocument.description ?? '');
      setDocumentType(editingDocument.document_type ?? '');
      setDocumentNumber(editingDocument.document_number ?? '');
      setVersion(editingDocument.version ?? '1.0');
      setDepartment(editingDocument.department ?? '');
      setIsoCategory((editingDocument.metadata as any)?.iso_category ?? '');
      setEffectiveDate(editingDocument.effective_date ?? '');
      setNextReviewDate(editingDocument.next_review_date ?? '');
      setFile(null);
    } else {
      setTitle(''); setDescription(''); setDocumentType('');
      setDocumentNumber(''); setVersion('1.0'); setDepartment('');
      setIsoCategory(''); setEffectiveDate(''); setNextReviewDate('');
      setFile(null);
    }
  }, [open, editingDocument]);

  const acceptAttr = useMemo(
    () => ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(','),
    [],
  );

  const uploadFileToStorage = async (f: File): Promise<{ path: string; ext: string; size: number }> => {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${user?.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, f, {
      cacheControl: '3600',
      upsert: false,
      contentType: f.type || 'application/octet-stream',
    });
    if (error) throw error;
    return { path, ext, size: f.size };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (readOnly) {
      toast({
        title: 'Read-only',
        description: 'You do not have permission to edit this document.',
        variant: 'destructive',
      });
      return;
    }

    // Schema validation
    const parsed = formSchema.safeParse({
      title, description, documentType, documentNumber,
      version, department, effectiveDate, nextReviewDate,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const key = i.path[0] as string;
        if (key && !fieldErrors[key]) fieldErrors[key] = i.message;
      });
      setErrors(fieldErrors);
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' });
      return;
    }
    setErrors({});

    // File required for create; optional for edit
    if (!isEditing && !file) {
      setFileError('Please attach a document to upload.');
      toast({ title: 'File required', variant: 'destructive' });
      return;
    }
    if (file) {
      const fErr = validateFile(file);
      if (fErr) {
        setFileError(fErr);
        toast({ title: 'Invalid file', description: fErr, variant: 'destructive' });
        return;
      }
    }
    setFileError(null);

    setLoading(true);
    try {
      const metadata: Record<string, any> = { ...(editingDocument?.metadata || {}) };
      if (isoCategory) metadata.iso_category = isoCategory;
      else delete metadata.iso_category;

      let fileFields: { file_url?: string; file_extension?: string; file_size?: number } = {};
      if (file) {
        const uploaded = await uploadFileToStorage(file);
        fileFields = {
          file_url: uploaded.path,
          file_extension: uploaded.ext,
          file_size: uploaded.size,
        };
      }

      if (isEditing && editingDocument?.id) {
        const { error } = await supabase
          .from('control_documents')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            document_type: documentType as any,
            document_number: documentNumber.trim() || null,
            version: version.trim(),
            department: department.trim() || null,
            effective_date: effectiveDate || null,
            next_review_date: nextReviewDate || null,
            metadata,
            ...fileFields,
          })
          .eq('id', editingDocument.id);
        if (error) throw error;
        toast({ title: 'Document updated' });
      } else {
        const { error } = await supabase.from('control_documents').insert({
          title: title.trim(),
          description: description.trim() || null,
          document_type: documentType as any,
          document_number: documentNumber.trim() || null,
          version: version.trim(),
          department: department.trim() || null,
          effective_date: effectiveDate || null,
          next_review_date: nextReviewDate || null,
          status: 'Draft',
          owner_id: user.id,
          created_by: user.id,
          metadata,
          ...fileFields,
        });
        if (error) throw error;
        toast({ title: 'Document created as Draft' });
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Document save failed:', err);
      toast({
        title: isEditing ? 'Update failed' : 'Upload failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setFileError(err);
      setFile(null);
      e.target.value = '';
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const fieldErr = (k: string) =>
    errors[k] ? <p className="text-xs text-destructive mt-1">{errors[k]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? readOnly ? 'View Document' : 'Edit Draft Document'
              : 'Upload New Document'}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'You do not have permission to edit this document. Fields are read-only.'
              : isEditing
                ? 'Update the draft details below. The document remains in Draft until submitted for review.'
                : 'New documents start in Draft status. They can be submitted for review once ready.'}
          </DialogDescription>
        </DialogHeader>

        {readOnly && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Editing is restricted to the document owner (while in Draft) or RMD/CRO/Admin roles.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={readOnly} className="space-y-4 disabled:opacity-70">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
                {fieldErr('title')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="documentNumber">Document Number</Label>
                <Input id="documentNumber" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} maxLength={50} />
                {fieldErr('documentNumber')}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
              {fieldErr('description')}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Document Type *</Label>
                <Select value={documentType} onValueChange={setDocumentType} required disabled={readOnly}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                {fieldErr('documentType')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="version">Version *</Label>
                <Input id="version" value={version} onChange={(e) => setVersion(e.target.value)} maxLength={20} required />
                {fieldErr('version')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} />
                {fieldErr('department')}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>ISO 31000 Category</Label>
                <Select value={isoCategory || 'none'} onValueChange={(v) => setIsoCategory(v === 'none' ? '' : v)} disabled={readOnly}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {ISO_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="effectiveDate">Effective Date</Label>
                <Input id="effectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
                {fieldErr('effectiveDate')}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextReviewDate">Next Review Date</Label>
                <Input id="nextReviewDate" type="date" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} />
                {fieldErr('nextReviewDate')}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isEditing ? 'Replace File (optional)' : 'File *'}</Label>
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-foreground">Allowed file types:</span>{' '}
                  {ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(', ')}
                  <span className="mx-1">·</span>
                  <span className="font-medium text-foreground">Max size:</span>{' '}
                  {(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB
                </div>
              </div>
              <div className={`border-2 border-dashed rounded-lg p-4 ${fileError ? 'border-destructive' : ''}`}>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  accept={acceptAttr}
                  disabled={readOnly}
                />
                <label htmlFor="file-upload" className={`flex flex-col items-center ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {file ? file.name : isEditing ? 'Click to replace the existing file' : 'Click to upload document'}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    Allowed: {ALLOWED_EXTENSIONS.join(', ')} · Max {(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB
                  </span>
                </label>
                {isEditing && editingDocument?.file_url && !file && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    Current file will be kept (.{editingDocument.file_extension || 'unknown'})
                  </div>
                )}
              </div>
              {fileError && (
                <Alert variant="destructive" role="alert" aria-live="polite">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <span className="font-medium">File not allowed:</span> {fileError}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving…' : isEditing ? 'Save Changes' : 'Upload Document'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

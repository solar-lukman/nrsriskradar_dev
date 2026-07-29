import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, type UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Loader2, FileText, Download, Upload, Search, CheckCircle,
  ShieldCheck, X, Pencil, Eye, Send, Archive, RotateCcw,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  UploadDocumentDialog,
  type ControlDocumentFormValue,
} from '@/components/documents/UploadDocumentDialog';
import { DocumentViewDialog } from '@/components/documents/DocumentViewDialog';
import { AccessDenied } from '@/components/AccessDenied';
import { useToast } from '@/hooks/use-toast';

interface Document {
  id: string;
  mfiles_id: string | null;
  title: string;
  description: string;
  document_type: string;
  document_number: string;
  version: string;
  status: string;
  department: string;
  effective_date: string;
  review_date: string;
  next_review_date: string;
  file_url: string;
  file_size: number;
  file_extension: string;
  created_at: string;
  owner_id?: string | null;
  created_by?: string | null;
  metadata?: Record<string, any> | null;
  owner_profile?: { full_name: string };
  user_acknowledged?: boolean;
  acknowledged_version?: string | null;
}

const STORAGE_BUCKET = 'control-documents';

// Document permission matrix — derived from RLS rules on control_documents
const VIEW_ROLES: UserRole[] = [
  'RC', 'RR', 'RO', 'RMD', 'CRO', 'ERMSC', 'EC', 'RCB', 'SUPERVISOR', 'ADMIN', 'USER',
];
const CREATE_ROLES: UserRole[] = ['RMD', 'CRO', 'ADMIN'];
const REVIEW_ROLES: UserRole[] = ['RMD', 'CRO', 'ADMIN']; // can move Draft → Under Review
const APPROVE_ROLES: UserRole[] = ['CRO', 'ADMIN']; // can move Under Review → Approved
const ARCHIVE_ROLES: UserRole[] = ['RMD', 'CRO', 'ADMIN']; // can archive
const EDIT_ROLES: UserRole[] = ['RMD', 'CRO', 'ADMIN'];

const DOCUMENT_TYPES = ['Policy', 'SOP', 'Risk Framework', 'Procedure', 'Guideline', 'Standard'];
const DOCUMENT_STATUSES = ['Draft', 'Under Review', 'Approved', 'Archived', 'Superseded'];
const ISO_CATEGORIES = [
  'Strategic', 'Operational', 'Financial', 'Compliance',
  'Technology', 'Reputational', 'Environmental', 'Human Resources',
];

export default function ControlDocuments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [isoFilter, setIsoFilter] = useState<string>('all');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [editingDocument, setEditingDocument] =
    useState<ControlDocumentFormValue | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  type PendingTransition = {
    document: Document;
    next: 'Under Review' | 'Approved' | 'Archived' | 'Draft';
    title: string;
    description: string;
    confirmLabel: string;
    successMsg: string;
    destructive?: boolean;
  };
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);

  const role = user?.role;
  const canView = !!role && VIEW_ROLES.includes(role);
  const canCreate = !!role && CREATE_ROLES.includes(role);
  const canReview = !!role && REVIEW_ROLES.includes(role);
  const canApprove = !!role && APPROVE_ROLES.includes(role);
  const canArchive = !!role && ARCHIVE_ROLES.includes(role);
  const canEditAll = !!role && EDIT_ROLES.includes(role);

  useEffect(() => {
    if (canView) fetchDocuments();
  }, [user, canView]);

  const fetchDocuments = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('control_documents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const docs = (data || []) as unknown as Document[];

      const ownerIds = Array.from(
        new Set(docs.map((d) => d.owner_id).filter((v): v is string => !!v)),
      );
      let nameMap: Record<string, string> = {};
      if (ownerIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', ownerIds);
        nameMap = Object.fromEntries(
          (profs || []).map((p: any) => [p.user_id, p.full_name || p.email || 'Unknown']),
        );
      }
      setProfilesById(nameMap);

      // Hydrate user_acknowledged flags (latest version acknowledged per doc)
      const docIds = docs.map((d) => d.id);
      const ackByDoc = new Map<string, string>();
      if (docIds.length) {
        const { data: acks } = await supabase
          .from('document_acknowledgments')
          .select('document_id, version_acknowledged, acknowledged_at')
          .eq('user_id', user.id)
          .in('document_id', docIds)
          .order('acknowledged_at', { ascending: false });
        (acks || []).forEach((a: any) => {
          if (!ackByDoc.has(a.document_id)) ackByDoc.set(a.document_id, a.version_acknowledged);
        });
      }

      setDocuments(
        docs.map((d) => {
          const ackedVersion = ackByDoc.get(d.id) || null;
          return {
            ...d,
            owner_profile: {
              full_name: d.owner_id ? nameMap[d.owner_id] || 'Unassigned' : 'Unassigned',
            },
            acknowledged_version: ackedVersion,
            user_acknowledged: !!ackedVersion && ackedVersion === d.version,
          };
        }),
      );
    } catch (err) {
      console.error('Error fetching documents:', err);
      toast({ title: 'Failed to load documents', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return documents.filter((d) => {
      if (term) {
        const hay = [d.title, d.description, d.document_type, d.department, d.document_number]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (typeFilter !== 'all' && d.document_type !== typeFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (ownerFilter !== 'all' && d.owner_id !== ownerFilter) return false;
      if (isoFilter !== 'all') {
        if ((d.metadata as any)?.iso_category !== isoFilter) return false;
      }
      return true;
    });
  }, [documents, searchTerm, typeFilter, statusFilter, ownerFilter, isoFilter]);

  const ownerOptions = useMemo(
    () =>
      Object.entries(profilesById)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [profilesById],
  );

  const handleDownload = async (document: Document) => {
    if (!document.file_url) {
      toast({ title: 'No file attached', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(document.file_url, 60);
      if (error || !data?.signedUrl) throw error || new Error('Signed URL unavailable');
      const a = window.document.createElement('a');
      a.href = data.signedUrl;
      a.download = `${document.title}.${document.file_extension || 'bin'}`;
      a.target = '_blank';
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
    } catch (err: any) {
      console.error('Error downloading document:', err);
      toast({
        title: 'Download failed',
        description: err?.message || 'File may be missing or you lack access.',
        variant: 'destructive',
      });
    }
  };

  const handleAcknowledge = async (document: Document) => {
    if (document.user_acknowledged) return;
    try {
      const { error } = await supabase.from('document_acknowledgments').insert({
        document_id: document.id,
        user_id: user!.id,
        version_acknowledged: document.version,
      });
      if (error) throw error;
      setDocuments((docs) =>
        docs.map((d) =>
          d.id === document.id
            ? { ...d, user_acknowledged: true, acknowledged_version: document.version }
            : d,
        ),
      );
      toast({ title: 'Document acknowledged', description: `Version ${document.version} confirmed.` });
    } catch (err: any) {
      console.error('Error acknowledging document:', err);
      toast({ title: 'Acknowledgement failed', description: err?.message, variant: 'destructive' });
    }
  };

  const transitionStatus = async (
    document: Document,
    next: 'Under Review' | 'Approved' | 'Archived' | 'Draft',
    successMsg: string,
  ) => {
    try {
      const { error } = await supabase
        .from('control_documents')
        .update({ status: next })
        .eq('id', document.id);
      if (error) throw error;
      setDocuments((docs) =>
        docs.map((d) => (d.id === document.id ? { ...d, status: next } : d)),
      );
      toast({ title: successMsg });
    } catch (err: any) {
      console.error('Status transition failed:', err);
      toast({
        title: 'Action failed',
        description: err?.message || 'You may not have permission.',
        variant: 'destructive',
      });
    }
  };

  const openEdit = (d: Document) => {
    setEditingDocument({
      id: d.id,
      title: d.title,
      description: d.description,
      document_type: d.document_type,
      document_number: d.document_number,
      version: d.version,
      department: d.department,
      effective_date: d.effective_date,
      next_review_date: d.next_review_date,
      file_url: d.file_url,
      file_extension: d.file_extension,
      file_size: d.file_size,
      status: d.status,
      owner_id: d.owner_id ?? null,
      created_by: d.created_by ?? null,
      metadata: d.metadata || {},
    });
    setIsUploadDialogOpen(true);
  };

  const openCreate = () => {
    setEditingDocument(null);
    setIsUploadDialogOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm(''); setTypeFilter('all'); setStatusFilter('all');
    setOwnerFilter('all'); setIsoFilter('all');
  };

  const hasActiveFilters =
    !!searchTerm || typeFilter !== 'all' || statusFilter !== 'all' ||
    ownerFilter !== 'all' || isoFilter !== 'all';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'bg-success/15 text-success';
      case 'Under Review': return 'bg-warning/15 text-warning';
      case 'Draft': return 'bg-primary/15 text-primary';
      case 'Archived':
      case 'Superseded': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (!user) return <AccessDenied />;
  if (!canView) {
    return <AccessDenied message="The Control Document Repository is restricted to authorized roles." />;
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold">Control Document Repository</h1>
            <p className="text-muted-foreground">
              Access policies, procedures, and compliance documents
            </p>
          </div>
          {canCreate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={openCreate}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload New Document
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create a new control document (starts in Draft).</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Documents</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{documents.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Approved</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">
              {documents.filter((d) => d.status === 'Approved').length}
            </div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending Review</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">
              {documents.filter((d) => d.status === 'Under Review' || d.status === 'Draft').length}
            </div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Due for Review</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">
              {documents.filter((d) => d.next_review_date && new Date(d.next_review_date) < new Date()).length}
            </div></CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, description, type, department or document number…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {DOCUMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger><SelectValue placeholder="All owners" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {ownerOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={isoFilter} onValueChange={setIsoFilter}>
                <SelectTrigger><SelectValue placeholder="All ISO 31000 categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ISO 31000 categories</SelectItem>
                  {ISO_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1" /> Clear filters
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents List */}
        <Card>
          <CardHeader><CardTitle>Documents ({filteredDocuments.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredDocuments.map((document) => {
                const isOwner = !!user && (document.owner_id === user.id || document.created_by === user.id);
                const canEditThis =
                  (canEditAll || isOwner) && document.status === 'Draft';
                const canSubmitForReview = canEditAll && document.status === 'Draft';
                const canApproveThis = canApprove && document.status === 'Under Review';
                const canReturnToDraft = canReview && document.status === 'Under Review';
                const canArchiveThis = canArchive && document.status === 'Approved';
                const isoCategory = (document.metadata as any)?.iso_category as string | undefined;

                return (
                  <div key={document.id} className="border rounded-lg p-4 hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-5 h-5 text-muted-foreground" />
                          <h3 className="font-semibold">{document.title}</h3>
                          {document.user_acknowledged && (
                            <CheckCircle className="w-4 h-4 text-success" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="secondary">{document.document_type}</Badge>
                          <Badge className={getStatusColor(document.status)}>{document.status}</Badge>
                          {isoCategory && <Badge variant="outline">ISO: {isoCategory}</Badge>}
                          <span className="text-sm text-muted-foreground">Version {document.version}</span>
                        </div>

                        <p className="text-sm text-muted-foreground mb-2">{document.description}</p>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span>Owner: {document.owner_profile?.full_name || 'Unassigned'}</span>
                          <span>Department: {document.department || '—'}</span>
                          {document.next_review_date && (
                            <span>Next Review: {new Date(document.next_review_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-1 flex-wrap justify-end">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setSelectedDocument(document); setIsViewDialogOpen(true); }}
                              aria-label="View document details"
                            >
                              <Eye className="w-4 h-4 mr-1" /> View
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Open document details and metadata.</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(document)}
                              disabled={!document.file_url}
                              aria-label="Download document file"
                            >
                              <Download className="w-4 h-4 mr-1" /> Download
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {document.file_url
                              ? 'Download the attached file via a secure link.'
                              : 'No file attached to this document.'}
                          </TooltipContent>
                        </Tooltip>

                        {canEditThis && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(document)}>
                                <Pencil className="w-4 h-4 mr-1" /> Edit
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit this draft document.</TooltipContent>
                          </Tooltip>
                        )}

                        {canSubmitForReview && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPendingTransition({
                                  document, next: 'Under Review',
                                  title: 'Submit for review?',
                                  description: `"${document.title}" will move from Draft to Under Review. Reviewers will be notified and you won't be able to edit it until it's returned.`,
                                  confirmLabel: 'Submit for Review',
                                  successMsg: 'Submitted for review',
                                })}
                              >
                                <Send className="w-4 h-4 mr-1" /> Submit
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Submit this draft for review.</TooltipContent>
                          </Tooltip>
                        )}

                        {canReturnToDraft && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingTransition({
                                  document, next: 'Draft',
                                  title: 'Return to Draft?',
                                  description: `"${document.title}" will be sent back to Draft so the author can revise it. The current review will be discarded.`,
                                  confirmLabel: 'Return to Draft',
                                  successMsg: 'Returned to Draft',
                                })}
                              >
                                <RotateCcw className="w-4 h-4 mr-1" /> Return to Draft
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Send back to author for revision.</TooltipContent>
                          </Tooltip>
                        )}

                        {canApproveThis && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPendingTransition({
                                  document, next: 'Approved',
                                  title: 'Approve this document?',
                                  description: `"${document.title}" (v${document.version}) will be marked Approved and become the official version. Users will be prompted to acknowledge it.`,
                                  confirmLabel: 'Approve',
                                  successMsg: 'Document approved',
                                })}
                              >
                                <ShieldCheck className="w-4 h-4 mr-1" /> Approve
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Approve this document for use.</TooltipContent>
                          </Tooltip>
                        )}

                        {canArchiveThis && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingTransition({
                                  document, next: 'Archived',
                                  title: 'Archive this document?',
                                  description: `"${document.title}" will be archived. It stays in the audit trail but is hidden from active use. This action can be reversed by an administrator.`,
                                  confirmLabel: 'Archive',
                                  successMsg: 'Document archived',
                                  destructive: true,
                                })}
                              >
                                <Archive className="w-4 h-4 mr-1" /> Archive
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Retire this document — keep for audit, hide from active use.</TooltipContent>
                          </Tooltip>
                        )}

                        {document.status === 'Approved' && (() => {
                          const acked = !!document.user_acknowledged;
                          const ackedOld = !acked && !!document.acknowledged_version
                            && document.acknowledged_version !== document.version;
                          const tip = acked
                            ? `You acknowledged version ${document.version}.`
                            : ackedOld
                              ? `You acknowledged an older version (${document.acknowledged_version}). Please acknowledge the current version ${document.version}.`
                              : `You have not yet acknowledged this document. Click to confirm you've read version ${document.version}.`;
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    variant={acked ? 'ghost' : ackedOld ? 'destructive' : 'outline'}
                                    size="sm"
                                    onClick={() => !acked && handleAcknowledge(document)}
                                    disabled={acked}
                                    aria-label={acked ? 'Already acknowledged' : 'Acknowledge document'}
                                  >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    {acked ? 'Acknowledged' : ackedOld ? 'Re-acknowledge' : 'Acknowledge'}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{tip}</TooltipContent>
                            </Tooltip>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredDocuments.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No documents found</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dialogs */}
        <UploadDocumentDialog
          open={isUploadDialogOpen}
          onOpenChange={(o) => {
            setIsUploadDialogOpen(o);
            if (!o) setEditingDocument(null);
          }}
          onSuccess={fetchDocuments}
          editingDocument={editingDocument}
          canManage={canEditAll}
        />

        {selectedDocument && (
          <DocumentViewDialog
            open={isViewDialogOpen}
            onOpenChange={setIsViewDialogOpen}
            document={selectedDocument}
            onAcknowledge={() => handleAcknowledge(selectedDocument)}
          />
        )}

        <AlertDialog
          open={!!pendingTransition}
          onOpenChange={(o) => { if (!o) setPendingTransition(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{pendingTransition?.title}</AlertDialogTitle>
              <AlertDialogDescription>{pendingTransition?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={pendingTransition?.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
                onClick={async () => {
                  if (!pendingTransition) return;
                  const p = pendingTransition;
                  setPendingTransition(null);
                  await transitionStatus(p.document, p.next, p.successMsg);
                }}
              >
                {pendingTransition?.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

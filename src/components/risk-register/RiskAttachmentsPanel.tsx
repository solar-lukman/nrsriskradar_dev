import React, { useState, useEffect, useRef } from 'react';
import { Upload, Download, Trash2, FileText, Shield, ClipboardList, File, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface RiskAttachment {
  id: string;
  risk_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  attachment_type: string;
  description: string | null;
  uploaded_by: string;
  created_at: string;
}

interface RiskAttachmentsPanelProps {
  riskId: string;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  evidence: { icon: FileText, label: 'Evidence', color: 'default' },
  policy: { icon: Shield, label: 'Policy', color: 'secondary' },
  audit_trail: { icon: ClipboardList, label: 'Audit Trail', color: 'outline' },
  other: { icon: File, label: 'Other', color: 'outline' },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RiskAttachmentsPanel({ riskId }: RiskAttachmentsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<RiskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Upload form
  const [attachmentType, setAttachmentType] = useState('evidence');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchAttachments = async () => {
    const { data, error } = await supabase
      .from('risk_attachments' as any)
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false });
    if (!error && data) setAttachments(data as any);
    setLoading(false);
  };

  useEffect(() => { fetchAttachments(); }, [riskId]);

  const handleUpload = async () => {
    if (!user || !selectedFile) return;
    setUploading(true);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const filePath = `${riskId}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('risk-attachments')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('risk_attachments' as any)
        .insert({
          risk_id: riskId,
          file_name: selectedFile.name,
          file_path: filePath,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          attachment_type: attachmentType,
          description: description.trim() || null,
          uploaded_by: user.id,
        } as any);

      if (insertError) throw insertError;

      toast({ title: 'File uploaded' });
      setSelectedFile(null);
      setDescription('');
      setAttachmentType('evidence');
      setShowUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchAttachments();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (attachment: RiskAttachment) => {
    const { data, error } = await supabase.storage
      .from('risk-attachments')
      .createSignedUrl(attachment.file_path, 60);

    if (error || !data?.signedUrl) {
      toast({ title: 'Error', description: 'Could not generate download link', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (attachment: RiskAttachment) => {
    const { error: storageError } = await supabase.storage
      .from('risk-attachments')
      .remove([attachment.file_path]);

    if (storageError) {
      toast({ title: 'Error', description: storageError.message, variant: 'destructive' });
      return;
    }

    const { error: dbError } = await supabase
      .from('risk_attachments' as any)
      .delete()
      .eq('id', attachment.id);

    if (dbError) {
      toast({ title: 'Error', description: dbError.message, variant: 'destructive' });
    } else {
      toast({ title: 'File deleted' });
      fetchAttachments();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) { setSelectedFile(file); setShowUpload(true); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Paperclip className="w-3.5 h-3.5" />
          Documents & Evidence
          {attachments.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{attachments.length}</Badge>
          )}
        </h4>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setShowUpload(!showUpload)}>
          <Upload className="w-3 h-3" />
          <span className="text-xs">{showUpload ? 'Cancel' : 'Upload'}</span>
        </Button>
      </div>

      {/* Upload area */}
      {showUpload && (
        <div
          className="p-3 border-2 border-dashed rounded-lg space-y-3 bg-muted/30"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="text-center text-xs text-muted-foreground">
            Drag & drop a file here or click to browse
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]); }}
          />
          <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => fileInputRef.current?.click()}>
            {selectedFile ? selectedFile.name : 'Choose File'}
          </Button>
          {selectedFile && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={attachmentType} onValueChange={setAttachmentType}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="evidence">Evidence</SelectItem>
                      <SelectItem value="policy">Policy</SelectItem>
                      <SelectItem value="audit_trail">Audit Trail</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Size</Label>
                  <div className="text-xs text-muted-foreground mt-2">{formatFileSize(selectedFile.size)}</div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="text-sm" placeholder="Brief description..." />
              </div>
              <Button size="sm" onClick={handleUpload} disabled={uploading} className="w-full h-7 text-xs">
                {uploading ? 'Uploading...' : 'Upload File'}
              </Button>
            </>
          )}
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="text-xs text-muted-foreground">Loading attachments...</div>
      ) : attachments.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">No documents attached yet.</div>
      ) : (
        <div className="space-y-1.5">
          {attachments.map(att => {
            const tc = TYPE_CONFIG[att.attachment_type] || TYPE_CONFIG.other;
            const TypeIcon = tc.icon;
            return (
              <div key={att.id} className="flex items-center gap-2 p-2 rounded border text-xs">
                <TypeIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{att.file_name}</div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Badge variant={tc.color as any} className="text-[9px] h-4 px-1.5">{tc.label}</Badge>
                    <span>{formatFileSize(att.file_size)}</span>
                    <span>{format(new Date(att.created_at), 'MMM d, yyyy')}</span>
                  </div>
                  {att.description && (
                    <div className="text-muted-foreground mt-0.5 truncate">{att.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDownload(att)} title="Download">
                    <Download className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(att)} title="Delete">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

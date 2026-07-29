import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, CheckCircle, Calendar, User } from 'lucide-react';

interface Document {
  id: string;
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
  file_size: number;
  file_extension: string;
  created_at: string;
  owner_profile?: {
    full_name: string;
  };
  user_acknowledged?: boolean;
}

interface DocumentViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document;
  onAcknowledge: () => void;
}

export function DocumentViewDialog({ open, onOpenChange, document, onAcknowledge }: DocumentViewDialogProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'Under Review':
        return 'bg-yellow-100 text-yellow-800';
      case 'Draft':
        return 'bg-blue-100 text-blue-800';
      case 'Archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Policy':
        return 'bg-purple-100 text-purple-800';
      case 'SOP':
        return 'bg-blue-100 text-blue-800';
      case 'Risk Framework':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {document.title}
              {document.user_acknowledged && (
                <CheckCircle className="w-4 h-4 text-green-600" />
              )}
            </div>
            <div className="flex gap-2">
              <Badge className={getTypeColor(document.document_type)}>
                {document.document_type}
              </Badge>
              <Badge className={getStatusColor(document.status)}>
                {document.status}
              </Badge>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Document Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Document Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Document Number</label>
                  <p className="text-sm">{document.document_number || 'Not specified'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Version</label>
                  <p className="text-sm">{document.version}</p>
                </div>
              </div>

              {document.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="text-sm mt-1">{document.description}</p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Owner</label>
                  <div className="flex items-center gap-2 mt-1">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">{document.owner_profile?.full_name || 'Unassigned'}</p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Department</label>
                  <p className="text-sm mt-1">{document.department || 'Not specified'}</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">File Size</label>
                  <p className="text-sm">{formatFileSize(document.file_size)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">File Type</label>
                  <p className="text-sm">.{document.file_extension}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Date Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Date Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Effective Date</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      {document.effective_date ? new Date(document.effective_date).toLocaleDateString() : 'Not set'}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Review Date</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm">
                      {document.review_date ? new Date(document.review_date).toLocaleDateString() : 'Not set'}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Next Review</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <p className={`text-sm ${
                      document.next_review_date && new Date(document.next_review_date) < new Date() 
                        ? 'text-red-600 font-medium' 
                        : ''
                    }`}>
                      {document.next_review_date ? new Date(document.next_review_date).toLocaleDateString() : 'Not scheduled'}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            {!document.user_acknowledged && (
              <Button onClick={onAcknowledge}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Acknowledge
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
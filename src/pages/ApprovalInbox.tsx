import { useMemo, useState } from 'react';

import { Inbox, RefreshCw, AlertCircle, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useApprovalInbox, type InboxRow, type InboxBucket } from '@/hooks/useApprovalInbox';
import { useAuth } from '@/contexts/AuthContext';
import { PendingAgeBadge } from '@/components/risk-register/PendingAgeBadge';
import { RiskWorkflowActions } from '@/components/risk-register/RiskWorkflowActions';
import { BulkApprovalBar } from '@/components/risk-register/BulkApprovalBar';
import { ViewRiskDialog } from '@/components/risk-register/ViewRiskDialog';
import { AccessDenied } from '@/components/AccessDenied';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const BUCKET_LABELS: Record<InboxBucket, string> = {
  awaiting_review: 'Awaiting my review',
  awaiting_approval: 'Awaiting my approval',
  returned_to_me: 'Returned to me',
  reviewing: "I'm reviewing",
};

const BUCKET_ORDER: InboxBucket[] = [
  'awaiting_approval',
  'awaiting_review',
  'reviewing',
  'returned_to_me',
];

function initials(name?: string | null) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function ApprovalInbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { rows, loading, error, refetch } = useApprovalInbox();
  const [activeBucket, setActiveBucket] = useState<InboxBucket | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewRisk, setViewRisk] = useState<any | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const openRiskDialog = async (riskId: string) => {
    setViewLoading(true);
    const { data, error } = await supabase.from('risks').select('*').eq('id', riskId).maybeSingle();
    setViewLoading(false);
    if (error || !data) {
      toast({
        title: 'Could not open risk',
        description: error?.message || 'Risk not found or access denied.',
        variant: 'destructive',
      });
      return;
    }
    setViewRisk(data);
  };

  const grouped = useMemo(() => {
    const g: Record<InboxBucket, InboxRow[]> = {
      awaiting_review: [],
      awaiting_approval: [],
      returned_to_me: [],
      reviewing: [],
    };
    for (const r of rows) {
      if (r.bucket) g[r.bucket].push(r);
    }
    return g;
  }, [rows]);

  const visibleBuckets = BUCKET_ORDER.filter((b) => grouped[b].length > 0);
  const visibleRows = activeBucket === 'all' ? rows.filter((r) => r.bucket) : grouped[activeBucket];

  const canBulk =
    activeBucket === 'awaiting_approval' &&
    !!user &&
    ['SUPERVISOR', 'CRO', 'RMD', 'ADMIN'].includes(user.role);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!user) return <AccessDenied />;

  const totalActionable = rows.filter((r) => r.bucket && r.bucket !== 'reviewing').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-primary" />
            Approval Inbox
          </h1>
          <p className="text-sm text-muted-foreground">
            Risks awaiting your review, approval, or revision
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reload the inbox</TooltipContent>
        </Tooltip>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Bucket summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BUCKET_ORDER.map((b) => (
          <Card
            key={b}
            className={`cursor-pointer transition-colors ${
              activeBucket === b ? 'border-primary' : ''
            }`}
            onClick={() => {
              setActiveBucket(b);
              setSelected(new Set());
            }}
          >
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{BUCKET_LABELS[b]}</p>
              <p className="text-2xl font-bold">{grouped[b].length}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {activeBucket === 'all' ? 'All items' : BUCKET_LABELS[activeBucket]}
              </CardTitle>
              <CardDescription>
                {visibleRows.length} item{visibleRows.length === 1 ? '' : 's'}
                {totalActionable > 0 && activeBucket === 'all' && ` · ${totalActionable} actionable`}
              </CardDescription>
            </div>
            <Tabs value={activeBucket} onValueChange={(v) => { setActiveBucket(v as any); setSelected(new Set()); }}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {visibleBuckets.map((b) => (
                  <TabsTrigger key={b} value={b}>
                    {BUCKET_LABELS[b]}
                    <Badge variant="secondary" className="ml-1.5">{grouped[b].length}</Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {visibleRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Nothing in your inbox. You're all caught up.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {canBulk && <TableHead className="w-10"></TableHead>}
                  <TableHead>Reference</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Submitter</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((r) => (
                  <TableRow key={r.id}>
                    {canBulk && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">{r.risk_reference || '—'}</TableCell>
                    <TableCell className="max-w-xs">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.department || '—'} · {r.risk_type}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={r.residual_score >= 15 ? 'destructive' : r.residual_score >= 8 ? 'secondary' : 'outline'}
                      >
                        {r.residual_score}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{r.submitter_name || '—'}</TableCell>
                    <TableCell>
                      {r.reviewer_name ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-xs">{initials(r.reviewer_name)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{r.reviewer_name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">unclaimed</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <PendingAgeBadge
                        since={r.returned_at || r.submitted_at}
                        label={r.bucket === 'returned_to_me' ? 'Returned' : 'Pending'}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <RiskWorkflowActions
                          riskId={r.id}
                          status={r.status as any}
                          approvalStatus={r.approval_status as any}
                          currentReviewerId={r.reviewer_id}
                          onChanged={refetch}
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={viewLoading}
                              onClick={() => openRiskDialog(r.id)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View risk details</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {canBulk && (
            <BulkApprovalBar
              selectedIds={Array.from(selected)}
              onClear={() => setSelected(new Set())}
              onComplete={refetch}
            />
          )}
        </CardContent>
      </Card>

      {viewRisk && (
        <ViewRiskDialog
          open={!!viewRisk}
          onOpenChange={(o) => { if (!o) { setViewRisk(null); refetch(); } }}
          risk={viewRisk}
        />
      )}
    </div>
  );
}

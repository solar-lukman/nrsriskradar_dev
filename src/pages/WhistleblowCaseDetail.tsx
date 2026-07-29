import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Send, Shield, Clock, User, AlertTriangle, CheckCircle, MessageSquare, FileText, History, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  'Submitted': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Under Review': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Investigation': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Escalated': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'Resolved': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Closed': 'bg-muted text-muted-foreground',
  'Dismissed': 'bg-muted text-muted-foreground',
};

const STATUSES = ['Submitted', 'Under Review', 'Investigation', 'Escalated', 'Resolved', 'Closed', 'Dismissed'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

export default function WhistleblowCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [caseData, setCaseData] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Dialogs
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [escalationReason, setEscalationReason] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');

  useEffect(() => {
    if (id) fetchAll();
  }, [id]);

  const fetchAll = async () => {
    setLoading(true);
    const [caseRes, msgRes, auditRes] = await Promise.all([
      supabase.from('whistleblow_cases').select('*').eq('id', id).single(),
      supabase.from('whistleblow_messages').select('*').eq('case_id', id).order('created_at', { ascending: true }),
      supabase.from('whistleblow_audit_log').select('*').eq('case_id', id).order('created_at', { ascending: false }),
    ]);

    if (caseRes.error) {
      toast.error('Case not found');
      navigate('/whistleblow/cases');
      return;
    }
    setCaseData(caseRes.data);
    setMessages(msgRes.data || []);
    setAuditLog(auditRes.data || []);
    setLoading(false);
  };

  const updateCase = async (updates: any, action: string, oldValue?: string, newValue?: string) => {
    const { error } = await supabase.from('whistleblow_cases').update(updates).eq('id', id);
    if (error) { toast.error('Update failed'); return; }

    await supabase.from('whistleblow_audit_log').insert({
      case_id: id,
      action,
      performed_by: user?.id,
      details: { ...updates, old_value: oldValue, new_value: newValue }
    });

    toast.success('Case updated');
    fetchAll();
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'Escalated') { setEscalateOpen(true); return; }
    if (newStatus === 'Resolved') { setResolveOpen(true); return; }
    updateCase({ status: newStatus }, 'status_changed', caseData.status, newStatus);
  };

  const handleEscalate = async () => {
    if (!escalationReason) { toast.error('Reason required'); return; }
    await updateCase({
      status: 'Escalated',
      escalation_reason: escalationReason,
    }, 'case_escalated', caseData.status, 'Escalated');

    // Notify CRO users
    const { data: croUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['CRO', 'ADMIN']);
    
    if (croUsers) {
      const notifications = croUsers.map(u => ({
        user_id: u.user_id,
        title: 'Whistleblow Case Escalated',
        message: `Case ${caseData.case_reference} has been escalated: ${escalationReason}`,
        type: 'error',
        category: 'whistleblow',
        resource_type: 'whistleblow_case',
        resource_id: id
      }));
      await supabase.from('notifications').insert(notifications);
    }

    setEscalateOpen(false);
    setEscalationReason('');
  };

  const handleResolve = async () => {
    if (!resolutionSummary) { toast.error('Resolution summary required'); return; }
    await updateCase({
      status: 'Resolved',
      resolution_summary: resolutionSummary,
      resolution_date: new Date().toISOString().split('T')[0],
      resolved_by: user?.id,
    }, 'case_resolved', caseData.status, 'Resolved');
    setResolveOpen(false);
    setResolutionSummary('');
  };

  const handlePriorityChange = (priority: string) => {
    updateCase({ priority }, 'priority_changed', caseData.priority || 'None', priority);
  };

  const sendInvestigatorMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMessage(true);
    const { error } = await supabase.from('whistleblow_messages').insert({
      case_id: id,
      sender_type: 'investigator',
      sender_id: user?.id,
      message: newMessage,
    });
    if (error) { toast.error('Failed to send'); setSendingMessage(false); return; }
    
    await supabase.from('whistleblow_audit_log').insert({
      case_id: id,
      action: 'investigator_message_sent',
      performed_by: user?.id,
    });
    
    setNewMessage('');
    setSendingMessage(false);
    fetchAll();
    toast.success('Message sent to reporter');
  };

  if (loading || !caseData) {
    return <MainLayout><div className="p-6 text-center text-muted-foreground">Loading...</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/whistleblow/cases')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-mono">{caseData.case_reference}</h1>
                <Badge className={statusColors[caseData.status]}>{caseData.status}</Badge>
                {caseData.priority && <Badge variant="outline">{caseData.priority}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{caseData.subject}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report Details */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Report Details</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Category:</span> <span className="font-medium">{caseData.category}</span></div>
                <div><span className="text-muted-foreground">Submitted:</span> {format(new Date(caseData.created_at), 'dd MMM yyyy HH:mm')}</div>
                {caseData.date_of_incident && <div><span className="text-muted-foreground">Incident Date:</span> {caseData.date_of_incident}</div>}
                {caseData.location && <div><span className="text-muted-foreground">Location:</span> {caseData.location}</div>}
                <Separator />
                <div>
                  <p className="text-muted-foreground mb-1">Description</p>
                  <p className="whitespace-pre-wrap">{caseData.description}</p>
                </div>
                {caseData.individuals_involved && (
                  <div>
                    <p className="text-muted-foreground mb-1">Individuals Involved</p>
                    <p className="whitespace-pre-wrap">{caseData.individuals_involved}</p>
                  </div>
                )}
                {caseData.evidence_description && (
                  <div>
                    <p className="text-muted-foreground mb-1">Evidence</p>
                    <p className="whitespace-pre-wrap">{caseData.evidence_description}</p>
                  </div>
                )}
                {caseData.escalation_reason && (
                  <div className="bg-destructive/10 p-3 rounded">
                    <p className="text-muted-foreground mb-1">Escalation Reason</p>
                    <p>{caseData.escalation_reason}</p>
                  </div>
                )}
                {caseData.resolution_summary && (
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded">
                    <p className="text-muted-foreground mb-1">Resolution</p>
                    <p>{caseData.resolution_summary}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Investigation Panel */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="messages">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="messages"><MessageSquare className="w-4 h-4 mr-1" /> Messages</TabsTrigger>
                <TabsTrigger value="timeline"><History className="w-4 h-4 mr-1" /> Timeline</TabsTrigger>
                <TabsTrigger value="actions"><Settings className="w-4 h-4 mr-1" /> Actions</TabsTrigger>
              </TabsList>

              <TabsContent value="messages">
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {messages.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Send a message to the anonymous reporter.</p>
                      ) : (
                        messages.map(m => (
                          <div key={m.id} className={`p-3 rounded-lg ${m.sender_type === 'reporter' ? 'bg-muted mr-12' : 'bg-primary/10 ml-12'}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium">{m.sender_type === 'reporter' ? 'Anonymous Reporter' : 'Investigator'}</span>
                              <span className="text-xs text-muted-foreground">{format(new Date(m.created_at), 'dd MMM HH:mm')}</span>
                            </div>
                            <p className="text-sm">{m.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                    {!['Closed', 'Dismissed'].includes(caseData.status) && (
                      <>
                        <Separator />
                        <div className="flex gap-2">
                          <Textarea placeholder="Message to the reporter..." value={newMessage} onChange={e => setNewMessage(e.target.value)} rows={2} className="flex-1" maxLength={2000} />
                          <Button onClick={sendInvestigatorMessage} disabled={sendingMessage || !newMessage.trim()} size="icon" className="self-end">
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="timeline">
                <Card>
                  <CardContent className="pt-6">
                    {auditLog.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No audit entries</p>
                    ) : (
                      <div className="space-y-4">
                        {auditLog.map(a => (
                          <div key={a.id} className="flex items-start gap-3 text-sm">
                            <div className="w-2 h-2 bg-primary rounded-full mt-2 shrink-0" />
                            <div className="flex-1">
                              <p className="font-medium">{a.action.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                              {a.old_value && a.new_value && (
                                <p className="text-muted-foreground">{a.old_value} → {a.new_value}</p>
                              )}
                              <p className="text-xs text-muted-foreground">{format(new Date(a.created_at), 'dd MMM yyyy HH:mm')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="actions">
                <Card>
                  <CardContent className="pt-6 space-y-6">
                    <div>
                      <Label className="mb-2 block">Change Status</Label>
                      <div className="flex flex-wrap gap-2">
                        {STATUSES.map(s => (
                          <Button
                            key={s}
                            variant={caseData.status === s ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleStatusChange(s)}
                            disabled={caseData.status === s}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <Label className="mb-2 block">Set Priority</Label>
                      <div className="flex gap-2">
                        {PRIORITIES.map(p => (
                          <Button
                            key={p}
                            variant={caseData.priority === p ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePriorityChange(p)}
                            disabled={caseData.priority === p}
                          >
                            {p}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Escalate Dialog */}
      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Escalate Case</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Escalation Reason *</Label>
              <Textarea placeholder="Why is this case being escalated?" value={escalationReason} onChange={e => setEscalationReason(e.target.value)} rows={3} maxLength={1000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleEscalate} disabled={!escalationReason}>Escalate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve Case</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Resolution Summary *</Label>
              <Textarea placeholder="Describe how this case was resolved..." value={resolutionSummary} onChange={e => setResolutionSummary(e.target.value)} rows={4} maxLength={2000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={!resolutionSummary}>Resolve Case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

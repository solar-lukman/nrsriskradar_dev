import React, { useState } from 'react';
import { Shield, Send, Clock, CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { SeoHead } from '@/components/SeoHead';

const statusColors: Record<string, string> = {
  'Submitted': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'Under Review': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Investigation': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Escalated': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'Resolved': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  'Closed': 'bg-muted text-muted-foreground',
  'Dismissed': 'bg-muted text-muted-foreground',
};

export default function WhistleblowFollowUp() {
  const [caseRef, setCaseRef] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [caseData, setCaseData] = useState<any>(null);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const fetchCase = async () => {
    if (!caseRef || !passphrase) {
      toast.error('Please enter both case reference and passphrase');
      return;
    }
    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/whistleblow-follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_reference: caseRef, passphrase }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to retrieve case');
      setCaseData(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to retrieve case');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    setSendingMessage(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/whistleblow-follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_reference: caseRef, passphrase, action: 'send_message', message: newMessage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCaseData(data);
      setNewMessage('');
      toast.success('Message sent');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  };

  if (!caseData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <SeoHead
          title="Check Case Status"
          description="Follow up on a whistleblow report submitted to the NRS Risk Management Portal using your case reference and passphrase."
          path="/whistleblow/follow-up"
        />
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h1 className="sr-only">Check Case Status</h1>
            <CardTitle>Check Case Status</CardTitle>
            <CardDescription>Enter your case reference and passphrase to view updates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Case Reference</Label>
              <Input placeholder="WB-2026-00001" value={caseRef} onChange={e => setCaseRef(e.target.value)} />
            </div>
            <div>
              <Label>Passphrase</Label>
              <Input type="password" placeholder="Your passphrase" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
            </div>
            <Button className="w-full" onClick={fetchCase} disabled={loading}>
              {loading ? 'Verifying...' : 'View Case'}
            </Button>
            <div className="text-center">
              <Link to="/whistleblow" className="text-sm text-primary hover:underline">Submit a new report →</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Case: {caseData.case_reference}</span>
          </div>
          <Badge className={statusColors[caseData.status] || 'bg-muted'}>{caseData.status}</Badge>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Case info */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Category:</span> <span className="font-medium">{caseData.category}</span></div>
              <div><span className="text-muted-foreground">Subject:</span> <span className="font-medium">{caseData.subject}</span></div>
              <div><span className="text-muted-foreground">Submitted:</span> <span>{new Date(caseData.created_at).toLocaleDateString()}</span></div>
              {caseData.priority && <div><span className="text-muted-foreground">Priority:</span> <Badge variant="outline">{caseData.priority}</Badge></div>}
            </div>
            {caseData.resolution_summary && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">Resolution</p>
                <p className="text-sm text-muted-foreground">{caseData.resolution_summary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        {caseData.timeline && caseData.timeline.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Case Timeline</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {caseData.timeline.map((t: any, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                    <div>
                      <p className="text-sm font-medium">{t.action.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</p>
                      {t.new_value && <p className="text-xs text-muted-foreground">→ {t.new_value}</p>}
                      <p className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Messages
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {caseData.messages && caseData.messages.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {caseData.messages.map((m: any) => (
                  <div key={m.id} className={`p-3 rounded-lg ${m.sender_type === 'reporter' ? 'bg-primary/10 ml-8' : 'bg-muted mr-8'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium">{m.sender_label}</span>
                      <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm">{m.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No messages yet</p>
            )}

            {!['Closed', 'Dismissed'].includes(caseData.status) && (
              <>
                <Separator />
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Send a message to the investigation team..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    rows={2}
                    maxLength={2000}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={sendingMessage || !newMessage.trim()} size="icon" className="self-end" aria-label="Send message to investigation team">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="outline" onClick={() => setCaseData(null)}>Sign Out of Case</Button>
        </div>
      </div>
    </div>
  );
}

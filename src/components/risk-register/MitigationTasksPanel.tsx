import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, Circle, Clock, XCircle, ChevronDown, ChevronUp, History, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface MitigationTask {
  id: string;
  risk_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  evidence_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface TaskHistoryEntry {
  id: string;
  task_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_at: string;
  note: string | null;
}

interface MitigationTasksPanelProps {
  riskId: string;
  compact?: boolean;
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  pending: { icon: Circle, label: 'Pending', color: 'text-muted-foreground' },
  in_progress: { icon: Clock, label: 'In Progress', color: 'text-primary' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-success' },
  cancelled: { icon: XCircle, label: 'Cancelled', color: 'text-destructive' },
};

const PRIORITY_CONFIG: Record<string, string> = {
  low: 'secondary',
  medium: 'default',
  high: 'warning',
  critical: 'destructive',
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['pending', 'in_progress', 'cancelled'],
  in_progress: ['in_progress', 'pending', 'completed', 'cancelled'],
  completed: ['completed', 'in_progress'],
  cancelled: ['cancelled', 'pending'],
};

const isOverdueTask = (t: MitigationTask) =>
  !!t.due_date && t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < new Date();

export function MitigationTasksPanel({ riskId, compact = false }: MitigationTasksPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<MitigationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'pending' | 'in_progress' | 'completed' | 'cancelled'>('all');

  // History dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTask, setHistoryTask] = useState<MitigationTask | null>(null);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Status change note dialog
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteTask, setNoteTask] = useState<MitigationTask | null>(null);
  const [noteNextStatus, setNoteNextStatus] = useState<string>('');
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Add form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newStatus, setNewStatus] = useState('pending');
  const [newDueDate, setNewDueDate] = useState<Date>();
  const [saving, setSaving] = useState(false);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('risk_mitigation_tasks' as any)
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at', { ascending: true });
    if (!error && data) setTasks(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    supabase.from('profiles').select('user_id, full_name, email').order('full_name').then(({ data }) => {
      if (data) setProfiles(data);
    });
  }, [riskId]);

  const overdueCount = tasks.filter(isOverdueTask).length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.filter(t => t.status !== 'cancelled').length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const filteredTasks = tasks.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return isOverdueTask(t);
    return t.status === filter;
  });

  const handleStatusChange = (task: MitigationTask, nextStatus: string) => {
    if (nextStatus === task.status) return;
    const allowed = ALLOWED_TRANSITIONS[task.status] || [];
    if (!allowed.includes(nextStatus)) {
      toast({
        title: 'Invalid transition',
        description: `Cannot move from ${STATUS_CONFIG[task.status]?.label || task.status} to ${STATUS_CONFIG[nextStatus]?.label || nextStatus}.`,
        variant: 'destructive',
      });
      return;
    }
    setNoteTask(task);
    setNoteNextStatus(nextStatus);
    setNoteText('');
    setNoteOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!noteTask || !noteNextStatus) return;
    setNoteSaving(true);
    const { error } = await supabase.rpc('update_mitigation_task_status' as any, {
      _task_id: noteTask.id,
      _new_status: noteNextStatus,
      _note: noteText.trim() || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `Status updated to ${STATUS_CONFIG[noteNextStatus]?.label || noteNextStatus}` });
      setNoteOpen(false);
      setNoteTask(null);
      setNoteNextStatus('');
      setNoteText('');
      fetchTasks();
    }
    setNoteSaving(false);
  };

  const handleAddTask = async () => {
    if (!user || !newTitle.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('risk_mitigation_tasks' as any)
      .insert({
        risk_id: riskId,
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        assigned_to: newAssignedTo || null,
        priority: newPriority,
        status: newStatus,
        due_date: newDueDate ? format(newDueDate, 'yyyy-MM-dd') : null,
        created_by: user.id,
        ...(newStatus === 'completed' ? { completed_at: new Date().toISOString(), completed_by: user.id } : {}),
      } as any);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Task added' });
      setNewTitle(''); setNewDescription(''); setNewAssignedTo(''); setNewPriority('medium'); setNewStatus('pending'); setNewDueDate(undefined);
      setShowAddForm(false);
      fetchTasks();
    }
    setSaving(false);
  };

  const openHistory = async (task: MitigationTask) => {
    setHistoryTask(task);
    setHistoryOpen(true);
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('risk_mitigation_task_history' as any)
      .select('*')
      .eq('task_id', task.id)
      .order('changed_at', { ascending: false });
    if (!error && data) setHistory(data as any);
    setHistoryLoading(false);
  };

  const getProfileName = (userId: string | null) => {
    if (!userId) return 'Unassigned';
    const p = profiles.find(p => p.user_id === userId);
    return p?.full_name || p?.email || 'Unknown';
  };

  const allComplete = totalCount > 0 && completedCount === totalCount;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          Mitigation Tasks
          {totalCount > 0 && (
            <Badge variant="outline" className="text-[10px]">{completedCount}/{totalCount}</Badge>
          )}
          {overdueCount > 0 && (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              {overdueCount} overdue
            </Badge>
          )}
        </h4>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
            <SelectTrigger className="h-7 w-[130px] text-xs" aria-label="Filter tasks">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All ({tasks.length})</SelectItem>
              <SelectItem value="overdue" className="text-xs">Overdue ({overdueCount})</SelectItem>
              <SelectItem value="pending" className="text-xs">Pending</SelectItem>
              <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
              <SelectItem value="completed" className="text-xs">Completed</SelectItem>
              <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? <ChevronUp className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            <span className="text-xs">{showAddForm ? 'Cancel' : 'Add Task'}</span>
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="space-y-1">
          <Progress value={progressPercent} className={cn('h-2', allComplete && '[&>div]:bg-success')} />
          <div className="text-[11px] text-muted-foreground">{Math.round(progressPercent)}% complete</div>
        </div>
      )}

      {/* All complete prompt */}
      {allComplete && (
        <div className="p-2 bg-success/10 border border-success/30 rounded text-xs text-success flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3" />
          All mitigation tasks complete. Consider setting risk status to "Mitigated".
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className="p-3 border rounded-lg space-y-3 bg-muted/30">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Task title" className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Optional description" rows={2} className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Assignee</Label>
              <Select value={newAssignedTo} onValueChange={setNewAssignedTo}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.user_id} value={p.user_id} className="text-xs">{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                  <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                  <SelectItem value="cancelled" className="text-xs">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={newPriority} onValueChange={setNewPriority}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full h-8 justify-start text-left text-xs font-normal', !newDueDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {newDueDate ? format(newDueDate, 'MMM d') : 'Pick'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={newDueDate} onSelect={setNewDueDate} initialFocus className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <Button size="sm" onClick={handleAddTask} disabled={saving || !newTitle.trim()} className="w-full h-7 text-xs">
            {saving ? 'Adding...' : 'Add Task'}
          </Button>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className="text-xs text-muted-foreground">Loading tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          {tasks.length === 0
            ? 'No mitigation tasks yet. Add one to track progress.'
            : `No tasks match the "${filter}" filter.`}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredTasks.map(task => {
            const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
            const StatusIcon = sc.icon;
            const overdue = isOverdueTask(task);
            return (
              <div key={task.id} className={cn(
                'flex items-center gap-2 p-2 rounded border text-xs',
                task.status === 'completed' && 'opacity-60',
                overdue && 'border-destructive/40 bg-destructive/5'
              )}>
                <StatusIcon className={cn('w-4 h-4 shrink-0', sc.color)} />
                <Select value={task.status} onValueChange={(v) => handleStatusChange(task, v)}>
                  <SelectTrigger className="h-7 w-[120px] text-[11px] shrink-0" aria-label="Task status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([value, cfg]) => {
                      const allowed = (ALLOWED_TRANSITIONS[task.status] || []).includes(value);
                      return (
                        <SelectItem key={value} value={value} disabled={!allowed} className="text-xs">
                          {cfg.label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="flex-1 min-w-0">
                  <div className={cn('font-medium truncate flex items-center gap-1.5', task.status === 'completed' && 'line-through')}>
                    {task.title}
                    {overdue && (
                      <Badge variant="destructive" className="text-[9px] h-4 px-1.5 gap-0.5">
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Overdue
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{getProfileName(task.assigned_to)}</span>
                    {task.due_date && (
                      <span className={cn(overdue && 'text-destructive font-medium')}>
                        {format(new Date(task.due_date), 'MMM d')}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant={PRIORITY_CONFIG[task.priority] as any} className="text-[9px] h-4 px-1.5">
                  {task.priority}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0"
                  aria-label="View status history"
                  title="View status history"
                  onClick={() => openHistory(task)}
                >
                  <History className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Status History — {historyTask?.title}</DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="text-xs text-muted-foreground py-4">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4">No history recorded yet.</div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {history.map(h => (
                <div key={h.id} className="flex items-start gap-2 text-xs border-l-2 border-primary/40 pl-2 py-1">
                  <div className="flex-1">
                    <div className="font-medium">
                      {h.from_status ? (
                        <>
                          {STATUS_CONFIG[h.from_status]?.label || h.from_status}
                          <span className="text-muted-foreground"> → </span>
                          {STATUS_CONFIG[h.to_status]?.label || h.to_status}
                        </>
                      ) : (
                        <>Created as {STATUS_CONFIG[h.to_status]?.label || h.to_status}</>
                      )}
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      {getProfileName(h.changed_by)} • {format(new Date(h.changed_at), 'MMM d, yyyy HH:mm')}
                    </div>
                    {h.note && <div className="text-[11px] italic mt-0.5">{h.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Status change note dialog */}
      <Dialog open={noteOpen} onOpenChange={(o) => { if (!noteSaving) setNoteOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Change status{noteTask ? ` — ${noteTask.title}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {noteTask && (
              <div className="text-xs text-muted-foreground">
                {STATUS_CONFIG[noteTask.status]?.label || noteTask.status}
                <span className="mx-1">→</span>
                <span className="font-medium text-foreground">
                  {STATUS_CONFIG[noteNextStatus]?.label || noteNextStatus}
                </span>
              </div>
            )}
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add context for this status change…"
                rows={3}
                className="text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNoteOpen(false)} disabled={noteSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={confirmStatusChange} disabled={noteSaving}>
                {noteSaving ? 'Saving…' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

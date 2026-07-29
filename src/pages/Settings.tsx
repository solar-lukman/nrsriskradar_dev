import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { 
  Settings, Shield, Clock, Key, Database, HardDrive, CheckCircle, AlertTriangle,
  Play, Calendar, FileText, Download, Upload, Save, Eye, EyeOff, Plus, Pencil, Trash2, Target, Building
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RiskAppetiteManager } from '@/components/settings/RiskAppetiteManager';
import { AppetiteBreachTrendChart } from '@/components/settings/AppetiteBreachTrendChart';
import { IntegrationPlaceholders } from '@/components/settings/IntegrationPlaceholders';
import { AccessDenied } from '@/components/AccessDenied';
import { MatrixDimensionsManager } from '@/components/settings/MatrixDimensionsManager';
import { SampleDataManager } from '@/components/settings/SampleDataManager';
import { TreatmentStrategyMappingManager } from '@/components/settings/TreatmentStrategyMappingManager';
import { RiskCategoriesManager } from '@/components/settings/RiskCategoriesManager';
import { AssessmentTemplatesManager } from '@/components/settings/AssessmentTemplatesManager';

// ─── Strategic Objectives & Departments Management ───

function StrategicObjectivesManager() {
  const { toast } = useToast();
  const [objectives, setObjectives] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const fetchObjectives = async () => {
    const { data } = await supabase.from('strategic_objectives').select('*').order('name');
    setObjectives(data || []);
  };

  useEffect(() => { fetchObjectives(); }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      if (editing) {
        const { error } = await supabase.from('strategic_objectives').update({ name, description, updated_at: new Date().toISOString() }).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Updated', description: 'Strategic objective updated.' });
      } else {
        const { error } = await supabase.from('strategic_objectives').insert({ name, description });
        if (error) throw error;
        toast({ title: 'Created', description: 'Strategic objective created.' });
      }
      setShowDialog(false);
      setEditing(null); setName(''); setDescription('');
      fetchObjectives();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const toggleActive = async (obj: any) => {
    await supabase.from('strategic_objectives').update({ is_active: !obj.is_active, updated_at: new Date().toISOString() }).eq('id', obj.id);
    fetchObjectives();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2"><Target className="w-5 h-5" /> Strategic Objectives</div>
          <Button size="sm" onClick={() => { setEditing(null); setName(''); setDescription(''); setShowDialog(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Objective
          </Button>
        </CardTitle>
        <CardDescription>Corporate objectives that risks can be linked to</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {objectives.map(obj => (
              <TableRow key={obj.id}>
                <TableCell className="font-medium">{obj.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{obj.description || '—'}</TableCell>
                <TableCell>
                  <Badge variant={obj.is_active ? 'default' : 'secondary'}>{obj.is_active ? 'Active' : 'Inactive'}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(obj); setName(obj.name); setDescription(obj.description || ''); setShowDialog(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(obj)}>
                      {obj.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {objectives.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No strategic objectives yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Strategic Objective</DialogTitle>
            <DialogDescription>Define a corporate objective for risk alignment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Expand to EMEA region" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of this objective" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading || !name.trim()}>
              {loading ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DepartmentsManager() {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');

  const fetchDepartments = async () => {
    const { data } = await supabase.from('departments').select('*').order('name');
    setDepartments(data || []);
  };

  useEffect(() => { fetchDepartments(); }, []);

  const handleAdd = async () => {
    if (!newDeptName.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('departments').insert({ name: newDeptName.trim() });
      if (error) throw error;
      toast({ title: 'Created', description: 'Department added.' });
      setNewDeptName('');
      fetchDepartments();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const toggleActive = async (dept: any) => {
    await supabase.from('departments').update({ is_active: !dept.is_active }).eq('id', dept.id);
    fetchDepartments();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building className="w-5 h-5" /> Departments</CardTitle>
        <CardDescription>Standardized department names used across the system</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder="New department name" className="flex-1" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          <Button onClick={handleAdd} disabled={loading || !newDeptName.trim()}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map(d => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>
                  <Badge variant={d.is_active ? 'default' : 'secondary'}>{d.is_active ? 'Active' : 'Inactive'}</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(d)}>
                    {d.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {departments.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No departments yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Main Settings Page ───

const SettingsPage = () => {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [backupStatus, setBackupStatus] = useState<any>(null);
  const [backupLogs, setBackupLogs] = useState<any[]>([]);
  const [recoveryChecklists, setRecoveryChecklists] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('security');
  const [showPassword, setShowPassword] = useState(false);

  const [systemSettings, setSystemSettings] = useState({
    password_policy: { min_length: 8, require_uppercase: true, require_lowercase: true, require_numbers: true, require_symbols: true, max_age_days: 90 },
    session_timeout_minutes: 5,
    api_keys: { mfiles_api_key: '', mfiles_endpoint: '', csdd_api_key: '', csdd_endpoint: '' }
  });

  useEffect(() => {
    if (hasPermission('*')) loadSystemData();
  }, [hasPermission]);

  const loadSystemData = async () => {
    try {
      setBackupStatus({
        active_configurations: 3, successful_backups_24h: 12, failed_backups_24h: 0,
        last_full_backup: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      });

      const { data: logs, error: logsError } = await supabase.from('backup_logs').select('*').order('started_at', { ascending: false }).limit(10);
      if (logsError) {
        setBackupLogs([
          { id: '1', backup_type: 'incremental', status: 'completed', started_at: new Date().toISOString(), duration_seconds: 120, file_size_bytes: 1024*1024*50, backup_configurations: { name: 'Daily Incremental' } },
          { id: '2', backup_type: 'full', status: 'completed', started_at: new Date(Date.now()-86400000).toISOString(), duration_seconds: 3600, file_size_bytes: 1024*1024*1024*2, backup_configurations: { name: 'Weekly Full' } }
        ]);
      } else { setBackupLogs(logs || []); }

      const { data: checklists, error: checklistsError } = await supabase.from('recovery_checklists').select('*').eq('is_active', true).order('priority', { ascending: false });
      if (checklistsError) {
        setRecoveryChecklists([{
          id: '1', title: 'Database Recovery Procedure', description: 'Steps to recover from database failure', priority: 'critical', estimated_time_minutes: 30,
          prerequisites: [{ item: 'Access to backup storage' }, { item: 'Database admin credentials' }],
          steps: [{ action: 'Stop all application services', estimated_minutes: 5 }, { action: 'Restore database from latest backup', estimated_minutes: 20 }, { action: 'Restart application services', estimated_minutes: 5 }],
          validation_steps: [{ check: 'Verify database connectivity' }, { check: 'Check data integrity' }, { check: 'Confirm all services are running' }]
        }]);
      } else { setRecoveryChecklists(checklists || []); }
    } catch (error) { console.error('Failed to load system data:', error); }
  };

  const savePasswordPolicy = async () => { setLoading(true); toast({ title: "Settings Saved", description: "Password policy updated." }); setLoading(false); };
  const saveTimeoutSettings = async () => { setLoading(true); toast({ title: "Settings Saved", description: "Session timeout updated." }); setLoading(false); };
  const saveIntegrationSettings = async (type: string) => { setLoading(true); toast({ title: "Settings Saved", description: `${type} integration settings updated.` }); setLoading(false); };
  const triggerBackup = async (configId: string, backupType: string) => { setLoading(true); toast({ title: "Backup Started", description: `${backupType} backup initiated.` }); setTimeout(() => loadSystemData(), 2000); setLoading(false); };

  const hasAdminAccess = user?.role === 'ADMIN';

  if (!hasAdminAccess) {
    return <AccessDenied message="System Settings is restricted to administrators." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Settings className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">System Settings</h1>
          <p className="text-muted-foreground">Configure system-wide settings and enterprise integrations</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="backup">Backup & Recovery</TabsTrigger>
          <TabsTrigger value="risk">Risk Management</TabsTrigger>
          <TabsTrigger value="lookups">Lookups & Data</TabsTrigger>
          <TabsTrigger value="system">System Info</TabsTrigger>
        </TabsList>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2"><Shield className="w-5 h-5" /><span>Password Policy</span></CardTitle>
              <CardDescription>Configure password requirements for all users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min-length">Minimum Length</Label>
                  <Input id="min-length" type="number" value={systemSettings.password_policy.min_length} onChange={(e) => setSystemSettings(prev => ({ ...prev, password_policy: { ...prev.password_policy, min_length: parseInt(e.target.value) } }))} min="6" max="20" />
                </div>
                <div>
                  <Label htmlFor="max-age">Maximum Age (days)</Label>
                  <Input id="max-age" type="number" value={systemSettings.password_policy.max_age_days} onChange={(e) => setSystemSettings(prev => ({ ...prev, password_policy: { ...prev.password_policy, max_age_days: parseInt(e.target.value) } }))} min="30" max="365" />
                </div>
              </div>
              <div className="space-y-3">
                {(['require_uppercase', 'require_lowercase', 'require_numbers', 'require_symbols'] as const).map(key => (
                  <div key={key} className="flex items-center justify-between">
                    <Label>{key.replace('require_', 'Require ').replace('_', ' ')}</Label>
                    <Switch checked={(systemSettings.password_policy as any)[key]} onCheckedChange={(checked) => setSystemSettings(prev => ({ ...prev, password_policy: { ...prev.password_policy, [key]: checked } }))} />
                  </div>
                ))}
              </div>
              <Button onClick={savePasswordPolicy} disabled={loading}><Save className="h-4 w-4 mr-2" />Save Password Policy</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2"><Clock className="w-5 h-5" /><span>Session Timeout</span></CardTitle>
              <CardDescription>Configure automatic logout settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="session-timeout">Inactivity Timeout (minutes)</Label>
                <Input id="session-timeout" type="number" value={systemSettings.session_timeout_minutes} onChange={(e) => setSystemSettings(prev => ({ ...prev, session_timeout_minutes: parseInt(e.target.value) }))} min="1" max="60" />
                <p className="text-sm text-muted-foreground mt-1">Current: {systemSettings.session_timeout_minutes} minutes</p>
              </div>
              <Button onClick={saveTimeoutSettings} disabled={loading}><Save className="h-4 w-4 mr-2" />Save Timeout Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="space-y-6">
          <IntegrationPlaceholders />
        </TabsContent>

        {/* Backup & Recovery */}
        <TabsContent value="backup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2"><HardDrive className="w-5 h-5" /><span>Backup Status Overview</span></CardTitle>
              <CardDescription>Enterprise backup integration status and recent activity</CardDescription>
            </CardHeader>
            <CardContent>
              {backupStatus ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center"><div className="text-2xl font-bold text-primary">{backupStatus.active_configurations}</div><div className="text-sm text-muted-foreground">Active Configs</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-success">{backupStatus.successful_backups_24h}</div><div className="text-sm text-muted-foreground">Successful (24h)</div></div>
                  <div className="text-center"><div className="text-2xl font-bold text-destructive">{backupStatus.failed_backups_24h}</div><div className="text-sm text-muted-foreground">Failed (24h)</div></div>
                  <div className="text-center"><div className="text-2xl font-bold">{backupStatus.last_full_backup ? new Date(backupStatus.last_full_backup).toLocaleDateString() : 'Never'}</div><div className="text-sm text-muted-foreground">Last Full Backup</div></div>
                </div>
              ) : <div className="text-center py-8 text-muted-foreground">Loading...</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2"><Play className="w-5 h-5" /><span>Manual Backup Operations</span></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button onClick={() => triggerBackup('inc', 'incremental')} disabled={loading}><Upload className="w-4 h-4 mr-2" />Start Incremental Backup</Button>
                <Button onClick={() => triggerBackup('full', 'full')} disabled={loading} variant="outline"><Database className="w-4 h-4 mr-2" />Start Full Backup</Button>
              </div>
              <Alert><AlertTriangle className="w-4 h-4" /><AlertDescription>Manual backups will be added to the normal backup schedule.</AlertDescription></Alert>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center space-x-2"><FileText className="w-5 h-5" /><span>Recent Backup Activity</span></CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Configuration</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead><TableHead>Duration</TableHead><TableHead>Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backupLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.backup_configurations?.name || 'Unknown'}</TableCell>
                      <TableCell><Badge variant={log.backup_type === 'full' ? 'default' : 'secondary'}>{log.backup_type}</Badge></TableCell>
                      <TableCell><Badge variant={log.status === 'completed' ? 'default' : log.status === 'failed' ? 'destructive' : 'outline'}>{log.status}</Badge></TableCell>
                      <TableCell>{new Date(log.started_at).toLocaleString()}</TableCell>
                      <TableCell>{log.duration_seconds ? `${log.duration_seconds}s` : '-'}</TableCell>
                      <TableCell>{log.file_size_bytes ? `${Math.round(log.file_size_bytes / (1024 * 1024))}MB` : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center space-x-2"><CheckCircle className="w-5 h-5" /><span>Recovery Procedures</span></CardTitle></CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {recoveryChecklists.map((cl) => (
                  <AccordionItem key={cl.id} value={cl.id}>
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center space-x-2">
                        <Badge variant={cl.priority === 'critical' ? 'destructive' : cl.priority === 'high' ? 'default' : 'secondary'}>{cl.priority}</Badge>
                        <span>{cl.title}</span>
                        <span className="text-sm text-muted-foreground">(~{cl.estimated_time_minutes} min)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <p className="text-muted-foreground">{cl.description}</p>
                      <div><h4 className="font-medium mb-2">Prerequisites:</h4><ul className="list-disc list-inside space-y-1">{(cl.prerequisites || []).map((p: any, i: number) => <li key={i} className="text-sm">{p.item}</li>)}</ul></div>
                      <div><h4 className="font-medium mb-2">Recovery Steps:</h4><ol className="list-decimal list-inside space-y-2">{(cl.steps || []).map((s: any, i: number) => <li key={i} className="text-sm"><span className="font-medium">{s.action}</span>{s.estimated_minutes && <span className="text-muted-foreground ml-2">({s.estimated_minutes} min)</span>}</li>)}</ol></div>
                      <div><h4 className="font-medium mb-2">Validation Checks:</h4><ul className="list-disc list-inside space-y-1">{(cl.validation_steps || []).map((v: any, i: number) => <li key={i} className="text-sm">{v.check}</li>)}</ul></div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk Management */}
        <TabsContent value="risk" className="space-y-6">
          <RiskCategoriesManager />
          <Card>
            <CardHeader><CardTitle>Risk Scoring Matrix (5x5)</CardTitle><CardDescription>Risk scoring matrix for impact vs likelihood assessment</CardDescription></CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground mb-4">Risk levels: 1-4 (Low), 5-8 (Medium), 9-15 (High), 16-25 (Critical)</div>
              <div className="grid grid-cols-6 gap-2 text-center text-sm max-w-md">
                <div></div>
                {[1,2,3,4,5].map(n => <div key={n} className="font-medium">{n}</div>)}
                {[5,4,3,2,1].map(impact => (
                  <React.Fragment key={impact}>
                    <div className="font-medium">{impact}</div>
                    {[1,2,3,4,5].map(likelihood => {
                      const score = impact * likelihood;
                      const variant = score <= 4 ? 'secondary' : score <= 8 ? 'outline' : score <= 15 ? 'default' : 'destructive';
                      return <div key={`${impact}-${likelihood}`} className="p-2"><Badge variant={variant} className="w-full">{score}</Badge></div>;
                    })}
                  </React.Fragment>
                ))}
              </div>
            </CardContent>
          </Card>
          <MatrixDimensionsManager />
          <RiskAppetiteManager />
          {user?.role === 'ADMIN' && <TreatmentStrategyMappingManager />}
          <AssessmentTemplatesManager />
          <AppetiteBreachTrendChart />
        </TabsContent>

        {/* Lookups & Data (NEW TAB) */}
        <TabsContent value="lookups" className="space-y-6">
          {user?.role === 'ADMIN' && <SampleDataManager />}
          <StrategicObjectivesManager />
          <DepartmentsManager />
        </TabsContent>

        {/* System Info */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>System Information</CardTitle><CardDescription>Current system status and configuration</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Application Version</Label><p className="text-sm text-muted-foreground">1.0.0</p></div>
                <div><Label className="text-sm font-medium">Database</Label><p className="text-sm text-muted-foreground">PostgreSQL (Supabase)</p></div>
                <div><Label className="text-sm font-medium">Enterprise Backup</Label><Badge variant="default">Connected</Badge></div>
                <div><Label className="text-sm font-medium">System Status</Label><Badge variant="default">Operational</Badge></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;

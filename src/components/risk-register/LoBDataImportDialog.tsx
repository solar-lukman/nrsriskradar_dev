import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Database, Brain, CheckCircle2, AlertCircle, Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

interface IdentifiedRisk {
  title: string;
  description: string;
  category: string;
  department?: string;
  inherent_likelihood: number;
  inherent_impact: number;
  residual_likelihood: number;
  residual_impact: number;
  mitigation_plan?: string;
  confidence: number;
  source_reference?: string;
}

interface LoBDataImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Step = 'upload' | 'analyzing' | 'review' | 'saving';

export function LoBDataImportDialog({ open, onOpenChange, onSuccess }: LoBDataImportDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sourceSystem, setSourceSystem] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [identifiedRisks, setIdentifiedRisks] = useState<IdentifiedRisk[]>([]);
  const [selectedRisks, setSelectedRisks] = useState<Set<number>>(new Set());
  const [summary, setSummary] = useState('');
  const [dataQualityNotes, setDataQualityNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const resetState = () => {
    setStep('upload');
    setFile(null);
    setSourceSystem('');
    setParsedRows([]);
    setIdentifiedRisks([]);
    setSelectedRisks(new Set());
    setSummary('');
    setDataQualityNotes('');
    setProgress(0);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    try {
      const data = await selectedFile.arrayBuffer();
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv') {
        const text = new TextDecoder().decode(data);
        const workbook = XLSX.read(text, { type: 'string' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        setParsedRows(XLSX.utils.sheet_to_json(sheet));
      } else {
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        setParsedRows(XLSX.utils.sheet_to_json(sheet));
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to parse file', variant: 'destructive' });
    }
  };

  const analyzeData = async () => {
    if (!user || parsedRows.length === 0) return;

    setStep('analyzing');
    setProgress(20);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      setProgress(40);

      const { data, error } = await supabase.functions.invoke('lob-data-import', {
        body: { rows: parsedRows, sourceSystem, userId: user.id },
        headers: { Authorization: `Bearer ${session.session.access_token}` }
      });

      if (error) throw error;

      setProgress(80);

      if (!data.success) throw new Error(data.error || 'Analysis failed');

      setIdentifiedRisks(data.identifiedRisks || []);
      setSummary(data.summary || '');
      setDataQualityNotes(data.dataQualityNotes || '');
      setSelectedRisks(new Set(data.identifiedRisks.map((_: any, i: number) => i)));
      setProgress(100);
      setStep('review');
    } catch (err: any) {
      console.error('Analysis error:', err);
      toast({ title: 'Analysis Failed', description: err.message || 'Failed to analyze data', variant: 'destructive' });
      setStep('upload');
    }
  };

  const saveSelectedRisks = async () => {
    if (!user || selectedRisks.size === 0) return;

    setSaving(true);
    setStep('saving');

    try {
      const risksToSave = identifiedRisks
        .filter((_, i) => selectedRisks.has(i))
        .map(risk => ({
          title: risk.title,
          description: risk.description,
          category: risk.category as any,
          department: risk.department || null,
          inherent_likelihood: risk.inherent_likelihood,
          inherent_impact: risk.inherent_impact,
          residual_likelihood: risk.residual_likelihood,
          residual_impact: risk.residual_impact,
          mitigation_plan: risk.mitigation_plan || null,
          status: 'New' as const,
          created_by: user.id,
          mitigation_actions: [],
        }));

      const { error } = await supabase.from('risks').insert(risksToSave);
      if (error) throw error;

      toast({
        title: 'Risks Imported',
        description: `${risksToSave.length} risks added to the register from ${sourceSystem || 'LoB'} data`,
      });

      onSuccess();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      console.error('Save error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to save risks', variant: 'destructive' });
      setStep('review');
    } finally {
      setSaving(false);
    }
  };

  const toggleRisk = (index: number) => {
    setSelectedRisks(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRiskLevel = (l: number, i: number) => {
    const s = l * i;
    if (s >= 20) return { label: 'Critical', variant: 'destructive' as const };
    if (s >= 15) return { label: 'High', variant: 'destructive' as const };
    if (s >= 8) return { label: 'Medium', variant: 'secondary' as const };
    return { label: 'Low', variant: 'outline' as const };
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetState(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            LoB Data Import & AI Risk Identification
          </DialogTitle>
          <DialogDescription>
            Import data from operations, insurance, or other LoB systems. AI will automatically identify risks.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source System</Label>
              <Select value={sourceSystem} onValueChange={setSourceSystem}>
                <SelectTrigger>
                  <SelectValue placeholder="Select data source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Operations System">Operations System</SelectItem>
                  <SelectItem value="Insurance System">Insurance System</SelectItem>
                  <SelectItem value="ERP System">ERP System</SelectItem>
                  <SelectItem value="Financial System">Financial System</SelectItem>
                  <SelectItem value="HR System">HR System</SelectItem>
                  <SelectItem value="IT Service Management">IT Service Management</SelectItem>
                  <SelectItem value="Compliance System">Compliance System</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data File (CSV or Excel)</Label>
              <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
              <p className="text-xs text-muted-foreground">
                Upload any CSV or Excel file. AI will analyze the data to identify potential risks.
              </p>
            </div>

            {parsedRows.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    <span className="font-medium">File Preview</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>{parsedRows.length} rows detected</p>
                    <p>Columns: {Object.keys(parsedRows[0]).join(', ')}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
              <p className="font-medium">How it works:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Upload any data file from your LoB system</li>
                <li>AI analyzes data patterns to identify potential risks</li>
                <li>Review and select identified risks to add to the register</li>
                <li>Selected risks are saved with AI-generated details</li>
              </ol>
            </div>
          </div>
        )}

        {step === 'analyzing' && (
          <div className="py-8 space-y-4 text-center">
            <Brain className="w-12 h-12 mx-auto text-primary animate-pulse" />
            <h3 className="text-lg font-semibold">AI is analyzing your data...</h3>
            <p className="text-sm text-muted-foreground">
              Scanning {parsedRows.length} rows from {sourceSystem || 'LoB system'} for potential risks
            </p>
            <Progress value={progress} className="w-64 mx-auto" />
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            {summary && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-4 h-4 text-primary" />
                    <span className="font-medium">AI Analysis Summary</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{summary}</p>
                  {dataQualityNotes && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {dataQualityNotes}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {identifiedRisks.length} Risks Identified — {selectedRisks.size} Selected
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedRisks(new Set(identifiedRisks.map((_, i) => i)))}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSelectedRisks(new Set())}>
                  Deselect All
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[350px]">
              <div className="space-y-3 pr-4">
                {identifiedRisks.map((risk, i) => {
                  const level = getRiskLevel(risk.inherent_likelihood, risk.inherent_impact);
                  return (
                    <Card key={i} className={`cursor-pointer transition-colors ${selectedRisks.has(i) ? 'ring-2 ring-primary' : 'opacity-60'}`} onClick={() => toggleRisk(i)}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox checked={selectedRisks.has(i)} onCheckedChange={() => toggleRisk(i)} className="mt-1" />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-medium text-sm truncate">{risk.title}</h4>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant={level.variant}>{level.label}</Badge>
                                <span className={`text-xs font-medium ${getConfidenceColor(risk.confidence)}`}>
                                  {risk.confidence}% conf.
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{risk.description}</p>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-xs">{risk.category}</Badge>
                              {risk.department && <Badge variant="outline" className="text-xs">{risk.department}</Badge>}
                              <span className="text-xs text-muted-foreground">
                                L:{risk.inherent_likelihood} × I:{risk.inherent_impact} = {risk.inherent_likelihood * risk.inherent_impact}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {step === 'saving' && (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Saving {selectedRisks.size} risks to the register...</p>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={analyzeData} disabled={parsedRows.length === 0 || !sourceSystem}>
                <Brain className="w-4 h-4 mr-2" />
                Analyze with AI
              </Button>
            </>
          )}
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={saveSelectedRisks} disabled={selectedRisks.size === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Import {selectedRisks.size} Risk{selectedRisks.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

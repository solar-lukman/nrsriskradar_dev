import React, { useState, useEffect } from 'react';
import { MainLayout } from '@/components/MainLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Search, AlertTriangle, Clock, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
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

const priorityColors: Record<string, string> = {
  'Critical': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  'High': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Medium': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Low': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
};

export default function WhistleblowCases() {
  const { user } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whistleblow_cases')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load cases');
      console.error(error);
    } else {
      setCases(data || []);
    }
    setLoading(false);
  };

  const filtered = cases.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return c.case_reference.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    }
    return true;
  });

  const totalOpen = cases.filter(c => !['Closed', 'Dismissed', 'Resolved'].includes(c.status)).length;
  const totalEscalated = cases.filter(c => c.status === 'Escalated').length;
  const totalResolved = cases.filter(c => c.status === 'Resolved' || c.status === 'Closed').length;
  const avgResolution = (() => {
    const resolved = cases.filter(c => c.resolution_date && c.created_at);
    if (resolved.length === 0) return 0;
    const total = resolved.reduce((sum, c) => {
      return sum + (new Date(c.resolution_date).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(total / resolved.length);
  })();

  const WHISTLEBLOW_CATEGORIES = ['Fraud', 'Corruption', 'Harassment', 'Safety', 'Policy Violation', 'Financial Misconduct', 'Other'];
  const categories = [...new Set([...WHISTLEBLOW_CATEGORIES, ...cases.map(c => c.category).filter(Boolean)])];

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="w-6 h-6 text-primary" /> Whistleblow Case Management
            </h1>
            <p className="text-muted-foreground">Manage and investigate anonymous reports</p>
          </div>
          <Button onClick={fetchCases} variant="outline">Refresh</Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Cases</p>
                  <p className="text-2xl font-bold">{cases.length}</p>
                </div>
                <Shield className="w-8 h-8 text-primary/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Open Cases</p>
                  <p className="text-2xl font-bold text-orange-600">{totalOpen}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-orange-600/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Escalated</p>
                  <p className="text-2xl font-bold text-red-600">{totalEscalated}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-red-600/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Resolution</p>
                  <p className="text-2xl font-bold">{avgResolution}d</p>
                </div>
                <Clock className="w-8 h-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search cases..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {['Submitted', 'Under Review', 'Investigation', 'Escalated', 'Resolved', 'Closed', 'Dismissed'].map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Cases table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No cases found</TableCell></TableRow>
                ) : (
                  filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium">{c.case_reference}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.subject}</TableCell>
                      <TableCell>{c.category}</TableCell>
                      <TableCell>
                        {c.priority ? <Badge className={priorityColors[c.priority] || 'bg-muted'}>{c.priority}</Badge> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><Badge className={statusColors[c.status] || 'bg-muted'}>{c.status}</Badge></TableCell>
                      <TableCell className="text-sm">{format(new Date(c.created_at), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/whistleblow/cases/${c.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

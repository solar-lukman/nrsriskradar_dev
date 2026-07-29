import React, { useState } from 'react';
import { Database, Download, Upload, RefreshCw, AlertTriangle, CheckCircle, Clock, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';

export default function DataManagement() {
  const { user, hasPermission } = useAuth();
  const [isBackupRunning, setIsBackupRunning] = useState(false);

  if (!hasPermission('*')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-warning mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">
            You don't have permission to access data management.
          </p>
        </div>
      </div>
    );
  }

  const backupHistory = [
    {
      id: 1,
      type: "Full Backup",
      status: "completed",
      date: "2024-12-23 02:00",
      size: "2.4 GB",
      duration: "45 minutes"
    },
    {
      id: 2,
      type: "Incremental Backup",
      status: "completed", 
      date: "2024-12-22 02:00",
      size: "156 MB",
      duration: "8 minutes"
    },
    {
      id: 3,
      type: "Full Backup",
      status: "failed",
      date: "2024-12-21 02:00",
      size: "0 MB",
      duration: "2 minutes"
    }
  ];

  const dataStats = [
    { label: "Total Records", value: "45,234", icon: Database, trend: "+2.3%" },
    { label: "Storage Used", value: "2.4 GB", icon: HardDrive, trend: "+156 MB" },
    { label: "Last Backup", value: "23 Dec", icon: CheckCircle, trend: "Success" },
    { label: "Data Integrity", value: "99.9%", icon: CheckCircle, trend: "Good" }
  ];

  const handleBackup = () => {
    setIsBackupRunning(true);
    // Simulate backup process
    setTimeout(() => {
      setIsBackupRunning(false);
    }, 3000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-success text-success-foreground">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge variant="secondary">Running</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Database className="w-8 h-8" />
            Data Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Database operations, backups, and data integrity management
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleBackup} disabled={isBackupRunning}>
            {isBackupRunning ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Manual Backup
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Data Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        {dataStats.map((stat, index) => (
          <Card key={index}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.trend}</p>
                </div>
                <stat.icon className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="backups" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="backups">Backup Management</TabsTrigger>
          <TabsTrigger value="integrity">Data Integrity</TabsTrigger>
          <TabsTrigger value="migration">Data Migration</TabsTrigger>
          <TabsTrigger value="archive">Archive Management</TabsTrigger>
        </TabsList>

        <TabsContent value="backups" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Backup Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Backup Configuration</CardTitle>
                <CardDescription>
                  Automated backup settings and schedules
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Full Backup Schedule</span>
                    <span className="text-sm text-muted-foreground">Weekly (Sunday 2:00 AM)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Incremental Backup</span>
                    <span className="text-sm text-muted-foreground">Daily (2:00 AM)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Retention Period</span>
                    <span className="text-sm text-muted-foreground">30 days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Storage Location</span>
                    <span className="text-sm text-muted-foreground">AWS S3</span>
                  </div>
                </div>
                
                <Button variant="outline" className="w-full">
                  <Upload className="w-4 h-4 mr-2" />
                  Configure Backup Settings
                </Button>
              </CardContent>
            </Card>

            {/* Backup Status */}
            <Card>
              <CardHeader>
                <CardTitle>Current Status</CardTitle>
                <CardDescription>
                  Real-time backup and system status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isBackupRunning ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Manual Backup in Progress</span>
                      <Clock className="w-4 h-4 text-warning" />
                    </div>
                    <Progress value={65} className="h-2" />
                    <p className="text-xs text-muted-foreground">Estimated time remaining: 2 minutes</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">System Status</span>
                      <CheckCircle className="w-4 h-4 text-success" />
                    </div>
                    <p className="text-sm text-muted-foreground">All systems operational</p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Next Scheduled Backup</span>
                    <span className="text-sm text-muted-foreground">Tonight 2:00 AM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Available Storage</span>
                    <span className="text-sm text-muted-foreground">75% free</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Backup History */}
          <Card>
            <CardHeader>
              <CardTitle>Backup History</CardTitle>
              <CardDescription>
                Recent backup operations and their status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {backupHistory.map((backup) => (
                  <div key={backup.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium">{backup.type}</p>
                        <p className="text-sm text-muted-foreground">{backup.date}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm">
                        <p className="font-medium">{backup.size}</p>
                        <p className="text-muted-foreground">{backup.duration}</p>
                      </div>
                      {getStatusBadge(backup.status)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Integrity Checks</CardTitle>
              <CardDescription>
                Database consistency and validation reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Data Integrity Monitoring</h3>
                <p className="text-muted-foreground mb-4">
                  Real-time monitoring of database consistency and integrity
                </p>
                <Button>Run Integrity Check</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="migration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Migration Tools</CardTitle>
              <CardDescription>
                Import, export, and migration utilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Migration Center</h3>
                <p className="text-muted-foreground mb-4">
                  Tools for importing and exporting data between systems
                </p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline">Import Data</Button>
                  <Button variant="outline">Export Data</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archive" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Archive Management</CardTitle>
              <CardDescription>
                Long-term data retention and archival policies
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <HardDrive className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Archive Storage</h3>
                <p className="text-muted-foreground mb-4">
                  Manage long-term data retention and compliance requirements
                </p>
                <Button variant="outline">Configure Archive Policies</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
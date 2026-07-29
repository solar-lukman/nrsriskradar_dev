import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Search, Plus, Edit, Trash2, UserCheck, History, Activity, Eye } from 'lucide-react';
import { getRoleDisplayName, UserRole } from '@/contexts/AuthContext';
import AddEditUserDialog from '@/components/user-management/AddEditUserDialog';
import { AccessDenied } from '@/components/AccessDenied';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  roles: UserRole[];
}

interface UserLoginHistory {
  id: string;
  user_id: string;
  login_at: string;
  ip_address: unknown;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
}

interface UserActivity {
  id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: any;
  performed_at: string;
  ip_address: unknown;
  user_agent: string | null;
}

const UserManagement = () => {
  const { user, hasPermission } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [viewingHistory, setViewingHistory] = useState<UserProfile | null>(null);
  const [loginHistory, setLoginHistory] = useState<UserLoginHistory[]>([]);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);

  const availableRoles: UserRole[] = ['RC', 'RR', 'RO', 'RMD', 'CRO', 'ERMSC', 'EC', 'RCB', 'SUPERVISOR', 'ADMIN', 'USER'];

  useEffect(() => {
    if (!hasPermission('manage_users')) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access user management.",
        variant: "destructive"
      });
      return;
    }
    fetchUsers();
  }, [hasPermission]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, selectedRole]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      
      console.log('Fetching user profiles...');
      
      // Simplified query to avoid RLS issues
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error('Profiles fetch error:', profilesError);
        throw profilesError;
      }
      
      console.log('Profiles fetched successfully:', profiles?.length || 0);

      // Fetch user roles for each user
      const usersWithRoles = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id);

          return {
            ...profile,
            roles: roles?.map(r => r.role) || []
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.department?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedRole !== 'all') {
      filtered = filtered.filter(user => 
        user.roles.includes(selectedRole as UserRole)
      );
    }

    setFilteredUsers(filtered);
  };

  const fetchUserHistory = async (userId: string) => {
    try {
      // Fetch login history
      const { data: history, error: historyError } = await supabase
        .from('user_login_history')
        .select('*')
        .eq('user_id', userId)
        .order('login_at', { ascending: false })
        .limit(50);

      if (historyError) throw historyError;
      setLoginHistory(history || []);

      // Fetch activity logs
      const { data: activity, error: activityError } = await supabase
        .from('user_activity_logs')
        .select('*')
        .eq('user_id', userId)
        .order('performed_at', { ascending: false })
        .limit(50);

      if (activityError) throw activityError;
      setUserActivity(activity || []);
    } catch (error) {
      console.error('Error fetching user history:', error);
      toast({
        title: "Error",
        description: "Failed to fetch user history",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // Delete user roles first
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Delete profile
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "User deleted successfully"
      });

      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive"
      });
    }
  };

  const handleBulkRoleAssignment = async (role: UserRole, action: 'add' | 'remove') => {
    try {
      for (const userId of selectedUsers) {
        if (action === 'add') {
          await supabase
            .from('user_roles')
            .upsert({
              user_id: userId,
              role: role,
              assigned_by: user?.id
            });
        } else {
          await supabase
            .from('user_roles')
            .delete()
            .eq('user_id', userId)
            .eq('role', role);
        }
      }

      toast({
        title: "Success",
        description: `Roles ${action === 'add' ? 'assigned' : 'removed'} successfully`
      });

      setSelectedUsers([]);
      fetchUsers();
    } catch (error) {
      console.error('Error with bulk role assignment:', error);
      toast({
        title: "Error",
        description: "Failed to update roles",
        variant: "destructive"
      });
    }
  };

  if (!hasPermission('manage_users')) {
    return <AccessDenied message="You don't have permission to access user management." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">User Management</h1>
        <Button onClick={() => setShowAddUser(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by name, email, or department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {availableRoles.map(role => (
                  <SelectItem key={role} value={role}>
                    {getRoleDisplayName(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUsers.length > 0 && (
            <div className="flex gap-2 mb-4 p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">{selectedUsers.length} users selected</span>
              <div className="flex gap-2 ml-auto">
                <Select onValueChange={(role) => handleBulkRoleAssignment(role as UserRole, 'add')}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Add role" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map(role => (
                      <SelectItem key={role} value={role}>
                        {getRoleDisplayName(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select onValueChange={(role) => handleBulkRoleAssignment(role as UserRole, 'remove')}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Remove role" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map(role => (
                      <SelectItem key={role} value={role}>
                        {getRoleDisplayName(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users ({filteredUsers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading users...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                      onCheckedChange={(checked) => {
                        setSelectedUsers(checked ? filteredUsers.map(u => u.user_id) : []);
                      }}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((userProfile) => (
                  <TableRow key={userProfile.user_id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedUsers.includes(userProfile.user_id)}
                        onCheckedChange={(checked) => {
                          setSelectedUsers(prev => 
                            checked 
                              ? [...prev, userProfile.user_id]
                              : prev.filter(id => id !== userProfile.user_id)
                          );
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {userProfile.full_name?.[0] || userProfile.email[0].toUpperCase()}
                        </div>
                        <span className="font-medium">{userProfile.full_name || 'No name'}</span>
                      </div>
                    </TableCell>
                    <TableCell>{userProfile.email}</TableCell>
                    <TableCell>{userProfile.department || 'Not assigned'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {userProfile.roles.map(role => (
                          <Badge key={role} variant="secondary" className="text-xs">
                            {getRoleDisplayName(role)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(userProfile.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setViewingHistory(userProfile);
                            fetchUserHistory(userProfile.user_id);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingUser(userProfile)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this user? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUser(userProfile.user_id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* User History Dialog */}
      <Dialog open={!!viewingHistory} onOpenChange={() => setViewingHistory(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              User History: {viewingHistory?.full_name || viewingHistory?.email}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="login" className="w-full">
            <TabsList>
              <TabsTrigger value="login">
                <History className="h-4 w-4 mr-2" />
                Login History
              </TabsTrigger>
              <TabsTrigger value="activity">
                <Activity className="h-4 w-4 mr-2" />
                Activity Log
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="login" className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>User Agent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {new Date(entry.login_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.success ? "default" : "destructive"}>
                            {entry.success ? "Success" : "Failed"}
                          </Badge>
                        </TableCell>
                        <TableCell>{String(entry.ip_address) || 'Unknown'}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {entry.user_agent || 'Unknown'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            <TabsContent value="activity" className="space-y-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userActivity.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell>
                          {new Date(activity.performed_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{activity.action}</Badge>
                        </TableCell>
                        <TableCell>
                          {activity.resource_type || 'System'}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {activity.details ? JSON.stringify(activity.details) : 'No details'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add/Edit User Dialog */}
      <AddEditUserDialog
        open={showAddUser || !!editingUser}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddUser(false);
            setEditingUser(null);
          }
        }}
        user={editingUser}
        onSuccess={fetchUsers}
      />
    </div>
  );
};

export default UserManagement;
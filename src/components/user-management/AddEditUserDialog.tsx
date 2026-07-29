import React, { useState, useEffect } from 'react';
import { useAuth, UserRole, getRoleDisplayName } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

interface AddEditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserProfile | null;
  onSuccess: () => void;
}

const AddEditUserDialog = ({ open, onOpenChange, user, onSuccess }: AddEditUserDialogProps) => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    department: '',
    password: ''
  });
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const availableRoles: UserRole[] = ['RC', 'RR', 'RO', 'RMD', 'CRO', 'ERMSC', 'EC', 'RCB', 'SUPERVISOR', 'ADMIN', 'USER'];
  const isEditing = !!user;

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email,
        full_name: user.full_name || '',
        department: user.department || '',
        password: ''
      });
      setSelectedRoles(user.roles);
    } else {
      setFormData({
        email: '',
        full_name: '',
        department: '',
        password: ''
      });
      setSelectedRoles(['USER']);
    }
  }, [user]);

  const handleRoleToggle = (role: UserRole) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isEditing) {
        // Update existing user
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: formData.full_name,
            department: formData.department
          })
          .eq('user_id', user.user_id);

        if (profileError) throw profileError;

        // Update roles - remove all existing roles first
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', user.user_id);

        // Add new roles
        if (selectedRoles.length > 0) {
          const roleInserts = selectedRoles.map(role => ({
            user_id: user.user_id,
            role: role,
            assigned_by: currentUser?.id
          }));

          const { error: rolesError } = await supabase
            .from('user_roles')
            .insert(roleInserts);

          if (rolesError) throw rolesError;
        }

        toast({
          title: "Success",
          description: "User updated successfully"
        });
      } else {
        // Create new user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              full_name: formData.full_name,
              department: formData.department
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          // Wait a moment for the profile to be created by the trigger
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Update the profile with additional info
          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              full_name: formData.full_name,
              department: formData.department
            })
            .eq('user_id', authData.user.id);

          if (profileError) {
            console.warn('Profile update error:', profileError);
          }

          // Add roles
          if (selectedRoles.length > 0) {
            const roleInserts = selectedRoles.map(role => ({
              user_id: authData.user.id,
              role: role,
              assigned_by: currentUser?.id
            }));

            const { error: rolesError } = await supabase
              .from('user_roles')
              .insert(roleInserts);

            if (rolesError) {
              console.warn('Roles assignment error:', rolesError);
            }
          }
        }

        toast({
          title: "Success",
          description: "User created successfully"
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save user",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit User' : 'Add New User'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
                disabled={isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Select
                value={formData.department}
                onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Risk Management">Risk Management</SelectItem>
                  <SelectItem value="IT Department">IT Department</SelectItem>
                  <SelectItem value="Operations">Operations</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                  <SelectItem value="Human Resources">Human Resources</SelectItem>
                  <SelectItem value="Legal">Legal</SelectItem>
                  <SelectItem value="Compliance">Compliance</SelectItem>
                  <SelectItem value="Executive">Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isEditing && (
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assign Roles</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {availableRoles.map(role => (
                  <div key={role} className="flex items-center space-x-2">
                    <Checkbox
                      id={role}
                      checked={selectedRoles.includes(role)}
                      onCheckedChange={() => handleRoleToggle(role)}
                    />
                    <Label htmlFor={role} className="text-sm">
                      {getRoleDisplayName(role)}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Update User' : 'Create User'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddEditUserDialog;
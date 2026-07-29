import React from 'react';
import { MainLayout } from '@/components/MainLayout';
import UserManagement from './UserManagement';

const UserManagementPage = () => {
  return (
    <MainLayout>
      <UserManagement />
    </MainLayout>
  );
};

export default UserManagementPage;
import * as React from 'react';
import { ShellProvider } from '@/components/layout/shell-context';
import { AppShellLayout } from '@/components/layout/app-shell-layout';
import { AuthGuard } from '@/components/auth/auth-guard';

interface ProjectLayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const resolvedParams = await params;
  const projectId = resolvedParams.projectId;

  return (
    <AuthGuard>
      <ShellProvider projectId={projectId}>
        <AppShellLayout>{children}</AppShellLayout>
      </ShellProvider>
    </AuthGuard>
  );
}

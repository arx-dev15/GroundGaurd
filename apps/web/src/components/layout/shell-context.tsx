'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { Project } from '@groundguard/types';
import { createFallbackProject } from '@/lib/projects-data';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

interface ShellContextType {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  toggleInspector: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  currentProjectId: string;
  currentProject: Project;
  projects: Project[];
  isLoadingProjects: boolean;
  createProject: (name: string, description?: string) => Promise<Project>;
  refreshProjects: () => Promise<void>;
  switchProject: (projectId: string) => void;
  currentSection: 'overview' | 'ask' | 'knowledge' | 'reliability' | 'settings';
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const ShellContext = React.createContext<ShellContextType | undefined>(undefined);

const SIDEBAR_STORAGE_KEY = 'groundguard_sidebar_collapsed';

interface ShellProviderProps {
  projectId: string;
  children: React.ReactNode;
}

export function ShellProvider({ projectId, children }: ShellProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const [projects, setProjects] = React.useState<Project[]>([]);
  const [currentProjectState, setCurrentProjectState] = React.useState<Project>(() =>
    createFallbackProject(projectId)
  );
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(true);

  const [sidebarCollapsed, setSidebarCollapsedState] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('collapsed') === 'true' || params.get('collapsed') === '1') {
        return true;
      }
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved !== null) return saved === 'true';
      if (window.innerWidth >= 768 && window.innerWidth < 1024) return true;
    }
    return false;
  });

  const [inspectorOpen, setInspectorOpen] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('inspector') === 'true' || params.get('inspector') === '1';
    }
    return false;
  });

  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('command') === 'true' || params.get('command') === '1';
    }
    return false;
  });

  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const [isMobile, setIsMobile] = React.useState(false);
  const [isTablet, setIsTablet] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(true);

  // Responsive handling
  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      const tablet = width >= 768 && width < 1024;
      const desktop = width >= 1024;

      setIsMobile(mobile);
      setIsTablet(tablet);
      setIsDesktop(desktop);

      if (tablet && !localStorage.getItem(SIDEBAR_STORAGE_KEY)) {
        setSidebarCollapsedState(true);
      }
    };

    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved !== null) {
      setSidebarCollapsedState(saved === 'true');
    } else if (window.innerWidth >= 768 && window.innerWidth < 1024) {
      setSidebarCollapsedState(true);
    }

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('inspector') === 'true' || params.get('inspector') === '1') {
        setInspectorOpen(true);
      }
      if (params.get('command') === 'true' || params.get('command') === '1') {
        setCommandPaletteOpen(true);
      }
      if (params.get('collapsed') === 'true' || params.get('collapsed') === '1') {
        setSidebarCollapsedState(true);
      }
    } catch {
      // ignore
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch real projects from M3 API
  const refreshProjects = React.useCallback(async () => {
    if (!user) return;
    try {
      setIsLoadingProjects(true);
      const res = await apiClient.get<{ projects: Project[] }>('/v1/projects');
      const loaded = res.projects || [];
      setProjects(loaded);

      // Match current project
      const match = loaded.find((p) => p.id === projectId);
      if (match) {
        setCurrentProjectState(match);
      } else {
        // Try fetching individual project if not in list
        try {
          const single = await apiClient.get<{ project: Project }>(`/v1/projects/${projectId}`);
          if (single.project) {
            setCurrentProjectState(single.project);
          }
        } catch {
          // If project genuinely does not exist or unauthorized, leave fallback
        }
      }
    } catch {
      // Network or API failure handled gracefully
    } finally {
      setIsLoadingProjects(false);
    }
  }, [user, projectId]);

  React.useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const createProject = React.useCallback(
    async (name: string, description?: string): Promise<Project> => {
      const res = await apiClient.post<{ project: Project }>('/v1/projects', {
        name,
        description: description?.trim() || undefined,
      });
      const newProj = res.project;
      setProjects((prev) => [newProj, ...prev]);
      return newProj;
    },
    []
  );

  const setSidebarCollapsed = React.useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  const toggleInspector = React.useCallback(() => {
    setInspectorOpen((prev) => !prev);
  }, []);

  // Global keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }

      if (isCmdOrCtrl && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toggleInspector();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar, toggleInspector]);

  // Determine current section from pathname
  const currentSection = React.useMemo<'overview' | 'ask' | 'knowledge' | 'reliability' | 'settings'>(() => {
    if (pathname.includes('/ask')) return 'ask';
    if (pathname.includes('/knowledge')) return 'knowledge';
    if (pathname.includes('/reliability')) return 'reliability';
    if (pathname.includes('/settings')) return 'settings';
    return 'overview';
  }, [pathname]);

  const switchProject = React.useCallback(
    (newProjectId: string) => {
      router.push(`/projects/${newProjectId}/${currentSection}`);
    },
    [router, currentSection]
  );

  return (
    <ShellContext.Provider
      value={{
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        inspectorOpen,
        setInspectorOpen,
        toggleInspector,
        commandPaletteOpen,
        setCommandPaletteOpen,
        mobileMenuOpen,
        setMobileMenuOpen,
        currentProjectId: projectId,
        currentProject: currentProjectState,
        projects,
        isLoadingProjects,
        createProject,
        refreshProjects,
        switchProject,
        currentSection,
        isMobile,
        isTablet,
        isDesktop,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell(): ShellContextType {
  const context = React.useContext(ShellContext);
  if (!context) {
    throw new Error('useShell must be used within a ShellProvider');
  }
  return context;
}

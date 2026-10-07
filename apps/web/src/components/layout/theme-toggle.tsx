'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Laptop, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ThemeToggleProps {
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function ThemeToggle({ align = 'end', className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground opacity-70"
        aria-label="Appearance"
        disabled
      >
        <Moon className="h-4 w-4" />
      </Button>
    );
  }

  const currentIcon =
    theme === 'light' ? (
      <Sun className="h-3.5 w-3.5 text-foreground" />
    ) : theme === 'dark' ? (
      <Moon className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <Laptop className="h-3.5 w-3.5 text-foreground" />
    );

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring ${className || ''}`}
                aria-label={`Appearance: currently ${theme || 'system'}`}
              >
                {currentIcon}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <span>Appearance: {theme ? theme.charAt(0).toUpperCase() + theme.slice(1) : 'System'}</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent align={align} className="w-36 text-xs">
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="flex items-center justify-between cursor-pointer py-1.5"
        >
          <div className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Light</span>
          </div>
          {theme === 'light' && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="flex items-center justify-between cursor-pointer py-1.5"
        >
          <div className="flex items-center gap-2">
            <Moon className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Dark</span>
          </div>
          {theme === 'dark' && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className="flex items-center justify-between cursor-pointer py-1.5"
        >
          <div className="flex items-center gap-2">
            <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
            <span>System</span>
          </div>
          {theme === 'system' && <Check className="h-3.5 w-3.5 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

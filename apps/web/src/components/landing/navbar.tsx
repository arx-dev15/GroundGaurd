'use client';

import * as React from 'react';
import Link from 'next/link';
import { Shield, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavbarProps {
  onGetStarted?: () => void;
  onSignIn?: () => void;
}

const NAV_LINKS = [
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Verification', href: '#verification' },
  { label: 'Inspector', href: '#inspector' },
  { label: 'Security', href: '#security' },
  { label: 'Reliability', href: '#reliability' },
];

export function Navbar({ onGetStarted, onSignIn }: NavbarProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-200 select-none',
        scrolled
          ? 'bg-background/85 backdrop-blur-md border-b border-border/70 shadow-xs'
          : 'bg-transparent border-b border-transparent'
      )}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md py-1 px-1.5 -ml-1.5 transition-colors"
          aria-label="GroundGuard Home"
        >
          <div className="h-6 w-6 rounded bg-foreground text-background flex items-center justify-center transition-transform group-hover:scale-105 duration-150">
            <Shield className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-foreground">
            GroundGuard
          </span>
        </Link>

        {/* Desktop Anchor Navigation */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main Navigation">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleScrollTo(e, link.href)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right CTA Actions */}
        <div className="hidden sm:flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSignIn}
            className="text-xs text-muted-foreground hover:text-foreground h-8 px-3"
          >
            Sign in
          </Button>
          <Button
            size="sm"
            onClick={onGetStarted}
            className="text-xs h-8 px-3.5 shadow-sm font-medium"
          >
            Get started
          </Button>
        </div>

        {/* Mobile Menu Hamburger */}
        <div className="flex sm:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="text-muted-foreground hover:text-foreground"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-b border-border/80 bg-background/95 backdrop-blur-xl px-6 py-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col space-y-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleScrollTo(e, link.href)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground py-1.5 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="pt-2 border-t border-border/50 flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMobileMenuOpen(false);
                onSignIn?.();
              }}
              className="w-full text-xs"
            >
              Sign in
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setMobileMenuOpen(false);
                onGetStarted?.();
              }}
              className="w-full text-xs"
            >
              Get started
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

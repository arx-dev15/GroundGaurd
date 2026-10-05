'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Eye, EyeOff, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/projects';
  const { login, isAuthenticated, isLoading, error, clearError } = useAuth();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // If already authenticated, redirect to destination
  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(from);
    }
  }, [isLoading, isAuthenticated, router, from]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid email address');
      return;
    }

    if (!password) {
      setLocalError('Please enter your password');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email, password });
      router.push(from);
    } catch (err: unknown) {
      // Error handled by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center px-4 py-12 selection:bg-muted select-none">
      {/* Brand Header */}
      <div className="w-full max-w-sm flex flex-col items-center mb-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 mb-6 group outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md p-1"
        >
          <div className="h-7 w-7 rounded bg-foreground text-background flex items-center justify-center shrink-0 shadow-sm relative">
            <Shield className="h-4 w-4 fill-current" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-status-verified ring-2 ring-background" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            EvideX AI
          </span>
        </Link>

        <h1 className="text-xl font-bold tracking-tight text-foreground text-center">
          Sign in to EvideX AI
        </h1>
        <p className="text-xs text-muted-foreground mt-1.5 text-center">
          Enter your credentials to access verified workspaces
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm rounded-xl border border-border/80 bg-card/50 backdrop-blur-sm p-6 shadow-xl space-y-4">
        {displayError && (
          <div
            role="alert"
            className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5 animate-in fade-in duration-150"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{displayError}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="email"
              className="text-xs font-medium text-foreground block"
            >
              Work Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="alex@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (localError) setLocalError(null);
                if (error) clearError();
              }}
              className="h-9 text-xs"
              required
            />
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-xs font-medium text-foreground block"
              >
                Password
              </label>
            </div>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (localError) setLocalError(null);
                  if (error) clearError();
                }}
                className="h-9 text-xs pr-9 font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5"
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-9 text-xs font-semibold gap-1.5 cursor-pointer mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </form>

        {/* Footer Link */}
        <div className="pt-3 border-t border-border/60 text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="text-foreground font-medium hover:underline underline-offset-4"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

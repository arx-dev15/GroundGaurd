'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, Eye, EyeOff, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth-context';

export default function SignupPage() {
  const router = useRouter();
  const { register, isAuthenticated, isLoading, error, clearError } = useAuth();

  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // If already authenticated, redirect to projects
  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/projects');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!name.trim()) {
      setLocalError('Please enter your full name');
      return;
    }

    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid work email address');
      return;
    }

    if (!password || password.length < 6) {
      setLocalError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({ name: name.trim(), email, password });
      router.push('/projects');
    } catch (err: unknown) {
      // Handled by AuthContext
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
          Create your account
        </h1>
        <p className="text-xs text-muted-foreground mt-1.5 text-center">
          Start verifying AI claims against enterprise evidence
        </p>
      </div>

      {/* Signup Card */}
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

        <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
          {/* Full Name Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="text-xs font-medium text-foreground block"
            >
              Full Name
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              autoFocus
              placeholder="Alex Rivera"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (localError) setLocalError(null);
                if (error) clearError();
              }}
              className="h-9 text-xs"
              required
            />
          </div>

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
            <label
              htmlFor="password"
              className="text-xs font-medium text-foreground block"
            >
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 6 characters"
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

          {/* Confirm Password Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="confirmPassword"
              className="text-xs font-medium text-foreground block"
            >
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (localError) setLocalError(null);
                if (error) clearError();
              }}
              className="h-9 text-xs font-mono"
              required
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-9 text-xs font-semibold gap-1.5 cursor-pointer mt-3"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create account</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </form>

        {/* Footer Link */}
        <div className="pt-3 border-t border-border/60 text-center text-xs text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-foreground font-medium hover:underline underline-offset-4"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

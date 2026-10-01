import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-5 border border-border/80 p-8 rounded-lg bg-card/50 shadow-sm">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-secondary border border-border/60 text-muted-foreground">
          <Compass className="h-5 w-5" />
        </div>

        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The requested location does not exist or has been relocated within DHADHI.
          </p>
        </div>

        <div className="pt-2">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/">
              <ArrowLeft className="h-3.5 w-3.5" />
              Return home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

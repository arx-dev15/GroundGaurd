'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Navbar } from '@/components/landing/navbar';
import { Hero } from '@/components/landing/hero';
import { TrustPrinciple } from '@/components/landing/trust-principle';
import { HowItWorks } from '@/components/landing/how-it-works';
import { VerificationStory } from '@/components/landing/verification-story';
import { TrustInspectorPreview } from '@/components/landing/trust-inspector-preview';
import { ProvenanceSection } from '@/components/landing/provenance-section';
import { SecuritySection } from '@/components/landing/security-section';
import { ReliabilityPreview } from '@/components/landing/reliability-preview';
import { FinalCTA } from '@/components/landing/final-cta';
import { useRouter } from 'next/navigation';
import { Footer } from '@/components/landing/footer';

export default function CompleteLandingPage() {
  const router = useRouter();

  const handleSignIn = () => {
    router.push('/login');
  };

  const handleGetStarted = () => {
    router.push('/signup');
  };

  const handleExploreProduct = () => {
    const section = document.getElementById('how-it-works');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-muted selection:text-foreground antialiased scroll-smooth">
      {/* 01: Top Navigation Bar */}
      <Navbar onSignIn={handleSignIn} onGetStarted={handleGetStarted} />

      <main className="flex-1 flex flex-col">
        {/* 02: Hero Section (with Evidence Field, Live Typing, and Integrated Demo) */}
        <Hero onGetStarted={handleGetStarted} />

        {/* 03: Trust Principle Section */}
        <TrustPrinciple />

        {/* 04: How GroundGuard Works (Interactive 5-stage pipeline) */}
        <HowItWorks />

        {/* 05: Verification Story (Claim vs Evidence & Autonomous Recovery) */}
        <VerificationStory />

        {/* 06: Trust Without Complexity (Normal User vs Contextual Inspector) */}
        <TrustInspectorPreview />

        {/* 07: Knowledge + Provenance (Documents as first-class objects) */}
        <ProvenanceSection />

        {/* 08: Security & Isolation (Tenant separation diagram & 4 pillars) */}
        <SecuritySection />

        {/* 09: Reliability / Developer Preview (Execution trace waterfall & metrics) */}
        <ReliabilityPreview />

        {/* 10: Final Closing Call to Action */}
        <FinalCTA onGetStarted={handleGetStarted} onExploreProduct={handleExploreProduct} />
      </main>

      {/* 11: Minimal Footer */}
      <Footer />
    </div>
  );
}

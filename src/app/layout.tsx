import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GroundGuard — Complete 3D Architecture Experience',
  description: 'Interactive technical product visualization of GroundGuard verification-driven engineering intelligence.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark bg-[#060709] text-slate-100">
      <body className="antialiased min-h-screen overflow-x-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import '@fontsource-variable/mona-sans';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'RAT — Repo Analysis Tool',
  description:
    'Ingest Git repositories and explore file, directory, repository, commit-set and author metrics.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container site-header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true" />
              RAT
            </Link>
            <nav className="site-nav" aria-label="Primary">
              <Link href="/">Repositories</Link>
              <Link href="/compare">Compare</Link>
            </nav>
            <span className="site-header-tag mono">REPO ANALYSIS TOOL</span>
          </div>
        </header>
        <main className="site-main container">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <span>RAT — commit-level repository analytics over Git history.</span>
            <span className="mono text-xs">GIT &middot; SQLITE &middot; EXPRESS &middot; NEXT.JS</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

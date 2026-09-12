import type { ReactNode } from 'react';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:py-16">
      <div className="w-full max-w-[412px]">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">IELTS Practice</p>
          <h1 className="mt-2 text-[25px] font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}

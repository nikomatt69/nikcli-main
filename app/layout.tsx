import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WebConfigProvider } from '../src/web/lib/config-context';
import { WebSocketProvider } from '../src/web/lib/websocket-context';
import { ThemeProvider } from '../src/web/lib/theme-context';
import React from 'react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NikCLI - Background Agents',
  description: 'Create agents to edit and run code, asynchronously',
  keywords: ['AI', 'agents', 'background', 'code', 'automation'],
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0d0f' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${inter.className} h-full bg-background text-foreground transition-colors duration-300 antialiased`}
      >
        <ThemeProvider defaultTheme="system" storageKey="nikcli-theme">
          <WebConfigProvider>
            <WebSocketProvider>
              <main className="h-full flex flex-col min-h-screen">
                {children}
              </main>
            </WebSocketProvider>
          </WebConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

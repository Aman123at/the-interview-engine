import type { Metadata } from "next";
import { Roboto, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { GlobalLoadingBar } from "@/components/feature/global-loading-bar";

// Roboto via `next/font/google`: Next self-hosts the woff2 files at build
// time, so there's no runtime CDN dependency. We include the weights the UI
// actually leans on — regular for body/UI, 500/600/700 for buttons, labels,
// and the heading scale defined in globals.css.
const robotoSans = Roboto({
  variable: "--font-roboto-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Code surfaces (Monaco/xterm bring their own pixel-sized fonts; this
// covers `font-mono` Tailwind utilities and inline <code> chips).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Interview Sandbox",
  description: "Technical interview sandbox client",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // No forced theme class. `next-themes` (in <ThemeProvider>) injects an
    // SSR-safe inline script before first paint that adds `.dark` to <html>
    // when the resolved theme is dark — so reload preserves the choice and
    // there's no flash. `suppressHydrationWarning` is required because that
    // script mutates the DOM before React hydrates.
    <html
      lang="en"
      className={`${robotoSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-full flex flex-col font-sans">
        <ThemeProvider>
          {/* Top-of-viewport progress bar; visible whenever ANY API request
              is in flight. Non-blocking and pointer-events:none. */}
          <GlobalLoadingBar />
          <AuthProvider>{children}</AuthProvider>
          {/* `theme="system"` here is sonner's pass-through: it reads the
              `.dark` class on <html> (which next-themes maintains) so the
              toast palette tracks the active theme. */}
          <Toaster
            richColors
            closeButton
            position="bottom-right"
            theme="system"
          />
        </ThemeProvider>
      </body>
    </html>
  );
}

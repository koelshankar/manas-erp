import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session";
import { AppShell } from "@/components/shell";
import { ThemeScript } from "@/components/shell/theme-script";

/**
 * The app is sans-serif throughout — body, controls, tables and charts.
 *
 * `latin-ext` is not optional: the rupee sign U+20B9 sits in Google Fonts'
 * latin-ext unicode-range, not in `latin`. Without it every ₹ in the app would
 * silently fall back to the system UI font and sit half a millimetre off the
 * figures beside it.
 *
 * The variable is `--font-sans-face` rather than `--font-sans` because
 * globals.css builds the `--font-sans` stack from it, and a custom property
 * may not refer to itself on the element that declares it.
 */
const inter = Inter({
  variable: "--font-sans-face",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Document numbers and codes only. */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Manas Developers ERP",
  description:
    "Developer ERP for Manas Developers — projects, contractors, site, purchase and billing.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased">
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}

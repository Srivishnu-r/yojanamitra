import type { Metadata, Viewport } from 'next'
import './globals.scss'
import '@/components/MitraCompanion.scss'
import { capabilityReport } from '@/lib/config'
import { I18nProvider } from '@/lib/i18n/context'
import { SessionProvider } from '@/components/SessionProvider'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: {
    default: 'YojanaMitra AI — Find and apply for Indian government schemes',
    template: '%s · YojanaMitra AI',
  },
  description:
    'An AI companion for Indian government schemes. Describe your situation in your own language and YojanaMitra finds the schemes you qualify for, fetches your documents from DigiLocker, and applies on your behalf.',
  keywords: [
    'government schemes India',
    'yojana',
    'sarkari yojana',
    'eligibility',
    'DigiLocker',
    'AI assistant',
    'Indic languages',
  ],
  applicationName: 'YojanaMitra AI',
}

export const viewport: Viewport = {
  themeColor: '#f47216',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-side capability detection drives the client providers, so the UI
  // knows up front whether Sarvam translation is available.
  const capabilities = capabilityReport()

  return (
    <html lang="en-IN">
      <body>
        <I18nProvider translationLive={capabilities.sarvam.live}>
          <SessionProvider>
            <AppShell>{children}</AppShell>
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  )
}

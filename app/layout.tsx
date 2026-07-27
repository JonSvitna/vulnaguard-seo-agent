import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vulnaguard Outreach',
  description: 'AI-assisted lead qualification and email outreach',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}

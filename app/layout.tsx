import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Vulnaguard SEO Agent',
  description: 'Full-cycle SEO intelligence for Vulnaguard and partner sites',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tiny Tales Admin',
  description: 'Admin panel for managing children storybooks',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


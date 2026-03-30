import type { Metadata } from 'next'
import Image from 'next/image'
import './globals.css'

export const metadata: Metadata = {
  title: 'Screenshot to Spreadsheet',
  description: 'Extract table data from screenshots using AI'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
          <Image
            src="/sidgrove-logo.png"
            alt="Sidgrove"
            width={110}
            height={26}
            priority
          />
        </header>
        {children}
      </body>
    </html>
  )
}

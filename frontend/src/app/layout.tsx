import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '9Tools - ระบบบริหารจัดการเอกสาร',
  description: 'ระบบบริหารจัดการเอกสารแบบครบวงจรสำหรับฝ่าย GPF และฝ่ายเอกสารที่เกี่ยวข้อง',
  keywords: ['document management', 'GPF', 'file sharing', 'security'],
  authors: [{ name: '9Tools Development Team' }],
  viewport: 'width=device-width, initial-scale=1',
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" className="h-full">
      <body className={`h-full ${inter.className}`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

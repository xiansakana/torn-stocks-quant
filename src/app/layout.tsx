import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Torn Stocks Quant',
    template: '%s | Torn Stocks Quant',
  },
  description: 'Torn City 股票量化分析平台 - 技术指标、策略信号、历史回测',
  keywords: [
    'Torn',
    'Stocks',
    'Quant',
    'Trading',
    'Analysis',
    'Backtest',
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen bg-background text-foreground">
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}

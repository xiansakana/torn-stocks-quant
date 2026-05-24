# AGENTS.md

## 项目概览
**Torn Stocks Quant** - Torn City 股票量化分析平台，基于 tornsy.com API 提供实时行情、技术指标分析、策略信号和历史回测功能。

### 技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS 4
- **图表**: lightweight-charts v5 (TradingView)
- **包管理**: pnpm

## 目录结构
```
src/
├── app/
│   ├── api/
│   │   ├── stocks/route.ts           # 代理 tornsy /api/stocks
│   │   ├── stocks/[symbol]/route.ts  # 代理 tornsy 历史K线数据
│   │   ├── analysis/route.ts         # 全市场策略信号计算
│   │   └── backtest/route.ts         # 历史回测引擎
│   ├── stock/[symbol]/page.tsx       # 个股详情（K线+指标）
│   ├── strategy/page.tsx             # 策略信号面板
│   ├── backtest/page.tsx             # 历史回测页面
│   ├── layout.tsx                    # 根布局
│   ├── page.tsx                      # Dashboard
│   └── globals.css                   # 暗色终端主题
├── components/
│   ├── sidebar.tsx                   # 侧边导航
│   ├── app-shell.tsx                 # 页面骨架
│   └── ui/                           # shadcn 组件
├── lib/
│   ├── technical-analysis.ts         # RSI/MACD/布林带/MA 计算
│   ├── backtest.ts                   # 回测引擎
│   └── utils.ts                      # cn() 工具
└── types/
    └── stock.ts                      # 类型定义 & 常量
```

## 构建与测试命令
- 开发: `pnpm run dev`
- 类型检查: `pnpm ts-check`
- Lint: `pnpm lint`
- 构建: `pnpm run build`

## API 端点
| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/stocks` | GET | 获取全部股票实时行情 |
| `/api/stocks/{symbol}?interval={}&to={}` | GET | 获取历史K线 |
| `/api/analysis?config={}` | GET | 全市场策略信号 |
| `/api/backtest` | POST | 运行历史回测 |

## 量化策略
- **多因子组合策略**: RSI(40%) + MACD(35%) + 布林带(25%)
- 买入阈值: 综合评分 > 0.2
- 卖出阈值: 综合评分 < -0.2
- 卖出手续费: 0.1%（买入免费）

## 设计规范
- 暗色终端风格 (Bloomberg Terminal / TradingView)
- 背景色: `#0f1117` / 卡片: `#1a1d29`
- 涨绿 `#22c55e` / 跌红 `#ef4444` / 品牌蓝 `#3b82f6`
- 数据字体: JetBrains Mono
- 详细规范见 DESIGN.md

## 编码规范
- 严格 TypeScript，禁止隐式 any
- lightweight-charts v5 使用 `chart.addSeries(SeriesType, options)` API
- 前端动态内容需 'use client' + useEffect + useState

# NikCLI Architecture Flow - How Everything Works Together

**Date**: 2025-11-16
**Status**: ✅ COMPLETE ARCHITECTURE

---

## 🎯 Overall Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        User/CLI Input                             │
│                   (nikcli goat chat "Buy 100...")                 │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    GoatTool (Tool Registry)                       │
│                                                                   │
│  ├─ builder-sign-order    ├─ ws-connect      ├─ set-funder       │
│  ├─ native-health         ├─ ws-subscribe    ├─ relayer-deploy   │
│  ├─ native-status         ├─ ws-stats        ├─ gamma-trending   │
│  └─ ... (14+ actions)     └─ ... (more)      └─ rtds-subscribe   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  Chat Interface  │  │  Toolchains      │
        │  (Direct Tool    │  │  (Orchestrated   │
        │   Calls)         │  │   Tool Sequences)│
        └────────┬─────────┘  └────────┬─────────┘
                 │                     │
                 └──────────┬──────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│              GoatProvider (Component Factory)                     │
│                                                                   │
│  ├─ getPolymarketNativeClient()                                  │
│  ├─ getWebSocketManager()                                        │
│  ├─ getBuilderSigningService()                                   │
│  ├─ getPolymarketRelayerClient()      ← NEW                      │
│  ├─ getGammaMarketsAPI()              ← NEW                      │
│  ├─ getRTDSClient()                   ← NEW                      │
│  └─ getCTFClient()                    ← NEW                      │
└────────────────────────────┬─────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌────────────────┐ ┌──────────────────┐ ┌────────────────┐
│  AI Provider   │ │ PolymarketAgent  │ │   Toolchains   │
│  (Vercel AI)   │ │  (Specialized)   │ │  (Orchestrated)│
└────────┬───────┘ └────────┬─────────┘ └────────┬───────┘
         │                  │                    │
         └──────────┬───────┴────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Polymarket Components                            │
│                                                                   │
│  ├─ PolymarketNativeClient (CLOB API)                            │
│  ├─ PolymarketWebSocketManager (Real-time)                       │
│  ├─ PolymarketBuilderSigningService (Attribution)                │
│  ├─ PolymarketRelayerClient (Gasless)                            │
│  ├─ PolymarketGammaAPI (Market Data)                             │
│  ├─ PolymarketRTDS (Real-time Prices)                            │
│  └─ PolymarketCTF (Token Operations)                             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
                    Polymarket Blockchain
                   (Polygon + Base Networks)
```

---

## 📍 Three Interaction Paths

### Path 1: Direct Chat → GoatTool → Component

**User**: `nikcli goat chat "Buy 100 shares at 0.55 on TRUMP market"`

```
Chat Interface
    │
    ├─ Parse intent: "Buy 100 at 0.55 TRUMP"
    │
    ├─ Map to GoatTool action: "place-order"
    │
    ├─ Call GoatTool with parameters
    │
    ├─ GoatTool gets GoatProvider
    │
    ├─ GoatProvider.getPolymarketNativeClient()
    │
    ├─ NativeClient.placeOrder({
    │    tokenId: "TRUMP_MARKET_TOKEN",
    │    price: 0.55,
    │    size: 100,
    │    side: "BUY"
    │  })
    │
    └─ Return result to user

⚡ DIRECT & FAST - Single command execution
```

---

### Path 2: PolymarketAgent → GoatProvider → Components

**Task**: `{ description: "Buy 100 shares at 0.55 on TRUMP market" }`

```
PolymarketAgent.executeTask(task)
    │
    ├─ parseOrderIntent(task.description)
    │  └─ Extract: tokenId, size, price, side
    │
    ├─ assessOrderRisk(orderIntent)
    │  └─ Calculate risk/reward ratio
    │
    ├─ this.goatProvider.getPolymarketNativeClient()
    │
    ├─ nativeClient.placeOrder(orderIntent)
    │
    ├─ this.goatProvider.getBuilderSigningService()
    │
    ├─ signingService.signOrder(result)
    │  └─ Add builder attribution
    │
    ├─ Update metrics
    │  ├─ tasksCompleted++
    │  ├─ successRate
    │  └─ avgTaskDuration
    │
    └─ Return result with metrics

🤖 AI-POWERED - Decision making + risk assessment + attribution
```

---

### Path 3: Toolchain → Multiple GoatTools → Orchestrated Components

**Toolchain**: `polymarket-market-making`

```
Toolchain Execution Engine
    │
    ├─ Step 1: Real-time Data Collection
    │  │
    │  ├─ goat-tool: rtds-connect
    │  │  └─ GoatProvider.getRTDSClient()
    │  │     └─ PolymarketRTDS.connect()
    │  │        └─ WebSocket live prices
    │  │
    │  └─ goat-tool: gamma-trending
    │     └─ GoatProvider.getGammaMarketsAPI()
    │        └─ PolymarketGammaAPI.getTrendingMarkets()
    │           └─ Market metadata
    │
    ├─ Step 2: Market Analysis
    │  │
    │  └─ goat-tool: polymarket-analyze
    │     └─ GoatProvider.getPolymarketNativeClient()
    │        └─ PolymarketNativeClient.getOrderBook()
    │           └─ Calculate spreads, liquidity
    │
    ├─ Step 3: Order Placement (Conditional)
    │  │
    │  ├─ IF spread < 0.01:
    │  │  │
    │  │  ├─ goat-tool: set-funder
    │  │  │  └─ GoatProvider.getPolymarketNativeClient()
    │  │  │     └─ setFunderAddress(address)
    │  │  │
    │  │  └─ goat-tool: relayer-execute
    │  │     └─ GoatProvider.getPolymarketRelayerClient()
    │  │        └─ PolymarketRelayerClient.executeSafeTransactions()
    │  │           └─ Gasless transaction via Safe
    │  │
    │  └─ ELSE: Skip this market
    │
    ├─ Step 4: Position Management
    │  │
    │  └─ IF position > threshold:
    │     │
    │     ├─ goat-tool: ctf-split (create hedges)
    │     │  └─ GoatProvider.getCTFClient()
    │     │     └─ PolymarketCTF.split()
    │     │
    │     └─ goat-tool: ws-stats (monitor)
    │        └─ GoatProvider.getWebSocketManager()
    │           └─ PolymarketWebSocketManager.getStats()
    │
    └─ Step 5: Builder Attribution & Metrics
       │
       ├─ goat-tool: builder-metrics
       │  └─ GoatProvider.getBuilderSigningService()
       │     └─ PolymarketBuilderSigningService.getMetrics()
       │
       └─ goat-tool: funder-status
          └─ GoatProvider.getPolymarketNativeClient()
             └─ hasFunderAddress()

🔗 ORCHESTRATED - Multiple components in sequence
```

---

## 🔄 Complete End-to-End Example: Market Making Strategy

### Setup
```typescript
// User starts market making toolchain
nikcli goat run-toolchain polymarket-market-making --config strategy.json
```

### Execution Flow

**1️⃣ INITIALIZATION**
```
Toolchain starts
  ├─ GoatProvider.initialize()
  ├─ PolymarketAgent.initialize()
  │  ├─ nativeClient.initialize()
  │  │  └─ Derive L2 credentials from private key
  │  ├─ wsManager.connect()
  │  │  └─ Connect to WebSocket
  │  └─ gammaAPI.initialize()
  │     └─ Verify API connectivity
  └─ RTDSClient.connect()
     └─ Connect to live price stream
```

**2️⃣ DATA COLLECTION (Parallel)**
```
Parallel execution:
  ├─ gammaAPI.getTrendingMarkets(20)
  │  └─ Get top 20 liquid markets
  ├─ rtds.subscribeToCryptoPrices(['BTC', 'ETH'])
  │  └─ Subscribe to price updates
  └─ nativeClient.getMarkets(50)
     └─ Get all available markets
```

**3️⃣ MARKET ANALYSIS**
```
For each market in trending:
  ├─ nativeClient.getOrderBook(tokenId)
  │  └─ Calculate:
  │     ├─ Best bid/ask
  │     ├─ Spread in bps
  │     └─ Liquidity level
  │
  └─ gammaAPI.getMarketDetails(marketId)
     └─ Get metadata:
        ├─ Volume 24h
        ├─ Category
        └─ Creation date
```

**4️⃣ STRATEGY DECISION**
```
IF spread < 0.01 bps AND liquidity == high:
  │
  ├─ nativeClient.setFunderAddress(walletAddress)
  │  └─ Configure funder for this trade
  │
  ├─ agent.executeTask({
  │    description: "Place BUY order 100 shares at bid price"
  │  })
  │  ├─ Agent parses intent
  │  ├─ Agent assesses risk
  │  ├─ nativeClient.placeOrder()
  │  └─ builderSigningService.signOrder()
  │     └─ Add builder attribution for gas coverage
  │
  └─ ELSE: Skip market

REPEAT for each qualifying market
```

**5️⃣ REAL-TIME MONITORING**
```
Continuous loop:
  ├─ WebSocket receives price_change event
  │  └─ wsManager.emit('priceUpdate', update)
  │     └─ Agent reacts to significant price moves
  │
  ├─ Check if position needs rebalancing
  │  └─ IF unrealizedPnL > threshold:
  │     ├─ ctfClient.split() or merge()
  │     │  └─ Adjust position size
  │     └─ relayerClient.executeSafeTransactions()
  │        └─ Execute without gas costs
  │
  └─ Update metrics
     ├─ builderSigningService.getMetrics()
     └─ Report to monitoring system
```

**6️⃣ GRACEFUL SHUTDOWN**
```
User cancels or timeout reached:
  ├─ wsManager.disconnect()
  ├─ rtdsClient.disconnect()
  ├─ gammaAPI.clearCache()
  ├─ nativeClient.clearFunderAddress()
  └─ Report final metrics:
     ├─ Orders executed
     ├─ Volume traded
     ├─ Gas fees saved (via builder)
     └─ Success rate
```

---

## 🎬 Three Usage Scenarios

### Scenario A: Simple One-Off Trade
```
User → Chat ("Buy 100 at 0.55 TRUMP")
  │
  └─ GoatTool.execute("place-order")
     └─ NativeClient.placeOrder()
     └─ ✅ Done in seconds
```

### Scenario B: Autonomous Trading
```
PolymarketAgent.executeTask(task)
  │
  ├─ Market analysis
  ├─ Risk assessment
  ├─ Order placement
  ├─ Builder attribution
  └─ Metrics tracking
  └─ ✅ Full autonomous execution
```

### Scenario C: Complex Strategy (Market Making)
```
Toolchain: polymarket-market-making
  │
  ├─ Real-time data (RTDS + Gamma API)
  ├─ Market analysis (Native Client)
  ├─ Conditional order placement
  ├─ Position rebalancing (CTF)
  ├─ Gasless execution (Relayer)
  ├─ Builder metrics (Builder Service)
  └─ ✅ Enterprise trading operation
```

---

## 📊 Component Responsibility Matrix

| Component | Used By | Use Case |
|-----------|---------|----------|
| **GoatTool** | Chat, Toolchains, Agent | CLI interface to everything |
| **GoatProvider** | Tool, Agent, Toolchain | Factory for all components |
| **NativeClient** | GoatTool → Provider | Core trading (CLOB API) |
| **WebSocketManager** | GoatTool → Provider → Agent | Real-time orderbook |
| **BuilderSigningService** | GoatTool → Provider → Agent | Order attribution |
| **RelayerClient** | GoatTool → Provider → Toolchain | Gasless transactions |
| **GammaAPI** | GoatTool → Provider → Toolchain | Market discovery |
| **RTDSClient** | GoatTool → Provider → Toolchain | Real-time prices |
| **CTFClient** | GoatTool → Provider → Agent | Token operations |
| **PolymarketAgent** | Chat, Toolchain | AI trading decisions |
| **Toolchains** | Chat, CLI | Orchestrated workflows |

---

## 🔐 Data & Control Flow

### Data Flow
```
User Input
    │
    ▼
GoatTool (Parses + Validates)
    │
    ▼
GoatProvider (Gets correct component)
    │
    ▼
Polymarket Component (Executes operation)
    │
    ▼
Polymarket API / Blockchain
    │
    ▼
Result + Metrics
    │
    ▼
User Output
```

### Control Flow
```
GoatTool
    ├─ Sequential: One tool action at a time
    │  └─ await toolAction()
    │
GoatTool + Toolchain
    ├─ Sequential with conditions
    │  ├─ IF condition: execute step
    │  └─ ELSE: skip step
    │
PolymarketAgent
    ├─ AI decision-making
    │  ├─ Parse intent
    │  ├─ Assess risk
    │  └─ Execute
    │
WebSocket Manager
    └─ Event-driven asynchronous
       ├─ Subscribe
       ├─ Receive updates
       └─ React automatically
```

---

## ✨ Key Integration Points

### 1. AI Provider → GoatTool → Component
- **Vercel AI** calls GoatTool actions
- **GoatTool** calls GoatProvider methods
- **GoatProvider** instantiates components
- **Component** executes on Polymarket

### 2. Agent → GoatProvider → Components
- **Agent** has `goatProvider` injected
- **Agent** calls `getXyz()` methods directly
- **Components** execute with AI reasoning
- **Results** update agent metrics

### 3. Toolchain → Multiple GoatTools → Orchestration
- **Toolchain engine** coordinates steps
- **Each step** is a GoatTool action
- **GoatProvider** consistent across steps
- **Components** maintain state between steps

---

## 🚀 Production Deployment

**All three paths work together**:

```
Production System
├─ Chat Interface
│  └─ Direct tool calls for simple operations
│
├─ PolymarketAgent
│  └─ Autonomous trading with risk management
│
├─ Toolchains
│  └─ Complex strategies with orchestration
│
└─ All share:
   ├─ Same GoatProvider
   ├─ Same components
   ├─ Same authentication
   └─ Same metrics/monitoring
```

**Result**: Unified, scalable, production-ready Polymarket integration in NikCLI

---

**Status**: ✅ ARCHITECTURE COMPLETE
**Ready**: NOW
**Version**: 2.0.0

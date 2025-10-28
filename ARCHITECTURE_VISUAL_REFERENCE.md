# 🎨 ARCHITECTURE VISUAL REFERENCE GUIDE

## Mermaid Diagram Exports

All diagrams below can be rendered in Mermaid (GitHub, GitLab, Notion, etc.)

---

## 1. CURRENT MONOLITHIC ARCHITECTURE

```mermaid
graph TD
    A["User CLI Input"] -->|"65s startup, 760MB"| B["index.ts<br/>724 KB Monolith"]

    B -->|Commands Mixed In| C["Commands Layer<br/>45% of code"]
    B -->|Services Mixed In| D["Services Layer<br/>35% of code"]
    B -->|Utils Mixed In| E["Utilities<br/>15% of code"]
    B -->|Config Scattered| F["Config<br/>5% of code"]

    C -->|"Cross-references"| D
    D -->|"Cross-references"| E
    E -->|"Cross-references"| C

    D --> G["File Operations"]
    D --> H["Git Integration"]
    D --> I["AI Provider<br/>280 MB RAM"]
    D --> J["Package Manager"]

    I -->|"8 indirect deps"| K["OpenAI SDK"]
    I -->|"4 indirect deps"| L["Google Vertex"]
    I -->|"Unused 90% of time"| M["LangChain"]

    G --> N["External APIs<br/>92 Dependencies"]
    H --> N
    J --> N

    N -->|"Output"| O["CLI Output"]

    style B fill:#ff6b6b,stroke:#c92a2a,color:#fff
    style C fill:#ff8787,stroke:#c92a2a,color:#fff
    style D fill:#ff8787,stroke:#c92a2a,color:#fff
    style I fill:#ffb3b3,stroke:#d63031,color:#000
    style N fill:#ffe0e0,stroke:#e17055,color:#000
```

---

## 2. TARGET MODULAR ARCHITECTURE

```mermaid
graph TD
    A["User CLI Input"] -->|"5s startup, 200MB"| B["index.ts<br/>2 KB Bootstrap"]

    B --> C["CLI Parser<br/>Fast, Minimal Deps"]

    C --> D["Orchestrator<br/>Service Registry"]

    D -->|"Identify Command"| E["Command Router"]
    E -->|"File Ops"| F["File Service"]
    E -->|"Git Ops"| G["Git Service<br/>Lazy Load"]
    E -->|"Package Ops"| H["Package Service<br/>Lazy Load"]
    E -->|"AI Ops"| I["AI Service<br/>Lazy Load"]

    F --> J["Core Layer<br/>Config, Logger, Types"]
    G --> J
    H --> J
    I --> J

    J --> K["Cache Service<br/>Memory + FS"]

    K -->|"Only on demand"| L["External APIs<br/>48 Dependencies"]

    F -->|"Output"| M["CLI Output<br/>Structured & Fast"]
    G --> M
    H --> M
    I --> M

    style B fill:#51cf66,stroke:#2f9e44,color:#fff
    style D fill:#69db7c,stroke:#2f9e44,color:#000
    style F fill:#a9e34b,stroke:#5c940d,color:#000
    style L fill:#d0f0c0,stroke:#5c940d,color:#000
    style K fill:#d4edda,stroke:#28a745,color:#000
```

---

## 3. DEPENDENCY NETWORK COMPARISON

### BEFORE: Circular Dependencies

```mermaid
graph LR
    CMD["Commands<br/>45% code"] -->|"Direct import"| SVC["Services<br/>35% code"]
    SVC -->|"Direct import"| UTL["Utilities<br/>15% code"]
    UTL -->|"Cross-reference"| CMD

    SVC -->|"Import all"| AI["AI SDKs<br/>280 MB"]
    SVC -->|"Import all"| GIT["Git Libs"]
    SVC -->|"Import all"| PKG["Package Mgrs"]

    AI -->|"9 circular"| SVC

    CMD -->|"Access state"| STATE["Global State<br/>Scattered"]
    SVC -->|"Access state"| STATE
    UTL -->|"Access state"| STATE

    style CMD fill:#ff6b6b,stroke:#c92a2a
    style SVC fill:#ff8787,stroke:#c92a2a
    style UTL fill:#ffa7a7,stroke:#d63031
    style AI fill:#ffe0e0,stroke:#e17055
    style STATE fill:#ffcccc,stroke:#ee5a3f
```

### AFTER: Clean Hierarchy

```mermaid
graph TD
    USER["User Input"]

    USER --> CLI["CLI Parser<br/>Minimal Deps"]

    CLI --> ORCH["Orchestrator<br/>Service Registry"]

    ORCH -->|"Route cmd: file-ops"| CMD1["File Command"]
    ORCH -->|"Route cmd: git"| CMD2["Git Command"]
    ORCH -->|"Route cmd: build"| CMD3["Build Command"]

    CMD1 -->|"Inject"| SVC1["File Service"]
    CMD2 -->|"Inject"| SVC2["Git Service"]
    CMD3 -->|"Inject"| SVC3["Build Service"]

    SVC1 -->|"Use"| CORE["Core Layer"]
    SVC2 -->|"Use"| CORE
    SVC3 -->|"Use"| CORE

    CORE -->|"Query"| CACHE["Cache Service"]

    CACHE -->|"Lazy load if needed"| EXT["External<br/>On-Demand"]

    style CLI fill:#69db7c,stroke:#2f9e44
    style ORCH fill:#94d82d,stroke:#5c940d
    style CMD1 fill:#b2f2bb,stroke:#2f9e44
    style CMD2 fill:#b2f2bb,stroke:#2f9e44
    style CMD3 fill:#b2f2bb,stroke:#2f9e44
    style CORE fill:#d4edda,stroke:#28a745
    style EXT fill:#f0f0f0,stroke:#666
```

---

## 4. MODULE STRUCTURE EVOLUTION

```mermaid
graph LR
    subgraph CURRENT["CURRENT STATE"]
        A["index.ts<br/>724 KB"]
    end

    subgraph TARGET["TARGET STATE - MODULES"]
        B1["index.ts<br/>2 KB"]
        B2["commands/<br/>156 KB"]
        B3["services/<br/>280 KB"]
        B4["core/<br/>48 KB"]
        B5["utils/<br/>32 KB"]

        B1 --> B2
        B1 --> B3
        B1 --> B4
        B2 --> B4
        B3 --> B4
        B2 -.-> B5
        B3 -.-> B5
    end

    CURRENT -->|"Extract"| TARGET

    style A fill:#ff6b6b,stroke:#c92a2a,stroke-width:3px
    style B1 fill:#51cf66,stroke:#2f9e44,stroke-width:2px
    style B2 fill:#69db7c,stroke:#2f9e44
    style B3 fill:#69db7c,stroke:#2f9e44
    style B4 fill:#94d82d,stroke:#5c940d,stroke-width:2px
    style B5 fill:#d4edda,stroke:#28a745
```

---

## 5. PERFORMANCE IMPROVEMENTS TIMELINE

```mermaid
graph LR
    P0["Phase 0<br/>Baseline<br/>65s | 760MB"] -->
    P1["Phase 1<br/>Security<br/>65s | 760MB"] -->
    P2["Phase 2<br/>Modularize<br/>35s | 480MB"] -->
    P3["Phase 3<br/>Dependencies<br/>22s | 320MB"] -->
    P4["Phase 4<br/>Lazy Load<br/>5s | 200MB"] -->
    P5["Phase 5<br/>Optimize<br/>5s | 200MB<br/>+50% cache"]

    style P0 fill:#ffd43b,stroke:#f59f00
    style P1 fill:#ff922b,stroke:#e67700
    style P2 fill:#ff8787,stroke:#d63031
    style P3 fill:#ffa7a7,stroke:#e17055
    style P4 fill:#b2f2bb,stroke:#2f9e44
    style P5 fill:#51cf66,stroke:#2f9e44,stroke-width:3px
```

---

## 6. STARTUP TIME BREAKDOWN

### Current (65 seconds)

```mermaid
xychart-beta
    title "Current Startup Time Breakdown"
    x-axis [Module Init, Dep Resolve, CLI Setup, Lazy Ops, Overhead]
    y-axis "Time (seconds)" 0 --> 25
    line [18, 22, 15, 8, 2]

    highlight 1,2 color #ff6b6b
```

### Target (5 seconds)

```mermaid
xychart-beta
    title "Target Startup Time Breakdown"
    x-axis [Core Init, Dep Resolve, CLI Setup, Dispatch, Ready]
    y-axis "Time (seconds)" 0 --> 2
    line [1.5, 1.1, 1.2, 0.8, 0.4]

    highlight 5,6 color #51cf66
```

---

## 7. MEMORY PROFILE TRANSFORMATION

### Current (760 MB)

```mermaid
pie title "Current Memory Distribution"
    "AI SDKs (37%)" : 280
    "Dependencies (29%)" : 220
    "App State (21%)" : 160
    "Node.js (13%)" : 100
```

### Target (200 MB)

```mermaid
pie title "Target Memory Distribution"
    "Core App (23%)" : 45
    "AI SDKs Lazy (43%)" : 85
    "Dependencies (23%)" : 45
    "Node.js (11%)" : 25
```

---

## 8. DEPENDENCY REDUCTION

```mermaid
xychart-beta
    title "Dependency Count Over Time"
    x-axis [Current, Phase 1, Phase 2, Phase 3, Target]
    y-axis "# of Dependencies" 0 --> 100
    line [92, 92, 85, 68, 68]

    highlight 5 color #51cf66
```

---

## 9. DATA FLOW: COMMAND EXECUTION

### Current (Mixed, Monolithic)

```mermaid
sequenceDiagram
    participant User
    participant CLI as CLI Parser
    participant Index as index.ts<br/>Monolith
    participant Services as Services<br/>Mixed Logic
    participant External as External APIs

    User->>CLI: nikcli build
    CLI->>Index: Parse & Load
    Note over Index: Load ALL 92 deps<br/>18s ⏱
    Index->>Services: Find handler
    Services->>Services: Mixed logic
    Services->>External: Multiple APIs
    External-->>Services: Results
    Services-->>CLI: Output
    CLI-->>User: Result

    Note over User,External: Total: 65s+
```

### Target (Modular, Lazy)

```mermaid
sequenceDiagram
    participant User
    participant CLI as CLI Parser
    participant Orch as Orchestrator
    participant Services as Services<br/>On-Demand
    participant Cache as Cache Layer
    participant External as External APIs

    User->>CLI: nikcli build
    CLI->>Orch: Route command
    Note over Orch: Identify: build cmd<br/>Load only needed svcs
    Orch->>Cache: Check cache?
    Cache->>Cache: Cache hit? ⚡
    Cache-->>Services: Return or proceed
    Services->>External: Only if needed
    External-->>Services: Results
    Services->>Cache: Cache result
    Cache-->>Orch: Return data
    Orch-->>CLI: Output
    CLI-->>User: Result

    Note over User,External: Total: 5s ⚡
```

---

## 10. SERVICE INITIALIZATION COMPARISON

### Current (Upfront Loading)

```mermaid
graph LR
    START["Program Start"] -->|"MUST load"| AI["AI SDKs<br/>280 MB"]
    START -->|"MUST load"| GIT["Git Libs"]
    START -->|"MUST load"| PKG["Package Mgr"]
    START -->|"MUST load"| UTILS["Utilities"]
    START -->|"MUST load"| CORE["Core"]

    AI --> |"Even if never used"| WAIT["Wait 65s ⏱"]
    GIT --> WAIT
    PKG --> WAIT
    UTILS --> WAIT
    CORE --> WAIT

    WAIT --> READY["Ready for cmd"]

    style WAIT fill:#ff6b6b,stroke:#c92a2a
```

### Target (On-Demand Loading)

```mermaid
graph LR
    START["Program Start"] -->|"Always"| CORE["Core Layer<br/>50 MB"]

    CORE --> CLI["CLI Parser"]

    CLI --> READY["Ready: 5s ✓"]

    READY -->|"User runs: ai"| AI["AI SDKs<br/>+280 MB<br/>on demand"]
    READY -->|"User runs: git"| GIT["Git Libs<br/>+50 MB<br/>on demand"]
    READY -->|"User runs: pkg"| PKG["Package Mgr<br/>+30 MB<br/>on demand"]

    AI --> EXE["Execute"]
    GIT --> EXE
    PKG --> EXE

    style READY fill:#51cf66,stroke:#2f9e44
    style AI fill:#fcc419,stroke:#f59f00
    style GIT fill:#fcc419,stroke:#f59f00
    style PKG fill:#fcc419,stroke:#f59f00
```

---

## 11. CACHING STRATEGY

```mermaid
graph TD
    REQ["Command Request"] -->|"Check"| MEM["Memory Cache<br/>LRU - 50 MB"]

    MEM -->|"Miss"| FS["FS Cache<br/>Disk - 200 MB"]

    FS -->|"Miss"| EXEC["Execute Service"]

    EXEC -->|"Result"| STORE["Cache Result"]

    STORE -->|"Store in"| MEM
    STORE -->|"Store in"| FS

    MEM -->|"Hit"| RESP["Return Cached<br/>~10ms ⚡"]
    FS -->|"Hit"| RESP
    EXEC -->|"Fresh"| RESP

    RESP --> OUT["Output to User"]

    style MEM fill:#51cf66,stroke:#2f9e44
    style FS fill:#69db7c,stroke:#2f9e44
    style RESP fill:#94d82d,stroke:#5c940d
```

---

## 12. HEALTH SCORE PROGRESSION

```mermaid
xychart-beta
    title "Overall Health Score (0-10)"
    x-axis [Current, P0, P1, P2, P3, P4, P5, Target]
    y-axis "Score" 0 --> 10
    line [5.3, 5.3, 5.5, 6.2, 6.8, 7.5, 8.1, 8.3]

    highlight 8 color #51cf66
```

---

## 13. RISK MATRIX: CURRENT STATE

```mermaid
graph LR
    subgraph RISKS["Risk Areas - Current"]
        R1["Monolithic<br/>High Risk"]
        R2["Circular Deps<br/>High Risk"]
        R3["Poor Testing<br/>High Risk"]
        R4["Security Issues<br/>Medium Risk"]
        R5["Performance<br/>High Risk"]
    end

    R1 -->|"Mitigated by"| M1["Phase 2<br/>Modularization"]
    R2 -->|"Mitigated by"| M2["Phase 2-3<br/>Module extraction"]
    R3 -->|"Mitigated by"| M3["Phase 4<br/>Testing framework"]
    R4 -->|"Mitigated by"| M4["Phase 1<br/>Security hardening"]
    R5 -->|"Mitigated by"| M5["Phase 3-5<br/>Optimization"]

    style R1 fill:#ff6b6b,stroke:#c92a2a
    style R2 fill:#ff6b6b,stroke:#c92a2a
    style R3 fill:#ff6b6b,stroke:#c92a2a
    style R4 fill:#ffa7a7,stroke:#d63031
    style R5 fill:#ff6b6b,stroke:#c92a2a

    style M1 fill:#51cf66,stroke:#2f9e44
    style M2 fill:#51cf66,stroke:#2f9e44
    style M3 fill:#51cf66,stroke:#2f9e44
    style M4 fill:#51cf66,stroke:#2f9e44
    style M5 fill:#51cf66,stroke:#2f9e44
```

---

## 14. TEST COVERAGE ROADMAP

```mermaid
xychart-beta
    title "Test Coverage Growth"
    x-axis [Current, P2, P3, P4, P5, Target]
    y-axis "Coverage %" 0 --> 100
    line [20, 35, 45, 60, 75, 75]

    highlight 6 color #51cf66
```

---

## 15. COMPLETE MIGRATION FLOWCHART

```mermaid
graph TD
    START["Start Migration"] -->
    P0["Phase 0: Baseline & Planning"]

    P0 --> P0_TASKS["Create baselines<br/>Audit security<br/>Map dependencies"]
    P0_TASKS --> P0_GATE{"Baseline<br/>Approved?"}

    P0_GATE -->|"No"| P0_TASKS
    P0_GATE -->|"Yes"| P1["Phase 1: Security"]

    P1 --> P1_TASKS["Fix 3 CVEs<br/>Update deps<br/>Test changes"]
    P1_TASKS --> P1_GATE{"Security<br/>Verified?"}
    P1_GATE -->|"No"| P1_TASKS
    P1_GATE -->|"Yes"| P2["Phase 2: Modularize"]

    P2 --> P2_TASKS["Extract modules<br/>Create commands/<br/>Create services/<br/>Create core/"]
    P2_TASKS --> P2_GATE{"Module Tests<br/>Pass?"}
    P2_GATE -->|"No"| P2_TASKS
    P2_GATE -->|"Yes"| P3["Phase 3: Dependencies"]

    P3 --> P3_TASKS["Prune deps<br/>Remove dupes<br/>Consolidate"]
    P3_TASKS --> P3_GATE{"Deps Valid?"}
    P3_GATE -->|"No"| P3_TASKS
    P3_GATE -->|"Yes"| P4["Phase 4: Lazy Loading"]

    P4 --> P4_TASKS["Implement lazy load<br/>AI SDKs<br/>Git libs<br/>Package mgrs"]
    P4_TASKS --> P4_GATE{"Performance<br/>Verified?"}
    P4_GATE -->|"No"| P4_TASKS
    P4_GATE -->|"Yes"| P5["Phase 5: Optimize"]

    P5 --> P5_TASKS["Add caching<br/>Add streaming<br/>Connection pooling"]
    P5_TASKS --> FINAL_GATE{"All Metrics<br/>Met?"}

    FINAL_GATE -->|"No"| P5_TASKS
    FINAL_GATE -->|"Yes"| SUCCESS["✓ Migration Complete<br/>Health: 5.3 → 8.3<br/>Startup: 65s → 5s<br/>Memory: 760MB → 200MB"]

    style START fill:#ffd43b,stroke:#f59f00
    style P1 fill:#ff922b,stroke:#e67700
    style P2 fill:#ff8787,stroke:#d63031
    style P3 fill:#ffa7a7,stroke:#e17055
    style P4 fill:#b2f2bb,stroke:#2f9e44
    style P5 fill:#69db7c,stroke:#2f9e44
    style SUCCESS fill:#51cf66,stroke:#2f9e44,stroke-width:3px
```

---

## 16. QUICK REFERENCE: METRICS AT A GLANCE

```mermaid
xychart-beta
    title "Key Metrics Comparison: Current vs Target"
    x-axis [Startup, Memory, Deps, CVEs, Tests, Bundle, Score]
    y-axis "Value/Score" 0 --> 100

    line [65, 760, 92, 300, 20, 7200, 5.3]
    line [5, 200, 68, 0, 75, 3500, 8.3]
```

Legend:

- Startup: seconds (÷ 10 for scale)
- Memory: MB (÷ 10 for scale)
- Deps: count
- CVEs: count × 100
- Tests: coverage %
- Bundle: KB × 1
- Score: health score × 10

---

## EXPORTING THESE DIAGRAMS

### For GitHub README:

```markdown
# Architecture Diagrams

## Current State

![Current Architecture](image-url)

## Target State

![Target Architecture](image-url)
```

### For Mermaid.live:

1. Go to https://mermaid.live
2. Copy any diagram above
3. Paste to render live
4. Export as PNG/SVG

### For Documentation Wiki:

- These diagrams work in Confluence, Notion, GitBook, etc.
- Simply paste the mermaid code blocks
- They'll render automatically

---

## INTERPRETATION GUIDE

### Color Coding

🔴 **RED (Current Problems)**

- High risk areas
- Performance bottlenecks
- Security issues

🟠 **ORANGE (Warnings)**

- Medium risk
- Gradual improvement needed

🟢 **GREEN (Target State)**

- Optimized areas
- After migration
- Improved metrics

### Reading the Charts

1. **Timeline Charts**: Show progression left-to-right
2. **Pie Charts**: Show proportion breakdowns
3. **Sequence Diagrams**: Show process flow over time
4. **Network Graphs**: Show relationships and dependencies

---

## NEXT ACTIONS

1. ✅ **Review Diagrams**: Understand each visualization
2. 📊 **Present to Team**: Use in meetings/docs
3. 🎯 **Reference During Development**: Keep handy during Phase 2-5
4. 📈 **Update as You Go**: Track actual vs projected improvements
5. 🔗 **Share with Stakeholders**: Get buy-in on the transformation

These visual references make the migration strategy concrete and understandable! 🎨

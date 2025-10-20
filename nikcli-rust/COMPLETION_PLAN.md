# NikCLI Rust - File Completion Plan

## REGOLA AUREA
NO PLACEHOLDERS, NO STUBS, PRODUCTION-READY ONLY
OGNI FILE DEVE ESSERE IDENTICO AL TYPESCRIPT

## Phase 0: Complete Existing Files FIRST (PRIORITÀ MASSIMA)

### File Principali da Completare

#### 1. src/cli/nik_cli.rs - PRIORITÀ 1
**TypeScript**: nik-cli.ts = 20,519 righe (classe: 20,318 righe)
**Rust attuale**: nik_cli.rs = 3,038 righe
**MANCANO**: ~17,000 righe

**Metodi mancanti (56)**:
- getTokenOptimizer (line 459)
- extractKeywords (line 535)
- initializeCognitiveOrchestration (line 586)
- integrateCognitiveComponents (line 646)
- enhanceAgentServiceWithCognition (line 663)
- integrateValidationWithPlanning (line 683)
- setupToolRouterCoordination (line 704)
- configureAdvancedAIProviderCognition (line 712)
- handleSupervisionUpdate (line 724)
- handleValidationEvent (line 743)
- handleRoutingOptimization (line 758)
- handleAgentSelectionOptimization (line 769)
- initializeStructuredUI (line 780)
- setupUIEventListeners (line 810)
- setupAgentUIIntegration (line 823)
- subscribeToAllEventSources (line 1003)
- routeEventToUI (line 1107)
- isStructuredUIActive (line 1123)
- routeToAdvancedUI (line 1130)
- routeToConsole (line 1233)
- setupAdvancedUIFeatures (line 1291)
- initializeStructuredPanels (line 1393)
- setupFileWatching (line 1397)
- setupProgressTracking (line 1478)
- getVMOrchestrator (line 3939)
- convertToolToVMCommand (line 4010)
- showGCodeHelp (line 8671)
- showGCodeExamples (line 8700)
- _stripAnsi (line 11803)
- initializeChatUI (line 11812)
- renderChatUI (line 11848)
- createResponsiveStatusLayout (line 12041)
- startAIOperation (line 13142)
- stopAIOperation (line 13186)
- trackTool (line 13370)
- generateClaudeMarkdown (line 13390)
- parseCommitHistoryArgs (line 14160)
- buildGitLogCommand (line 14209)
- formatCommitHistory (line 14247)
- executeInBackground (line 16638)
- showAgentsPanel (line 16665)
- showFactoryPanel (line 16689)
- showBlueprintsPanel (line 16715)
- formatBytes (line 18673)
- formatTaskMasterPlanAsTodo (line 19769)
- calculateExecutionTime (line 20079)
- simulateSpecializedWork (line 20102)
- checkForCollaborationOpportunities (line 20153)
- streamAgentSteps (line 20200)
- mergeAgentResults (line 20216)
- showBackgroundJobPanel (line 20336)
- handleSlashMenuNavigation (line 20411)
- selectSlashCommand (line 20451)
- closeSlashMenu (line 20467)
- activateSlashMenu (line 20479)
- updateSlashMenu (line 20491)

**Azione**: Implementare TUTTI i 56 metodi mancanti con logica IDENTICA al TypeScript

#### 2. src/main.rs vs src/cli/index.ts
**TypeScript**: index.ts = 2,026 righe
**Rust**: main.rs = 364 righe
**MANCANO**: ~1,662 righe

**Azione**: Espandere main.rs per includere:
- BannerAnimator class completa
- OnboardingModule completo
- SystemModule completo
- ServiceModule completo
- IntroductionModule completo
- MainOrchestrator completo

#### 3. Altri file da completare
- streaming_module.rs vs streaming-orchestrator.ts
- slash_command_handler.rs vs nik-cli-commands.ts (già completato ✓)
- register_agents.rs vs register-agents.ts

### Strategia di Completamento

1. **Leggere sezione TypeScript (100-200 righe)**
2. **Identificare esattamente cosa fa**
3. **Portare in Rust con logica IDENTICA**
4. **Verificare import e dipendenze**
5. **Passare alla sezione successiva**

### Metodologia per nik_cli.rs

Siccome mancano ~17,000 righe, devo aggiungere sistematicamente:

**Blocco 1** (righe 459-1500 TS): Initialization & Cognitive Systems
- Tutti i metodi di inizializzazione
- Sistema cognitivo
- UI event system
- Validation integration

**Blocco 2** (righe 1500-5000 TS): Chat & Processing
- Chat handling completo
- Message processing
- Stream management
- Tool execution

**Blocco 3** (righe 5000-10000 TS): Commands & Features
- Tutti i comandi slash
- VM operations
- Agent operations
- File operations

**Blocco 4** (righe 10000-15000 TS): UI & Display
- UI rendering
- Status bars
- Progress tracking
- Panel management

**Blocco 5** (righe 15000-20000 TS): Advanced Features
- CAD/GCode
- Background jobs
- Git integration
- Collaboration
- Slash menu

**Blocco 6** (righe 20000-20519 TS): Utilities & Helpers
- Helper functions
- Formatting
- Validation
- Cleanup

### Ordine di Esecuzione

1. ✅ Completare nik_cli.rs (tutti i 56 metodi + sezioni mancanti)
2. ✅ Completare main.rs (BannerAnimator, Onboarding, ecc.)
3. ✅ Verificare slash_command_handler.rs completo
4. ✅ Completare streaming_module.rs
5. ✅ Completare register_agents.rs
6. ✅ Solo DOPO: creare i 210 file mancanti
7. ✅ Solo DOPO: compilare

## Stima del Lavoro

- **nik_cli.rs**: ~17,000 righe da aggiungere = ~200-250 metodi
- **main.rs**: ~1,600 righe da aggiungere = ~20-30 classi/funzioni
- **Altri file**: ~2,000 righe da aggiungere

**TOTALE PRIMA DI CREARE NUOVI FILE**: ~20,000 righe da aggiungere ai file esistenti

Questo è un lavoro di giorni, ma procederò sistematicamente.


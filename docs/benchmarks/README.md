# NikCLI Benchmark System

Sistema completo di benchmarking per testare e confrontare modelli AI con vari benchmark standard.

## Caratteristiche

### 📊 Template di Benchmark

- **SWE-bench**: Software engineering tasks basati su issue reali di GitHub
- **HumanEval**: 164 problemi di generazione codice Python
- **MBPP**: 974 problemi di programmazione Python
- **Custom**: Template personalizzabili da JSON/YAML

### 📈 Metriche Traciate

- **Latenza**: min, max, avg, p50, p95, p99
- **Token Usage**: input, output, totali
- **Costi**: per task e totali
- **Success Rate**: percentuale di successo
- **Accuracy**: precisione delle risposte
- **Risorse**: utilizzo CPU e memoria
- **Error Rate**: frequenza e tipologia errori

### 🎨 Visualizzazioni

- **Terminal Live**: Dashboard real-time con blessed-contrib
- **HTML Reports**: Report interattivi con Chart.js
- **PNG Exports**: Grafici statici ad alta risoluzione
- **CSV/JSON/Markdown**: Export dati in vari formati

## Comandi

```bash
# Avviare un benchmark
/bench start <template> [--model=<name>] [--iterations=<n>]

# Esempi:
/bench start swe-bench --model=claude-3-5-sonnet --iterations=20
/bench start humaneval --model=gpt-4-turbo --iterations=50
/bench start custom --dataset=my-tasks.json

# Controllare lo stato
/bench status          # Mostra stato corrente
/bench pause           # Mette in pausa
/bench resume          # Riprende l'esecuzione
/bench stop            # Ferma e genera report

# Visualizzare risultati
/bench list            # Lista template disponibili
/bench results         # Lista tutte le sessioni
/bench results --session=<id>  # Dettagli sessione specifica

# Confrontare sessioni
/bench compare <session1> <session2>

# Esportare risultati
/bench export --session=<id> --format=<json|csv|html|png|all>
```

## Struttura Dati

```
benchmarks/
├── results/
│   ├── sessions/
│   │   └── 2025-10-03_140523_swe-bench_claude_abc123/
│   │       ├── session.json       # Metadati sessione
│   │       ├── metrics.json       # Metriche time-series
│   │       ├── tasks.json         # Risultati task
│   │       ├── report.html        # Report HTML
│   │       ├── report.md          # Report Markdown
│   │       └── charts/            # Grafici PNG
│   │           ├── latency.png
│   │           ├── success-rate.png
│   │           ├── tokens.png
│   │           ├── resources.png
│   │           └── accuracy.png
│   ├── index.json                 # Indice sessioni
│   └── templates/                 # Template custom
└── datasets/
    ├── swe-bench-lite.json
    ├── humaneval.json
    └── mbpp.json
```

## Creazione Template Custom

Crea un file JSON o YAML con le tue task:

```json
[
  {
    "id": "custom-1",
    "description": "Task description",
    "prompt": "Your detailed prompt here",
    "expectedOutput": "Expected answer",
    "expectedKeywords": ["keyword1", "keyword2"],
    "evaluationCriteria": {
      "minLength": 100,
      "maxLength": 1000,
      "requiredPatterns": ["pattern1", "pattern2"],
      "forbiddenPatterns": ["bad_pattern"]
    }
  }
]
```

Poi lancia:

```bash
/bench start custom --dataset=path/to/your/tasks.json
```

## Integrazione nel Codice

Il sistema usa `advancedUI` per tutti i messaggi, assicurando che il prompt CLI sia sempre ripristinato correttamente anche in caso di errori.

Tutti i comandi includono:

- Try-catch appropriati
- Cleanup delle risorse
- Re-throw degli errori per gestione CLI
- Messaggi formattati con advancedUI

## Architettura

- **BenchmarkEngine**: Orchestratore principale
- **MetricsTracker**: Raccolta e aggregazione metriche
- **ResultsManager**: Storage locale JSON (no database)
- **Templates**: Base class + implementazioni specifiche
- **Visualizers**: Terminal, HTML, PNG generators

## Performance

- Real-time metrics durante l'esecuzione
- Salvataggio progressivo ogni 10 task
- Support per pause/resume
- Cleanup automatico delle risorse
- Gestione errori robusta

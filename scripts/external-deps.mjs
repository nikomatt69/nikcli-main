/**
 * Lista centralizzata delle dipendenze da esternalizzare durante il build
 * Queste dipendenze causano problemi con bun build --compile e devono essere
 * caricate a runtime da node_modules
 *
 * IMPORTANTE: Con --packages=external, TUTTE le dipendenze vengono esternalizzate.
 * Questa lista è per eventuale controllo granulare futuro.
 */

export const EXTERNAL_DEPS = [
  // Lista vuota - usiamo --packages=external che esternalizza tutto
]

/**
 * Genera gli argomenti --external per bun build
 */
export function getExternalArgs() {
  return EXTERNAL_DEPS.flatMap(dep => ['--external', dep])
}

/**
 * Ottieni la lista come stringa per package.json
 */
export function getExternalArgsString() {
  return EXTERNAL_DEPS.map(dep => `--external ${dep}`).join(' ')
}

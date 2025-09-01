#!/usr/bin/env node

/**
 * Test Runner per Terminal UI Kit
 * Esegue l'app di test con Ink per verificare tutti i componenti
 */

import React from 'react';
import { render } from 'ink';
import TestApp from './TestApp';

console.log('🚀 Starting Terminal UI Kit Test Runner...\n');

const app = render(<TestApp />);

// Gestisce Ctrl+C per uscita pulita
process.on('SIGINT', () => {
  app.unmount();
  console.log('\n👋 Terminal UI Kit test completed');
  process.exit(0);
});

// Gestisce errori non catturati
process.on('uncaughtException', (error) => {
  app.unmount();
  console.error('\n❌ Test error:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  app.unmount();
  console.error('\n❌ Test rejection:', reason);
  process.exit(1);
});

console.log('✅ Terminal UI Kit test started');
console.log('📝 Press Ctrl+C to exit\n');
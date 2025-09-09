/**
 * Test di compatibilità per TUI Bridge
 * 
 * Questo modulo testa la migrazione graduale da boxen a TUI components
 * verificando che l'API rimanga compatibile al 100%
 */

import { boxen, tuiBoxenVariants, getTuiBridgeStats, isTuiBridgeActive } from './tui-bridge';
import { FeatureFlagManager } from '../core/feature-flags';

/**
 * Esegue tutti i test di compatibilità
 */
export async function runTuiBridgeTests(): Promise<boolean> {
  console.log('🧪 Starting TUI Bridge compatibility tests...\n');
  
  let allTestsPassed = true;
  
  try {
    // Test 1: Basic boxen compatibility
    console.log('1. Testing basic boxen compatibility...');
    const basicTest = testBasicCompatibility();
    console.log(basicTest ? '✅ PASSED' : '❌ FAILED');
    allTestsPassed = allTestsPassed && basicTest;
    
    // Test 2: Advanced boxen options
    console.log('2. Testing advanced boxen options...');
    const advancedTest = testAdvancedOptions();
    console.log(advancedTest ? '✅ PASSED' : '❌ FAILED');
    allTestsPassed = allTestsPassed && advancedTest;
    
    // Test 3: Feature flag integration
    console.log('3. Testing feature flag integration...');
    const featureFlagTest = await testFeatureFlagIntegration();
    console.log(featureFlagTest ? '✅ PASSED' : '❌ FAILED');
    allTestsPassed = allTestsPassed && featureFlagTest;
    
    // Test 4: TUI component validation
    console.log('4. Testing TUI component validation...');
    const validationTest = testTuiValidation();
    console.log(validationTest ? '✅ PASSED' : '❌ FAILED');
    allTestsPassed = allTestsPassed && validationTest;
    
    // Test 5: Fallback mechanism
    console.log('5. Testing fallback mechanism...');
    const fallbackTest = await testFallbackMechanism();
    console.log(fallbackTest ? '✅ PASSED' : '❌ FAILED');
    allTestsPassed = allTestsPassed && fallbackTest;
    
    // Test 6: Performance comparison
    console.log('6. Testing performance...');
    const performanceTest = await testPerformance();
    console.log(performanceTest ? '✅ PASSED' : '❌ FAILED');
    allTestsPassed = allTestsPassed && performanceTest;
    
    console.log(`\n🎯 Overall result: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    // Display bridge statistics
    displayBridgeStats();
    
    return allTestsPassed;

  } catch (error) {
    console.error('🚨 Test suite failed with error:', error);
    return false;
  }
}

/**
 * Test 1: Basic boxen compatibility
 */
function testBasicCompatibility(): boolean {
  try {
    // Test simple content
    const simple = boxen('Hello World');
    if (typeof simple !== 'string') return false;
    
    // Test with basic options
    const withOptions = boxen('Test Message', {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'blue'
    });
    if (typeof withOptions !== 'string') return false;
    
    // Test empty content
    const empty = boxen('');
    if (typeof empty !== 'string') return false;
    
    return true;
  } catch (error) {
    console.error('Basic compatibility test failed:', error);
    return false;
  }
}

/**
 * Test 2: Advanced boxen options
 */
function testAdvancedOptions(): boolean {
  try {
    // Test all border styles
    const borderStyles = ['single', 'double', 'round', 'bold', 'none'];
    for (const style of borderStyles) {
      const result = boxen('Border test', { borderStyle: style as any });
      if (typeof result !== 'string') return false;
    }
    
    // Test all border colors
    const borderColors = ['red', 'green', 'yellow', 'blue', 'cyan', 'magenta'];
    for (const color of borderColors) {
      const result = boxen('Color test', { borderColor: color });
      if (typeof result !== 'string') return false;
    }
    
    // Test complex padding
    const paddingTest = boxen('Padding test', {
      padding: {
        top: 1,
        right: 2,
        bottom: 1,
        left: 2
      }
    });
    if (typeof paddingTest !== 'string') return false;
    
    // Test with title
    const titleTest = boxen('Content with title', {
      title: 'My Title',
      titleAlignment: 'center'
    });
    if (typeof titleTest !== 'string') return false;
    
    return true;
  } catch (error) {
    console.error('Advanced options test failed:', error);
    return false;
  }
}

/**
 * Test 3: Feature flag integration
 */
async function testFeatureFlagIntegration(): Promise<boolean> {
  try {
    const featureFlags = FeatureFlagManager.getInstance();
    
    // Test bridge status detection
    const bridgeActive = isTuiBridgeActive();
    const flagEnabled = featureFlags.isEnabled('tui-components');
    
    if (bridgeActive !== flagEnabled) {
      console.error('Bridge status mismatch with feature flags');
      return false;
    }
    
    // Test bridge stats
    const stats = getTuiBridgeStats();
    if (!stats || typeof stats.tuiEnabled !== 'boolean') {
      console.error('Invalid bridge stats');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Feature flag integration test failed:', error);
    return false;
  }
}

/**
 * Test 4: TUI component validation
 */
function testTuiValidation(): boolean {
  try {
    // Test that invalid props don't crash the system
    const invalidTest = boxen('Test content', {
      // @ts-ignore - intentionally invalid for testing
      invalidProp: 'should be ignored'
    } as any);
    
    if (typeof invalidTest !== 'string') return false;
    
    // Test edge cases
    const edgeCases = [
      boxen('Multi\nLine\nContent'),
      boxen('🚀 Unicode content with emojis 🎉'),
      boxen('Very long content '.repeat(20)),
      boxen('Content with \x1b[31mANSI\x1b[0m codes')
    ];
    
    for (const result of edgeCases) {
      if (typeof result !== 'string') return false;
    }
    
    return true;
  } catch (error) {
    console.error('TUI validation test failed:', error);
    return false;
  }
}

/**
 * Test 5: Fallback mechanism
 */
async function testFallbackMechanism(): Promise<boolean> {
  try {
    const featureFlags = FeatureFlagManager.getInstance();
    const originalState = featureFlags.isEnabled('tui-components');
    
    // Disable TUI components temporarily
    if (originalState) {
      await featureFlags.setFlag('tui-components', false);
    }
    
    // Test that fallback works
    const fallbackResult = boxen('Fallback test');
    if (typeof fallbackResult !== 'string') {
      // Restore original state
      if (originalState) {
        await featureFlags.setFlag('tui-components', true);
      }
      return false;
    }
    
    // Restore original state
    if (originalState) {
      await featureFlags.setFlag('tui-components', true);
    }
    
    return true;
  } catch (error) {
    console.error('Fallback mechanism test failed:', error);
    return false;
  }
}

/**
 * Test 6: Performance comparison
 */
async function testPerformance(): Promise<boolean> {
  try {
    const iterations = 100;
    const testContent = 'Performance test content with moderate length';
    const testOptions = {
      padding: 1,
      borderStyle: 'round' as const,
      borderColor: 'blue'
    };
    
    // Measure TUI performance
    const startTui = performance.now();
    for (let i = 0; i < iterations; i++) {
      boxen(testContent, testOptions);
    }
    const tuiTime = performance.now() - startTui;
    
    // Measure fallback performance
    const featureFlags = FeatureFlagManager.getInstance();
    const originalState = featureFlags.isEnabled('tui-components');
    
    if (originalState) {
      await featureFlags.setFlag('tui-components', false);
    }
    
    const startFallback = performance.now();
    for (let i = 0; i < iterations; i++) {
      boxen(testContent, testOptions);
    }
    const fallbackTime = performance.now() - startFallback;
    
    // Restore original state
    if (originalState) {
      await featureFlags.setFlag('tui-components', true);
    }
    
    console.log(`   TUI time: ${tuiTime.toFixed(2)}ms`);
    console.log(`   Fallback time: ${fallbackTime.toFixed(2)}ms`);
    
    // Performance should be reasonable (less than 10x slower)
    const performanceRatio = tuiTime / fallbackTime;
    console.log(`   Performance ratio: ${performanceRatio.toFixed(2)}x`);
    
    return performanceRatio < 10; // Accept up to 10x slower for TUI features
  } catch (error) {
    console.error('Performance test failed:', error);
    return false;
  }
}

/**
 * Test tuiBoxenVariants
 */
export function testTuiBoxenVariants(): boolean {
  try {
    const testContent = 'Variant test';
    
    // Test all variants
    const variants = {
      success: tuiBoxenVariants.success(testContent),
      error: tuiBoxenVariants.error(testContent),
      warning: tuiBoxenVariants.warning(testContent),
      info: tuiBoxenVariants.info(testContent),
      banner: tuiBoxenVariants.banner(testContent),
      status: tuiBoxenVariants.status(testContent)
    };
    
    // Check all variants return strings
    for (const [variant, result] of Object.entries(variants)) {
      if (typeof result !== 'string') {
        console.error(`Variant ${variant} test failed`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('TUI boxen variants test failed:', error);
    return false;
  }
}

/**
 * Display bridge statistics
 */
function displayBridgeStats(): void {
  const stats = getTuiBridgeStats();
  
  console.log('📊 TUI Bridge Statistics:');
  console.log(`   TUI Components: ${stats.tuiEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   Available Components: ${stats.componentsAvailable}`);
  console.log(`   Fallback Active: ${stats.fallbackActive ? '✅ Yes' : '❌ No'}`);
  console.log(`   Bridge Version: ${stats.bridgeVersion}`);
  
  if (stats.tuiEnabled) {
    console.log('   \n🎛️ TUI Feature Status:');
    console.log(`   Enhanced Prompt: ${stats.enhancedPrompt ? '✅' : '❌'}`);
    console.log(`   Interactive Dashboard: ${stats.interactiveDashboard ? '✅' : '❌'}`);
    console.log(`   Real-time Updates: ${stats.realTimeUpdates ? '✅' : '❌'}`);
    console.log(`   File Operations: ${stats.fileOperations ? '✅' : '❌'}`);
    console.log(`   Diff Viewer: ${stats.diffViewer ? '✅' : '❌'}`);
    console.log(`   Debug Mode: ${stats.debugMode ? '✅' : '❌'}`);
    console.log(`   Performance Monitoring: ${stats.performanceMonitoring ? '✅' : '❌'}`);
  }
}

/**
 * Migration helper: Compare boxen vs TUI output
 */
export function compareBoxenVsTui(content: string, options: any = {}): void {
  console.log('🔄 Comparing boxen vs TUI output:\n');
  
  // Get original boxen output
  const originalBoxen = require('boxen').default;
  const originalOutput = originalBoxen(content, options);
  
  // Get TUI output
  const tuiOutput = boxen(content, options);
  
  console.log('📦 Original boxen:');
  console.log(originalOutput);
  console.log('\n🎨 TUI version:');
  console.log(tuiOutput);
  
  console.log(`\n📏 Length comparison: original=${originalOutput.length}, tui=${tuiOutput.length}`);
}

/**
 * Compatibility check for specific NikCLI usage patterns
 */
export async function checkNikCLICompatibility(): Promise<boolean> {
  console.log('🔍 Testing NikCLI-specific usage patterns...\n');
  
  try {
    // Test banner pattern (from index.ts)
    const bannerTest = boxen(
      '🚀 Starting NikCLI...\n\nInitializing autonomous AI assistant\n• Loading project context\n• Preparing planning system\n• Setting up tool integrations',
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'green'
      }
    );
    
    // Test warning pattern
    const warningTest = boxen(
      '⚠️ API Key Required\n\nTo use NikCLI, please set at least one API key',
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'yellow'
      }
    );
    
    // Test status pattern
    const statusTest = boxen(
      'System Status:\n✅ All systems operational\n🤖 2 agents active',
      {
        borderStyle: 'round',
        borderColor: 'green',
        padding: 1
      }
    );
    
    // Verify all return strings
    const results = [bannerTest, warningTest, statusTest];
    for (const result of results) {
      if (typeof result !== 'string') {
        return false;
      }
    }
    
    console.log('✅ All NikCLI patterns compatible');
    return true;
    
  } catch (error) {
    console.error('❌ NikCLI compatibility test failed:', error);
    return false;
  }
}

// Auto-run tests if this module is executed directly
if (require.main === module) {
  runTuiBridgeTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
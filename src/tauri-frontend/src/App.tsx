import { useState, useCallback } from 'react';
import { Terminal } from './components/Terminal';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(() => {
    setIsConnected(true);
    setError(null);
  }, []);

  const handleExit = useCallback(() => {
    setIsConnected(false);
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
  }, []);

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      <div className="terminal-container">
        <Terminal
          onConnect={handleConnect}
          onExit={handleExit}
          onError={handleError}
        />
      </div>
      {!isConnected && !error && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <span>Connecting to NikCLI...</span>
        </div>
      )}
    </div>
  );
}

export default App;

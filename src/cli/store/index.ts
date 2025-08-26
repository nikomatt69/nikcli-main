import { create } from 'zustand';

interface StoreState {
  analysisHistory: { code: string; analysis: string; timestamp: string }[];
  addAnalysis: (code: string, analysis: string) => void;
  clearHistory: () => void;
}

export const useStore = create<StoreState>((set) => ({
  analysisHistory: [],
  addAnalysis: (code, analysis) =>
    set((state) => ({
      analysisHistory: [
        ...state.analysisHistory,
        { code, analysis, timestamp: new Date().toISOString() },
      ],
    })),
  clearHistory: () => set({ analysisHistory: [] }),
}));

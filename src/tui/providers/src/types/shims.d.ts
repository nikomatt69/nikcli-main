// Lightweight shims for the providers package to satisfy TypeScript during local builds

// Provide a stub for the @tui-kit-ai/ai package used only for compile-time checks
declare module '@tui-kit-ai/ai' {
  // Minimal ProviderClient shape expected by providers; keep as loose types
  export type ProviderMessage = any;
  export type ProviderStream = AsyncIterable<string> | any;
  export interface ProviderClient {
    name?: string;
    complete?(opts: {
      model?: string;
      messages?: ProviderMessage[];
      stream?: boolean;
      abortSignal?: AbortSignal;
    }): Promise<ProviderStream | { text: string }>;
    stream?(
      messages: ProviderMessage[],
      abortSignal?: AbortSignal,
    ): Promise<ProviderStream>;
  }

  // Export a loose default for any runtime imports
  const _default: any;
  export default _default;
}

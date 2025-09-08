// Enhanced ambient shims to satisfy TypeScript for TUI package during local builds

// Blessed: provide a loose namespace and module mapping
declare namespace blessed {
  namespace Widgets {
    type Node = any;
    type BoxOptions = any;
    type BoxElement = any;
    type TextboxElement = any;
    type ListElement = any;
    type ProgressBarElement = any;
    type TextareaElement = any;
    type Element = any;
  }
  function box(...args: any[]): Widgets.BoxElement;
  function textbox(...args: any[]): Widgets.TextboxElement;
  function textarea(...args: any[]): Widgets.TextareaElement;
  function list(...args: any[]): Widgets.ListElement;
  function progressbar(...args: any[]): Widgets.ProgressBarElement;
  const screen: any;
}
declare module 'blessed' {
  export = blessed;
}

// Core library shim with named exports used across TUI
declare module '@tui-kit-ai/core' {
  export type BaseProps = any & { [key: string]: any };
  export const resolveBlessedColor: (...args: any[]) => any;
  export const BasePropsSchema: any;
  export const ComponentVariantSchema: any;
  export const ComponentSizeSchema: any;
  export const safeRender: (screen: any) => void;
  export const KEY: any;
  const _default: any;
  export default _default;
}

// 'ai' package shim - provide Message type and default export
declare module 'ai' {
  export type Message = {
    role: string;
    content: string;
    id?: string;
    createdAt?: string | number;
    [key: string]: any;
  };
  const _default: any;
  export default _default;
}

// zod shim - provide both a value export and a merging namespace so
// expressions like `import { z } from 'zod'` and type-level refs like `z.infer<T>` both work.
declare module 'zod' {
  // Value exported from the module
  const z: any;

  // Namespace merged with the value to provide type helpers used by consumer code
  namespace z {
    // Common zod type helpers (loose any types to satisfy the build)
    type infer<T> = any;
    type input<T> = any;
    type output<T> = any;
  }

  // Named export and default export
  export { z };
  export default z;
}

// events shim
declare module 'events' {
  export class EventEmitter {
    on(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
  }
  const _default: any;
  export default _default;
}

// Provide common global/DOM shims used in TUI code
declare var fetch: any;
declare var AbortController: any;
declare var TextDecoder: any;
declare var Response: any;
declare var URL: any;

declare const console: any;
declare function setTimeout(
  handler: any,
  timeout?: number,
  ...args: any[]
): any;
declare function clearTimeout(id: any): void;
declare function setInterval(
  handler: any,
  timeout?: number,
  ...args: any[]
): any;
declare function clearInterval(id: any): void;

// NodeJS Timeout shim
declare namespace NodeJS {
  interface Timeout {}
}

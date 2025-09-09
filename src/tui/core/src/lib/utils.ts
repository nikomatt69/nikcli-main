import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Resolve blessed color from design token
 */
export function resolveBlessedColor(token: string, tokens: any): string {
  const parts = token.split('.');
  let value = tokens;
  
  for (const part of parts) {
    value = value?.[part];
  }
  
  return typeof value === 'string' ? value : token;
}

/**
 * Merge variant props for blessed components
 */
export function resolveVariants(props: any, config: any): any {
  const { variant, size, tone, ...rest } = props;
  
  if (!config.variants) return props;
  
  const componentVariants = config.variants[props.component] || {};
  
  const variantStyles = {
    ...componentVariants.variant?.[variant],
    ...componentVariants.size?.[size], 
    ...componentVariants.tone?.[tone]
  };
  
  return { ...rest, ...variantStyles };
}
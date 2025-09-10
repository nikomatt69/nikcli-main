import * as React from "react";
import { clsx } from "clsx";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: "default" | "glass" | "outline";
  size?: "sm" | "default" | "lg";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", size = "default", ...props }, ref) => {
    const variants = {
      default: "border border-input bg-background/50 backdrop-blur-sm",
      glass: "border border-white/20 dark:border-gray-800/20 bg-white/10 dark:bg-gray-900/10 backdrop-blur-xl",
      outline: "border-2 border-border/50 bg-transparent hover:border-border focus:border-primary"
    };

    const sizes = {
      sm: "h-9 px-3 py-2 text-sm rounded-lg",
      default: "h-11 px-4 py-3 text-sm rounded-xl",
      lg: "h-13 px-6 py-4 text-base rounded-2xl"
    };

    return (
      <input
        type={type}
        className={clsx(
          "flex w-full font-medium ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

// Enhanced Input variants
const InputGlass = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        variant="glass"
        className={clsx("shadow-lg", className)}
        {...props}
      />
    );
  }
);
InputGlass.displayName = "InputGlass";

const InputSearch = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        variant="outline"
        className={clsx("pl-10", className)}
        {...props}
      />
    );
  }
);
InputSearch.displayName = "InputSearch";

export { Input, InputGlass, InputSearch };
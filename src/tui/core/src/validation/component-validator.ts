import { z } from "zod";
import { ComponentSchemas } from "../types/component-schemas";

// Component validation result type
export type ValidationResult = {
  success: boolean;
  errors: z.ZodError | null;
  warnings: string[];
  data: any;
};

// Component validator class
export class ComponentValidator {
  private static instance: ComponentValidator;
  private schemas = ComponentSchemas;

  private constructor() {}

  // Singleton pattern
  public static getInstance(): ComponentValidator {
    if (!ComponentValidator.instance) {
      ComponentValidator.instance = new ComponentValidator();
    }
    return ComponentValidator.instance;
  }

  // Validate component props using the appropriate schema
  public validateComponent<T extends keyof typeof ComponentSchemas>(
    componentName: T,
    props: any
  ): ValidationResult {
    try {
      const schema = this.schemas[componentName];
      if (!schema) {
        return {
          success: false,
          errors: null,
          warnings: [`Unknown component: ${componentName}`],
          data: props,
        };
      }

      // Validate props
      const validatedData = schema.parse(props);

      return {
        success: true,
        errors: null,
        warnings: [],
        data: validatedData,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          errors: error,
          warnings: [],
          data: props,
        };
      }

      return {
        success: false,
        errors: null,
        warnings: [`Validation error: ${error}`],
        data: props,
      };
    }
  }

  // Validate component props with warnings for unknown properties
  public validateComponentStrict<T extends keyof typeof ComponentSchemas>(
    componentName: T,
    props: any
  ): ValidationResult {
    const result = this.validateComponent(componentName, props);

    if (result.success) {
      const warnings = this.checkUnknownProperties(componentName, props);
      return {
        ...result,
        warnings: [...result.warnings, ...warnings],
      };
    }

    return result;
  }

  // Check for unknown properties that might indicate typos or deprecated props
  private checkUnknownProperties(
    componentName: keyof typeof ComponentSchemas,
    props: any
  ): string[] {
    const warnings: string[] = [];
    const schema = this.schemas[componentName];

    if (!schema) return warnings;

    // Get all valid property names from the schema
    const validProps = this.getSchemaProperties(schema);

    // Check for unknown properties
    Object.keys(props).forEach((prop) => {
      if (!validProps.includes(prop)) {
        warnings.push(
          `Unknown property '${prop}' for component '${componentName}'`
        );
      }
    });

    return warnings;
  }

  // Extract property names from a Zod schema
  private getSchemaProperties(schema: z.ZodSchema): string[] {
    try {
      const shape = (schema as any)._def?.shape;
      if (shape) {
        return Object.keys(shape);
      }
      return [];
    } catch {
      return [];
    }
  }

  // Validate multiple components at once
  public validateComponents(
    components: Array<{ name: string; props: any }>
  ): ValidationResult[] {
    return components.map((component) =>
      this.validateComponent(
        component.name as keyof typeof ComponentSchemas,
        component.props
      )
    );
  }

  // Get validation schema for a specific component
  public getSchema<T extends keyof typeof ComponentSchemas>(
    componentName: T
  ): z.ZodSchema {
    return this.schemas[componentName];
  }

  // Check if a component has a specific property
  public hasProperty<T extends keyof typeof ComponentSchemas>(
    componentName: T,
    propertyName: string
  ): boolean {
    const schema = this.schemas[componentName];
    if (!schema) return false;

    const properties = this.getSchemaProperties(schema);
    return properties.includes(propertyName);
  }

  // Get all available component names
  public getAvailableComponents(): string[] {
    return Object.keys(this.schemas);
  }

  // Validate component props and provide suggestions for common mistakes
  public validateWithSuggestions<T extends keyof typeof ComponentSchemas>(
    componentName: T,
    props: any
  ): ValidationResult & { suggestions: string[] } {
    const result = this.validateComponent(componentName, props);
    const suggestions: string[] = [];

    if (!result.success && result.errors) {
      // Provide helpful suggestions based on validation errors
      result.errors.issues.forEach((issue) => {
        switch (issue.code) {
          case "invalid_type":
            if (issue.received === "undefined") {
              suggestions.push(
                `Property '${issue.path.join(".")}' is required`
              );
            } else {
              suggestions.push(
                `Property '${issue.path.join(".")}' should be of type ${
                  issue.expected
                }`
              );
            }
            break;
          case "invalid_string":
            if (issue.validation === "regex") {
              suggestions.push(
                `Property '${issue.path.join(".")}' has invalid format`
              );
            }
            break;
          case "too_small":
            suggestions.push(
              `Property '${issue.path.join(".")}' is too small (minimum: ${
                issue.minimum
              })`
            );
            break;
          case "too_big":
            suggestions.push(
              `Property '${issue.path.join(".")}' is too big (maximum: ${
                issue.maximum
              })`
            );
            break;
          case "invalid_enum_value":
            suggestions.push(
              `Property '${issue.path.join(
                "."
              )}' must be one of: ${issue.options.join(", ")}`
            );
            break;
        }
      });
    }

    return {
      ...result,
      suggestions,
    };
  }
}

// Export singleton instance
export const componentValidator = ComponentValidator.getInstance();

// Export convenience functions
export const validateComponent = <T extends keyof typeof ComponentSchemas>(
  componentName: T,
  props: any
) => componentValidator.validateComponent(componentName, props);

export const validateComponentStrict = <
  T extends keyof typeof ComponentSchemas
>(
  componentName: T,
  props: any
) => componentValidator.validateComponentStrict(componentName, props);

export const validateWithSuggestions = <
  T extends keyof typeof ComponentSchemas
>(
  componentName: T,
  props: any
) => componentValidator.validateWithSuggestions(componentName, props);

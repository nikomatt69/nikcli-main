import chalk from 'chalk';
import { 
  BaseMiddleware, 
  MiddlewareRequest, 
  MiddlewareResponse, 
  MiddlewareNext,
  MiddlewareExecutionContext,
  MiddlewareConfig
} from './types';
import { logger } from '../utils/logger';

interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any, request: MiddlewareRequest) => boolean | string;
  message?: string;
}

interface ValidationMiddlewareConfig extends MiddlewareConfig {
  strictMode: boolean;
  validateArgs: boolean;
  validateContext: boolean;
  validateResponse: boolean;
  failOnValidationError: boolean;
  logValidationErrors: boolean;
  customValidators: Record<string, ValidationRule[]>;
}

interface ValidationError {
  field: string;
  value: any;
  rule: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class ValidationMiddleware extends BaseMiddleware {
  private validationConfig: ValidationMiddlewareConfig;
  private operationValidators: Map<string, ValidationRule[]> = new Map();

  constructor(config: Partial<ValidationMiddlewareConfig> = {}) {
    const defaultConfig: ValidationMiddlewareConfig = {
      enabled: true,
      priority: 800,
      strictMode: false,
      validateArgs: true,
      validateContext: true,
      validateResponse: false,
      failOnValidationError: true,
      logValidationErrors: true,
      customValidators: {},
      ...config
    };

    super('validation', 'Request and response validation', defaultConfig);
    
    this.validationConfig = defaultConfig;
    this.setupDefaultValidators();
    this.setupCustomValidators();
  }

  async execute(
    request: MiddlewareRequest,
    next: MiddlewareNext,
    context: MiddlewareExecutionContext
  ): Promise<MiddlewareResponse> {
    const requestValidation = await this.validateRequest(request);
    
    if (!requestValidation.valid) {
      return this.handleValidationFailure(
        'Request validation failed',
        requestValidation,
        request
      );
    }

    if (requestValidation.warnings.length > 0) {
      this.logValidationWarnings('Request', requestValidation.warnings, request);
    }

    const startTime = Date.now();
    let response: MiddlewareResponse;

    try {
      response = await next();
    } catch (error: any) {
      throw error;
    }

    if (this.validationConfig.validateResponse) {
      const responseValidation = await this.validateResponse(response, request);
      
      if (!responseValidation.valid) {
        return this.handleValidationFailure(
          'Response validation failed',
          responseValidation,
          request
        );
      }

      if (responseValidation.warnings.length > 0) {
        this.logValidationWarnings('Response', responseValidation.warnings, request);
      }
    }

    return {
      ...response,
      metadata: {
        ...response.metadata,
        validation: {
          validated: true,
          requestValid: true,
          responseValid: this.validationConfig.validateResponse,
          validationTime: Date.now() - startTime
        }
      }
    };
  }

  private async validateRequest(request: MiddlewareRequest): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (this.validationConfig.validateArgs && request.args) {
      const argsValidation = this.validateArgs(request);
      errors.push(...argsValidation.errors);
      warnings.push(...argsValidation.warnings);
    }

    if (this.validationConfig.validateContext) {
      const contextValidation = this.validateContext(request);
      errors.push(...contextValidation.errors);
      warnings.push(...contextValidation.warnings);
    }

    const operationValidation = this.validateOperation(request);
    errors.push(...operationValidation.errors);
    warnings.push(...operationValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateArgs(request: MiddlewareRequest): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!Array.isArray(request.args)) {
      errors.push({
        field: 'args',
        value: request.args,
        rule: 'type',
        message: 'Arguments must be an array'
      });
      return { valid: false, errors, warnings };
    }

    request.args.forEach((arg, index) => {
      if (arg === null || arg === undefined) {
        warnings.push({
          field: `args[${index}]`,
          value: arg,
          rule: 'null_check',
          message: 'Argument is null or undefined'
        });
      }

      if (typeof arg === 'string' && arg.trim().length === 0) {
        warnings.push({
          field: `args[${index}]`,
          value: arg,
          rule: 'empty_string',
          message: 'Argument is empty string'
        });
      }

      if (typeof arg === 'object' && arg !== null) {
        try {
          JSON.stringify(arg);
        } catch (error) {
          errors.push({
            field: `args[${index}]`,
            value: '[Circular]',
            rule: 'serialization',
            message: 'Argument contains circular references'
          });
        }
      }
    });

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateContext(request: MiddlewareRequest): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const requiredContextFields = [
      'requestId', 'timestamp', 'workingDirectory', 
      'autonomous', 'planMode', 'autoAcceptEdits'
    ];

    requiredContextFields.forEach(field => {
      if (!(field in request.context) || request.context[field as keyof typeof request.context] === undefined) {
        errors.push({
          field: `context.${field}`,
          value: undefined,
          rule: 'required',
          message: `Required context field '${field}' is missing`
        });
      }
    });

    if (request.context.workingDirectory && typeof request.context.workingDirectory === 'string') {
      if (!require('path').isAbsolute(request.context.workingDirectory)) {
        warnings.push({
          field: 'context.workingDirectory',
          value: request.context.workingDirectory,
          rule: 'path_format',
          message: 'Working directory should be an absolute path'
        });
      }
    }

    if (request.context.requestId && typeof request.context.requestId === 'string') {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(request.context.requestId)) {
        warnings.push({
          field: 'context.requestId',
          value: request.context.requestId,
          rule: 'format',
          message: 'Request ID should be a valid UUID'
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateOperation(request: MiddlewareRequest): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!request.operation || typeof request.operation !== 'string') {
      errors.push({
        field: 'operation',
        value: request.operation,
        rule: 'required',
        message: 'Operation must be a non-empty string'
      });
      return { valid: false, errors, warnings };
    }

    if (request.operation.trim().length === 0) {
      errors.push({
        field: 'operation',
        value: request.operation,
        rule: 'empty',
        message: 'Operation cannot be empty'
      });
    }

    if (request.operation.length > 1000) {
      warnings.push({
        field: 'operation',
        value: request.operation,
        rule: 'length',
        message: 'Operation is very long (>1000 characters)'
      });
    }

    const validators = this.operationValidators.get(request.operation);
    if (validators) {
      const customValidation = this.applyValidationRules(
        { operation: request.operation, args: request.args, context: request.context },
        validators,
        request
      );
      errors.push(...customValidation.errors);
      warnings.push(...customValidation.warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateResponse(
    response: MiddlewareResponse,
    request: MiddlewareRequest
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (typeof response.success !== 'boolean') {
      errors.push({
        field: 'response.success',
        value: response.success,
        rule: 'type',
        message: 'Response success field must be boolean'
      });
    }

    if (!response.success && !response.error) {
      warnings.push({
        field: 'response.error',
        value: response.error,
        rule: 'consistency',
        message: 'Failed response should include error message'
      });
    }

    if (response.data) {
      try {
        JSON.stringify(response.data);
      } catch (error) {
        errors.push({
          field: 'response.data',
          value: '[Circular]',
          rule: 'serialization',
          message: 'Response data contains circular references'
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private applyValidationRules(
    target: any,
    rules: ValidationRule[],
    request: MiddlewareRequest
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    rules.forEach(rule => {
      const value = this.getFieldValue(target, rule.field);
      const validation = this.validateField(value, rule, request);
      
      if (validation.error) {
        if (rule.required || this.validationConfig.strictMode) {
          errors.push(validation.error);
        } else {
          warnings.push(validation.error);
        }
      }
    });

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateField(
    value: any,
    rule: ValidationRule,
    request: MiddlewareRequest
  ): { error?: ValidationError } {
    if (value === undefined || value === null) {
      if (rule.required) {
        return {
          error: {
            field: rule.field,
            value,
            rule: 'required',
            message: rule.message || `Field '${rule.field}' is required`
          }
        };
      }
      return {};
    }

    if (rule.type && typeof value !== rule.type) {
      if (rule.type === 'array' && !Array.isArray(value)) {
        return {
          error: {
            field: rule.field,
            value,
            rule: 'type',
            message: rule.message || `Field '${rule.field}' must be an array`
          }
        };
      } else if (rule.type !== 'array' && typeof value !== rule.type) {
        return {
          error: {
            field: rule.field,
            value,
            rule: 'type',
            message: rule.message || `Field '${rule.field}' must be of type ${rule.type}`
          }
        };
      }
    }

    if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) {
      return {
        error: {
          field: rule.field,
          value,
          rule: 'minLength',
          message: rule.message || `Field '${rule.field}' must be at least ${rule.minLength} characters`
        }
      };
    }

    if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) {
      return {
        error: {
          field: rule.field,
          value,
          rule: 'maxLength',
          message: rule.message || `Field '${rule.field}' must be at most ${rule.maxLength} characters`
        }
      };
    }

    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
      return {
        error: {
          field: rule.field,
          value,
          rule: 'pattern',
          message: rule.message || `Field '${rule.field}' does not match required pattern`
        }
      };
    }

    if (rule.enum && !rule.enum.includes(value)) {
      return {
        error: {
          field: rule.field,
          value,
          rule: 'enum',
          message: rule.message || `Field '${rule.field}' must be one of: ${rule.enum.join(', ')}`
        }
      };
    }

    if (rule.custom) {
      const customResult = rule.custom(value, request);
      if (typeof customResult === 'string') {
        return {
          error: {
            field: rule.field,
            value,
            rule: 'custom',
            message: customResult
          }
        };
      } else if (customResult === false) {
        return {
          error: {
            field: rule.field,
            value,
            rule: 'custom',
            message: rule.message || `Field '${rule.field}' failed custom validation`
          }
        };
      }
    }

    return {};
  }

  private getFieldValue(target: any, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let current = target;
    
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    
    return current;
  }

  private setupDefaultValidators(): void {
    this.addOperationValidator('command', [
      { field: 'operation', type: 'string', required: true, minLength: 1 },
      { field: 'args', type: 'array', required: true }
    ]);

    this.addOperationValidator('agent', [
      { field: 'operation', type: 'string', required: true, minLength: 1 },
      { field: 'args', type: 'array', required: true },
      { field: 'context.autonomous', type: 'boolean', required: true }
    ]);

    this.addOperationValidator('file', [
      { field: 'operation', type: 'string', required: true },
      { field: 'args', type: 'array', required: true, minLength: 1 },
      { field: 'args[0]', type: 'string', required: true, minLength: 1 }
    ]);

    this.addOperationValidator('tool', [
      { field: 'operation', type: 'string', required: true },
      { field: 'args', type: 'array', required: true }
    ]);
  }

  private setupCustomValidators(): void {
    Object.entries(this.validationConfig.customValidators).forEach(([operation, rules]) => {
      this.addOperationValidator(operation, rules);
    });
  }

  private handleValidationFailure(
    message: string,
    validation: ValidationResult,
    request: MiddlewareRequest
  ): MiddlewareResponse {
    if (this.validationConfig.logValidationErrors) {
      logger.error(message, {
        requestId: request.id,
        operation: request.operation,
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    if (this.validationConfig.failOnValidationError) {
      return {
        success: false,
        error: `${message}: ${validation.errors.map(e => e.message).join(', ')}`,
        metadata: {
          validationFailed: true,
          validationErrors: validation.errors,
          validationWarnings: validation.warnings
        }
      };
    }

    return {
      success: true,
      metadata: {
        validationFailed: true,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings
      }
    };
  }

  private logValidationWarnings(
    type: string,
    warnings: ValidationError[],
    request: MiddlewareRequest
  ): void {
    if (this.validationConfig.logValidationErrors) {
      console.log(
        chalk.yellow(`⚠️ ${type} validation warnings for ${request.operation}:`)
      );
      warnings.forEach(warning => {
        console.log(chalk.yellow(`  • ${warning.field}: ${warning.message}`));
      });
    }
  }

  addOperationValidator(operation: string, rules: ValidationRule[]): void {
    this.operationValidators.set(operation, rules);
  }

  removeOperationValidator(operation: string): boolean {
    return this.operationValidators.delete(operation);
  }

  getOperationValidators(): Map<string, ValidationRule[]> {
    return new Map(this.operationValidators);
  }

  updateValidationConfig(config: Partial<ValidationMiddlewareConfig>): void {
    this.validationConfig = { ...this.validationConfig, ...config };
    this.updateConfig(this.validationConfig);
    
    if (config.customValidators) {
      this.setupCustomValidators();
    }
  }

  getValidationConfig(): ValidationMiddlewareConfig {
    return { ...this.validationConfig };
  }
}
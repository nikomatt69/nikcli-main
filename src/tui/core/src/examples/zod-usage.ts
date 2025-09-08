import { z } from "zod";
import {
  BoxSchema,
  ButtonSchema,
  ComponentSchemas,
  TextSchema,
} from "../types/component-schemas";
import {
  componentValidator,
  validateComponent,
  validateComponentStrict,
  validateWithSuggestions,
} from "../validation/component-validator";

// ===== ESEMPIO 1: Validazione Base =====

console.log("=== ESEMPIO 1: Validazione Base ===");

// Validazione di un Button con props corrette
const buttonProps = {
  text: "Click me",
  onClick: () => console.log("Button clicked"),
  variant: "primary" as const,
  size: "md" as const,
  top: 10,
  left: 20,
  width: 20,
  height: 3,
};

const buttonValidation = validateComponent("button", buttonProps);
console.log(
  "Button validation:",
  buttonValidation.success ? "✅ Success" : "❌ Failed"
);

if (!buttonValidation.success) {
  console.log("Errors:", buttonValidation.errors?.issues);
}

// ===== ESEMPIO 2: Validazione con Errori =====

console.log("\n=== ESEMPIO 2: Validazione con Errori ===");

// Button con props invalide
const invalidButtonProps = {
  text: 123, // Dovrebbe essere string
  onClick: "not a function", // Dovrebbe essere function
  variant: "invalid-variant", // Variant non valido
  size: "xxl", // Size non valido
};

const invalidButtonValidation = validateWithSuggestions(
  "button",
  invalidButtonProps
);
console.log(
  "Invalid button validation:",
  invalidButtonValidation.success ? "✅ Success" : "❌ Failed"
);

if (!invalidButtonValidation.success) {
  console.log("Errors:", invalidButtonValidation.errors?.issues);
  console.log("Suggestions:", invalidButtonValidation.suggestions);
}

// ===== ESEMPIO 3: Validazione Strict =====

console.log("\n=== ESEMPIO 3: Validazione Strict ===");

// Button con proprietà sconosciute
const buttonWithUnknownProps = {
  ...buttonProps,
  unknownProp: "this should trigger a warning",
  anotherUnknown: 123,
};

const strictValidation = validateComponentStrict(
  "button",
  buttonWithUnknownProps
);
console.log(
  "Strict validation:",
  strictValidation.success ? "✅ Success" : "❌ Failed"
);
console.log("Warnings:", strictValidation.warnings);

// ===== ESEMPIO 4: Validazione Multipla =====

console.log("\n=== ESEMPIO 4: Validazione Multipla ===");

const componentsToValidate = [
  {
    name: "button",
    props: {
      text: "Button 1",
      top: 0,
      left: 0,
    },
  },
  {
    name: "box",
    props: {
      content: "Box content",
      top: 5,
      left: 0,
      width: 50,
      height: 10,
    },
  },
  {
    name: "text",
    props: {
      content: "Text content",
      top: 10,
      left: 0,
    },
  },
];

const multiValidation =
  componentValidator.validateComponents(componentsToValidate);
multiValidation.forEach((result, index) => {
  const componentName = componentsToValidate[index].name;
  console.log(`${componentName}: ${result.success ? "✅" : "❌"}`);
  if (!result.success) {
    console.log(`  Errors: ${result.errors?.issues.length || 0}`);
  }
});

// ===== ESEMPIO 5: Utilizzo degli Schemi Direttamente =====

console.log("\n=== ESEMPIO 5: Utilizzo degli Schemi Direttamente ===");

// Parsing diretto con Zod
try {
  const parsedButton = ButtonSchema.parse(buttonProps);
  console.log("✅ Button parsed successfully:", parsedButton.text);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log("❌ Button parsing failed:", error.issues);
  }
}

// Safe parsing (non lancia errori)
const safeParsedButton = ButtonSchema.safeParse(invalidButtonProps);
if (safeParsedButton.success) {
  console.log("✅ Button parsed safely");
} else {
  console.log(
    "❌ Button parsing failed safely:",
    safeParsedButton.error.issues
  );
}

// ===== ESEMPIO 6: Validazione Avanzata =====

console.log("\n=== ESEMPIO 6: Validazione Avanzata ===");

// Creazione di uno schema personalizzato che estende Button
const CustomButtonSchema = ButtonSchema.extend({
  customIcon: z.string().optional(),
  customStyle: z
    .object({
      borderColor: z.string().optional(),
      bg: z.string().optional(),
    })
    .optional(),
});

// Validazione con schema personalizzato
const customButtonProps = {
  ...buttonProps,
  customIcon: "🚀",
  customStyle: {
    borderColor: "#ff0000",
    bg: "#000000",
  },
};

try {
  const customButton = CustomButtonSchema.parse(customButtonProps);
  console.log("✅ Custom button validated:", customButton.customIcon);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log("❌ Custom button validation failed:", error.issues);
  }
}

// ===== ESEMPIO 7: Utility Functions =====

console.log("\n=== ESEMPIO 7: Utility Functions ===");

// Controllo se un componente ha una proprietà specifica
console.log(
  'Button has "text" property:',
  componentValidator.hasProperty("button", "text")
);
console.log(
  'Button has "unknownProp" property:',
  componentValidator.hasProperty("button", "unknownProp")
);

// Ottieni tutti i componenti disponibili
const availableComponents = componentValidator.getAvailableComponents();
console.log("Available components:", availableComponents.length);

// Ottieni schema per un componente specifico
const buttonSchema = componentValidator.getSchema("button");
console.log("Button schema type:", typeof buttonSchema);

// ===== ESEMPIO 8: Validazione in Tempo Reale =====

console.log("\n=== ESEMPIO 8: Validazione in Tempo Reale ===");

// Funzione helper per validare props in tempo reale
function createComponent<T extends keyof typeof ComponentSchemas>(
  componentName: T,
  props: any
) {
  const validation = validateComponent(componentName, props);

  if (!validation.success) {
    console.error(`❌ Failed to create ${componentName}:`);
    validation.errors?.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    });
    throw new Error(`Invalid props for ${componentName}`);
  }

  console.log(`✅ Successfully validated ${componentName} props`);
  return validation.data;
}

// Utilizzo della funzione helper
try {
  const validatedButton = createComponent("button", buttonProps);
  console.log("Button created with validated props:", validatedButton.text);
} catch (error) {
  console.log("Failed to create button:", error);
}

// ===== ESEMPIO 9: Type Inference =====

console.log("\n=== ESEMPIO 9: Type Inference ===");

// I tipi sono automaticamente inferiti dagli schemi Zod
type ButtonProps = z.infer<typeof ButtonSchema>;
type BoxProps = z.infer<typeof BoxSchema>;
type TextProps = z.infer<typeof TextSchema>;

// TypeScript ora conosce esattamente la struttura di questi tipi
const typedButtonProps: ButtonProps = {
  text: "Typed Button",
  top: 0,
  left: 0,
  focusable: true,
  scrollable: false,
  // TypeScript mostrerà errori per proprietà invalide
  // variant: 'invalid', // ❌ Error: Type '"invalid"' is not assignable
};

console.log("✅ Type-safe button props created");

// ===== ESEMPIO 10: Validazione Condizionale =====

console.log("\n=== ESEMPIO 10: Validazione Condizionale ===");

// Schema con validazione condizionale
const ConditionalButtonSchema = ButtonSchema.extend({
  showIcon: z.boolean().optional(),
  icon: z.string().optional(),
}).refine(
  (data) => {
    // Se showIcon è true, icon deve essere presente
    if (data.showIcon && !data.icon) {
      return false;
    }
    return true;
  },
  {
    message: "Icon is required when showIcon is true",
    path: ["icon"],
  }
);

// Test della validazione condizionale
const conditionalButtonProps = {
  ...buttonProps,
  showIcon: true,
  // icon: '🚀', // Manca - dovrebbe fallire
};

try {
  const conditionalButton = ConditionalButtonSchema.parse(
    conditionalButtonProps
  );
  console.log("✅ Conditional button validated");
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log("❌ Conditional validation failed:", error.issues);
  }
}

console.log("\n🎉 Tutti gli esempi completati!");

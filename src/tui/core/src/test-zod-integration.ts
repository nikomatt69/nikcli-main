import { BoxSchema, ButtonSchema, TextSchema } from "./types/component-schemas";
import {
  componentValidator,
  validateComponent,
  validateComponentStrict,
  validateWithSuggestions,
} from "./validation/component-validator";

// Test function to verify Zod integration
export function testZodIntegration() {
  console.log("🧪 Testing Zod Integration...\n");

  // Test 1: Button validation
  console.log("=== Test 1: Button Validation ===");
  const validButtonProps = {
    text: "Click me",
    top: 10,
    left: 20,
    width: 20,
    height: 3,
  };

  const invalidButtonProps = {
    text: 123, // Should be string
    top: "invalid", // Should be number
  };

  try {
    const buttonValidation = validateComponent("button", validButtonProps);
    console.log("✅ Valid button props:", buttonValidation.success);

    const invalidButtonValidation = validateComponent(
      "button",
      invalidButtonProps
    );
    console.log("❌ Invalid button props:", !invalidButtonValidation.success);
    if (!invalidButtonValidation.success) {
      console.log(
        "   Errors:",
        invalidButtonValidation.errors?.issues.map((i) => i.message)
      );
    }
  } catch (error) {
    console.log("❌ Button validation failed:", error);
  }

  // Test 2: Box validation
  console.log("\n=== Test 2: Box Validation ===");
  const validBoxProps = {
    content: "Box content",
    top: 5,
    left: 0,
    width: 50,
    height: 10,
  };

  try {
    const boxValidation = validateComponent("box", validBoxProps);
    console.log("✅ Valid box props:", boxValidation.success);
  } catch (error) {
    console.log("❌ Box validation failed:", error);
  }

  // Test 3: Text validation
  console.log("\n=== Test 3: Text Validation ===");
  const validTextProps = {
    text: "Hello World",
    top: 0,
    left: 0,
  };

  try {
    const textValidation = validateComponent("text", validTextProps);
    console.log("✅ Valid text props:", textValidation.success);
  } catch (error) {
    console.log("❌ Text validation failed:", error);
  }

  // Test 4: Schema direct usage
  console.log("\n=== Test 4: Direct Schema Usage ===");
  try {
    const parsedButton = ButtonSchema.parse(validButtonProps);
    console.log("✅ ButtonSchema.parse success:", parsedButton.text);

    const parsedBox = BoxSchema.parse(validBoxProps);
    console.log("✅ BoxSchema.parse success:", parsedBox.content);

    const parsedText = TextSchema.parse(validTextProps);
    console.log("✅ TextSchema.parse success:", parsedText.content);
  } catch (error) {
    console.log("❌ Direct schema parsing failed:", error);
  }

  // Test 5: Component validator utilities
  console.log("\n=== Test 5: Component Validator Utilities ===");
  try {
    const availableComponents = componentValidator.getAvailableComponents();
    console.log("✅ Available components:", availableComponents.length);

    const hasButtonText = componentValidator.hasProperty("button", "text");
    console.log("✅ Button has text property:", hasButtonText);

    const buttonSchema = componentValidator.getSchema("button");
    console.log("✅ Button schema retrieved:", !!buttonSchema);
  } catch (error) {
    console.log("❌ Component validator utilities failed:", error);
  }

  // Test 6: Strict validation with warnings
  console.log("\n=== Test 6: Strict Validation ===");
  const propsWithUnknown = {
    ...validButtonProps,
    unknownProp: "this should trigger a warning",
  };

  try {
    const strictValidation = validateComponentStrict(
      "button",
      propsWithUnknown
    );
    console.log("✅ Strict validation:", strictValidation.success);
    if (strictValidation.warnings.length > 0) {
      console.log("   Warnings:", strictValidation.warnings);
    }
  } catch (error) {
    console.log("❌ Strict validation failed:", error);
  }

  // Test 7: Validation with suggestions
  console.log("\n=== Test 7: Validation with Suggestions ===");
  try {
    const suggestionsValidation = validateWithSuggestions(
      "button",
      invalidButtonProps
    );
    console.log("✅ Suggestions validation:", !suggestionsValidation.success);
    if (suggestionsValidation.suggestions.length > 0) {
      console.log("   Suggestions:", suggestionsValidation.suggestions);
    }
  } catch (error) {
    console.log("❌ Suggestions validation failed:", error);
  }

  console.log("\n🎉 Zod Integration Test Complete!");
}

// Run the test if this file is executed directly
if (require.main === module) {
  testZodIntegration();
}

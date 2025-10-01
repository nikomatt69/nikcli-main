/**
 * Custom assertion helpers for tests
 */

import { expect } from 'vitest'

/**
 * Assert that value is within range
 */
export function assertInRange(value: number, min: number, max: number, message?: string) {
  expect(value, message || `Expected ${value} to be between ${min} and ${max}`).toBeGreaterThanOrEqual(
    min
  )
  expect(value, message || `Expected ${value} to be between ${min} and ${max}`).toBeLessThanOrEqual(max)
}

/**
 * Assert that object has specific shape
 */
export function assertShape<T extends Record<string, any>>(
  obj: any,
  shape: Partial<Record<keyof T, string>>
) {
  expect(typeof obj).toBe('object')
  expect(obj).not.toBeNull()

  for (const [key, expectedType] of Object.entries(shape)) {
    expect(obj).toHaveProperty(key)
    expect(typeof obj[key]).toBe(expectedType)
  }
}

/**
 * Assert that array contains items matching predicate
 */
export function assertArrayContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string
) {
  const found = array.some(predicate)
  expect(found, message || 'Array does not contain item matching predicate').toBe(true)
}

/**
 * Assert that array has specific length
 */
export function assertArrayLength<T>(array: T[], length: number, message?: string) {
  expect(array, message || `Expected array length ${length}, got ${array.length}`).toHaveLength(
    length
  )
}

/**
 * Assert that function throws specific error
 */
export async function assertThrowsAsync(
  fn: () => Promise<any>,
  expectedError?: string | RegExp
) {
  let error: Error | undefined

  try {
    await fn()
  } catch (e) {
    error = e as Error
  }

  expect(error).toBeDefined()

  if (expectedError) {
    if (typeof expectedError === 'string') {
      expect(error!.message).toContain(expectedError)
    } else {
      expect(error!.message).toMatch(expectedError)
    }
  }
}

/**
 * Assert that function does not throw
 */
export async function assertDoesNotThrow(fn: () => Promise<any>) {
  let error: Error | undefined

  try {
    await fn()
  } catch (e) {
    error = e as Error
  }

  expect(error, error ? `Function threw: ${error.message}` : undefined).toBeUndefined()
}

/**
 * Assert that value matches snapshot (simplified)
 */
export function assertMatchesPattern<T>(value: T, pattern: Partial<T>) {
  for (const [key, expectedValue] of Object.entries(pattern)) {
    expect(value).toHaveProperty(key)
    expect((value as any)[key]).toEqual(expectedValue)
  }
}

/**
 * Assert that string matches format
 */
export function assertStringFormat(
  value: string,
  format: 'email' | 'url' | 'uuid' | 'date' | RegExp
) {
  const patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    url: /^https?:\/\/.+/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    date: /^\d{4}-\d{2}-\d{2}/,
  }

  const pattern = typeof format === 'string' ? patterns[format] : format
  expect(value, `Expected string to match ${format} format`).toMatch(pattern)
}

/**
 * Assert that async operation completes within time limit
 */
export async function assertCompletesWithin(
  fn: () => Promise<any>,
  maxTimeMs: number,
  message?: string
) {
  const startTime = Date.now()
  await fn()
  const duration = Date.now() - startTime

  expect(
    duration,
    message || `Expected operation to complete within ${maxTimeMs}ms, took ${duration}ms`
  ).toBeLessThanOrEqual(maxTimeMs)
}

/**
 * Assert that value is one of the allowed values
 */
export function assertOneOf<T>(value: T, allowedValues: T[], message?: string) {
  expect(
    allowedValues,
    message || `Expected ${value} to be one of ${allowedValues.join(', ')}`
  ).toContain(value)
}

/**
 * Assert that object is deeply equal (with better error messages)
 */
export function assertDeepEqual<T>(actual: T, expected: T, path = 'root') {
  if (actual === expected) return

  if (typeof actual !== typeof expected) {
    throw new Error(
      `Type mismatch at ${path}: expected ${typeof expected}, got ${typeof actual}`
    )
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      throw new Error(
        `Array length mismatch at ${path}: expected ${expected.length}, got ${actual.length}`
      )
    }

    for (let i = 0; i < actual.length; i++) {
      assertDeepEqual(actual[i], expected[i], `${path}[${i}]`)
    }
    return
  }

  if (typeof actual === 'object' && actual !== null && expected !== null) {
    const actualKeys = Object.keys(actual).sort()
    const expectedKeys = Object.keys(expected).sort()

    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`Keys mismatch at ${path}`)
    }

    for (const key of actualKeys) {
      assertDeepEqual((actual as any)[key], (expected as any)[key], `${path}.${key}`)
    }
    return
  }

  throw new Error(`Values not equal at ${path}: expected ${expected}, got ${actual}`)
}

/**
 * Assert that collection has unique items
 */
export function assertUnique<T>(items: T[], message?: string) {
  const seen = new Set<T>()
  const duplicates: T[] = []

  for (const item of items) {
    if (seen.has(item)) {
      duplicates.push(item)
    }
    seen.add(item)
  }

  expect(duplicates, message || `Found duplicate items: ${duplicates.join(', ')}`).toHaveLength(0)
}

/**
 * Assert that collection is sorted
 */
export function assertSorted<T>(
  items: T[],
  compareFn?: (a: T, b: T) => number,
  message?: string
) {
  const sorted = [...items].sort(compareFn)
  expect(items, message || 'Array is not sorted').toEqual(sorted)
}

/**
 * Assert that value is within percentage of expected
 */
export function assertWithinPercent(
  actual: number,
  expected: number,
  percent: number,
  message?: string
) {
  const tolerance = Math.abs(expected * (percent / 100))
  const min = expected - tolerance
  const max = expected + tolerance

  assertInRange(
    actual,
    min,
    max,
    message || `Expected ${actual} to be within ${percent}% of ${expected}`
  )
}

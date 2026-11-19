declare module "bun:test" {
  export interface Matchers<T = unknown> {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toMatch(pattern: RegExp | string): void;
    toHaveLength(length: number): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toThrow(expected?: unknown): void;
    readonly not: Matchers<T>;
    readonly resolves: Matchers<T>;
    readonly rejects: Matchers<T>;
  }

  export function describe(label: string, fn: () => void | Promise<void>): void;
  export function test(label: string, fn: () => void | Promise<void>): void;
  export function it(label: string, fn: () => void | Promise<void>): void;
  export function expect<T>(actual: T): Matchers<T>;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}

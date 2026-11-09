// @ts-nocheck
export const parseDataplaneJson = <T>(
  value: string | undefined,
  fallback: T,
): T => {
  if (!value) return fallback
  return JSON.parse(value) as T
}

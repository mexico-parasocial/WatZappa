/**
 * Fix for @connectrpc/connect v1.7.0 ServiceImpl type inference bug.
 * The library's MethodImpl conditional type fails to infer specific message types
 * from generated connect-es services, defaulting all requests to Message<unknown>.
 * 
 * This replacement type uses direct property access + InstanceType instead of
 * the broken infer-based conditional in the upstream library.
 */

export type FixedServiceImpl<T extends { methods: Record<string, any> }> = {
  [P in keyof T['methods']]: (
    req: T['methods'][P] extends { I: infer I }
      ? I extends abstract new (...args: any[]) => any
        ? InstanceType<I>
        : never
      : never,
    ctx: any
  ) => Promise<
    T['methods'][P] extends { O: infer O }
      ? O extends abstract new (...args: any[]) => any
        ? InstanceType<O>
        : never
      : never
  > | (
    T['methods'][P] extends { O: infer O }
      ? O extends abstract new (...args: any[]) => any
        ? InstanceType<O>
        : never
      : never
  )
}

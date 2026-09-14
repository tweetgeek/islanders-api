declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    templateDatabase: string;
    redisUrl: string;
  }
}
export {};

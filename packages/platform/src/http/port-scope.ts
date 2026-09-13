import type { NextFunction, Request, Response } from 'express';

/** Znacznik ustawiany na żądaniach przyjętych przez serwer wewnętrzny (`listenInternal`). */
export const INTERNAL_REQUEST = Symbol.for('islanders.internalRequest');

export interface PortScopeOptions {
  /** Prefiksy obsługiwane wyłącznie na porcie wewnętrznym, np. `/internal`, `/health`. */
  internalPrefixes: string[];
  /** Ścieżki dostępne na obu portach, np. `/.well-known/jwks.json`. */
  sharedPaths: string[];
}

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Jedna instancja Express obsługuje dwa serwery HTTP. Ten middleware pilnuje, żeby trasa
 * wewnętrzna nie dała się wywołać przez port publiczny i odwrotnie — odpowiedź jest taka sama
 * jak dla nieistniejącej trasy, więc port publiczny nie zdradza istnienia API wewnętrznego.
 */
export function portScopeMiddleware(options: PortScopeOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path;
    if (options.sharedPaths.some((p) => matches(path, p))) {
      next();
      return;
    }
    const internalRequest = (req as unknown as Record<symbol, unknown>)[INTERNAL_REQUEST] === true;
    const internalPath = options.internalPrefixes.some((p) => matches(path, p));
    if (internalRequest !== internalPath) {
      res.status(404).json({
        statusCode: 404,
        error: 'Not Found',
        message: `Cannot ${req.method} ${path}`,
      });
      return;
    }
    next();
  };
}

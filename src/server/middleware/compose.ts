import type { NextRequest } from 'next/server';

export type RouteHandler = (req: NextRequest, ctx: HandlerContext) => Promise<Response> | Response;

export type HandlerContext = {
  /** Next.js route params. */
  params?: Promise<Record<string, string | string[] | undefined>>;
  /** Set by `withAuth` — the employer's Stellar public key. */
  publicKey?: string;
  [k: string]: unknown;
};

export type Middleware = (handler: RouteHandler) => RouteHandler;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compose(...middlewares: Middleware[]) {
  return (handler: RouteHandler): ((req: NextRequest, ctx: any) => Promise<Response> | Response) => {
    const composed = middlewares.reduceRight((acc, mw) => mw(acc), handler);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (req: NextRequest, ctx: any) => composed(req, ctx as HandlerContext);
  };
}

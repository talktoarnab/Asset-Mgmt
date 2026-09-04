import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { notFound } from './errors.js';

export interface RequestContext<TAuth> {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: string | undefined;
  isBase64Encoded: boolean;
  auth: TAuth;
}

export type Handler<TAuth> = (
  ctx: RequestContext<TAuth>,
) => Promise<APIGatewayProxyStructuredResultV2>;

interface Route<TAuth> {
  method: string;
  segments: string[];
  handler: Handler<TAuth>;
}

/**
 * A tiny path-pattern router. One Lambda serves the whole API, which keeps cold
 * starts rare (all traffic keeps the same container warm) and lets the entire
 * surface be deployed as a single versioned artifact.
 */
export class Router<TAuth> {
  private readonly routes: Route<TAuth>[] = [];

  add(method: string, pattern: string, handler: Handler<TAuth>): this {
    this.routes.push({
      method: method.toUpperCase(),
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
    return this;
  }

  get = (pattern: string, handler: Handler<TAuth>) => this.add('GET', pattern, handler);
  post = (pattern: string, handler: Handler<TAuth>) => this.add('POST', pattern, handler);
  patch = (pattern: string, handler: Handler<TAuth>) => this.add('PATCH', pattern, handler);
  put = (pattern: string, handler: Handler<TAuth>) => this.add('PUT', pattern, handler);
  delete = (pattern: string, handler: Handler<TAuth>) => this.add('DELETE', pattern, handler);

  match(
    method: string,
    path: string,
  ): { handler: Handler<TAuth>; params: Record<string, string> } | undefined {
    const parts = path.split('/').filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      if (route.segments.length !== parts.length) continue;

      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i += 1) {
        const segment = route.segments[i]!;
        const value = parts[i]!;
        if (segment.startsWith('{') && segment.endsWith('}')) {
          params[segment.slice(1, -1)] = decodeURIComponent(value);
        } else if (segment !== value) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return undefined;
  }

  async handle(ctx: Omit<RequestContext<TAuth>, 'params'>): Promise<APIGatewayProxyStructuredResultV2> {
    const match = this.match(ctx.method, ctx.path);
    if (!match) throw notFound(`No route for ${ctx.method} ${ctx.path}`);
    return match.handler({ ...ctx, params: match.params });
  }
}

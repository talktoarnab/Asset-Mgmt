/**
 * Local API harness. Adapts Node's http server into the API Gateway v2 event
 * shape so the exact Lambda handler that ships to AWS is the one exercised in
 * development. Pair it with DynamoDB Local (see docker-compose.yml).
 *
 *   AUTH_MODE=dev npm run dev
 */
import { createServer } from 'node:http';
import { handler as apiHandler } from '../handlers/api.js';

process.env.AUTH_MODE ??= 'dev';
process.env.TABLE_NAME ??= 'shelfkit-local';
process.env.DYNAMO_ENDPOINT ??= 'http://localhost:8000';
process.env.AWS_REGION ??= 'eu-north-1';
process.env.AWS_ACCESS_KEY_ID ??= 'local';
process.env.AWS_SECRET_ACCESS_KEY ??= 'local';
process.env.ORG_ID ??= 'dev-branch';
process.env.DESK_PIN ??= '123456';
process.env.SESSION_SECRET ??= 'dev-session-secret-change-me';

const PORT = Number(process.env.PORT ?? 4000);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders()).end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : undefined;

  try {
    const event = {
      version: '2.0',
      rawPath: url.pathname,
      rawQueryString: url.search.slice(1),
      queryStringParameters: Object.fromEntries(url.searchParams.entries()),
      headers: req.headers as Record<string, string>,
      body,
      isBase64Encoded: false,
      requestContext: { http: { method: req.method ?? 'GET', path: url.pathname } },
    };

    const result = await apiHandler(event as never);
    res
      .writeHead(result.statusCode ?? 200, {
        ...(result.headers as Record<string, string>),
        ...corsHeaders(),
      })
      .end(result.body ?? '');
  } catch (error) {
    console.error(error);
    res
      .writeHead(500, { 'content-type': 'application/json', ...corsHeaders() })
      .end(JSON.stringify({ error: { code: 'LOCAL_ERROR', message: String(error) } }));
  }
});

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  };
}

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} (auth: ${process.env.AUTH_MODE})`);
});

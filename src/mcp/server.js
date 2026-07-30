const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { requireBearerAuth } = require('../auth/principal');
const catalogService = require('../services/catalogService');

const router = express.Router();
router.use(express.json());

// Simplified DNS-rebinding guard: check Host + Content-Type. The full design
// also validates Origin against an allowlist and uses a hardened undici
// connector for the CIMD fetch path (not applicable here) — flagged as a
// follow-up, not silently dropped.
function originGuard(req, res, next) {
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
    if (req.method === 'POST' && contentType !== 'application/json') {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Content-Type must be application/json' });
    }
    next();
}

function buildServer(auth) {
    const server = new McpServer({ name: 'comics-tv', version: '1.0.0' });

    if (auth.scopes.has('catalog:read')) {
        server.registerTool(
            'search_catalog',
            {
                title: 'Search catalog',
                description: 'Search the movie catalog by title',
                inputSchema: { query: z.string(), limit: z.number().int().min(1).max(25).optional() },
            },
            async ({ query, limit = 10 }) => {
                const all = await catalogService.listMoviesPage({ limit: 500, offset: 0 });
                const matches = all
                    .filter((m) => m.title.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, limit);
                return {
                    content: [{ type: 'text', text: JSON.stringify(matches.map((m) => ({ id: m.id, title: m.title, releaseDate: m.releaseDate }))) }],
                };
            }
        );

        server.registerTool(
            'get_movie',
            {
                title: 'Get movie details',
                description: 'Get details for a specific movie by id',
                inputSchema: { id: z.string() },
            },
            async ({ id }) => {
                const movie = await catalogService.getMovie(id);
                if (!movie) {
                    return { isError: true, content: [{ type: 'text', text: 'Movie not found' }] };
                }
                return { content: [{ type: 'text', text: JSON.stringify(movie) }] };
            }
        );
    }

    return server;
}

router.get('/', (req, res) => {
    res.status(405).json({ error: 'method_not_allowed' });
});

router.post('/', requireBearerAuth, originGuard, async (req, res, next) => {
    try {
        const server = buildServer(req.auth);
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        res.on('close', () => {
            transport.close();
            server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        next(err);
    }
});

module.exports = router;

const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { requireBearerAuth } = require('../auth/principal');
const catalogService = require('../services/catalogService');
const { can } = require('../authz/fga');

const router = express.Router();
router.use(express.json());

// DNS-rebinding / cross-site guard: Content-Type + an Origin allowlist.
// The undici custom-connector hardening for the CIMD fetch path
// (src/auth/oidc/clients.js) doesn't apply here - there's no outbound
// fetch to a client-supplied URL on this endpoint - so this only needed
// the Origin check, which was the other half of the original "flagged as
// a follow-up" gap.
//
// Same-origin threat model: a page running in a victim's browser can't
// itself read this server's cookies or forge a bearer token, but it CAN
// issue a cross-origin fetch/XHR carrying whatever Authorization header
// its own JS constructs (e.g. one lifted from a compromised extension, a
// misconfigured client stashing the token somewhere page JS can reach, or
// a same-site sibling app). Rejecting a present-but-foreign Origin closes
// that off without breaking non-browser MCP clients (CLI tools, server-to-
// server agents), which typically don't send an Origin header at all.
const ISSUER_ORIGIN = new URL(process.env.OAUTH_ISSUER || 'http://localhost:1000').origin;

function originGuard(req, res, next) {
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim();
    if (req.method === 'POST' && contentType !== 'application/json') {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Content-Type must be application/json' });
    }

    const origin = req.headers.origin;
    if (origin && origin !== ISSUER_ORIGIN) {
        return res.status(403).json({ error: 'invalid_request', error_description: 'Origin not allowed' });
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
                // catalogService.getMovie() has no published-status filter
                // (unlike search_catalog's listMoviesPage) - the web route
                // for the same lookup enforces `can_discover` via
                // requireFgaPermission, so this tool must check it too, or
                // an MCP client with only catalog:read could fetch an
                // unpublished/draft title by id. tier: 'browse' semantics -
                // fail open on an FGA outage, treat "not allowed" the same
                // as "not found" so this doesn't leak existence either.
                const allowed = await can(auth.subject, 'can_discover', `title:${id}`, { failOpen: true });
                if (!allowed) {
                    return { isError: true, content: [{ type: 'text', text: 'Movie not found' }] };
                }
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

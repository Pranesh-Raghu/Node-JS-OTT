// override: true - see the matching comment in src/config/index.js.
require('dotenv').config({ override: true });

const base = {
    client: 'pg',
    connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    },
    migrations: {
        directory: './migrations',
        tableName: 'knex_migrations',
    },
};

module.exports = {
    development: base,
    production: base,
};

require('dotenv').config();

const base = {
    client: 'mysql2',
    connection: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        charset: 'utf8mb4',
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

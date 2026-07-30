const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASS,
    database: config.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: ['DATE'],
    timezone: 'Z',
});

async function withTransaction(fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function ping() {
    const [rows] = await pool.query('SELECT 1 AS ok');
    return rows[0].ok === 1;
}

module.exports = { pool, withTransaction, ping };

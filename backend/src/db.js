const mysql = require('mysql2/promise');
require('dotenv').config();

if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER) {
  console.error('Database settings are missing. Copy .env.example to .env and configure MySQL.');
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,

  ssl: {
    rejectUnauthorized: false
  },

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

module.exports = pool;

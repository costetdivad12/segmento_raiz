require('dotenv').config()

const sqlConfig = {
  user:'sa',
  password: 'samorelos*1',
  database: 'db_cescolar',
  server: '172.16.20.51',
  // user: process.env.DB_USER,
  // password: process.env.DB_PWD,
  // database: process.env.DB_NAME,
  // server: process.env.DB_SERVER,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: true 
  }
}

module.exports = sqlConfig;
const mysql = require("mysql")
require("dotenv").config()

const conn = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_BOT_NAME
})

console.log("Connected to database")

module.exports = conn
const mysql = require("mysql2/promise")
require("dotenv").config()

async function addProfilePhotoColumn() {
  console.log("Starting migration to add profile_photo_url column...")

  // Create database connection
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "myclass_db",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })

  try {
    // Check if column exists
    const [columns] = await pool.query(
      `
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'users' 
      AND COLUMN_NAME = 'profile_photo_url'
    `,
      [process.env.DB_NAME || "myclass_db"],
    )

    if (columns.length === 0) {
      console.log("Column 'profile_photo_url' does not exist. Adding it now...")

      // Add the column
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN profile_photo_url VARCHAR(255) NULL
      `)

      console.log("Column 'profile_photo_url' added successfully!")
    } else {
      console.log("Column 'profile_photo_url' already exists. No changes needed.")
    }
  } catch (error) {
    console.error("Error during migration:", error)
  } finally {
    // Close the connection pool
    await pool.end()
    console.log("Migration completed.")
  }
}

// Run the migration
addProfilePhotoColumn()

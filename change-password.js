const express = require("express")
const router = express.Router()
const mysql = require("mysql2/promise")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
require("dotenv").config()

// Database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "myclass_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "myclass_secret_key"

// Auth middleware for protected routes
const authMiddleware = (req, res, next) => {
  const token = req.header("x-auth-token")

  if (!token) {
    return res.status(401).json({ message: "Accès refusé, token manquant" })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    console.error("Token verification failed:", error.message)
    res.status(401).json({ message: "Token invalide" })
  }
}

// Change password endpoint
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const { currentPassword, newPassword } = req.body

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Les mots de passe actuels et nouveaux sont requis" })
    }

    // Get user from database
    const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [userId])

    if (users.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" })
    }

    const user = users[0]

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) {
      return res.status(400).json({ message: "Mot de passe actuel incorrect" })
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(newPassword, salt)

    // Update password in database
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId])

    res.status(200).json({ message: "Mot de passe mis à jour avec succès" })
  } catch (error) {
    console.error("Error changing password:", error)
    res.status(500).json({ message: "Erreur lors du changement de mot de passe", error: error.message })
  }
})

module.exports = router

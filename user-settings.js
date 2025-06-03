const express = require("express")
const router = express.Router()
const mysql = require("mysql2/promise")
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

// Get user settings
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id

    // Check if user has settings
    const [rows] = await pool.query("SELECT * FROM user_settings WHERE user_id = ?", [userId])

    if (rows.length === 0) {
      // Create default settings for user
      const defaultSettings = {
        notifications: {
          emailNotifications: true,
          courseUpdates: true,
          newAnnouncements: true,
          marketingEmails: false,
        },
        appearance: {
          theme: "light",
          fontSize: "medium",
          reducedMotion: false,
        },
        privacy: {
          profileVisibility: "public",
          showEnrolledCourses: true,
          showActivityStatus: true,
        },
        language: "fr",
      }

      // Insert default settings
      await pool.query(
        `INSERT INTO user_settings 
        (user_id, notifications_email, notifications_course_updates, 
         notifications_announcements, notifications_marketing, 
         appearance_theme, appearance_font_size, appearance_reduced_motion,
         privacy_profile_visibility, privacy_show_courses, privacy_show_activity,
         language) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          defaultSettings.notifications.emailNotifications ? 1 : 0,
          defaultSettings.notifications.courseUpdates ? 1 : 0,
          defaultSettings.notifications.newAnnouncements ? 1 : 0,
          defaultSettings.notifications.marketingEmails ? 1 : 0,
          defaultSettings.appearance.theme,
          defaultSettings.appearance.fontSize,
          defaultSettings.appearance.reducedMotion ? 1 : 0,
          defaultSettings.privacy.profileVisibility,
          defaultSettings.privacy.showEnrolledCourses ? 1 : 0,
          defaultSettings.privacy.showActivityStatus ? 1 : 0,
          defaultSettings.language,
        ],
      )

      return res.status(200).json({ settings: defaultSettings })
    }

    // Map database settings to frontend format
    const settings = {
      notifications: {
        emailNotifications: rows[0].notifications_email === 1,
        courseUpdates: rows[0].notifications_course_updates === 1,
        newAnnouncements: rows[0].notifications_announcements === 1,
        marketingEmails: rows[0].notifications_marketing === 1,
      },
      appearance: {
        theme: rows[0].appearance_theme,
        fontSize: rows[0].appearance_font_size,
        reducedMotion: rows[0].appearance_reduced_motion === 1,
      },
      privacy: {
        profileVisibility: rows[0].privacy_profile_visibility,
        showEnrolledCourses: rows[0].privacy_show_courses === 1,
        showActivityStatus: rows[0].privacy_show_activity === 1,
      },
      language: rows[0].language,
    }

    res.status(200).json({ settings })
  } catch (error) {
    console.error("Error fetching user settings:", error)
    res.status(500).json({ message: "Erreur lors de la récupération des paramètres", error: error.message })
  }
})

// Update user settings
router.put("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const { settings } = req.body

    if (!settings) {
      return res.status(400).json({ message: "Les paramètres sont requis" })
    }

    // Check if user has settings
    const [rows] = await pool.query("SELECT * FROM user_settings WHERE user_id = ?", [userId])

    if (rows.length === 0) {
      // Insert new settings
      await pool.query(
        `INSERT INTO user_settings 
        (user_id, notifications_email, notifications_course_updates, 
         notifications_announcements, notifications_marketing, 
         appearance_theme, appearance_font_size, appearance_reduced_motion,
         privacy_profile_visibility, privacy_show_courses, privacy_show_activity,
         language) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          settings.notifications.emailNotifications ? 1 : 0,
          settings.notifications.courseUpdates ? 1 : 0,
          settings.notifications.newAnnouncements ? 1 : 0,
          settings.notifications.marketingEmails ? 1 : 0,
          settings.appearance.theme,
          settings.appearance.fontSize,
          settings.appearance.reducedMotion ? 1 : 0,
          settings.privacy.profileVisibility,
          settings.privacy.showEnrolledCourses ? 1 : 0,
          settings.privacy.showActivityStatus ? 1 : 0,
          settings.language,
        ],
      )
    } else {
      // Update existing settings
      await pool.query(
        `UPDATE user_settings SET 
        notifications_email = ?, 
        notifications_course_updates = ?, 
        notifications_announcements = ?, 
        notifications_marketing = ?, 
        appearance_theme = ?, 
        appearance_font_size = ?, 
        appearance_reduced_motion = ?,
        privacy_profile_visibility = ?, 
        privacy_show_courses = ?, 
        privacy_show_activity = ?,
        language = ?
        WHERE user_id = ?`,
        [
          settings.notifications.emailNotifications ? 1 : 0,
          settings.notifications.courseUpdates ? 1 : 0,
          settings.notifications.newAnnouncements ? 1 : 0,
          settings.notifications.marketingEmails ? 1 : 0,
          settings.appearance.theme,
          settings.appearance.fontSize,
          settings.appearance.reducedMotion ? 1 : 0,
          settings.privacy.profileVisibility,
          settings.privacy.showEnrolledCourses ? 1 : 0,
          settings.privacy.showActivityStatus ? 1 : 0,
          settings.language,
          userId,
        ],
      )
    }

    res.status(200).json({ message: "Paramètres mis à jour avec succès", settings })
  } catch (error) {
    console.error("Error updating user settings:", error)
    res.status(500).json({ message: "Erreur lors de la mise à jour des paramètres", error: error.message })
  }
})

module.exports = router

const express = require("express")
const cors = require("cors")
const mysql = require("mysql2/promise")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
require("dotenv").config()
const { sendPasswordResetEmail, testEmailConfiguration } = require("./email-service")

const app = express()
const PORT = process.env.PORT || 8000

// Enable CORS with more options
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-auth-token", "Authorization"],
    credentials: true,
  }),
)

// Body parser middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true })
    console.log("Created uploads directory:", uploadsDir)
  } catch (err) {
    console.error("Failed to create uploads directory:", err)
  }
}

// Configure multer for file uploads with better error handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("Multer destination called for file:", file.originalname)
    // Ensure the directory exists before trying to save the file
    if (!fs.existsSync(uploadsDir)) {
      return cb(new Error(`Uploads directory does not exist: ${uploadsDir}`), null)
    }

    // Check if directory is writable
    try {
      fs.accessSync(uploadsDir, fs.constants.W_OK)
      cb(null, uploadsDir)
    } catch (err) {
      cb(new Error(`Uploads directory is not writable: ${err.message}`), null)
    }
  },
  filename: (req, file, cb) => {
    console.log("Multer filename called for file:", file.originalname)
    // Create a safe filename with timestamp to avoid collisions
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    cb(null, file.fieldname + "-" + uniqueSuffix + ext)
  },
})

// File filter to validate file types - UPDATED to handle different file types based on field name
const fileFilter = (req, file, cb) => {
  console.log("Checking file type:", file.mimetype, "Field name:", file.fieldname)

  // For profile_photo field, accept image files
  if (file.fieldname === "profile_photo") {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Unsupported file type for profile photo. Only image files are allowed."), false)
    }
  }
  // For teacher_image field, accept image files
  else if (file.fieldname === "teacher_image") {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Unsupported file type for teacher image. Only image files are allowed."), false)
    }
  }
  // For course_file field, accept PDF and video files
  else if (file.fieldname === "course_file") {
    if (file.mimetype === "application/pdf" || file.mimetype.startsWith("video/")) {
      cb(null, true)
    } else {
      cb(new Error("Unsupported file type for course. Only PDF and video files are allowed."), false)
    }
  }
  // For any other field, accept all files (can be restricted later if needed)
  else {
    cb(null, true)
  }
}

// Create multer instance with improved configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
})

// Serve static files from uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

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

// Test database connection
async function testDatabaseConnection() {
  try {
    const connection = await pool.getConnection()
    console.log("Database connection successful")
    connection.release()

    // Create tables if they don't exist
    await createTables()

    // Test email configuration
    await testEmailConfiguration()
  } catch (err) {
    console.error("Database connection failed:", err)
  }
}

// Create necessary tables
async function createTables() {
  try {
    // Users table with role field and profile_photo_url
    const usersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        dateNaissance DATE,
        niveau VARCHAR(50),
        option VARCHAR(50),
        etablissement VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        tel VARCHAR(20),
        pays VARCHAR(50) DEFAULT 'Maroc',
        ville VARCHAR(50),
        profile_photo_url VARCHAR(255),
        role ENUM('student', 'admin') DEFAULT 'student',
        reset_token VARCHAR(255),
        reset_expires DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Contact messages table
    const contactTable = `
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        tel VARCHAR(20),
        objet VARCHAR(100),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Courses table with file_type and file_url fields
    const coursesTable = `
      CREATE TABLE IF NOT EXISTS courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        content TEXT,
        image_url VARCHAR(255),
        category VARCHAR(100),
        level VARCHAR(50),
        duration VARCHAR(50),
        file_type ENUM('pdf', 'video'),
        file_url VARCHAR(255),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `

    // Announcements table for teacher announcements
    const announcementsTable = `
      CREATE TABLE IF NOT EXISTS announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        teacher_name VARCHAR(255),
        teacher_image_url VARCHAR(255),
        course_id INT,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `

    await pool.query(usersTable)
    console.log("Users table ready")

    await pool.query(contactTable)
    console.log("Contact messages table ready")

    await pool.query(coursesTable)
    console.log("Courses table ready")

    await pool.query(announcementsTable)
    console.log("Announcements table ready")

    // User settings table
    const userSettingsTable = `
      CREATE TABLE IF NOT EXISTS user_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        notifications_email BOOLEAN DEFAULT TRUE,
        notifications_course_updates BOOLEAN DEFAULT TRUE,
        notifications_announcements BOOLEAN DEFAULT TRUE,
        notifications_marketing BOOLEAN DEFAULT FALSE,
        appearance_theme VARCHAR(20) DEFAULT 'light',
        appearance_font_size VARCHAR(20) DEFAULT 'medium',
        appearance_reduced_motion BOOLEAN DEFAULT FALSE,
        privacy_profile_visibility VARCHAR(20) DEFAULT 'public',
        privacy_show_courses BOOLEAN DEFAULT TRUE,
        privacy_show_activity BOOLEAN DEFAULT TRUE,
        language VARCHAR(10) DEFAULT 'fr',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `

    await pool.query(userSettingsTable)
    console.log("User settings table ready")

    // Check and add reset_token and reset_expires columns if they don't exist
    const [resetTokenColumns] = await pool.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME IN ('reset_token', 'reset_expires')`,
      [process.env.DB_NAME || "myclass_db"],
    )

    const existingColumns = resetTokenColumns.map((col) => col.COLUMN_NAME)

    if (!existingColumns.includes("reset_token")) {
      await pool.query(`ALTER TABLE users ADD COLUMN reset_token VARCHAR(255) NULL`)
      console.log("Added reset_token column to users table")
    }

    if (!existingColumns.includes("reset_expires")) {
      await pool.query(`ALTER TABLE users ADD COLUMN reset_expires DATETIME NULL`)
      console.log("Added reset_expires column to users table")
    }

    // Check if teacher_name column exists in announcements table
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'announcements' 
       AND COLUMN_NAME = 'teacher_name'`,
      [process.env.DB_NAME || "myclass_db"],
    )

    // If teacher_name column doesn't exist, add it
    if (columns.length === 0) {
      await pool.query(`ALTER TABLE announcements ADD COLUMN teacher_name VARCHAR(255) AFTER description`)
      console.log("Added teacher_name column to announcements table")

      // Populate teacher_name for existing announcements
      await pool.query(`
        UPDATE announcements a
        JOIN users u ON a.created_by = u.id
        SET a.teacher_name = CONCAT(u.nom, ' ', u.prenom)
        WHERE a.teacher_name IS NULL OR a.teacher_name = ''
      `)
      console.log("Populated teacher_name for existing announcements")
    }
  } catch (err) {
    console.error("Error creating tables:", err)
  }
}

// Call the test function
testDatabaseConnection()

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || "myclass_secret_key"

// Helper function to safely delete a file
function safeDeleteFile(filePath) {
  try {
    if (!filePath) return false

    // If the path starts with /uploads, prepend the __dirname
    const fullPath = filePath.startsWith("/uploads") ? path.join(__dirname, filePath) : filePath

    console.log(`Attempting to delete file: ${fullPath}`)

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
      console.log(`Successfully deleted file: ${fullPath}`)
      return true
    } else {
      console.log(`File not found: ${fullPath}`)
      return false
    }
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error)
    return false
  }
}

// Auth middleware for protected routes
const authMiddleware = (req, res, next) => {
  // Support both x-auth-token and Authorization Bearer formats
  const token = req.header("x-auth-token") || req.header("Authorization")?.replace("Bearer ", "")

  console.log("Auth middleware called, token:", token ? "Token provided" : "No token")

  if (!token) {
    return res.status(401).json({ message: "Accès refusé, token manquant" })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    console.log("Token verified successfully for user ID:", decoded.id)
    next()
  } catch (error) {
    console.error("Token verification failed:", error.message)
    res.status(401).json({ message: "Token invalide" })
  }
}

// Admin middleware - checks if user is an admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Accès refusé. Vous n'avez pas les droits d'administrateur." })
  }
  next()
}

// Routes
// Registration endpoint
app.post("/api/inscription", async (req, res) => {
  try {
    const { nom, prenom, dateNaissance, niveau, option, etablissement, email, password, tel, pays, ville } = req.body

    // Check if user already exists
    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [email])

    if (users.length > 0) {
      return res.status(400).json({ message: "Cet email est déjà utilisé" })
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // Insert new user with default role 'student'
    const newUser = {
      nom,
      prenom,
      dateNaissance,
      niveau,
      option,
      etablissement,
      email,
      password: hashedPassword,
      tel,
      pays,
      ville,
      role: "student", // Default role
    }

    const [result] = await pool.query("INSERT INTO users SET ?", [newUser])

    res.status(201).json({
      message: "Inscription réussie !",
      userId: result.insertId,
    })
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ message: "Erreur de serveur", error: error.message })
  }
})

// Login endpoint
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Find user by email
    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [email])

    if (users.length === 0) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" })
    }

    const user = users[0]

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" })
    }

    // Create JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "1d" },
    )

    res.status(200).json({
      message: "Connexion réussie",
      token,
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ message: "Erreur de serveur", error: error.message })
  }
})

// Forgot password endpoint
app.post("/api/forgot-password", async (req, res) => {
  console.log("=== FORGOT PASSWORD REQUEST ===")
  console.log("Request body:", req.body)

  try {
    const { email } = req.body

    if (!email) {
      console.log("❌ Email manquant")
      return res.status(400).json({ message: "L'email est requis" })
    }

    console.log("🔍 Recherche de l'utilisateur avec email:", email)

    // Check if user exists
    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [email])
    console.log("👤 Utilisateurs trouvés:", users.length)

    if (users.length === 0) {
      console.log("❌ Aucun utilisateur trouvé")
      return res.status(404).json({ message: "Aucun compte associé à cet email" })
    }

    const user = users[0]
    console.log("✅ Utilisateur trouvé:", user.nom, user.prenom)

    // Generate reset token
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString()
    const resetExpires = new Date(Date.now() + 3600000) // 1 hour from now

    console.log("🔑 Token généré:", resetToken)
    console.log("⏰ Expiration:", resetExpires)

    // Store reset token in database
    console.log("💾 Mise à jour de la base de données...")
    await pool.query("UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?", [
      resetToken,
      resetExpires,
      user.id,
    ])
    console.log("✅ Token sauvegardé en base")

    // Test email configuration first
    console.log("📧 Test de la configuration email...")
    const emailConfigValid = await testEmailConfiguration()

    if (!emailConfigValid) {
      console.log("❌ Configuration email invalide")
      return res.status(500).json({
        message: "Configuration email non valide. Contactez l'administrateur.",
        error: "Email configuration failed",
      })
    }

    // Send email with reset token
    console.log("📤 Envoi de l'email...")
    const userName = `${user.prenom} ${user.nom}`
    const emailResult = await sendPasswordResetEmail(email, resetToken, userName)

    console.log("📧 Résultat de l'envoi email:", emailResult)

    if (emailResult.success) {
      console.log("✅ Email envoyé avec succès!")
      console.log(`📧 Code envoyé à ${email}: ${resetToken}`)

      res.status(200).json({
        message: "Un code de vérification a été envoyé à votre adresse email",
        resetToken: resetToken, // Always include for development/testing
        emailSent: true,
        emailService: emailResult.service || "resend",
        messageId: emailResult.messageId,
      })
    } else {
      console.error("❌ Échec de l'envoi email:", emailResult.error)

      // Still allow password reset even if email fails
      res.status(200).json({
        message: "Code de vérification généré. Vérifiez votre email ou utilisez le code affiché.",
        resetToken: resetToken, // Include token since email failed
        emailSent: false,
        emailError: emailResult.error,
        warning: "L'email n'a pas pu être envoyé, mais vous pouvez utiliser le code affiché.",
      })
    }
  } catch (error) {
    console.error("💥 ERREUR SERVEUR dans forgot-password:", error)
    console.error("Stack trace:", error.stack)
    res.status(500).json({
      message: "Erreur de serveur",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
})

// Test email endpoint - for development only
app.post("/api/test-email", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ message: "Email is required" })
    }

    console.log("🧪 Testing email service...")

    const testResult = await sendPasswordResetEmail(email, "TEST123", "Test User")

    res.status(200).json({
      message: "Test email sent",
      result: testResult,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Test email error:", error)
    res.status(500).json({
      message: "Test email failed",
      error: error.message,
    })
  }
})

// Reset password endpoint
app.post("/api/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token et nouveau mot de passe requis" })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 6 caractères" })
    }

    // Find user with valid reset token
    const [users] = await pool.query("SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW()", [token])

    if (users.length === 0) {
      return res.status(400).json({ message: "Token invalide ou expiré" })
    }

    const user = users[0]

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(newPassword, salt)

    // Update password and clear reset token
    await pool.query("UPDATE users SET password = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?", [
      hashedPassword,
      user.id,
    ])

    res.status(200).json({
      message: "Mot de passe réinitialisé avec succès",
    })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({ message: "Erreur de serveur", error: error.message })
  }
})

// Verify reset token endpoint
app.get("/api/verify-reset-token/:token", async (req, res) => {
  try {
    const { token } = req.params

    const [users] = await pool.query("SELECT id, email FROM users WHERE reset_token = ? AND reset_expires > NOW()", [
      token,
    ])

    if (users.length === 0) {
      return res.status(400).json({ message: "Token invalide ou expiré" })
    }

    res.status(200).json({
      message: "Token valide",
      email: users[0].email,
    })
  } catch (error) {
    console.error("Verify token error:", error)
    res.status(500).json({ message: "Erreur de serveur", error: error.message })
  }
})

// Contact form submission endpoint
app.post("/api/contact", async (req, res) => {
  try {
    const { nom, email, tel, objet, message } = req.body

    const newMessage = { nom, email, tel, objet, message }

    const [result] = await pool.query("INSERT INTO contact_messages SET ?", [newMessage])

    res.status(201).json({
      message: "Message envoyé avec succès !",
      messageId: result.insertId,
    })
  } catch (error) {
    console.error("Server error:", error)
    res.status(500).json({ message: "Erreur de serveur", error: error.message })
  }
})

// Get user profile endpoint
app.get("/api/profile", async (req, res) => {
  console.log("GET /api/profile endpoint called")

  try {
    // Get token from header
    const token = req.header("x-auth-token")

    if (!token) {
      console.log("No token provided")
      return res.status(401).json({ message: "Accès refusé, token manquant" })
    }

    // Verify token
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
      console.log("Token verified successfully, user ID:", decoded.id)
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError.message)
      return res.status(401).json({ message: "Token invalide ou expiré" })
    }

    // Get user data from database
    try {
      // First check if the profile_photo_url column exists
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

      let query
      if (columns.length > 0) {
        // Column exists, include it in the query
        query = `
          SELECT id, nom, prenom, email, niveau, option, etablissement, 
                 tel, pays, ville, role, profile_photo_url, created_at 
          FROM users 
          WHERE id = ?
        `
      } else {
        // Column doesn't exist, exclude it from the query
        query = `
          SELECT id, nom, prenom, email, niveau, option, etablissement, 
                 tel, pays, ville, role, created_at 
          FROM users 
          WHERE id = ?
        `
      }

      const [users] = await pool.query(query, [decoded.id])

      if (users.length === 0) {
        console.log("User not found in database")
        return res.status(404).json({ message: "Utilisateur non trouvé" })
      }

      // If the column doesn't exist, add a null value for profile_photo_url
      if (columns.length === 0) {
        users[0].profile_photo_url = null
      }

      console.log("User data retrieved successfully")
      return res.status(200).json({ user: users[0] })
    } catch (dbError) {
      console.error("Database error:", dbError)
      return res.status(500).json({
        message: "Erreur de base de données lors de la récupération du profil",
        error: dbError.message,
      })
    }
  } catch (error) {
    console.error("Unexpected error in /api/profile endpoint:", error)
    return res.status(500).json({
      message: "Erreur inattendue lors de la récupération du profil",
      error: error.message,
    })
  }
})

// Update user profile endpoint
app.put("/api/profile/update", async (req, res) => {
  console.log("PUT /api/profile/update endpoint called")

  try {
    // Get token from header
    const token = req.header("x-auth-token")

    if (!token) {
      console.log("No token provided")
      return res.status(401).json({ message: "Accès refusé, token manquant" })
    }

    // Verify token
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
      console.log("Token verified successfully, user ID:", decoded.id)
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError.message)
      return res.status(401).json({ message: "Token invalide ou expiré" })
    }

    const { nom, prenom, niveau, option, etablissement, tel, pays, ville } = req.body
    console.log("Update data received:", req.body)

    // Update user information
    try {
      // First check if the profile_photo_url column exists
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

      // Update user information without referencing profile_photo_url
      const [result] = await pool.query(
        `UPDATE users SET 
          nom = ?,
          prenom = ?,
          niveau = ?,
          option = ?,
          etablissement = ?,
          tel = ?,
          pays = ?,
          ville = ?
        WHERE id = ?`,
        [
          nom || null,
          prenom || null,
          niveau || null,
          option || null,
          etablissement || null,
          tel || null,
          pays || null,
          ville || null,
          decoded.id,
        ],
      )

      console.log("Update result:", result)

      if (result.affectedRows === 0) {
        console.log("No rows affected, user not found")
        return res.status(404).json({ message: "Utilisateur non trouvé" })
      }

      // Get updated user data - adjust query based on column existence
      let query
      if (columns.length > 0) {
        // Column exists, include it in the query
        query = `
          SELECT id, nom, prenom, email, niveau, option, etablissement, 
                 tel, pays, ville, role, profile_photo_url 
          FROM users 
          WHERE id = ?
        `
      } else {
        // Column doesn't exist, exclude it from the query
        query = `
          SELECT id, nom, prenom, email, niveau, option, etablissement, 
                 tel, pays, ville, role
          FROM users 
          WHERE id = ?
        `
      }

      const [users] = await pool.query(query, [decoded.id])

      // If the column doesn't exist, add a null value for profile_photo_url
      if (columns.length === 0) {
        users[0].profile_photo_url = null
      }

      console.log("Profile updated successfully")
      return res.status(200).json({
        message: "Profil mis à jour avec succès",
        user: users[0],
      })
    } catch (dbError) {
      console.error("Database error:", dbError)
      return res.status(500).json({
        message: "Erreur de base de données lors de la mise à jour du profil",
        error: dbError.message,
      })
    }
  } catch (error) {
    console.error("Unexpected error in /api/profile/update endpoint:", error)
    return res.status(500).json({
      message: "Erreur inattendue lors de la mise à jour du profil",
      error: error.message,
    })
  }
})

// Upload profile photo endpoint
app.post("/api/profile/photo", (req, res) => {
  console.log("POST /api/profile/photo endpoint called")

  try {
    // Get token from header
    const token = req.header("x-auth-token")

    if (!token) {
      console.log("No token provided")
      return res.status(401).json({ message: "Accès refusé, token manquant" })
    }

    // Verify token
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
      console.log("Token verified successfully, user ID:", decoded.id)
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError.message)
      return res.status(401).json({ message: "Token invalide ou expiré" })
    }

    // Handle file upload
    const profilePhotoUpload = upload.single("profile_photo")

    profilePhotoUpload(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err)
        return res.status(400).json({
          message: "Erreur lors du téléchargement de la photo",
          error: err.message,
        })
      }

      if (!req.file) {
        console.log("No file uploaded")
        return res.status(400).json({ message: "Aucune photo n'a été téléchargée" })
      }

      try {
        console.log("File uploaded successfully:", req.file)

        // First check if the profile_photo_url column exists
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
          // Column doesn't exist, add it
          console.log("Column 'profile_photo_url' does not exist. Adding it now...")
          await pool.query(`
            ALTER TABLE users 
            ADD COLUMN profile_photo_url VARCHAR(255) NULL
          `)
          console.log("Column 'profile_photo_url' added successfully!")
        }

        // Update user's profile photo URL in the database
        const photoUrl = `/uploads/${req.file.filename}`
        console.log("Setting photo URL to:", photoUrl)

        // First, check if user already has a profile photo to delete the old one
        const [users] = await pool.query("SELECT profile_photo_url FROM users WHERE id = ?", [decoded.id])

        const oldPhotoUrl = users[0]?.profile_photo_url
        console.log("Old photo URL:", oldPhotoUrl)

        // Delete old photo if it exists
        if (oldPhotoUrl) {
          try {
            const fullPath = path.join(__dirname, oldPhotoUrl)
            console.log("Attempting to delete old photo:", fullPath)
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath)
              console.log(`Deleted old profile photo: ${fullPath}`)
            } else {
              console.log("Old photo file not found:", fullPath)
            }
          } catch (fileError) {
            console.error("Error deleting old profile photo:", fileError)
          }
        }

        // Update the user's profile photo URL
        console.log("Updating database with new photo URL for user ID:", decoded.id)
        const [updateResult] = await pool.query("UPDATE users SET profile_photo_url = ? WHERE id = ?", [
          photoUrl,
          decoded.id,
        ])
        console.log("Database updated successfully, rows affected:", updateResult.affectedRows)

        // Get updated user data
        const [updatedUsers] = await pool.query(
          "SELECT id, nom, prenom, email, niveau, option, etablissement, tel, pays, ville, role, profile_photo_url FROM users WHERE id = ?",
          [decoded.id],
        )

        console.log("Returning updated user data")
        return res.status(200).json({
          message: "Photo de profil mise à jour avec succès",
          photoUrl: photoUrl,
          user: updatedUsers[0],
        })
      } catch (dbError) {
        console.error("Database error:", dbError)

        // If there was an error, try to delete the uploaded file
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path)
            console.log("Deleted file after database error:", req.file.path)
          } catch (fileError) {
            console.error("Error deleting file after database error:", fileError)
          }
        }

        return res.status(500).json({
          message: "Erreur de base de données lors de la mise à jour de la photo de profil",
          error: dbError.message,
        })
      }
    })
  } catch (error) {
    console.error("Unexpected error in /api/profile/photo endpoint:", error)
    return res.status(500).json({
      message: "Erreur inattendue lors de la mise à jour de la photo de profil",
      error: error.message,
    })
  }
})

// Delete profile photo endpoint
app.delete("/api/profile/photo", async (req, res) => {
  console.log("DELETE /api/profile/photo endpoint called")

  try {
    // Get token from header
    const token = req.header("x-auth-token")

    if (!token) {
      console.log("No token provided")
      return res.status(401).json({ message: "Accès refusé, token manquant" })
    }

    // Verify token
    let decoded
    try {
      decoded = jwt.verify(token, JWT_SECRET)
      console.log("Token verified successfully, user ID:", decoded.id)
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError.message)
      return res.status(401).json({ message: "Token invalide ou expiré" })
    }

    try {
      // Get the user's current profile photo URL
      const [users] = await pool.query("SELECT profile_photo_url FROM users WHERE id = ?", [decoded.id])

      if (users.length === 0) {
        console.log("User not found")
        return res.status(404).json({ message: "Utilisateur non trouvé" })
      }

      const user = users[0]
      const oldPhotoUrl = user.profile_photo_url

      // Delete the photo file if it exists
      if (oldPhotoUrl) {
        try {
          const fullPath = path.join(__dirname, oldPhotoUrl)
          console.log("Attempting to delete profile photo:", fullPath)

          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath)
            console.log(`Successfully deleted profile photo: ${fullPath}`)
          } else {
            console.log("Profile photo file not found:", fullPath)
          }
        } catch (fileError) {
          console.error("Error deleting profile photo:", fileError)
          // Continue even if file deletion fails
        }
      }

      // Update the user's profile_photo_url to null
      console.log("Setting profile_photo_url to null for user ID:", decoded.id)
      await pool.query("UPDATE users SET profile_photo_url = NULL WHERE id = ?", [decoded.id])

      // Get updated user data
      const [updatedUsers] = await pool.query(
        "SELECT id, nom, prenom, email, niveau, option, etablissement, tel, pays, ville, role, profile_photo_url FROM users WHERE id = ?",
        [decoded.id],
      )

      console.log("Profile photo removed successfully")
      return res.status(200).json({
        message: "Photo de profil supprimée avec succès",
        user: updatedUsers[0],
      })
    } catch (dbError) {
      console.error("Database error:", dbError)
      return res.status(500).json({
        message: "Erreur de base de données lors de la suppression de la photo de profil",
        error: dbError.message,
      })
    }
  } catch (error) {
    console.error("Unexpected error in /api/profile/photo DELETE endpoint:", error)
    return res.status(500).json({
      message: "Erreur inattendue lors de la suppression de la photo de profil",
      error: error.message,
    })
  }
})

// Change password endpoint
app.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id
    const { currentPassword, newPassword } = req.body

    console.log("Password change request received for user ID:", userId)

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

    console.log("Password updated successfully for user ID:", userId)
    res.status(200).json({ message: "Mot de passe mis à jour avec succès" })
  } catch (error) {
    console.error("Error changing password:", error)
    res.status(500).json({ message: "Erreur lors du changement de mot de passe", error: error.message })
  }
})

// Keep these lines as they are
app.use("/api/user-settings", require("./user-settings"))
app.use("/api/users/change-password", require("./change-password"))
app.use("/change-password", require("./change-password"))

// COURSES ENDPOINTS

// Get all courses - accessible to all users
app.get("/api/courses", async (req, res) => {
  try {
    const { sort, order, category } = req.query

    let query = `SELECT c.*, u.nom, u.prenom 
                FROM courses c 
                LEFT JOIN users u ON c.created_by = u.id`

    const queryParams = []

    if (category) {
      query += ` WHERE c.category = ?`
      queryParams.push(category)
    }

    // Add sorting
    if (sort && ["title", "category", "level", "created_at"].includes(sort)) {
      query += ` ORDER BY c.${sort} ${order === "asc" ? "ASC" : "DESC"}`
    } else {
      query += ` ORDER BY c.created_at DESC`
    }

    const [courses] = await pool.query(query, queryParams)
    res.status(200).json({ courses })
  } catch (error) {
    console.error("Error fetching courses:", error)
    res.status(500).json({ message: "Erreur lors de la récupération des cours", error: error.message })
  }
})

// Get a single course by ID
app.get("/api/courses/:id", async (req, res) => {
  try {
    const courseId = req.params.id

    const [courses] = await pool.query(
      `SELECT c.*, u.nom, u.prenom 
      FROM courses c 
      LEFT JOIN users u ON c.created_by = u.id 
      WHERE c.id = ?`,
      [courseId],
    )

    if (courses.length === 0) {
      return res.status(404).json({ message: "Cours non trouvé" })
    }

    res.status(200).json({ course: courses[0] })
  } catch (error) {
    console.error("Error fetching course:", error)
    res.status(500).json({ message: "Erreur lors de la récupération du cours", error: error.message })
  }
})

// Create a new course - admin only
app.post("/api/courses", authMiddleware, adminMiddleware, (req, res) => {
  console.log("POST /api/courses - Starting course creation")

  // Handle file upload directly
  const singleUpload = upload.single("course_file")

  singleUpload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err)
      return res.status(400).json({
        message: "Erreur lors du téléchargement du fichier",
        error: err.message,
      })
    }

    console.log("File upload processed, req.file:", req.file)
    console.log("Form data:", req.body)

    let connection = null

    try {
      const { title, description, content, image_url, category, level, duration, file_type } = req.body

      if (!title || !description) {
        // If file was uploaded but validation failed, delete it
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path)
            console.log("Deleted file after validation failure:", req.file.path)
          } catch (fileErr) {
            console.error("Error deleting file after validation failure:", fileErr)
          }
        }

        return res.status(400).json({ message: "Le titre et la description sont requis" })
      }

      // Get a connection from the pool
      connection = await pool.getConnection()
      console.log("Database connection acquired")

      // Start transaction
      await connection.beginTransaction()
      console.log("Transaction started")

      // Create course object
      const newCourse = {
        title,
        description,
        content: content || "",
        image_url: image_url || null,
        category: category || null,
        level: level || null,
        duration: duration || null,
        created_by: req.user.id,
      }

      // If a file was uploaded, add file info to the course
      if (req.file) {
        console.log("Processing uploaded file:", req.file.filename)
        // Store the relative path to the file
        newCourse.file_url = `/uploads/${req.file.filename}`
        // Determine file type based on mimetype or form data
        newCourse.file_type = file_type || (req.file.mimetype === "application/pdf" ? "pdf" : "video")
        console.log("File URL set to:", newCourse.file_url)
        console.log("File type set to:", newCourse.file_type)
      }

      console.log("Inserting course into database:", newCourse)
      const [result] = await connection.query("INSERT INTO courses SET ?", [newCourse])
      console.log("Course inserted successfully, ID:", result.insertId)

      // Commit the transaction
      await connection.commit()
      console.log("Transaction committed")
      connection.release()
      connection = null

      // Return the created course with file information
      res.status(201).json({
        message: "Cours créé avec succès !",
        courseId: result.insertId,
        course: {
          ...newCourse,
          id: result.insertId,
          file_url: newCourse.file_url,
          file_type: newCourse.file_type,
        },
      })
    } catch (error) {
      console.error("Error creating course:", error)

      // Rollback the transaction if there was an error
      if (connection) {
        try {
          await connection.rollback()
          console.log("Transaction rolled back")
          connection.release()
        } catch (rollbackError) {
          console.error("Error rolling back transaction:", rollbackError)
        }
      }

      // If there was a file uploaded, try to delete it since the course creation failed
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path)
          console.log("Deleted file after error:", req.file.path)
        } catch (fileError) {
          console.error("Error deleting file:", fileError)
        }
      }

      res.status(500).json({
        message: "Erreur lors de la création du cours",
        error: error.message,
      })
    }
  })
})

// Update a course - admin only
app.put("/api/courses/:id", authMiddleware, adminMiddleware, (req, res) => {
  console.log("PUT /api/courses/:id - Starting course update")
  const courseId = req.params.id

  // Handle file upload directly
  const singleUpload = upload.single("course_file")

  singleUpload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err)
      return res.status(400).json({
        message: "Erreur lors du téléchargement du fichier",
        error: err.message,
      })
    }

    console.log("File upload processed, req.file:", req.file)
    console.log("Form data:", req.body)

    let connection = null

    try {
      const { title, description, content, image_url, category, level, duration, file_type } = req.body

      // Get a connection from the pool
      connection = await pool.getConnection()
      console.log("Database connection acquired")

      // Start transaction
      await connection.beginTransaction()
      console.log("Transaction started")

      // Step 1: Get the current course data
      console.log("Fetching current course data for ID:", courseId)
      const [courses] = await connection.query("SELECT * FROM courses WHERE id = ?", [courseId])

      if (courses.length === 0) {
        console.log("Course not found")

        // If file was uploaded but course not found, delete it
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path)
            console.log("Deleted file after course not found:", req.file.path)
          } catch (fileErr) {
            console.error("Error deleting file after course not found:", fileErr)
          }
        }

        await connection.rollback()
        connection.release()
        return res.status(404).json({ message: "Cours non trouvé" })
      }

      const oldCourse = courses[0]
      console.log(`Course found: ID ${oldCourse.id}, Title: ${oldCourse.title}`)
      console.log("Current file_url:", oldCourse.file_url)
      console.log("Current file_type:", oldCourse.file_type)

      // Step 2: Prepare the updated course data
      const updatedCourse = {
        title: title || oldCourse.title,
        description: description || oldCourse.description,
        content: content || oldCourse.content,
        image_url: image_url || oldCourse.image_url,
        category: category || oldCourse.category,
        level: level || oldCourse.level,
        duration: duration || oldCourse.duration,
      }

      // Step 3: Handle file upload if a new file was provided
      let oldFilePath = null

      if (req.file) {
        console.log("New file uploaded:", req.file.filename)
        updatedCourse.file_url = `/uploads/${req.file.filename}`
        updatedCourse.file_type = file_type || (req.file.mimetype === "application/pdf" ? "pdf" : "video")
        console.log("New file URL:", updatedCourse.file_url)
        console.log("New file type:", updatedCourse.file_type)

        // Save the old file path for deletion after successful update
        if (oldCourse.file_url) {
          oldFilePath = oldCourse.file_url
          console.log("Old file to delete after update:", oldFilePath)
        }
      } else {
        // Keep the existing file information if no new file was uploaded
        updatedCourse.file_url = oldCourse.file_url
        updatedCourse.file_type = oldCourse.file_type
        console.log("Keeping existing file information")
      }

      // Step 4: Update the course in the database
      console.log("Updating course in database:", updatedCourse)
      const [updateResult] = await connection.query("UPDATE courses SET ? WHERE id = ?", [updatedCourse, courseId])

      if (updateResult.affectedRows === 0) {
        console.log("No rows affected by update")

        // If file was uploaded but update failed, delete it
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path)
            console.log("Deleted file after update failure:", req.file.path)
          } catch (fileErr) {
            console.error("Error deleting file after update failure:", fileErr)
          }
        }

        await connection.rollback()
        connection.release()
        return res.status(404).json({ message: "Cours non trouvé ou aucune modification effectuée" })
      }

      console.log(`Course updated in database: ${updateResult.affectedRows} row(s) affected`)

      // Commit the transaction
      await connection.commit()
      console.log("Transaction committed")
      connection.release()
      connection = null

      // Step 5: Delete the old file if a new one was uploaded
      if (oldFilePath && req.file) {
        try {
          const fullPath = path.join(__dirname, oldFilePath)
          console.log(`Attempting to delete old file: ${fullPath}`)

          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath)
            console.log(`Successfully deleted old file: ${fullPath}`)
          } else {
            console.log(`Old file not found: ${fullPath}`)
          }
        } catch (fileError) {
          console.error("Error deleting old file:", fileError)
          // Continue with success response even if file deletion fails
        }
      }

      // Step 6: Send success response with updated course data
      res.status(200).json({
        message: "Cours mis à jour avec succès !",
        course: {
          ...updatedCourse,
          id: Number.parseInt(courseId),
        },
      })
    } catch (error) {
      console.error("Error updating course:", error)

      // Rollback the transaction if there was an error
      if (connection) {
        try {
          await connection.rollback()
          connection.release()
        } catch (rollbackError) {
          console.error("Error rolling back transaction:", rollbackError)
        }
      }

      // If there was a file uploaded, try to delete it since the update failed
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path)
          console.log("Deleted file after error:", req.file.path)
        } catch (fileError) {
          console.error("Error deleting file:", fileError)
        }
      }

      res.status(500).json({
        message: "Erreur lors de la mise à jour du cours",
        error: error.message,
      })
    }
  })
})

// Delete a course - admin only
app.delete("/api/courses/:id", authMiddleware, adminMiddleware, async (req, res) => {
  console.log("DELETE /api/courses/:id - Starting course deletion")
  let connection = null

  try {
    const courseId = req.params.id
    console.log("Course ID to delete:", courseId)

    // Get a connection from the pool
    connection = await pool.getConnection()
    console.log("Database connection acquired")

    // Start transaction
    await connection.beginTransaction()
    console.log("Transaction started")

    // Step 1: Get the course to check if there's a file to delete
    console.log("Fetching course data")
    const [courses] = await connection.query("SELECT * FROM courses WHERE id = ?", [courseId])

    if (courses.length === 0) {
      console.log("Course not found")
      await connection.rollback()
      connection.release()
      return res.status(404).json({ message: "Cours non trouvé" })
    }

    const course = courses[0]
    console.log(`Course found: ID ${course.id}, Title: ${course.title}`)

    // Save file path for deletion after database operation
    let filePath = null
    if (course.file_url) {
      filePath = course.file_url
      console.log("File to delete:", filePath)
    }

    // Step 2: Delete the course from the database
    console.log("Deleting course from database")
    const [deleteResult] = await connection.query("DELETE FROM courses WHERE id = ?", [courseId])

    if (deleteResult.affectedRows === 0) {
      console.log("No rows affected by delete")
      await connection.rollback()
      connection.release()
      return res.status(404).json({ message: "Cours non trouvé ou déjà supprimé" })
    }

    console.log(`Course deleted from database: ${deleteResult.affectedRows} row(s) affected`)

    // Commit the transaction
    await connection.commit()
    console.log("Transaction committed")
    connection.release()
    connection = null

    // Step 3: Delete the associated file if it exists
    if (filePath) {
      try {
        const fullPath = path.join(__dirname, filePath)
        console.log(`Attempting to delete file: ${fullPath}`)

        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath)
          console.log(`Successfully deleted file: ${fullPath}`)
        } else {
          console.log(`File not found: ${fullPath}`)
        }
      } catch (fileError) {
        console.error("Error deleting file:", fileError)
        // Continue with success response even if file deletion fails
      }
    }

    // Step 4: Send success response
    res.status(200).json({
      message: "Cours supprimé avec succès !",
    })
  } catch (error) {
    console.error("Error deleting course:", error)

    // Rollback the transaction if there was an error
    if (connection) {
      try {
        await connection.rollback()
        connection.release()
      } catch (rollbackError) {
        console.error("Error rolling back transaction:", rollbackError)
      }
    }

    res.status(500).json({
      message: "Erreur lors de la suppression du cours",
      error: error.message,
    })
  }
})

// ANNOUNCEMENTS ENDPOINTS

// GET all announcements
app.get("/api/announcements", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, 
             u.nom as admin_nom, 
             u.prenom as admin_prenom,
             a.teacher_name
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      ORDER BY a.created_at DESC
    `)

    res.json({ announcements: rows })
  } catch (error) {
    console.error("Error fetching announcements:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// GET single announcement
app.get("/api/announcements/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT a.*, 
             u.nom as admin_nom, 
             u.prenom as admin_prenom,
             c.title as course_title,
             c.description as course_description,
             c.image_url as course_image_url,
             a.teacher_name
      FROM announcements a
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN courses c ON a.course_id = c.id
      WHERE a.id = ?
    `,
      [req.params.id],
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: "Announcement not found" })
    }

    res.json({ announcement: rows[0] })
  } catch (error) {
    console.error("Error fetching announcement:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// POST new announcement with file upload support
app.post("/api/announcements", authMiddleware, (req, res) => {
  console.log("POST /api/announcements - Starting announcement creation")

  // Handle file upload for teacher image
  const teacherImageUpload = upload.single("teacher_image")

  teacherImageUpload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err)
      return res.status(400).json({
        message: "Erreur lors du téléchargement de l'image",
        error: err.message,
      })
    }

    console.log("File upload processed, req.file:", req.file)
    console.log("Form data:", req.body)

    try {
      const { title, description, course_id, teacher_name } = req.body

      // Validate input
      if (!title || !description) {
        // If file was uploaded but validation failed, delete it
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path)
            console.log("Deleted file after validation failure:", req.file.path)
          } catch (fileErr) {
            console.error("Error deleting file after validation failure:", fileErr)
          }
        }
        return res.status(400).json({ message: "Title and description are required" })
      }

      // Get user ID from the authenticated request
      const created_by = req.user.id

      // Construct the new announcement object
      const newAnnouncement = {
        title,
        description,
        course_id: course_id || null,
        created_by,
        teacher_name: teacher_name || null,
        teacher_image_url: null,
      }

      // If a teacher image was uploaded, add the image URL
      if (req.file) {
        console.log("Processing uploaded teacher image:", req.file.filename)
        newAnnouncement.teacher_image_url = `/uploads/${req.file.filename}`
        console.log("Teacher image URL set to:", newAnnouncement.teacher_image_url)
      }

      console.log("Creating announcement with data:", newAnnouncement)

      // Execute the database query
      const [result] = await pool.query("INSERT INTO announcements SET ?", [newAnnouncement])

      console.log("Announcement created successfully, ID:", result.insertId)
      res.status(201).json({
        message: "Announcement created successfully",
        announcementId: result.insertId,
        announcement: {
          ...newAnnouncement,
          id: result.insertId,
        },
      })
    } catch (error) {
      console.error("Error creating announcement:", error)

      // If there was a file uploaded, try to delete it since the creation failed
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path)
          console.log("Deleted file after error:", req.file.path)
        } catch (fileError) {
          console.error("Error deleting file:", fileError)
        }
      }

      res.status(500).json({
        message: "Failed to create announcement",
        error: error.message,
      })
    }
  })
})

// PUT update announcement with file upload support
app.put("/api/announcements/:id", authMiddleware, (req, res) => {
  console.log("PUT /api/announcements/:id - Starting announcement update")
  const announcementId = req.params.id

  // Handle file upload for teacher image
  const teacherImageUpload = upload.single("teacher_image")

  teacherImageUpload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err)
      return res.status(400).json({
        message: "Erreur lors du téléchargement de l'image",
        error: err.message,
      })
    }

    console.log("File upload processed, req.file:", req.file)
    console.log("Form data:", req.body)

    try {
      const { title, description, course_id, is_active, teacher_name } = req.body

      // Validate input
      if (!title || !description) {
        // If file was uploaded but validation failed, delete it
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path)
            console.log("Deleted file after validation failure:", req.file.path)
          } catch (fileErr) {
            console.error("Error deleting file after validation failure:", fileErr)
          }
        }
        return res.status(400).json({ message: "Title and description are required" })
      }

      // Get the current announcement data
      const [announcements] = await pool.query("SELECT * FROM announcements WHERE id = ?", [announcementId])

      if (announcements.length === 0) {
        // If file was uploaded but announcement not found, delete it
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path)
            console.log("Deleted file after announcement not found:", req.file.path)
          } catch (fileErr) {
            console.error("Error deleting file after announcement not found:", fileErr)
          }
        }
        return res.status(404).json({ message: "Announcement not found" })
      }

      const oldAnnouncement = announcements[0]
      console.log(`Announcement found: ID ${oldAnnouncement.id}, Title: ${oldAnnouncement.title}`)

      // Construct the updated announcement object
      const updatedAnnouncement = {
        title,
        description,
        course_id: course_id || null,
        is_active: is_active !== undefined ? is_active : true,
        teacher_name: teacher_name || null,
        teacher_image_url: oldAnnouncement.teacher_image_url, // Keep existing image by default
        updated_at: new Date(),
      }

      // Handle new teacher image upload
      let oldImagePath = null
      if (req.file) {
        console.log("New teacher image uploaded:", req.file.filename)
        updatedAnnouncement.teacher_image_url = `/uploads/${req.file.filename}`
        console.log("New teacher image URL:", updatedAnnouncement.teacher_image_url)

        // Save the old image path for deletion after successful update
        if (oldAnnouncement.teacher_image_url) {
          oldImagePath = oldAnnouncement.teacher_image_url
          console.log("Old image to delete after update:", oldImagePath)
        }
      }

      console.log("Updating announcement with data:", updatedAnnouncement)

      // Execute the database query
      const [result] = await pool.query("UPDATE announcements SET ? WHERE id = ?", [
        updatedAnnouncement,
        announcementId,
      ])

      if (result.affectedRows === 0) {
        // If file was uploaded but update failed, delete it
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path)
            console.log("Deleted file after update failure:", req.file.path)
          } catch (fileErr) {
            console.error("Error deleting file after update failure:", fileErr)
          }
        }
        return res.status(404).json({ message: "Announcement not found" })
      }

      console.log("Announcement updated successfully")

      // Delete the old image if a new one was uploaded
      if (oldImagePath && req.file) {
        try {
          const fullPath = path.join(__dirname, oldImagePath)
          console.log(`Attempting to delete old image: ${fullPath}`)

          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath)
            console.log(`Successfully deleted old image: ${fullPath}`)
          } else {
            console.log(`Old image not found: ${fullPath}`)
          }
        } catch (fileError) {
          console.error("Error deleting old image:", fileError)
          // Continue with success response even if file deletion fails
        }
      }

      res.json({
        message: "Announcement updated successfully",
        announcement: {
          ...updatedAnnouncement,
          id: Number.parseInt(announcementId),
        },
      })
    } catch (error) {
      console.error("Error updating announcement:", error)

      // If there was a file uploaded, try to delete it since the update failed
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path)
          console.log("Deleted file after error:", req.file.path)
        } catch (fileError) {
          console.error("Error deleting file:", fileError)
        }
      }

      res.status(500).json({
        message: "Failed to update announcement",
        error: error.message,
      })
    }
  })
})

// DELETE announcement
app.delete("/api/announcements/:id", authMiddleware, async (req, res) => {
  console.log("DELETE /api/announcements/:id - Starting announcement deletion")

  const announcementId = req.params.id

  pool
    .query("DELETE FROM announcements WHERE id = ?", [announcementId])
    .then((result) => {
      if (result[0].affectedRows === 0) {
        return res.status(404).json({ message: "Announcement not found" })
      }
      console.log("Announcement deleted successfully")
      res.json({ message: "Announcement deleted successfully" })
    })
    .catch((error) => {
      console.error("Error deleting announcement:", error)
      res.status(500).json({ message: "Failed to delete announcement" })
    })
})

// ADMIN ENDPOINTS

// Get all contact messages - admin only
app.get("/api/admin/messages", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("Fetching contact messages for admin")

    const [messages] = await pool.query("SELECT * FROM contact_messages ORDER BY created_at DESC")

    console.log(`Found ${messages.length} contact messages`)

    res.status(200).json({
      message: "Messages récupérés avec succès",
      messages: messages,
    })
  } catch (error) {
    console.error("Error fetching contact messages:", error)
    res.status(500).json({
      message: "Erreur lors de la récupération des messages",
      error: error.message,
    })
  }
})

// Delete a contact message - admin only
app.delete("/api/admin/messages/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const messageId = req.params.id
    console.log("Deleting contact message with ID:", messageId)

    const [result] = await pool.query("DELETE FROM contact_messages WHERE id = ?", [messageId])

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Message non trouvé" })
    }

    console.log("Contact message deleted successfully")
    res.status(200).json({
      message: "Message supprimé avec succès",
    })
  } catch (error) {
    console.error("Error deleting contact message:", error)
    res.status(500).json({
      message: "Erreur lors de la suppression du message",
      error: error.message,
    })
  }
})

// Get all users - admin only
app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("Fetching all users for admin")

    const { sort, order, niveau } = req.query

    let query = `SELECT id, nom, prenom, email, niveau, role, created_at, tel, pays, ville FROM users`
    const queryParams = []

    // Add niveau filter if provided
    if (niveau) {
      query += ` WHERE niveau = ?`
      queryParams.push(niveau)
    }

    // Add sorting
    if (sort && ["nom", "prenom", "email", "niveau", "created_at"].includes(sort)) {
      query += ` ORDER BY ${sort} ${order === "asc" ? "ASC" : "DESC"}`
    } else {
      query += ` ORDER BY created_at DESC`
    }

    const [users] = await pool.query(query, queryParams)

    console.log(`Found ${users.length} users`)

    res.status(200).json({
      message: "Utilisateurs récupérés avec succès",
      users: users,
    })
  } catch (error) {
    console.error("Error fetching users:", error)
    res.status(500).json({
      message: "Erreur lors de la récupération des utilisateurs",
      error: error.message,
    })
  }
})

// Get a specific user by ID (admin only) - NEW ENDPOINT FOR USER DETAILS
app.get("/api/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id
    console.log("Fetching user details for ID:", userId)

    const [users] = await pool.query(
      `SELECT id, nom, prenom, email, niveau, option, etablissement, 
              tel, pays, ville, role, profile_photo_url, created_at, dateNaissance 
       FROM users 
       WHERE id = ?`,
      [userId],
    )

    if (users.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" })
    }

    console.log("User details retrieved successfully")
    res.status(200).json({
      message: "Détails utilisateur récupérés avec succès",
      user: users[0],
    })
  } catch (error) {
    console.error("Error fetching user details:", error)
    res.status(500).json({
      message: "Erreur lors de la récupération des détails utilisateur",
      error: error.message,
    })
  }
})

// Get distinct educational levels - admin only
app.get("/api/admin/distinct-levels", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("Fetching distinct educational levels")

    const [levels] = await pool.query(`
      SELECT DISTINCT niveau 
      FROM users 
      WHERE niveau IS NOT NULL AND niveau != '' 
      ORDER BY niveau ASC
    `)

    const levelsList = levels.map((row) => row.niveau)

    console.log(`Found ${levelsList.length} distinct levels:`, levelsList)

    res.status(200).json({
      message: "Niveaux récupérés avec succès",
      levels: levelsList,
    })
  } catch (error) {
    console.error("Error fetching distinct levels:", error)
    res.status(500).json({
      message: "Erreur lors de la récupération des niveaux",
      error: error.message,
    })
  }
})

// Update user role - admin only
app.put("/api/admin/users/:id/role", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id
    const { role } = req.body

    if (!role || !["student", "admin"].includes(role)) {
      return res.status(400).json({ message: "Rôle invalide" })
    }

    console.log(`Updating user ${userId} role to ${role}`)

    const [result] = await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, userId])

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" })
    }

    console.log("User role updated successfully")
    res.status(200).json({
      message: "Rôle utilisateur mis à jour avec succès",
    })
  } catch (error) {
    console.error("Error updating user role:", error)
    res.status(500).json({
      message: "Erreur lors de la mise à jour du rôle",
      error: error.message,
    })
  }
})

// Delete user - admin only
app.delete("/api/admin/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = req.params.id

    // Prevent admin from deleting themselves
    if (Number.parseInt(userId) === req.user.id) {
      return res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte" })
    }

    console.log("Deleting user with ID:", userId)

    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [userId])

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" })
    }

    console.log("User deleted successfully")
    res.status(200).json({
      message: "Utilisateur supprimé avec succès",
    })
  } catch (error) {
    console.error("Error deleting user:", error)
    res.status(500).json({
      message: "Erreur lors de la suppression de l'utilisateur",
      error: error.message,
    })
  }
})

// Get dashboard statistics - admin only
app.get("/api/admin/stats", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    console.log("Fetching dashboard statistics")

    // Get counts for different entities
    const [userCount] = await pool.query("SELECT COUNT(*) as count FROM users")
    const [courseCount] = await pool.query("SELECT COUNT(*) as count FROM courses")
    const [messageCount] = await pool.query("SELECT COUNT(*) as count FROM contact_messages")
    const [announcementCount] = await pool.query("SELECT COUNT(*) as count FROM announcements")

    // Get recent registrations (last 30 days)
    const [recentUsers] = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
    )

    const stats = {
      totalUsers: userCount[0].count,
      totalCourses: courseCount[0].count,
      totalMessages: messageCount[0].count,
      totalAnnouncements: announcementCount[0].count,
      recentUsers: recentUsers[0].count,
    }

    console.log("Dashboard statistics:", stats)

    res.status(200).json({
      message: "Statistiques récupérées avec succès",
      stats: stats,
    })
  } catch (error) {
    console.error("Error fetching dashboard statistics:", error)
    res.status(500).json({
      message: "Erreur lors de la récupération des statistiques",
      error: error.message,
    })
  }
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})

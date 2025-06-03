const fs = require("fs")
const path = require("path")

// Define the uploads directory path
const uploadsDir = path.join(__dirname, "uploads")

console.log("Checking uploads directory:", uploadsDir)

// Check if the directory exists
if (!fs.existsSync(uploadsDir)) {
  console.log("Uploads directory does not exist. Creating it...")
  try {
    fs.mkdirSync(uploadsDir, { recursive: true })
    console.log("Uploads directory created successfully.")
  } catch (error) {
    console.error("Error creating uploads directory:", error)
    process.exit(1)
  }
} else {
  console.log("Uploads directory already exists.")
}

// Check directory permissions
try {
  // Try to write a test file
  const testFilePath = path.join(uploadsDir, "test-write-permission.txt")
  fs.writeFileSync(testFilePath, "Testing write permissions")
  console.log("Successfully wrote test file. Directory is writable.")

  // Clean up the test file
  fs.unlinkSync(testFilePath)
  console.log("Test file removed.")
} catch (error) {
  console.error("Error testing directory permissions:", error)
  console.log("Please ensure the Node.js process has write permissions to:", uploadsDir)
  process.exit(1)
}

console.log("Setup complete. The uploads directory is ready to use.")

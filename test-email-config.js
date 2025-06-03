const { sendPasswordResetEmail, testEmailConfiguration } = require("./email-service")
require("dotenv").config()

async function testEmailSetup() {
  console.log("🧪 Testing Email Configuration...")
  console.log("=" * 50)

  // Test 1: Check environment variables
  console.log("1. Checking environment variables:")
  console.log("   RESEND_API_KEY:", process.env.RESEND_API_KEY ? "✅ Set" : "❌ Missing")

  if (!process.env.RESEND_API_KEY) {
    console.log("❌ RESEND_API_KEY is not set in environment variables")
    console.log("   Please add RESEND_API_KEY to your .env file")
    return
  }

  // Test 2: Check API key format
  console.log("2. Checking API key format:")
  if (process.env.RESEND_API_KEY.startsWith("re_")) {
    console.log("   ✅ API key format is correct")
  } else {
    console.log("   ❌ API key format is incorrect (should start with 're_')")
    return
  }

  // Test 3: Test email configuration
  console.log("3. Testing email configuration:")
  const configTest = await testEmailConfiguration()
  console.log("   Configuration test:", configTest ? "✅ Passed" : "❌ Failed")

  // Test 4: Send test email
  console.log("4. Sending test email:")
  const testEmail = "test@example.com" // Change this to your email for testing

  try {
    const result = await sendPasswordResetEmail(testEmail, "TEST123456", "Test User")
    console.log("   Email send result:", result.success ? "✅ Success" : "❌ Failed")
    console.log("   Message ID:", result.messageId)
    console.log("   Service:", result.service)

    if (!result.success) {
      console.log("   Error:", result.error)
    }
  } catch (error) {
    console.log("   ❌ Email send failed:", error.message)
  }

  console.log("=" * 50)
  console.log("🏁 Email configuration test completed")
}

// Run the test
testEmailSetup()

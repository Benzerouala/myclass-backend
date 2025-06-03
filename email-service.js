const { Resend } = require("resend")
require("dotenv").config()

// Initialize Resend with API key
const resend = new Resend(process.env.RESEND_API_KEY)

// Fonction pour envoyer un email de récupération de mot de passe
const sendPasswordResetEmail = async (email, resetToken, userName = "") => {
  try {
    console.log("📧 Tentative d'envoi d'email via Resend à:", email)
    console.log("🔑 Token de réinitialisation:", resetToken)

    // Vérifier que la clé API Resend est configurée
    if (!process.env.RESEND_API_KEY) {
      console.error("❌ RESEND_API_KEY manquant")
      throw new Error("RESEND_API_KEY n'est pas configuré dans les variables d'environnement")
    }

    // Vérifier le format de la clé API
    if (!process.env.RESEND_API_KEY.startsWith("re_")) {
      console.error("❌ Format de clé API invalide")
      throw new Error("Format de clé API Resend invalide")
    }

    console.log("✅ Configuration API validée")

    const emailData = {
      from: "MyClass <onboarding@resend.dev>", // Using default Resend domain
      to: [email],
      subject: "Récupération de votre mot de passe - MyClass",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Récupération de mot de passe - MyClass</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background-color: #f8f9fa;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .email-content {
              background-color: white;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              border: 1px solid #e9ecef;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 28px;
              font-weight: bold;
              color: #007bff;
              margin-bottom: 10px;
            }
            .title {
              font-size: 24px;
              color: #495057;
              margin: 0;
            }
            .greeting {
              font-size: 16px;
              margin-bottom: 20px;
              color: #6c757d;
            }
            .code-container {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              border-radius: 12px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
              box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            }
            .code-label {
              color: white;
              font-size: 14px;
              margin-bottom: 10px;
              opacity: 0.9;
            }
            .verification-code {
              font-size: 36px;
              font-weight: bold;
              color: white;
              letter-spacing: 12px;
              font-family: 'Courier New', monospace;
              text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            .instructions {
              background-color: #f8f9fa;
              border-left: 4px solid #007bff;
              padding: 20px;
              margin: 25px 0;
              border-radius: 0 8px 8px 0;
            }
            .instructions h3 {
              margin-top: 0;
              color: #007bff;
              font-size: 18px;
            }
            .instructions ol {
              margin: 15px 0;
              padding-left: 20px;
            }
            .instructions li {
              margin-bottom: 8px;
              color: #495057;
            }
            .warning {
              background-color: #fff3cd;
              border: 1px solid #ffeaa7;
              color: #856404;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
            }
            .warning-title {
              font-weight: bold;
              margin-bottom: 10px;
              display: flex;
              align-items: center;
            }
            .warning ul {
              margin: 10px 0;
              padding-left: 20px;
            }
            .warning li {
              margin-bottom: 5px;
            }
            .footer {
              text-align: center;
              color: #6c757d;
              font-size: 14px;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #dee2e6;
            }
            .footer p {
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="email-content">
              <div class="header">
                <div class="logo">🎓 MyClass</div>
                <h1 class="title">Récupération de mot de passe</h1>
              </div>
              
              <div class="greeting">
                Bonjour ${userName || "Cher utilisateur"},
              </div>
              
              <p>Vous avez demandé la récupération de votre mot de passe pour votre compte MyClass. Nous avons généré un code de vérification sécurisé pour vous.</p>
              
              <div class="code-container">
                <div class="code-label">Votre code de vérification</div>
                <div class="verification-code">${resetToken}</div>
              </div>
              
              <div class="instructions">
                <h3>📋 Instructions</h3>
                <ol>
                  <li>Copiez le code de vérification ci-dessus</li>
                  <li>Retournez sur la page de récupération de mot de passe</li>
                  <li>Collez le code dans le champ de vérification</li>
                  <li>Créez votre nouveau mot de passe sécurisé</li>
                </ol>
              </div>
              
              <div class="warning">
                <div class="warning-title">⚠️ Important - Sécurité</div>
                <ul>
                  <li><strong>Ce code expire dans 1 heure</strong></li>
                  <li>Ne partagez jamais ce code avec personne</li>
                  <li>Si vous n'avez pas demandé cette récupération, ignorez cet email</li>
                  <li>En cas de doute, contactez notre support</li>
                </ul>
              </div>
              
              <p>Si vous avez des questions ou besoin d'aide, n'hésitez pas à nous contacter. Notre équipe est là pour vous aider.</p>
              
              <p style="margin-top: 30px;">
                Cordialement,<br>
                <strong>L'équipe MyClass</strong>
              </p>
              
              <div class="footer">
                <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre directement.</p>
                <p>© 2024 MyClass Platform. Tous droits réservés.</p>
                <p style="font-size: 12px; margin-top: 15px;">
                  Envoyé avec ❤️ par Resend
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Récupération de mot de passe - MyClass
        
        Bonjour ${userName || "Cher utilisateur"},
        
        Vous avez demandé la récupération de votre mot de passe pour votre compte MyClass.
        
        Code de vérification : ${resetToken}
        
        Ce code expire dans 1 heure.
        
        Instructions :
        1. Copiez le code ci-dessus
        2. Retournez sur la page de récupération de mot de passe
        3. Collez le code dans le champ de vérification
        4. Créez votre nouveau mot de passe sécurisé
        
        IMPORTANT :
        - Ce code expire dans 1 heure
        - Ne partagez jamais ce code avec personne
        - Si vous n'avez pas demandé cette récupération, ignorez cet email
        
        Si vous avez des questions, contactez notre support.
        
        Cordialement,
        L'équipe MyClass
        
        © 2024 MyClass Platform. Tous droits réservés.
      `,
    }

    console.log("📤 Envoi de l'email via Resend...")
    console.log("📧 Destinataire:", email)
    console.log("📧 Expéditeur:", emailData.from)

    const result = await resend.emails.send(emailData)

    console.log("📬 Réponse Resend complète:", JSON.stringify(result, null, 2))

    // Vérifier si l'envoi a réussi
    if (result.data && result.data.id) {
      console.log("✅ Email envoyé avec succès via Resend!")
      console.log("📧 ID de l'email:", result.data.id)
      console.log(`📧 Code envoyé à ${email}: ${resetToken}`)

      return {
        success: true,
        messageId: result.data.id,
        service: "resend",
      }
    } else {
      console.error("❌ Échec de l'envoi - Pas d'ID retourné")
      console.error("📬 Réponse:", result)

      return {
        success: false,
        error: "Aucun ID d'email retourné par Resend",
        details: result,
      }
    }
  } catch (error) {
    console.error("❌ Erreur lors de l'envoi de l'email via Resend:", error)

    // Log détaillé de l'erreur
    if (error.response) {
      console.error("📬 Réponse d'erreur Resend:", error.response.data)
      console.error("📬 Status:", error.response.status)
    }

    // Gestion des erreurs spécifiques à Resend
    if (error.message?.includes("API key")) {
      return {
        success: false,
        error: "Clé API Resend invalide ou manquante",
      }
    }

    if (error.message?.includes("rate limit")) {
      return {
        success: false,
        error: "Limite de taux atteinte. Veuillez réessayer plus tard.",
      }
    }

    if (error.message?.includes("Invalid")) {
      return {
        success: false,
        error: "Données d'email invalides",
      }
    }

    return {
      success: false,
      error: error.message || "Erreur inconnue lors de l'envoi de l'email",
      details: error.response?.data || error,
    }
  }
}

// Fonction pour tester la configuration email
const testEmailConfiguration = async () => {
  try {
    console.log("🧪 Test de la configuration Resend...")

    // Vérifier la clé API
    if (!process.env.RESEND_API_KEY) {
      console.error("❌ Variable d'environnement RESEND_API_KEY manquante")
      return false
    }

    // Vérifier le format de la clé API
    if (!process.env.RESEND_API_KEY.startsWith("re_")) {
      console.error("❌ Format de clé API Resend invalide (doit commencer par 're_')")
      return false
    }

    console.log("✅ Configuration Resend valide")
    return true
  } catch (error) {
    console.error("❌ Erreur de configuration Resend:", error.message)
    return false
  }
}

// Fonction pour envoyer un email de test
const sendTestEmail = async (email) => {
  try {
    console.log("🧪 Envoi d'un email de test via Resend...")

    const emailData = {
      from: "MyClass <onboarding@resend.dev>",
      to: [email],
      subject: "Test de configuration - MyClass",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #007bff;">🎉 Test réussi !</h2>
          <p>Félicitations ! Votre configuration Resend fonctionne parfaitement.</p>
          <p>Vous pouvez maintenant envoyer des emails de récupération de mot de passe.</p>
          <hr style="margin: 20px 0;">
          <p style="color: #6c757d; font-size: 14px;">
            Cet email de test a été envoyé depuis MyClass Platform.
          </p>
        </div>
      `,
      text: "Test réussi ! Votre configuration Resend fonctionne parfaitement.",
    }

    const result = await resend.emails.send(emailData)
    console.log("✅ Email de test envoyé avec succès:", result.data?.id)
    return { success: true, messageId: result.data?.id }
  } catch (error) {
    console.error("❌ Erreur lors de l'envoi de l'email de test:", error)
    return { success: false, error: error.message }
  }
}

module.exports = {
  sendPasswordResetEmail,
  testEmailConfiguration,
  sendTestEmail,
}

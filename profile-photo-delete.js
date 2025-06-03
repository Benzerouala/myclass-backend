const express = require("express")
const router = express.Router()
const auth = require("../../middleware/auth")
const User = require("../../models/User")
const fs = require("fs")
const path = require("path")

// @route   DELETE api/profile/photo
// @desc    Delete user profile photo
// @access  Private
router.delete("/", auth, async (req, res) => {
  try {
    // Get user
    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" })
    }

    // If user has a profile photo, delete the file
    if (user.profile_photo_url) {
      const photoPath = path.join(__dirname, "../..", user.profile_photo_url)

      // Check if file exists before attempting to delete
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath)
      }

      // Update user record
      user.profile_photo_url = null
      await user.save()
    }

    res.json({
      message: "Photo de profil supprimée avec succès",
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        profile_photo_url: user.profile_photo_url,
        niveau: user.niveau,
        option: user.option,
        etablissement: user.etablissement,
        tel: user.tel,
        pays: user.pays,
        ville: user.ville,
        region: user.region,
      },
    })
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Erreur serveur")
  }
})

module.exports = router

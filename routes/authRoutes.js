const express = require("express");
const { register, login, refreshToken, logout, self, generic } = require("../controllers/authController");
const { getAllUsers, updateUser, deleteUser } = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireLevel } = require("../middleware/roleMiddleware");
const { upload, imageCompressor } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post("/register", authMiddleware, requireLevel(1), upload.single("signature"), imageCompressor, register);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/logout", authMiddleware, logout);
router.post("/self", authMiddleware, self);
router.get("/users", authMiddleware, requireLevel(1), getAllUsers);
router.put("/update/user/:id", authMiddleware, requireLevel(1), upload.single("signature"), imageCompressor, updateUser);
router.delete("/user/:id", authMiddleware, requireLevel(1), deleteUser);
router.post("/generic", authMiddleware, generic);

module.exports = router;

const express = require("express");
const { register, login, refreshToken, logout, self, generic } = require("../controllers/authController");
const { getAllUsers, updateUser, deleteUser } = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireLevel } = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/register", authMiddleware, requireLevel(1), register);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/logout", authMiddleware, logout);
router.post("/self", authMiddleware, self);
router.get("/users", authMiddleware, requireLevel(1), getAllUsers);
router.put("/update/user/:id", authMiddleware, requireLevel(1), updateUser);
router.delete("/user/:id", authMiddleware, requireLevel(1), deleteUser);
router.post("/generic", authMiddleware, generic);

module.exports = router;

const express = require("express");
const { register, login, refreshToken, logout, self, generic } = require("../controllers/authController");
const {  getAllUsers, updateUser } = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

router.post("/register", adminMiddleware, register);
router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/logout", authMiddleware, logout);
router.post("/self", authMiddleware, self);
router.get("/users", adminMiddleware, getAllUsers);
router.put("/update/user/:id", adminMiddleware, updateUser);
router.post("/generic", authMiddleware, generic);

module.exports = router;

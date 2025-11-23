// routes/expenseRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { getAllExpenses, getExpenseById, createTransferOwner } = require('../controllers/transferOwnerController');

// If you are using middleware for proofPath upload, import it here
// const { upload, imageCompressor } = require('../middleware/uploadMiddleware'); // Example

// Create a new expense
// If using middleware for proof upload:
// router.post('/', upload.single('expenseProof'), imageCompressor, expenseController.createExpense);
// If not using middleware for upload (path is sent in body):
router.post('/', authMiddleware, createTransferOwner);

// Get all expenses (with filters)
router.get('/', authMiddleware, getAllExpenses);

// Get a single expense by ID
router.get('/:id', authMiddleware, getExpenseById);

// You might add PUT/DELETE routes later if needed

module.exports = router;
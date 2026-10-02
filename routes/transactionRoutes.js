const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { requireLevel } = require("../middleware/roleMiddleware");

const {
    getAllTransactions,
    getTransactionById,
    // createTransaction,
    // updateTransaction,
    // deleteTransaction,
    recordPayment,
    deleteTransaction,
    getAllCharges,
    deleteCharge
} = require('../controllers/transactionController');

router.get('/', authMiddleware, getAllTransactions);
router.get('/:id', authMiddleware, getTransactionById);
// router.post('/', authMiddleware, createTransaction);
// router.put('/:id', authMiddleware, updateTransaction);
// router.delete('/:id', authMiddleware, deleteTransaction);

// Record a new payment transaction (confirm payment) — Pemilik/Admin only
router.post('/', authMiddleware, requireLevel(1), recordPayment);
router.delete('/:id', authMiddleware, deleteTransaction);
router.post('/charges/', authMiddleware,  getAllCharges);
router.post('/remCharge/', authMiddleware,  deleteCharge);



module.exports = router;
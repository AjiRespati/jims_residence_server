const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getAllTransactions,
    getTransactionById,
    // createTransaction,
    // updateTransaction,
    // deleteTransaction,
    recordPayment
} = require('../controllers/transactionController');

router.get('/', authMiddleware, getAllTransactions);
router.get('/:id', authMiddleware, getTransactionById);
// router.post('/', authMiddleware, createTransaction);
// router.put('/:id', authMiddleware, updateTransaction);
// router.delete('/:id', authMiddleware, deleteTransaction);

// Record a new payment transaction
// If using middleware for proof upload:
// router.post('/', upload.single('paymentProof'), imageCompressor, transactionController.recordPayment);
// If not using middleware for upload (path is sent in body):
router.post('/', authMiddleware, recordPayment);



module.exports = router;
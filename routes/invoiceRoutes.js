const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
    deleteInvoice, getAllInvoices, getInvoiceById, updateInvoice, createInvoice
} = require('../controllers/invoiceController');


router.post('/', authMiddleware, createInvoice);
router.get('/', authMiddleware, getAllInvoices);
router.get('/:id', authMiddleware, getInvoiceById);
router.put('/:id', authMiddleware, updateInvoice); // Or PATCH
router.delete('/:id', authMiddleware, authMiddleware, deleteInvoice);

module.exports = router;
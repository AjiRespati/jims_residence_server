const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getAllPrices,
    getPriceById,
    createPrice, updatePrice,
    deletePrice,
} = require('../controllers/priceController');

router.get('/', authMiddleware, getAllPrices);
router.get('/:id', authMiddleware, getPriceById);
router.post('/', authMiddleware, createPrice);
router.put('/:id', authMiddleware, updatePrice);
router.delete('/:id', authMiddleware, deletePrice);

module.exports = router;
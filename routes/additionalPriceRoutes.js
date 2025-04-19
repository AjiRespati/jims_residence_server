const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getAllAdditionalPrices,
    getAdditionalPriceById,
    createAdditionalPrice,
    updateAdditionalPrice,
    deleteAdditionalPrice
} = require('../controllers/additionalPriceController');

router.get('/', authMiddleware, getAllAdditionalPrices);
router.get('/:id', authMiddleware, getAdditionalPriceById);
router.post('/', authMiddleware, createAdditionalPrice);
router.put('/:id', authMiddleware, updateAdditionalPrice);
router.delete('/:id', authMiddleware, deleteAdditionalPrice);

module.exports = router;
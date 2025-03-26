const express = require('express');
const router = express.Router();
const {
    getAllAdditionalPrices,
    getAdditionalPriceById,
    createAdditionalPrice,
    updateAdditionalPrice,
    deleteAdditionalPrice
} = require('../controllers/additionalPriceController');

router.get('/', getAllAdditionalPrices);
router.get('/:id', getAdditionalPriceById);
router.post('/', createAdditionalPrice);
router.put('/:id', updateAdditionalPrice);
router.delete('/:id', deleteAdditionalPrice);

module.exports = router;
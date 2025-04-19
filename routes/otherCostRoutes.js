const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getAllOtherCosts,
    getOtherCostById,
    createOtherCost,
    updateOtherCost,
    deleteOtherCost
} = require('../controllers/otherCostController');

router.get('/', authMiddleware, getAllOtherCosts);
router.get('/:id', authMiddleware, getOtherCostById);
router.post('/', authMiddleware, createOtherCost);
router.put('/:id', authMiddleware, updateOtherCost);
router.delete('/:id', authMiddleware, deleteOtherCost);

module.exports = router;
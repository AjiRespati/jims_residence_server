const express = require('express');
const router = express.Router();
const {
    getAllOtherCosts,
    getOtherCostById,
    createOtherCost,
    updateOtherCost,
    deleteOtherCost
} = require('../controllers/otherCostController');

router.get('/', getAllOtherCosts);
router.get('/:id', getOtherCostById);
router.post('/', createOtherCost);
router.put('/:id', updateOtherCost);
router.delete('/:id', deleteOtherCost);

module.exports = router;
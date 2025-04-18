const express = require('express');
const router = express.Router();
const {
    getAllRoomPrices,
    getRoomPriceById,
    createRoomPrice,
    updateRoomPrice,
    deleteRoomPrice
} = require('../controllers/roomPriceController');

router.get('/', getAllRoomPrices);
router.get('/:id', getRoomPriceById);
router.post('/', createRoomPrice);
router.put('/:id', updateRoomPrice);
router.delete('/:id', deleteRoomPrice);

module.exports = router;
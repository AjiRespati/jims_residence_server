const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getAllRoomPrices,
    getRoomPriceById,
    createRoomPrice,
    updateRoomPrice,
    deleteRoomPrice
} = require('../controllers/roomPriceController');

router.get('/', authMiddleware, getAllRoomPrices);
router.get('/:id', authMiddleware, getRoomPriceById);
router.post('/', authMiddleware, createRoomPrice);
router.put('/:id', authMiddleware, updateRoomPrice);
router.delete('/:id', authMiddleware, deleteRoomPrice);

module.exports = router;
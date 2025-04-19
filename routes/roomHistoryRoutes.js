const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getAllRoomHistorys,
    getRoomHistoryById,
    createRoomHistory,
    updateRoomHistory,
    deleteRoomHistory
} = require('../controllers/roomHistoryController');

router.get('/', authMiddleware, getAllRoomHistorys);
router.get('/:id', authMiddleware, getRoomHistoryById);
router.post('/', authMiddleware, createRoomHistory);
router.put('/:id', authMiddleware, updateRoomHistory);
router.delete('/:id', authMiddleware, deleteRoomHistory);

module.exports = router;
const express = require('express');
const router = express.Router();
const {
    getAllRoomHistorys,
    getRoomHistoryById,
    createRoomHistory,
    updateRoomHistory,
    deleteRoomHistory
} = require('../controllers/roomHistoryController');

router.get('/', getAllRoomHistorys);
router.get('/:id', getRoomHistoryById);
router.post('/', createRoomHistory);
router.put('/:id', updateRoomHistory);
router.delete('/:id', deleteRoomHistory);

module.exports = router;
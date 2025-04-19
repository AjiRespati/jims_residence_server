const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getAllBoardingHouses,
    getBoardingHouseById,
    createBoardingHouse,
    updateBoardingHouse,
    deleteBoardingHouse
} = require('../controllers/boardingHouseController');

router.get('/', authMiddleware, getAllBoardingHouses);
router.get('/:id', authMiddleware, getBoardingHouseById);
router.post('/', authMiddleware, createBoardingHouse);
router.put('/:id', authMiddleware, updateBoardingHouse);
router.delete('/:id', authMiddleware, deleteBoardingHouse);

module.exports = router;
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

router.get('/', getAllBoardingHouses);
router.get('/:id', getBoardingHouseById);
router.post('/', authMiddleware, createBoardingHouse);
router.put('/:id', authMiddleware, updateBoardingHouse);
router.delete('/:id', authMiddleware, deleteBoardingHouse);

module.exports = router;
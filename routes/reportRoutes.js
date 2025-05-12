// routes/expenseRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { getMonthlyFinancialReport, getFinancialOverview } = require('../controllers/reportController');

// Get monthly financial report
// Example: /reports/monthly-financial?month=5&year=2025&boardingHouseId=some-uuid
router.get('/monthly-financial', authMiddleware, getMonthlyFinancialReport);
router.get('/financial-overview', authMiddleware, getFinancialOverview);

module.exports = router;
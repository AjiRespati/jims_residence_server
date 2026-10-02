// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const { requireLevel } = require("../middleware/roleMiddleware");
const { getMonthlyFinancialReport, getFinancialOverview, getFinancialTransactions } = require('../controllers/reportController');

// Reports are Pemilik (1) / Admin (2) only; financial-transactions (ledger) is scoped for all.
router.get('/monthly-financial', authMiddleware, requireLevel(1), getMonthlyFinancialReport);
router.get('/financial-overview', authMiddleware, requireLevel(1), getFinancialOverview);
router.get('/financial-transactions', authMiddleware, getFinancialTransactions);

module.exports = router;

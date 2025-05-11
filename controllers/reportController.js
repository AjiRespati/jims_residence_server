const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

const { Invoice, Expense, BoardingHouse } = require('../models');


// Method to generate a monthly financial report
exports.getMonthlyFinancialReport = async (req, res) => {
    try {
        // Extract filter parameters from query string
        const { month, year, boardingHouseId } = req.query;

        // Validate month and year
        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Month and year are required query parameters.',
                data: null
            });
        }

        const monthInt = parseInt(month, 10);
        const yearInt = parseInt(year, 10);

        if (isNaN(monthInt) || monthInt < 1 || monthInt > 12 || isNaN(yearInt)) {
             return res.status(400).json({
                 success: false,
                 message: 'Invalid month or year format. Month must be 1-12, Year must be a number.',
                 data: null
             });
        }

        // Calculate the date range for the specified month
        const startDate = new Date(yearInt, monthInt - 1, 1); // Month is 0-indexed in Date constructor
        const endDate = new Date(yearInt, monthInt, 0); // Day 0 of the next month is the last day of the current month
        endDate.setHours(23, 59, 59, 999); // Include the entire end day

        // Prepare the where clause for filtering by BoardingHouse if provided
        const boardingHouseWhere = {};
        if (boardingHouseId) {
            boardingHouseWhere.id = boardingHouseId;
        }

        // --- Calculate Total Income from Tenant Billing ---
        // We'll sum the totalAmountPaid for invoices issued within the specified month.
        // This represents income received related to bills generated in that month.
        // If you need income received *during* the month regardless of invoice date,
        // you would sum Transaction amounts where transactionDate is in the range.
        // Summing totalAmountPaid on invoices issued in the month is a common report type.

        const incomeQueryOptions = {
            attributes: [
                [sequelize.fn('SUM', sequelize.col('totalAmountPaid')), 'totalMonthlyIncome']
            ],
            where: {
                issueDate: { // Filter invoices by issue date within the month
                    [Op.between]: [startDate, endDate]
                },
                 // Optional: Only sum income for invoices not in 'Draft' or 'Void' status?
                 // status: { [Op.notIn]: ['Draft', 'Void'] }
            },
            include: [] // Include BoardingHouse for filtering
        };

        // Add BoardingHouse filter to income query if applied
        if (boardingHouseId) {
             incomeQueryOptions.include.push({
                 model: BoardingHouse,
                 attributes: [], // Don't need BH attributes in the result
                 where: boardingHouseWhere, // Apply the BH filter
                 required: true // Require BoardingHouse association when filtering
             });
             // If filtering by BH, also filter the main Invoice query by roomId linked to that BH
             // This is more explicit and might be needed if invoices can exist without rooms but with tenants
             // incomeQueryOptions.where.roomId = {
             //      [Op.in]: sequelize.literal(`(SELECT id FROM "Rooms" WHERE "boardingHouseId" = '${boardingHouseId}')`)
             // };
             // Or more simply, rely on the required include filtering:
             // The required include ensures only invoices linked to rooms in the BH are considered.
        }


        const totalIncomeResult = await Invoice.findOne(incomeQueryOptions);


        // --- Calculate Total Expenses ---
        // Sum the amount of Expense records where expenseDate falls within the specified month.

        const expenseQueryOptions = {
             attributes: [
                 [sequelize.fn('SUM', sequelize.col('amount')), 'totalMonthlyExpenses']
             ],
             where: {
                 expenseDate: { // Filter expenses by expense date within the month
                     [Op.between]: [startDate, endDate]
                 }
             },
             include: [] // Include BoardingHouse for filtering
        };

        // Add BoardingHouse filter to expense query if applied
        if (boardingHouseId) {
             expenseQueryOptions.include.push({
                 model: BoardingHouse,
                 attributes: [], // Don't need BH attributes in the result
                 where: boardingHouseWhere, // Apply the BH filter
                 required: true // Require BoardingHouse association when filtering
             });
             // The required include ensures only expenses linked to the BH are considered.
        }

        const totalExpenseResult = await Expense.findOne(expenseQueryOptions);


        // Extract the results (SUM returns null if no records match)
        const totalMonthlyIncome = totalIncomeResult ? totalIncomeResult.get('totalMonthlyIncome') || 0 : 0;
        const totalMonthlyExpenses = totalExpenseResult ? totalExpenseResult.get('totalMonthlyExpenses') || 0 : 0;

        // Prepare the response data
        const reportData = {
            month: monthInt,
            year: yearInt,
            boardingHouseId: boardingHouseId || 'All',
            totalMonthlyIncome: parseFloat(totalMonthlyIncome), // Ensure it's a number
            totalMonthlyExpenses: parseFloat(totalMonthlyExpenses), // Ensure it's a number
            netProfitLoss: parseFloat(totalMonthlyIncome) - parseFloat(totalMonthlyExpenses) // Calculate net
        };

        res.status(200).json({
            success: true,
            message: `Monthly financial report for ${monthInt}/${yearInt}${boardingHouseId ? ` for Boarding House ID: ${boardingHouseId}` : ''} generated successfully`,
            data: reportData
        });

    } catch (error) {
        logger.error(`❌ getMonthlyFinancialReport error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

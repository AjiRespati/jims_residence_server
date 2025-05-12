const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

const { Invoice, Expense, BoardingHouse, Tenant, Room, Charge, Transaction} = require('../models');


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

// Method to get a financial overview including filtered invoices and expenses
exports.getFinancialOverview = async (req, res) => {
    try {
        // Extract filter parameters from query string
        const { boardingHouseId, dateFrom, dateTo } = req.query;

        // --- Prepare Date Filter ---
        const dateWhere = {};
        let isDateFilterApplied = false;

        if (dateFrom && dateTo) {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);

            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                 // Adjust toDate to include the entire end day
                toDate.setHours(23, 59, 59, 999);

                dateWhere[Op.between] = [fromDate, toDate];
                isDateFilterApplied = true;
            } else {
                 // Handle invalid date formats
                 return res.status(400).json({
                     success: false,
                     message: 'Invalid date format for dateFrom or dateTo. Use YYYY-MM-DD.',
                     data: null
                 });
            }
        } else if (dateFrom) {
             // Handle only dateFrom provided
             const fromDate = new Date(dateFrom);
             if (!isNaN(fromDate.getTime())) {
                 dateWhere[Op.gte] = fromDate;
                 isDateFilterApplied = true;
             } else {
                 return res.status(400).json({
                     success: false,
                     message: 'Invalid date format for dateFrom. Use YYYY-MM-DD.',
                     data: null
                 });
             }
        } else if (dateTo) {
             // Handle only dateTo provided
             const toDate = new Date(dateTo);
             if (!isNaN(toDate.getTime())) {
                 toDate.setHours(23, 59, 59, 999); // Include the entire end day
                 dateWhere[Op.lte] = toDate;
                 isDateFilterApplied = true;
             } else {
                 return res.status(400).json({
                     success: false,
                     message: 'Invalid date format for dateTo. Use YYYY-MM-DD.',
                     data: null
                 });
             }
        }

        // --- Prepare Boarding House Filter for Includes ---
        const boardingHouseWhere = {};
        let isBoardingHouseFilterApplied = false;

        if (boardingHouseId) {
            boardingHouseWhere.id = boardingHouseId;
            isBoardingHouseFilterApplied = true;
        }

        // Define the BoardingHouse include configuration for filtering
        const boardingHouseIncludeConfig = {
            model: BoardingHouse,
            attributes: ['id', 'name'], // Include basic BH attributes
            where: boardingHouseWhere, // Apply where clause directly here
            required: isBoardingHouseFilterApplied // Require BoardingHouse if filtering by it
        };


        // --- Fetch Filtered Invoices ---
        // Filter invoices by issueDate and optionally by BoardingHouse via Room include
        const invoiceWhere = { ...dateWhere }; // Apply date filter to invoices issueDate
        // Note: BoardingHouse filter for Invoices is applied via the Room -> BoardingHouse include's 'where' and 'required'


        const invoices = await Invoice.findAll({
            where: invoiceWhere, // Apply date filter
            attributes: [ // Select relevant Invoice attributes
                'id', 'periodStart', 'periodEnd', 'issueDate', 'dueDate',
                'totalAmountDue', 'totalAmountPaid', 'status', 'description',
                'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                // Include Room -> BoardingHouse for filtering
                {
                    model: Room,
                    attributes: ['id', 'roomNumber'], // Include some room info
                    include: [boardingHouseIncludeConfig], // Nested BH include for filtering
                    required: isBoardingHouseFilterApplied // Require Room if filtering by BH
                },
                // Include other relevant Invoice associations for detail
                { model: Tenant, attributes: ['id', 'name', 'phone'], required: false },
                { model: Charge, as: 'Charges', attributes: ['id', 'name', 'amount', 'transactionType'], required: false },
                { model: Transaction, as: 'Transactions', attributes: ['id', 'amount', 'transactionDate', 'method'], required: false }
            ],
            order: [['issueDate', 'DESC']] // Default order
        });


        // --- Fetch Filtered Expenses ---
        // Filter expenses by expenseDate and optionally by BoardingHouse directly
        const expenseWhere = { ...dateWhere }; // Apply date filter to expenses expenseDate

        if (boardingHouseId) {
             expenseWhere.boardingHouseId = boardingHouseId; // 🔥 Apply BH filter directly to Expense model
        }

        const expenses = await Expense.findAll({
            where: expenseWhere, // Apply date and BH filters
            attributes: [ // Select relevant Expense attributes
                'id', 'boardingHouseId', 'category', 'name', 'amount', 'expenseDate',
                'paymentMethod', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: BoardingHouse, attributes: ['id', 'name'], required: false } // Include BH for context (optional join)
            ],
            order: [['expenseDate', 'DESC']] // Default order
        });


        // --- Prepare Response Data ---
        const responseData = {
            filters: {
                boardingHouseId: boardingHouseId || 'All',
                dateFrom: dateFrom || 'Beginning',
                dateTo: dateTo || 'End'
            },
            invoices: invoices, // Array of filtered Invoice objects
            expenses: expenses // Array of filtered Expense objects
        };

        let message = 'Financial overview retrieved successfully';
         if (isBoardingHouseFilterApplied && isDateFilterApplied) {
             message = `Financial overview retrieved successfully for Boarding House ID: ${boardingHouseId} and date range: ${dateFrom} to ${dateTo}`;
         } else if (isBoardingHouseFilterApplied) {
             message = `Financial overview retrieved successfully for Boarding House ID: ${boardingHouseId}`;
         } else if (isDateFilterApplied) {
             message = `Financial overview retrieved successfully for date range: ${dateFrom} to ${dateTo}`;
         }


        res.status(200).json({
            success: true,
            message: message,
            data: responseData
        });

    } catch (error) {
        logger.error(`❌ getFinancialOverview error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

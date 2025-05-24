const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;
const logger = require('../config/logger');

const { Invoice, Expense, BoardingHouse, Tenant, Room,
    Charge, Transaction, OtherCost
} = require('../models');

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

        // Prepare the base date filter for both queries
        const dateFilter = {
            [Op.between]: [startDate, endDate]
        };

        let reportDataList = []; // Initialize the list of report data objects

        // --- Case 1: Filter by a specific Boarding House ---
        if (boardingHouseId) {
            // Validate if the specific boarding house exists
            const boardingHouse = await BoardingHouse.findByPk(boardingHouseId);
            if (!boardingHouse) {
                return res.status(404).json({
                    success: false,
                    message: `Boarding House with ID ${boardingHouseId} not found.`,
                    data: null
                });
            }

            // Calculate Total Income for the specific Boarding House
            const totalIncomeResult = await Invoice.findOne({
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('totalAmountPaid')), 'totalMonthlyIncome']
                ],
                where: {
                    issueDate: dateFilter, // Apply date filter
                },
                include: [
                    {
                        model: Room,
                        attributes: [],
                        required: true, // Require Room
                        include: [
                            {
                                model: BoardingHouse,
                                attributes: [],
                                where: { id: boardingHouseId }, // Filter by specific BH ID
                                required: true // Require BoardingHouse
                            }
                        ]
                    }
                ],
                raw: true // 🔥 Add raw: true here to prevent implicit Invoice.id selection
            });

            // Calculate Total Expenses for the specific Boarding House
            const totalExpenseResult = await Expense.findOne({
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('amount')), 'totalMonthlyExpenses']
                ],
                where: {
                    expenseDate: dateFilter, // Apply date filter
                    boardingHouseId: boardingHouseId // Filter by specific BH ID
                },
                raw: true // 🔥 Add raw: true here to prevent implicit Expense.id selection
            });

            // Extract results (SUM returns null if no records match)
            // Use optional chaining (?.) for safer access to properties on raw results
            const totalMonthlyIncome = totalIncomeResult?.totalMonthlyIncome || 0;
            const totalMonthlyExpenses = totalExpenseResult?.totalMonthlyExpenses || 0;

            // Create a single report data object for this BH and add it to the list
            reportDataList.push({
                boardingHouseId: boardingHouse.id,
                boardingHouseName: boardingHouse.name,
                month: monthInt,
                year: yearInt,
                totalMonthlyIncome: parseFloat(totalMonthlyIncome),
                totalMonthlyExpenses: parseFloat(totalMonthlyExpenses),
                netProfitLoss: parseFloat(totalMonthlyIncome) - parseFloat(totalMonthlyExpenses)
            });

        }
        // --- Case 2: Get Report for ALL Boarding Houses ---
        else {
            // Calculate Total Income grouped by Boarding House
            const incomePerBoardingHouse = await Invoice.findAll({
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('totalAmountPaid')), 'totalMonthlyIncome'],
                    [sequelize.col('Room.BoardingHouse.id'), 'boardingHouseId'], // Get BH ID from nested association
                    [sequelize.col('Room.BoardingHouse.name'), 'boardingHouseName'] // Get BH Name from nested association
                ],
                where: {
                    issueDate: dateFilter, // Apply date filter
                },
                include: [
                    {
                        model: Room,
                        attributes: [],
                        required: true, // Require Room to join to BoardingHouse
                        include: [
                            {
                                model: BoardingHouse,
                                attributes: [], // Don't need BH attributes in the result, just for joining/grouping
                                required: true // Require BoardingHouse
                            }
                        ]
                    }
                ],
                group: ['Room.BoardingHouse.id', 'Room.BoardingHouse.name'], // Group by BH ID and Name
                raw: true // Return raw data for easier mapping
            });

            // Calculate Total Expenses grouped by Boarding House
            const expensesPerBoardingHouse = await Expense.findAll({
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('amount')), 'totalMonthlyExpenses'],
                    'boardingHouseId' // Group by BH ID directly
                ],
                where: {
                    expenseDate: dateFilter, // Apply date filter
                },
                group: ['Expense.boardingHouseId'], // Group by BH ID
                raw: true // Return raw data for easier mapping
            });

            // Map and merge income and expense results by boardingHouseId
            const expenseMap = expensesPerBoardingHouse.reduce((map, expense) => {
                map[expense.boardingHouseId] = parseFloat(expense.totalMonthlyExpenses) || 0;
                return map;
            }, {});

            reportDataList = incomePerBoardingHouse.map(income => {
                const boardingHouseId = income.boardingHouseId;
                const totalMonthlyIncome = parseFloat(income.totalMonthlyIncome) || 0;
                const totalMonthlyExpenses = expenseMap[boardingHouseId] || 0; // Get expenses for this BH, default to 0

                return {
                    boardingHouseId: boardingHouseId,
                    boardingHouseName: income.boardingHouseName,
                    month: monthInt,
                    year: yearInt,
                    totalMonthlyIncome: totalMonthlyIncome,
                    totalMonthlyExpenses: totalMonthlyExpenses,
                    netProfitLoss: totalMonthlyIncome - totalMonthlyExpenses
                };
            });

            // Optional: Include boarding houses that had expenses but no income in the period
            const allBoardingHouses = await BoardingHouse.findAll({ attributes: ['id', 'name'], raw: true });
            const incomeBoardingHouseIds = new Set(reportDataList.map(item => item.boardingHouseId));

            allBoardingHouses.forEach(bh => {
                const totalMonthlyExpenses = expenseMap[bh.id] || 0;
                // Only add if it had expenses but no income record in the incomePerBoardingHouse result
                if (!incomeBoardingHouseIds.has(bh.id) && totalMonthlyExpenses > 0) {
                    reportDataList.push({
                        boardingHouseId: bh.id,
                        boardingHouseName: bh.name,
                        month: monthInt,
                        year: yearInt,
                        totalMonthlyIncome: 0, // No income for this BH in this period
                        totalMonthlyExpenses: totalMonthlyExpenses,
                        netProfitLoss: -totalMonthlyExpenses
                    });
                }
                // Optional: Include boarding houses with 0 income and 0 expense if desired
                // else if (!incomeBoardingHouseIds.has(bh.id) && totalMonthlyExpenses === 0) {
                //      reportDataList.push({
                //         boardingHouseId: bh.id,
                //         boardingHouseName: bh.name,
                //         month: monthInt,
                //         year: yearInt,
                //         totalMonthlyIncome: 0,
                //         totalMonthlyExpenses: 0,
                //         netProfitLoss: 0
                //      });
                // }
            });

            // Sort the list by Boarding House Name or ID if desired
            reportDataList.sort((a, b) => a.boardingHouseName.localeCompare(b.boardingHouseName));

        }


        res.status(200).json({
            success: true,
            message: boardingHouseId ?
                `Monthly financial report for Boarding House ID: ${boardingHouseId} for ${monthInt}/${yearInt} generated successfully` :
                `Monthly financial report for all boarding houses for ${monthInt}/${yearInt} generated successfully`,
            data: reportDataList // Return the list of report data objects
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

        // --- Prepare Date Filter Conditions ---
        const dateConditions = {}; // Object to hold date conditions using Op operators
        let isDateFilterApplied = false;

        if (dateFrom && dateTo) {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);

            if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
                // Adjust toDate to include the entire end day
                toDate.setHours(23, 59, 59, 999);

                dateConditions[Op.between] = [fromDate, toDate];
                isDateFilterApplied = true;
            } else {
                // Handle invalid date formats
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateFrom or dateTo. UseYYYY-MM-DD.',
                    data: null
                });
            }
        } else if (dateFrom) {
            // Handle only dateFrom provided
            const fromDate = new Date(dateFrom);
            if (!isNaN(fromDate.getTime())) {
                dateConditions[Op.gte] = fromDate;
                isDateFilterApplied = true;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateFrom. UseYYYY-MM-DD.',
                    data: null
                });
            }
        } else if (dateTo) {
            // Handle only dateTo provided
            const toDate = new Date(dateTo);
            if (!isNaN(toDate.getTime())) {
                toDate.setHours(23, 59, 59, 999); // Include the entire end day
                dateConditions[Op.lte] = toDate;
                isDateFilterApplied = true;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for dateTo. UseYYYY-MM-DD.',
                    data: null
                });
            }
        }

        // --- Prepare Boarding House Filter Conditions ---
        const boardingHouseConditions = {}; // Object to hold BH ID condition
        if (boardingHouseId) {
            boardingHouseConditions.id = boardingHouseId;
        }
        let isBoardingHouseFilterApplied = Object.keys(boardingHouseConditions).length > 0;


        // --- Fetch Filtered Invoices ---
        // Filter invoices by issueDate and optionally by BoardingHouse via Room include
        const invoiceWhere = isDateFilterApplied ? { issueDate: dateConditions } : undefined;

        // The BoardingHouse include where clause only contains BH ID filter or is undefined
        const boardingHouseIncludeWhere = isBoardingHouseFilterApplied ? boardingHouseConditions : undefined;

        // Configure the Room include with nested BoardingHouse include for filtering
        const roomIncludeConfig = {
            model: Room,
            attributes: ['id', 'roomNumber'], // Include some room info
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name'], // Include basic BH attributes
                    where: boardingHouseIncludeWhere, // Apply BH where clause (or undefined)
                    required: isBoardingHouseFilterApplied // Require BoardingHouse if filtering by it
                }
            ],
            required: isBoardingHouseFilterApplied // Require Room if filtering by BH
        };


        const invoices = await Invoice.findAll({
            where: invoiceWhere, // Apply date filter (or undefined if no date filter)
            attributes: [ // Select relevant Invoice attributes
                'id', 'periodStart', 'periodEnd', 'issueDate', 'dueDate',
                'totalAmountDue', 'totalAmountPaid', 'status', 'description',
                'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                // Include the Room -> BoardingHouse path for filtering and nesting
                roomIncludeConfig,
                // Include other relevant Invoice associations for detail (will be nested)
                { model: Tenant, attributes: ['id', 'name', 'phone'], required: false },
                { model: Charge, as: 'Charges', attributes: ['id', 'name', 'amount', 'description', 'transactionType'], required: false }, // Include description for Charges
                { model: Transaction, as: 'Transactions', attributes: ['id', 'amount', 'transactionDate', 'method', 'description', 'transactionProofPath'], required: false } // Include more details for Transactions
            ],
            order: [['issueDate', 'DESC']], // Default order
            // raw: true // Keep raw: true for now
        });


        // --- Fetch Filtered Expenses ---
        // Filter expenses by expenseDate and optionally by BoardingHouse directly
        const expenseWhere = {};
        if (isDateFilterApplied) {
            expenseWhere.expenseDate = dateConditions;
        }
        if (isBoardingHouseFilterApplied) {
            expenseWhere.boardingHouseId = boardingHouseId; // Direct filter on Expense model
        }
        // Use undefined if no filters were applied at all
        const finalExpenseWhere = Object.keys(expenseWhere).length > 0 ? expenseWhere : undefined;


        const expenses = await Expense.findAll({
            where: finalExpenseWhere, // Apply combined filters (or undefined)
            attributes: [ // Select relevant Expense attributes
                'id', 'boardingHouseId', 'category', 'name', 'amount', 'expenseDate',
                'paymentMethod', 'proofPath', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'], required: false } // Include BH for context (optional join)
            ],
            order: [['expenseDate', 'DESC']], // Default order
            // raw: true // Keep raw: true for now
        });


        // --- Calculate Totals ---
        const totalInvoicesPaid = invoices.reduce((sum, invoice) => sum + (invoice.totalAmountPaid || 0), 0);
        const totalExpensesAmount = expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);


        // --- Prepare Response Data ---
        // When raw: false, Sequelize handles the nesting automatically.
        // We convert to JSON explicitly if needed, but Sequelize often does this for res.json()
        const responseData = {
            filters: {
                boardingHouseId: boardingHouseId || 'All',
                dateFrom: dateFrom || 'Beginning',
                dateTo: dateTo || 'End'
            },
            invoices: invoices.map(invoice => invoice.toJSON()), // Convert to plain JSON
            expenses: expenses.map(expense => expense.toJSON()), // Convert to plain JSON
            totalInvoicesPaid: parseFloat(totalInvoicesPaid.toFixed(2)), // Format to 2 decimal places and ensure number
            totalExpensesAmount: parseFloat(totalExpensesAmount.toFixed(2)) // Format to 2 decimal places and ensure number
            // totals: { // 🔥 Add totals here
            //     totalInvoicesPaid: parseFloat(totalInvoicesPaid.toFixed(2)), // Format to 2 decimal places and ensure number
            //     totalExpensesAmount: parseFloat(totalExpensesAmount.toFixed(2)), // Format to 2 decimal places and ensure number
            //     netProfitLoss: parseFloat((totalInvoicesPaid - totalExpensesAmount).toFixed(2)) // Calculate net
            // }
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
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
};

// Method to get a list of financial transactions for table display, sorted by date
exports.getFinancialTransactions = async (req, res) => {
    try {
        logger.info('Fetching financial transactions...');

        // // Define a common set of attributes to select from financial models
        // const commonAttributes = [
        //     'id',
        //     'amount',
        //     'description',
        //     'createdAt', // Use createdAt for sorting by creation date
        //     'updatedAt',
        // ];

        // --- Query Invoices ---
        // Invoices represent amounts due (debits)
        const invoices = await Invoice.findAll({
            attributes: [
                'id',
                'totalAmountDue',
                'description',
                'createdAt', // Use createdAt for sorting by creation date
                'createBy',
                'updatedAt',
                ['periodStart', 'transactionDate'], // Use periodStart as a relevant date for invoices
                [Sequelize.literal("'Invoice'"), 'type'], // Label the source
                [Sequelize.literal("'debit'"), 'transactionType'], // Invoices are typically debits
                'status', // Include invoice status
                'tenantId',
                'roomId',
                'totalAmountPaid' // Include totalAmountPaid for calculating total income
            ],
            include: [
                {
                    model: Tenant,
                    attributes: ['id', 'name'],
                },
                {
                    model: Room,
                    attributes: ['id', 'roomNumber'],
                }
            ],
            where: {
                // You might want to filter invoices based on status if needed, e.g.,
                // status: { [Op.not]: ['Draft', 'Void'] }
            },
            raw: true, // Get raw data for easier processing
            nest: true // Nest included models
        });

        // Map invoice data to a common format
        const formattedInvoices = invoices.map(inv => ({
            id: inv.id,
            date: new Date(inv.createdAt), // Use createdAt for sorting
            transactionDate: inv.transactionDate, // Keep the period start date
            description: inv.description || `Invoice for period ${inv.transactionDate}`,
            amount: inv.totalAmountDue, // Total amount due for the invoice
            type: inv.type,
            transactionType: inv.transactionType,
            createBy: inv.createBy,
            status: inv.status,
            tenant: inv.Tenant ? inv.Tenant.name : 'N/A',
            room: inv.Room ? inv.Room.roomNumber : 'N/A',
            sourceId: inv.id, // Keep the original ID
            sourceModel: 'Invoice', // Keep the original model name
            totalAmountPaid: inv.totalAmountPaid // Include totalAmountPaid for summary calculation
        }));

        // Calculate total invoices paid
        const totalInvoicesPaid = formattedInvoices.reduce((sum, inv) => sum + (inv.totalAmountPaid || 0), 0);


        // // --- Query Other Costs ---
        // // Other costs might be direct debits not tied to a monthly invoice
        // const otherCosts = await OtherCost.findAll({
        //     attributes: [
        //         'id',
        //         'name', // Use name as description
        //         'amount',
        //         'createdAt', // Use createdAt for sorting
        //         'updatedAt',
        //         // 🔥 Changed 'costDate' to 'createdAt' for transactionDate mapping
        //         [Sequelize.literal('("OtherCost"."createdAt")'), 'transactionDate'], // Use createdAt as the relevant date
        //         [Sequelize.literal("'Other Cost'"), 'type'], // Label the source
        //         [Sequelize.literal("'debit'"), 'transactionType'], // Other costs are debits
        //         'status', // Include status
        //         'roomId' // Other costs are linked to rooms
        //     ],
        //     include: [
        //         {
        //             model: Room,
        //             attributes: ['id', 'roomNumber'],
        //             include: [ // Include Tenant through Room association
        //                 {
        //                     model: Tenant,
        //                     attributes: ['id', 'name'],
        //                     required: false // Tenant might not always be associated directly with the Room (e.g., vacant)
        //                 }
        //             ]
        //         }
        //     ],
        //     where: {
        //         // You might want to filter based on status
        //         status: 'active' // Or other relevant statuses
        //     },
        //     raw: true,
        //     nest: true
        // });

        // // Map other cost data to a common format
        // const formattedOtherCosts = otherCosts.map(oc => ({
        //     id: oc.id,
        //     date: new Date(oc.createdAt), // Use createdAt for sorting
        //     transactionDate: oc.transactionDate, // Keep the cost date (now mapped from createdAt)
        //     description: oc.name || oc.description || 'Other Cost',
        //     amount: oc.amount, // Amount (positive for debit)
        //     type: oc.type,
        //     transactionType: oc.transactionType,
        //     status: oc.status,
        //     // Get tenant name from the associated Room's Tenant if available
        //     tenant: (oc.Room && oc.Room.Tenant) ? oc.Room.Tenant.name : 'N/A',
        //     room: oc.Room ? oc.Room.roomNumber : 'N/A',
        //     sourceId: oc.id,
        //     sourceModel: 'OtherCost'
        // }));

        // --- Query Expenses ---
        // Expenses represent costs incurred (credits from a financial perspective, but often displayed as negative or separate)
        const expenses = await Expense.findAll({
            attributes: [
                'id',
                'category', // Use category as part of description or separate column
                'name', // Use name as description
                'amount',
                'createdAt', // Use createdAt for sorting
                'createBy',
                'updatedAt',
                ['expenseDate', 'transactionDate'], // Use expenseDate as the relevant date
                [Sequelize.literal("'Expense'"), 'type'], // Label the source
                [Sequelize.literal("'credit'"), 'transactionType'], // Expenses are credits (outflows)
                // Add status if Expense model has one
                'boardingHouseId' // Link to boarding house
            ],
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name'],
                }
            ],
            where: {
                // You might want to filter based on status if Expense model has one
            },
            raw: true,
            nest: true
        });

        // Map expense data to a common format
        const formattedExpenses = expenses.map(exp => ({
            id: exp.id,
            date: new Date(exp.createdAt), // Use createdAt for sorting
            transactionDate: exp.transactionDate, // Keep the expense date
            description: `${exp.category ? exp.category + ': ' : ''}${exp.name}` || exp.description || 'Expense',
            amount: exp.amount, // Amount (positive for credit/outflow)
            type: exp.type,
            transactionType: exp.transactionType,
            createBy: exp.createBy,
            status: exp.status || 'N/A', // Use status from model if available
            tenant: 'N/A', // Expenses are not typically tied to a single tenant
            room: 'N/A', // Expenses are not typically tied to a single room
            boardingHouse: exp.BoardingHouse ? exp.BoardingHouse.name : 'N/A', // Include Boarding House name
            sourceId: exp.id,
            sourceModel: 'Expense'
        }));

        // Calculate total expenses amount
        const totalExpensesAmount = formattedExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);


        // --- Combine all financial transactions ---
        const allTransactions = [
            ...formattedInvoices,
            // Removed formattedPayments
            // ...formattedOtherCosts,
            ...formattedExpenses
        ];

        // --- Sort the combined list by the 'date' field (createdAt) ---
        allTransactions.sort((a, b) => b.date.getTime() - a.date.getTime()); // Sort descending by date

        logger.info(`Successfully fetched and formatted ${allTransactions.length} financial transactions.`);

        // Include summary totals in the response
        res.status(200).json({
            message: 'Financial transactions and summary retrieved successfully',
            data: allTransactions,
            summary: {
                totalInvoicesPaid: totalInvoicesPaid,
                totalExpensesAmount: totalExpensesAmount,
                // You might add net income here if needed (totalInvoicesPaid - totalExpensesAmount)
            }
        });

    } catch (error) {
        logger.error(`❌ Error fetching financial transactions: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
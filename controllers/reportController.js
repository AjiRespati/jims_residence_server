const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;
const logger = require('../config/logger');

const { Invoice, Expense, BoardingHouse, Tenant, Room, Charge, Transaction
} = require('../models');

const { isValid, parseISO, setHours, setMinutes, setSeconds, setMilliseconds, format } = require('date-fns'); // Import date-fns utilities



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

        // Prepare the base date filter for Transaction.transactionDate and Expense.expenseDate
        const dateFilter = {
            [Op.between]: [startDate, endDate]
        };

        let reportDataList = []; // Initialize the list of report data objects

        // --- Prepare Boarding House Filter Conditions ---
        const boardingHouseConditions = {}; // Object to hold BH ID condition
        let isBoardingHouseFilterApplied = false;
        if (boardingHouseId) {
            boardingHouseConditions.id = boardingHouseId;
            isBoardingHouseFilterApplied = true;
        }

        // --- Fetch Income (from Transactions) ---
        // Base options for Transaction query
        let incomeQueryOptions = {
            attributes: [
                // FIX 1: Change 'Transactions.amount' to just 'amount' as Transaction is the primary model
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalMonthlyIncome'],
            ],
            where: {
                transactionDate: dateFilter // Filter transactions by their date
            },
            include: [
                {
                    model: Invoice,
                    attributes: [],
                    required: true,
                    include: [
                        {
                            model: Room,
                            attributes: [],
                            required: true,
                            include: [
                                {
                                    model: BoardingHouse,
                                    attributes: [],
                                    where: boardingHouseConditions,
                                    required: isBoardingHouseFilterApplied
                                }
                            ]
                        }
                    ]
                }
            ],
            raw: true, // Return raw data
            nest: true // Nest included data for easier access
        };

        if (isBoardingHouseFilterApplied) {
            // For specific BH, group by nothing (implicitly grouped by findOne)
            // Use findOne as we expect one result for the sum
            const totalIncomeResult = await Transaction.findOne(incomeQueryOptions);
            const totalMonthlyIncome = totalIncomeResult?.totalMonthlyIncome || 0;

            // Fetch expenses for the specific Boarding House
            const totalExpenseResult = await Expense.findOne({
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('amount')), 'totalMonthlyExpenses']
                ],
                where: {
                    expenseDate: dateFilter,
                    boardingHouseId: boardingHouseId
                },
                raw: true
            });
            const totalMonthlyExpenses = totalExpenseResult?.totalMonthlyExpenses || 0;

            const boardingHouse = await BoardingHouse.findByPk(boardingHouseId);
            if (!boardingHouse) {
                return res.status(404).json({ success: false, message: `Boarding House with ID ${boardingHouseId} not found.`, data: null });
            }

            reportDataList.push({
                boardingHouseId: boardingHouse.id,
                boardingHouseName: boardingHouse.name,
                month: monthInt,
                year: yearInt,
                totalMonthlyIncome: parseFloat(totalMonthlyIncome),
                totalMonthlyExpenses: parseFloat(totalMonthlyExpenses),
                netProfitLoss: parseFloat(totalMonthlyIncome) - parseFloat(totalMonthlyExpenses)
            });

        } else {
            // --- Get Report for ALL Boarding Houses (Grouped) ---
            // Adjust attributes and group for overall report when not filtering by a specific BH
            // FIX 2: Use '->' for nested column references in attributes for raw queries
            incomeQueryOptions.attributes.push([sequelize.col('Invoice->Room->BoardingHouse.id'), 'boardingHouseId']);
            incomeQueryOptions.attributes.push([sequelize.col('Invoice->Room->BoardingHouse.name'), 'boardingHouseName']);

            // FIX 3: Use '->' for nested column references in group clause for raw queries
            incomeQueryOptions.group = [
                'Invoice->Room->BoardingHouse.id',
                'Invoice->Room->BoardingHouse.name'
            ];

            const incomePerBoardingHouse = await Transaction.findAll(incomeQueryOptions);

            // Calculate Total Expenses grouped by Boarding House
            const expensesPerBoardingHouse = await Expense.findAll({
                attributes: [
                    [sequelize.fn('SUM', sequelize.col('amount')), 'totalMonthlyExpenses'],
                    'boardingHouseId'
                ],
                where: {
                    expenseDate: dateFilter,
                },
                group: ['Expense.boardingHouseId'],
                raw: true
            });

            // Map expenses for easy lookup
            const expenseMap = expensesPerBoardingHouse.reduce((map, expense) => {
                map[expense.boardingHouseId] = parseFloat(expense.totalMonthlyExpenses) || 0;
                return map;
            }, {});

            // Merge income and expense results
            reportDataList = incomePerBoardingHouse.map(income => {
                // FIX: Access boardingHouseId and boardingHouseName directly from the 'income' object
                // because they were aliased to the top level in the attributes selection.
                const bhId = income.boardingHouseId; // Corrected access
                const bhName = income.boardingHouseName; // Corrected access
                const totalMonthlyIncome = parseFloat(income.totalMonthlyIncome) || 0;
                const totalMonthlyExpenses = expenseMap[bhId] || 0;

                return {
                    boardingHouseId: bhId,
                    boardingHouseName: bhName,
                    month: monthInt,
                    year: yearInt,
                    totalMonthlyIncome: totalMonthlyIncome,
                    totalMonthlyExpenses: totalMonthlyExpenses,
                    netProfitLoss: totalMonthlyIncome - totalMonthlyExpenses
                };
            });

            // Add boarding houses that had expenses but no income
            const allBoardingHouses = await BoardingHouse.findAll({ attributes: ['id', 'name'], raw: true });
            const incomeBoardingHouseIds = new Set(reportDataList.map(item => item.boardingHouseId));

            allBoardingHouses.forEach(bh => {
                const totalMonthlyExpenses = expenseMap[bh.id] || 0;
                if (!incomeBoardingHouseIds.has(bh.id) && totalMonthlyExpenses > 0) {
                    reportDataList.push({
                        boardingHouseId: bh.id,
                        boardingHouseName: bh.name,
                        month: monthInt,
                        year: yearInt,
                        totalMonthlyIncome: 0,
                        totalMonthlyExpenses: totalMonthlyExpenses,
                        netProfitLoss: -totalMonthlyExpenses
                    });
                }
            });

            reportDataList.sort((a, b) => a.boardingHouseName.localeCompare(b.boardingHouseName));
        }

        res.status(200).json({
            success: true,
            message: boardingHouseId
                ? `Monthly financial report for Boarding House ID: ${boardingHouseId} for ${monthInt}/${yearInt} generated successfully`
                : `Monthly financial report for all boarding houses for ${monthInt}/${yearInt} generated successfully`,
            data: reportDataList
        });

    } catch (error) {
        logger.error(`❌ getMonthlyFinancialReport error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ success: false, message: error.message, error: 'Internal Server Error' });
    }
};

// Method to get a financial overview including filtered invoices and expenses
exports.getFinancialOverview = async (req, res) => {
    try {
        // Extract filter parameters from query string
        const { boardingHouseId, dateFrom, dateTo } = req.query;

        // --- Prepare Date Filter Conditions for both Invoices (via Transactions) and Expenses ---
        const dateConditions = {}; // Object to hold date conditions using Op operators
        let isDateFilterApplied = false;
        let filterFromDate, filterToDate; // To store parsed and adjusted date objects for messages

        if (dateFrom || dateTo) {
            // Parse and validate dateFrom
            if (dateFrom) {
                filterFromDate = parseISO(dateFrom);
                if (!isValid(filterFromDate)) {
                    return res.status(400).json({ success: false, message: 'Invalid dateFrom format. Please use YYYY-MM-DD.', data: null });
                }
                filterFromDate = setHours(filterFromDate, 0, 0, 0, 0); // Start of the day
            } else {
                filterFromDate = new Date('1900-01-01'); // Effectively no lower bound
            }

            // Parse and validate dateTo
            if (dateTo) {
                filterToDate = parseISO(dateTo);
                if (!isValid(filterToDate)) {
                    return res.status(400).json({ success: false, message: 'Invalid dateTo format. Please use YYYY-MM-DD.', data: null });
                }
                filterToDate = setHours(filterToDate, 23, 59, 59, 999); // End of the day
            } else {
                filterToDate = new Date('2100-12-31'); // Effectively no upper bound
            }

            // Validate that filterFromDate is not after filterToDate
            if (filterFromDate > filterToDate) {
                return res.status(400).json({ success: false, message: 'dateFrom cannot be after dateTo.', data: null });
            }

            dateConditions[Op.between] = [filterFromDate, filterToDate];
            isDateFilterApplied = true;
        }

        // --- Prepare Boarding House Filter Conditions ---
        const boardingHouseConditions = {}; // Object to hold BH ID condition
        if (boardingHouseId) {
            boardingHouseConditions.id = boardingHouseId;
        }
        let isBoardingHouseFilterApplied = Object.keys(boardingHouseConditions).length > 0;


        // --- Fetch Filtered Invoices (filtered by Transaction.transactionDate) ---
        // Invoice where clause will now only filter by status, not date
        const invoiceStatusWhere = {
            // We want 'Paid' and 'PartiallyPaid' invoices if filtering by transaction dates,
            // as these are the ones that have actual transactions.
            // If no date filter, we might want 'Issued', 'Unpaid' too, but for financial overview
            // linked to payments, Paid/PartiallyPaid is more relevant.
            // Adjust this array if other statuses also represent collected money.
            status: { [Op.in]: ['Paid', 'PartiallyPaid'] }
        };

        // Configure the Room include with nested BoardingHouse include for filtering
        const roomIncludeConfig = {
            model: Room,
            attributes: ['id', 'roomNumber'],
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name'],
                    where: boardingHouseConditions, // Apply BH where clause (or empty if no BH filter)
                    required: isBoardingHouseFilterApplied // Require BoardingHouse if filtering by it
                }
            ],
            required: isBoardingHouseFilterApplied // Require Room if filtering by BH
        };

        // Configure the Transaction include for filtering by date
        const transactionIncludeConfig = {
            model: Transaction,
            as: 'Transactions',
            attributes: ['id', 'amount', 'transactionDate', 'method', 'description', 'transactionProofPath'],
            // Apply date filter to transactionDate if date filter is active
            where: isDateFilterApplied ? { transactionDate: dateConditions } : {},
            // If date filter is applied, we *must* have matching transactions, so required: true
            // Otherwise, keep it false to get invoices with no transactions if needed (though not relevant for totalPaid)
            required: isDateFilterApplied // Only require transaction if filtering by its date
        };


        const invoices = await Invoice.findAll({
            where: invoiceStatusWhere, // Apply invoice status filter
            attributes: [
                'id', 'periodStart', 'periodEnd', 'issueDate', 'dueDate',
                'totalAmountDue', 'totalAmountPaid', 'status', 'description',
                'invoicePaymentProofPath', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                roomIncludeConfig,
                { model: Tenant, attributes: ['id', 'name', 'phone'], required: false },
                { model: Charge, as: 'Charges', attributes: ['id', 'name', 'amount', 'description', 'transactionType'], required: false },
                transactionIncludeConfig // Use the configured transaction include
            ],
            order: [['createdAt', 'DESC']], // Default order
        });


        // --- Fetch Filtered Expenses ---
        const expenseWhere = {};
        if (isDateFilterApplied) {
            expenseWhere.expenseDate = dateConditions; // Apply date filter to expenseDate
        }
        if (isBoardingHouseFilterApplied) {
            expenseWhere.boardingHouseId = boardingHouseId; // Direct filter on Expense model
        }

        const expenses = await Expense.findAll({
            where: Object.keys(expenseWhere).length > 0 ? expenseWhere : undefined, // Apply combined filters (or undefined)
            attributes: [
                'id', 'boardingHouseId', 'category', 'name', 'amount', 'expenseDate',
                'paymentMethod', 'proofPath', 'description', 'createBy', 'updateBy', 'createdAt', 'updatedAt'
            ],
            include: [
                { model: BoardingHouse, attributes: ['id', 'name', 'address'], required: false }
            ],
            order: [['expenseDate', 'DESC']], // Default order
        });

        // --- Calculate Totals ---
        // Sum total amount from transactions that matched the filter
        let totalInvoicesPaid = 0;
        invoices.forEach(invoice => {
            if (invoice.Transactions && invoice.Transactions.length > 0) {
                invoice.Transactions.forEach(transaction => {
                    totalInvoicesPaid += parseFloat(transaction.amount || 0);
                });
            }
        });

        const totalExpensesAmount = expenses.reduce((sum, expense) => sum + (parseFloat(expense.amount) || 0), 0);


        // --- Prepare Response Data ---
        const responseData = {
            filters: {
                boardingHouseId: boardingHouseId || 'All',
                dateFrom: isDateFilterApplied ? format(filterFromDate, 'yyyy-MM-dd') : 'Beginning',
                dateTo: isDateFilterApplied ? format(filterToDate, 'yyyy-MM-dd') : 'End'
            },
            invoices: invoices.map(invoice => {
                // Ensure nested objects are JSON for consistent response structure
                const invoiceJSON = invoice.toJSON();
                // If there are transactions and they were filtered, you might want to show only the filtered ones.
                // However, Sequelize's include.where already handles this by default.
                // We're iterating over the `invoice.Transactions` that were included.
                return invoiceJSON;
            }),
            expenses: expenses.map(expense => expense.toJSON()),
            totalInvoicesPaid: parseFloat(totalInvoicesPaid.toFixed(2)),
            totalExpensesAmount: parseFloat(totalExpensesAmount.toFixed(2)),
            netProfitLoss: parseFloat((totalInvoicesPaid - totalExpensesAmount).toFixed(2)),
            // totals: {
            //     totalInvoicesPaid: parseFloat(totalInvoicesPaid.toFixed(2)),
            //     totalExpensesAmount: parseFloat(totalExpensesAmount.toFixed(2)),
            //     netProfitLoss: parseFloat((totalInvoicesPaid - totalExpensesAmount).toFixed(2))
            // }
        };

        let message = 'Financial overview retrieved successfully.';
        if (isBoardingHouseFilterApplied && isDateFilterApplied) {
            message = `Financial overview retrieved successfully for Boarding House ID: ${boardingHouseId} and date range: ${format(filterFromDate, 'yyyy-MM-dd')} to ${format(filterToDate, 'yyyy-MM-dd')}.`;
        } else if (isBoardingHouseFilterApplied) {
            message = `Financial overview retrieved successfully for Boarding House ID: ${boardingHouseId}.`;
        } else if (isDateFilterApplied) {
            message = `Financial overview retrieved successfully for date range: ${format(filterFromDate, 'yyyy-MM-dd')} to ${format(filterToDate, 'yyyy-MM-dd')}.`;
        }


        res.status(200).json({
            success: true,
            message: message,
            data: responseData
        });

    } catch (error) {
        logger.error(`❌ getFinancialOverview error: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ success: false,  message: error.message, error: 'Internal Server Error' });
    }
};

// Method to get a list of financial transactions for table display, sorted by date
exports.getFinancialTransactions = async (req, res) => {
    try {
        logger.info('Fetching financial transactions...');

        const { boardingHouseId, dateFrom, dateTo } = req.query;

        console.log("REQUEST QUERY: ", req.query);
        console.log("BOARDING HOUSE: ", boardingHouseId);

        let dateRangeFilter = {}; // Unified date filter for Transaction.transactionDate and Expense.expenseDate
        let isDateFilterApplied = false;

        if (dateFrom || dateTo) { // Use OR to allow filtering by only one date
            const parsedDateFrom = dateFrom ? parseISO(dateFrom) : null;
            const parsedDateTo = dateTo ? parseISO(dateTo) : null;

            if (dateFrom && (!parsedDateFrom || !isValid(parsedDateFrom))) {
                return res.status(400).json({ success: false, message: 'Invalid dateFrom format. Please use YYYY-MM-DD.', data: null });
            }
            if (dateTo && (!parsedDateTo || !isValid(parsedDateTo))) {
                return res.status(400).json({ success: false, message: 'Invalid dateTo format. Please use YYYY-MM-DD.', data: null });
            }

            let startFilterDate = parsedDateFrom ? setHours(parsedDateFrom, 0, 0, 0, 0) : new Date('1900-01-01');
            let endFilterDate = parsedDateTo ? setHours(parsedDateTo, 23, 59, 59, 999) : new Date('2100-12-31');

            if (startFilterDate > endFilterDate) {
                return res.status(400).json({ success: false, message: 'dateFrom cannot be after dateTo.', data: null });
            }

            dateRangeFilter = {
                [Op.between]: [startFilterDate, endFilterDate]
            };
            isDateFilterApplied = true;
        }

        // --- Prepare Boarding House Filter Conditions for Invoices and Expenses ---
        const boardingHouseWhere = {};
        if (boardingHouseId) {
            boardingHouseWhere.id = boardingHouseId;
        }
        const isBoardingHouseFilterActive = !!boardingHouseId; // Convert to boolean

        // --- Query Transactions (Payments - this is actual income/money received) ---
        // Filter Transactions by their transactionDate and optional BoardingHouse
        const transactions = await Transaction.findAll({
            attributes: [
                'id', 'amount', 'transactionDate', 'method', 'description', 'transactionProofPath',
                'createdAt', 'createBy', 'updatedAt',
                [Sequelize.literal("'Payment'"), 'type'], // Label as 'Payment'
                [Sequelize.literal("'credit'"), 'transactionType'], // Payments are inflows (credits)
            ],
            where: isDateFilterApplied ? { transactionDate: dateRangeFilter } : {}, // Apply date filter to transactionDate
            include: [
                {
                    model: Invoice,
                    attributes: ['id', 'status', 'periodStart', 'periodEnd', 'description', 'invoicePaymentProofPath'], // Get relevant invoice details
                    required: true, // Only get transactions linked to an invoice
                    include: [
                        { model: Tenant, attributes: ['id', 'name'], required: false }, // Include Tenant
                        {
                            model: Room,
                            attributes: ['id', 'roomNumber'], // Include Room
                            required: true, // Require Room
                            include: [
                                {
                                    model: BoardingHouse,
                                    attributes: ['id', 'name'], // Include BoardingHouse name and ID
                                    where: boardingHouseWhere, // Apply BH filter
                                    required: isBoardingHouseFilterActive // Require if BH filter is active
                                }
                            ]
                        }
                    ]
                }
            ],
            order: [['transactionDate', 'DESC']],
            raw: true,
            nest: true // Keep nest: true to flatten includes for easier access
        });

        // Map transaction data (Payments) to a common format
        const formattedPayments = transactions.map(trans => ({
            id: trans.Invoice.id,
            date: new Date(trans.transactionDate), // Use transactionDate as the primary date
            description: trans.description || `Payment for invoice ${trans.Invoice.id} (${format(trans.Invoice.periodStart, 'yyyy-MM-dd')} to ${format(trans.Invoice.periodEnd, 'yyyy-MM-dd')})`,
            amount: parseFloat(trans.amount),
            type: trans.type, // 'Payment'
            transactionType: trans.transactionType, // 'credit'
            transactionDate: trans.transactionDate, // 'credit'
            createBy: trans.createBy,
            status: trans.Invoice.status, // Invoice status for this payment
            tenant: trans.Invoice.Tenant ? trans.Invoice.Tenant.name : 'N/A',
            room: trans.Invoice.Room ? trans.Invoice.Room.roomNumber : 'N/A',
            boardingHouse: trans.Invoice.Room.BoardingHouse ? trans.Invoice.Room.BoardingHouse.name : 'N/A',
            boardingHouseId: trans.Invoice.Room.BoardingHouse ? trans.Invoice.Room.BoardingHouse.id : 'N/A',
            sourceId: trans.Invoice.id, // The ID of the invoice being paid
            sourceModel: 'InvoicePayment', // Clearly indicate this is a payment for an invoice
            invoicePaymentProofPath: trans.Invoice.invoicePaymentProofPath || null, // Add proof path
            totalAmountPaid: parseFloat(trans.amount)
        }));

        // --- Query Expenses (Debits - money outflow) ---
        const expenses = await Expense.findAll({
            attributes: [
                'id', 'category', 'name', 'amount', 'expenseDate', 'createdAt', 'createBy', 'updatedAt',
                'proofPath', // Include proofPath
                [Sequelize.literal("'Expense'"), 'type'], // Label as 'Expense'
                [Sequelize.literal("'debit'"), 'transactionType'], // Expenses are outflows (debits)
                'boardingHouseId'
            ],
            include: [
                {
                    model: BoardingHouse,
                    attributes: ['id', 'name'],
                    where: boardingHouseWhere,
                    required: isBoardingHouseFilterActive
                }
            ],
            where: isDateFilterApplied ? { expenseDate: dateRangeFilter } : {}, // Apply date filter to expenseDate
            order: [['expenseDate', 'DESC']],
            raw: true,
            nest: true
        });

        // Map expense data to a common format
        const formattedExpenses = expenses.map(exp => ({
            id: exp.id,
            date: new Date(exp.expenseDate), // Use expenseDate as the primary date
            description: `${exp.category ? exp.category + ': ' : ''}${exp.name}` || 'Expense',
            amount: parseFloat(exp.amount), // Amount of the expense
            totalAmountPaid: parseFloat(exp.amount), // Show how much of this invoice has been paid
            type: exp.type, // 'Expense'
            transactionType: exp.transactionType, // 'debit'
            transactionDate: new Date(exp.expenseDate),
            createBy: exp.createBy,
            status: 'Recorded', // Default status for an expense
            tenant: 'N/A',
            room: 'N/A',
            boardingHouse: exp.BoardingHouse ? exp.BoardingHouse.name : 'N/A',
            boardingHouseId: exp.BoardingHouse ? exp.BoardingHouse.id : 'N/A',
            sourceId: exp.id,
            sourceModel: 'Expense',
            proofPath: exp.proofPath || null
        }));


        // --- Combine all financial transactions ---
        const allTransactions = [
            ...formattedPayments, // These are payments received (from Transaction table)
            // ...formattedInvoices, // These are invoices issued (from Invoice table)
            ...formattedExpenses // These are expenses incurred (from Expense table)
        ];

        // --- Sort the combined list by the 'date' field (which is transactionDate for payments/expenses, issueDate for invoices) ---
        // allTransactions.sort((a, b) => b.date.getTime() - a.date.getTime()); // Sort descending by date

        logger.info(`Successfully fetched and formatted ${allTransactions.length} financial transactions.`);

        // Calculate summary totals from the formatted lists
        const totalIncomeAmount = formattedPayments.reduce((sum, trans) => sum + (trans.amount || 0), 0);
        const totalExpensesAmount = formattedExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
        // Note: totalAmountDue from invoices is typically not part of a 'net financial flow' calculation
        // for a *cash-based* report, as it's a receivable, not necessarily cash in hand.
        // The net flow should be (Payments - Expenses) for a cash-like view.


        // Include summary totals in the response
        res.status(200).json({
            message: 'Financial transactions and summary retrieved successfully',
            data: allTransactions,
            summary: {
                totalIncomeAmount: parseFloat(totalIncomeAmount.toFixed(2)),
                totalExpensesAmount: parseFloat(totalExpensesAmount.toFixed(2)),
                netFinancialFlow: parseFloat((totalIncomeAmount - totalExpensesAmount).toFixed(2))
            }
        });

    } catch (error) {
        logger.error(`❌ Error fetching financial transactions: ${error.message}`);
        logger.error(error.stack);
        res.status(500).json({ success: false, message: error.message, error: 'Internal Server Error'  });
    }
};
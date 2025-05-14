// tasks/billingTasks.js

const cron = require('node-cron'); // Import node-cron

const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

const { addDays, subDays, addMonths, endOfMonth, isLastDayOfMonth, isBefore, isAfter, startOfDay, format } = require('date-fns'); // Import date-fns functions, add format
const { utcToZonedTime } = require('date-fns-tz'); // Import timezone function (npm install date-fns-tz)

const { Tenant, Invoice, Charge, Room, Price, AdditionalPrice, OtherCost, BoardingHouse } = require('../models'); // Import all necessary models

const logger = require('../config/logger'); // Assuming you have a logger setup

// Define how many days before the period end to issue the next invoice
const DAYS_BEFORE_PERIOD_END_TO_ISSUE_INVOICE = 7;

// Define the INTENDED cron schedule (e.g., run every day at 2:00 AM)
// This is the schedule we WANT the task to run at.
const INTENDED_BILLING_SCHEDULE = '0 2 * * *'; // 2:00 AM daily

// Define a SIMPLE, RELIABLE cron schedule for the task to run frequently.
// The task logic will check if it's time to actually run the billing process.
// Using */5 * * * * (every 5 minutes) as it seemed to work outside the problematic window.
const WORKAROUND_SCHEDULE = '*/5 * * * *';

// Define the timezone for date comparisons
const APP_TIMEZONE = "Asia/Jakarta"; // Use the timezone that works outside the problematic window

// Function to calculate the next billing period end date
// Based on the rule: currentPeriodEnd + 1 month, adjust to last day if currentPeriodEnd was last day of month
const calculateNextPeriodEnd = (currentPeriodEnd) => {
    const nextPeriodStart = addDays(currentPeriodEnd, 1); // Next period starts the day after the current ends

    let nextPeriodEnd = addMonths(nextPeriodStart, 1);

    // Adjust to the last day of the month if the *start date* of the next period was the last day of its month
    // This handles cases like Jan 31 -> Feb 28/29, Mar 31 -> Apr 30
    if (isLastDayOfMonth(nextPeriodStart)) {
        nextPeriodEnd = endOfMonth(nextPeriodEnd);
    } else {
        // If the start date is not the last day, subtract one day from the calculated date
        // e.g., Feb 15 -> addMonths(1) -> Mar 15. Subtract 1 day -> Mar 14.
        nextPeriodEnd = subDays(nextPeriodEnd, 1);
    }

    return nextPeriodEnd;
};

// Helper function to check if the current time matches the intended cron schedule
const isTimeToRunBilling = () => {
    try {
        const now = new Date();
        // Convert current time to the application's timezone
        const zonedTime = utcToZonedTime(now, APP_TIMEZONE);

        // Check if the zoned time matches the INTENDED_BILLING_SCHEDULE
        // We can use node-cron's internal check, but it's not directly exposed.
        // A simpler way is to format the zoned time and compare parts based on the cron expression.
        // For '0 2 * * *', we check if minutes are 0 and hours are 2.

        const currentMinute = parseInt(format(zonedTime, 'm'), 10);
        const currentHour = parseInt(format(zonedTime, 'H'), 10); // H for 24-hour format

        // Check if it matches '0 2 * * *' (0 minutes, 2 hours)
        const matchesIntendedSchedule = currentMinute === 0 && currentHour === 2;

        if (matchesIntendedSchedule) {
            logger.info(`⏰ Current time (${format(zonedTime, 'yyyy-MM-dd HH:mm:ss z')}) matches intended billing schedule (${INTENDED_BILLING_SCHEDULE}).`);
        } else {
            // logger.debug(`Current time (${format(zonedTime, 'yyyy-MM-dd HH:mm:ss z')}) does not match intended billing schedule.`);
        }

        return matchesIntendedSchedule;

    } catch (error) {
        logger.error(`❌ Error checking if it's time to run billing: ${error.message}`);
        // If an error occurs checking the time, better not to run the billing task
        return false;
    }
};


// The main scheduled task function to generate monthly invoices
const generateMonthlyInvoices = async () => {
    // 🔥 Add the time check here
    if (!isTimeToRunBilling()) {
        // logger.debug('Skipping billing task execution as current time does not match intended schedule.');
        return; // Exit if it's not the intended time to run the main logic
    }

    logger.info('📅 Running scheduled monthly invoice generation task...');

    const today = startOfDay(new Date()); // Get the start of today for comparisons
    const billingCutoffDate = addDays(today, DAYS_BEFORE_PERIOD_END_TO_ISSUE_INVOICE); // Date by which periodEnd must occur

    try {
        // --- Step 1: Find Tenants whose LATEST invoice is due for next billing ---
        // Query Invoices to find the latest invoice for each tenant that fits the criteria.
        // We use a subquery or similar logic to find the latest invoice per tenant.
        // A common pattern is to group by tenantId and find the max periodEnd.

        // Find the latest periodEnd for each tenant
        const latestInvoicePeriodEnds = await Invoice.findAll({
            attributes: [
                'tenantId',
                [sequelize.fn('max', sequelize.col('periodEnd')), 'latestPeriodEnd']
            ],
            group: ['tenantId'],
            raw: true // Return raw data
        });

        // Filter the latest period ends to find those within the billing cutoff range
        const tenantIdsDueForBilling = latestInvoicePeriodEnds
            .filter(item => {
                // Ensure item.latestPeriodEnd is not null before creating Date object
                if (!item.latestPeriodEnd) return false;
                const latestPeriodEnd = new Date(item.latestPeriodEnd);
                // Ensure the date is valid
                if (isNaN(latestPeriodEnd.getTime())) {
                    logger.warn(`⚠️ Invalid latestPeriodEnd date found for tenantId ${item.tenantId}: ${item.latestPeriodEnd}. Skipping.`);
                    return false;
                }

                // Check if the latest period end is today or in the future, up to the cutoff date
                return (isAfter(latestPeriodEnd, subDays(today, 1)) || isBefore(latestPeriodEnd, addDays(today, 1))) // Is today or in the future
                    && (isBefore(latestPeriodEnd, addDays(billingCutoffDate, 1)) || isAfter(latestPeriodEnd, subDays(billingCutoffDate, 1))); // Is before or on the cutoff date
            })
            .map(item => item.tenantId); // Get the tenant IDs

        if (tenantIdsDueForBilling.length === 0) {
            logger.info('📅 No active tenants due for billing in the next 7 days based on latest invoice period end.');
            return; // Exit if no tenants need billing
        }

        logger.info(`📅 Found ${tenantIdsDueForBilling.length} tenant IDs potentially due for billing.`);


        // --- Step 2: Fetch the full Tenant details for those IDs, including Room and current costs (WITHOUT INVOICE INCLUDE) ---
        const tenantsToBill = await Tenant.findAll({
            where: {
                id: {
                    [Op.in]: tenantIdsDueForBilling // Filter tenants by the IDs found
                },
                tenancyStatus: 'Active' // Double-check active status
            },
            include: [
                // Include Room and its costs to get current billing details
                {
                    model: Room,
                    attributes: ['id', 'roomNumber'],
                    required: true, // Require Room association
                    include: [
                        {
                            model: Price,
                            attributes: ['id', 'name', 'amount', 'description'],
                            where: { status: 'active' }, // Get current active Price
                            required: true // Require active Price
                        },
                        {
                            model: AdditionalPrice,
                            attributes: ['id', 'name', 'amount', 'description'],
                            where: { status: 'active' }, // Get current active Additional Prices
                            required: false // Don't require additional prices
                        },
                        {
                            model: OtherCost,
                            attributes: ['id', 'name', 'amount', 'description'],
                            where: { status: 'active' }, // Get current active Other Costs
                            required: false // Don't require other costs
                        }
                    ]
                }
            ],
            // No Invoice include here
            // No HAVING or complex grouping needed on this main query
        });


        if (tenantsToBill.length === 0) {
            logger.info('📅 No tenants found with active status matching the IDs from step 1.');
            return;
        }

        logger.info(`📅 Proceeding to generate invoices for ${tenantsToBill.length} tenants.`);


        // --- Step 3: Iterate through tenants, fetch their latest invoice, and generate the next ---
        for (const tenant of tenantsToBill) {
            // Fetch the latest invoice for this specific tenant
            const latestInvoice = await Invoice.findOne({
                where: {
                    tenantId: tenant.id,
                    // Ensure it's the latest one that qualified in Step 1's date range
                    periodEnd: {
                        [Op.between]: [subDays(billingCutoffDate, DAYS_BEFORE_PERIOD_END_TO_ISSUE_INVOICE), billingCutoffDate]
                    },
                    status: { [Op.not]: 'Void' } // Exclude void invoices
                },
                order: [['periodEnd', 'DESC'], ['issueDate', 'DESC']], // Get the very latest one
            });

            // If for some reason the latest invoice wasn't found in this step (e.g., status changed), skip
            if (!latestInvoice) {
                logger.warn(`⚠️ Could not find qualifying latest invoice for Tenant ${tenant.id} in step 3. Skipping.`);
                continue;
            }


            const tenantRoom = tenant.Room; // The tenant's room with current costs (fetched in step 2)

            // Calculate the dates for the next invoice
            const nextPeriodStart = addDays(latestInvoice.periodEnd, 1);
            const nextPeriodEnd = calculateNextPeriodEnd(latestInvoice.periodEnd); // Use the helper function
            const nextIssueDate = subDays(nextPeriodEnd, DAYS_BEFORE_PERIOD_END_TO_ISSUE_INVOICE); // Issue 7 days before next period end
            const nextDueDate = addDays(nextPeriodStart, 7); // Due 7 days after next period start
            const nextBanishDate = addDays(nextPeriodStart, 14); // Banish 14 days after next period start

            // Optional: Check if an invoice for this next period already exists
            // This is a safeguard against duplicate invoices if the task runs multiple times
            const existingNextInvoice = await Invoice.findOne({
                where: {
                    tenantId: tenant.id,
                    periodStart: nextPeriodStart,
                    // Consider status here too, e.g., exclude 'Void' ones
                    status: { [Op.not]: 'Void' }
                }
            });

            if (existingNextInvoice) {
                logger.info(`ℹ️ Next invoice for Tenant ${tenant.id} (Period: ${nextPeriodStart.toISOString().split('T')[0]} to ${nextPeriodEnd.toISOString().split('T')[0]}) already exists. Skipping.`);
                continue; // Skip if the next invoice already exists
            }


            // Start a transaction for creating the new invoice and its charges
            const t = await sequelize.transaction();

            try {
                logger.info(`Generating next invoice for Tenant ${tenant.id} (Room ${tenantRoom.roomNumber}) for period: ${nextPeriodStart.toISOString().split('T')[0]} to ${nextPeriodEnd.toISOString().split('T')[0]}`);

                // 4. Create the New Invoice header
                const newInvoice = await Invoice.create({
                    tenantId: tenant.id,
                    roomId: tenantRoom.id,
                    periodStart: nextPeriodStart,
                    periodEnd: nextPeriodEnd,
                    issueDate: nextIssueDate,
                    dueDate: nextDueDate,
                    banishDate: nextBanishDate,
                    totalAmountDue: 0, // Calculate below
                    totalAmountPaid: 0, // Initially 0
                    status: 'Issued', // Newly generated invoice status
                    description: `Monthly invoice for room ${tenantRoom.roomNumber} period: ${nextPeriodStart.toISOString().split('T')[0]} to ${nextPeriodEnd.toISOString().split('T')[0]}`,
                    createBy: 'Automated Billing Task', // Indicate creation source
                    updateBy: 'Automated Billing Task',
                }, { transaction: t });

                // 5. Prepare and create Charge records based on current active costs
                const chargesToCreate = [];
                let calculatedTotalAmountDue = 0;

                // Charge for the current Active Price
                if (tenantRoom.Price) { // Price is required in the query, so this should exist
                    const priceCharge = {
                        invoiceId: newInvoice.id,
                        name: tenantRoom.Price.name,
                        amount: tenantRoom.Price.amount,
                        description: tenantRoom.Price.description || `Base rent for room ${tenantRoom.roomNumber}`,
                        transactionType: 'debit',
                        createBy: 'Automated Billing Task',
                        updateBy: 'Automated Billing Task',
                    };
                    chargesToCreate.push(priceCharge);
                    calculatedTotalAmountDue += priceCharge.amount;
                }

                // Charges for current Active Additional Prices
                if (tenantRoom.AdditionalPrices && tenantRoom.AdditionalPrices.length > 0) {
                    tenantRoom.AdditionalPrices.forEach(ap => {
                        const additionalCharge = {
                            invoiceId: newInvoice.id,
                            name: ap.name || 'Additional Cost',
                            amount: ap.amount,
                            description: ap.description || 'Additional charge details',
                            transactionType: 'debit',
                            createBy: 'Automated Billing Task',
                            updateBy: 'Automated Billing Task',
                        };
                        chargesToCreate.push(additionalCharge);
                        calculatedTotalAmountDue += additionalCharge.amount;
                    });
                }

                // Charges for current Active Other Costs
                if (tenantRoom.OtherCosts && tenantRoom.OtherCosts.length > 0) {
                    tenantRoom.OtherCosts.forEach(oc => {
                        const otherCharge = {
                            invoiceId: newInvoice.id,
                            name: oc.name || 'Other Cost',
                            amount: oc.amount,
                            description: oc.description || 'Other cost details',
                            transactionType: 'debit',
                            createBy: 'Automated Billing Task',
                            updateBy: 'Automated Billing Task',
                        };
                        chargesToCreate.push(otherCharge);
                        calculatedTotalAmountDue += otherCharge.amount;
                    });
                }

                // Create all prepared Charge records in bulk
                if (chargesToCreate.length > 0) {
                    await Charge.bulkCreate(chargesToCreate, { transaction: t });
                }

                // 6. Update the totalAmountDue on the New Invoice record
                await newInvoice.update({ totalAmountDue: calculatedTotalAmountDue }, { transaction: t });

                // Commit the transaction for this tenant's invoice
                await t.commit();
                logger.info(`✅ Successfully generated invoice ${newInvoice.id} for Tenant ${tenant.id}.`);

            } catch (innerError) {
                // If an error occurs for a single tenant, rollback their transaction
                await t.rollback();
                logger.error(`❌ Error generating invoice for Tenant ${tenant.id}: ${innerError.message}`);
                logger.error(innerError.stack);
                // Continue to the next tenant even if one fails
            }
        }

        logger.info('📅 Monthly invoice generation task completed.');

    } catch (error) {
        // Handle errors in the main query or iteration setup
        logger.error(`❌ Error in monthly invoice generation task: ${error.message}`);
        logger.error(error.stack);
    }
};

// Function to start the scheduled task
const startBillingTask = () => {
    logger.info(`📅 Starting monthly invoice generation task with schedule: ${WORKAROUND_SCHEDULE}`);
    // Use the workaround schedule that seems to start reliably.
    cron.schedule(WORKAROUND_SCHEDULE, () => {
        // 🔥 Check if it's the intended time to run the main logic
        generateMonthlyInvoices(); // generateMonthlyInvoices now contains the time check
    }, {
        scheduled: true, // Task is scheduled immediately upon cron.schedule call
        start: new Date(), // Keep explicit start date
        timezone: APP_TIMEZONE // Use the timezone that works outside the problematic window
    });
};

// Export the function to start the task
module.exports = {
    startBillingTask,
    generateMonthlyInvoices // Export the function itself if you want to trigger it manually
};

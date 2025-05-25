// tasks/billingTasks.js

// Use node-schedule for triggering
const schedule = require('node-schedule');
const logger = require('../config/logger'); // Assuming you have a logger setup

const db = require("../models");
const sequelize = db.sequelize;
const Sequelize = db.Sequelize;
const { Op } = Sequelize;

// Keep date-fns functions for date calculations (addDays, subDays, etc.)
const { addDays, subDays, addMonths, endOfMonth, isLastDayOfMonth, isBefore, isAfter, startOfDay, format, isEqual } = require('date-fns');

// Use moment and moment-timezone for the time check
logger.debug('🔥 Debug Log: Attempting to import moment-timezone...');
const moment = require('moment-timezone');
logger.debug('🔥 Debug Log: moment-timezone imported successfully.');

const { Tenant, Invoice, Charge, Room, Price, AdditionalPrice, OtherCost } = require('../models'); // Import all necessary models

// Define how many days before the period end to issue the next invoice
const DAYS_BEFORE_PERIOD_END_TO_ISSUE_INVOICE = 7;

// Define the INTENDED schedule for the billing logic (2:00 AM)
const INTENDED_BILLING_SCHEDULE_HOUR = 2; // 2 AM
const INTENDED_BILLING_SCHEDULE_MINUTE = 0; // 0 minutes

// Define the SIMPLE, RELIABLE cron schedule for node-schedule to trigger the task frequently.
// The task logic will check if it's the intended time to actually run the billing process.
const NODE_SCHEDULE_TRIGGER_SCHEDULE = '* * * * *'; // Run every minute

// Define the timezone for date comparisons and scheduling startup
const APP_TIMEZONE = "Asia/Jakarta"; // Use the timezone you intend for the task to run in

// 🔥 CRITICAL: Enhanced global unhandled error handlers to get full stack trace
process.on('uncaughtException', (err) => {
    logger.error('❌ Uncaught Exception:', err.message);
    logger.error(err.stack); // Log the full stack trace
    // It's often recommended to exit the process after an uncaught exception
    // to prevent the application from being in an unstable state.
    // process.exit(1); // Consider adding this in production
});

process.on('unhandledRejection', (reason, promise) => {
    // Log the reason as an error object, which should include the stack trace
    logger.error('❌ Unhandled Rejection at Promise:', promise);
    logger.error('Reason:', reason); // This will attempt to log the full object

    if (reason instanceof Error) {
        logger.error('Reason (Error message):', reason.message);
        logger.error('Reason (Error stack):', reason.stack); // This is what we need!
    } else {
        // Fallback for non-Error rejections (e.g., a string or number)
        logger.error('Reason (Non-Error):', JSON.stringify(reason, null, 2)); // Stringify for better readability
    }
    // Handle the rejection, e.g., log it and decide whether to exit
});


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

// Helper function to check if the current time matches the intended schedule using moment-timezone
const isTimeToRunBilling = () => {
    try {
        // Get the current time and convert it to the application's timezone using moment-timezone
        const zonedTime = moment().tz(APP_TIMEZONE);

        // Extract the current hour and minute from the zoned time
        const currentHour = zonedTime.hour();
        const currentMinute = zonedTime.minute();

        // Check if it matches the intended schedule (2:00 AM)
        const matchesIntendedSchedule = currentHour === INTENDED_BILLING_SCHEDULE_HOUR && currentMinute === INTENDED_BILLING_SCHEDULE_MINUTE;

        if (matchesIntendedSchedule) {
            logger.info(`⏰ Current time (${zonedTime.format('YYYY-MM-DD HH:mm:ss z')}) matches intended billing schedule (0 ${INTENDED_BILLING_SCHEDULE_HOUR} * * *).`);
        } else {
            // Optional: Log when skipping for debugging if needed
            // logger.debug(`Current time (${zonedTime.format('YYYY-MM-DD HH:mm:ss z')}) does not match intended billing schedule.`);
        }

        return matchesIntendedSchedule;

    } catch (error) {
        logger.error(`❌ Error checking if it's time to run billing: ${error.message}`);
        // If an error occurs checking the time, better not to run the billing task
        return false;
    }
};


// The main scheduled task function to generate monthly invoices
// This function is triggered frequently by node-schedule, but the logic
// only runs at the intended time based on the internal check.
const generateMonthlyInvoices = async () => {
    logger.debug('🔥 Debug Log: generateMonthlyInvoices function started.');

    // Add the time check back here
    if (!isTimeToRunBilling()) {
        logger.debug('🔥 Debug Log: Skipping main billing logic as it is not the scheduled time.');
        return; // Exit if it's not the intended time to run the main logic
    }

    logger.info('📅 Running scheduled monthly invoice generation task...');

    // Use new Date() directly, node-schedule handles the timezone for the schedule itself
    const today = startOfDay(new Date()); // Get the start of today for comparisons
    const billingCutoffDate = addDays(today, DAYS_BEFORE_PERIOD_END_TO_ISSUE_INVOICE); // Date by which periodEnd must occur

    try {
        // --- Step 1: Find Tenants whose LATEST invoice is due for next billing ---
        // Query Invoices to find the latest invoice for each tenant that fits the criteria.
        // We use a subquery or similar logic to find the latest invoice per tenant.

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
                return (isAfter(latestPeriodEnd, subDays(today, 1)) || isEqual(latestPeriodEnd, today)) // Is today or in the future
                    && (isBefore(latestPeriodEnd, addDays(billingCutoffDate, 1)) || isEqual(latestPeriodEnd, billingCutoffDate)); // Is before or on the cutoff date
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
            raw: true, // Get raw data for easier processing
            nest: true // Nest included models
        });


        if (tenantsToBill.length === 0) {
            logger.info('📅 No active tenants due for billing in the next 7 days based on latest invoice period end.');
            return; // Exit if no tenants need billing
        }

        logger.info(`📅 Found ${tenantsToBill.length} tenant IDs potentially due for billing.`);


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
            const nextIssueDate = subDays(nextPeriodStart, DAYS_BEFORE_PERIOD_END_TO_ISSUE_INVOICE); // Issue 7 days before next period end
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
    logger.info(`📅 Starting monthly invoice generation task trigger with schedule: ${NODE_SCHEDULE_TRIGGER_SCHEDULE} in timezone ${APP_TIMEZONE}. Task logic will run at ${INTENDED_BILLING_SCHEDULE_HOUR}:${INTENDED_BILLING_SCHEDULE_MINUTE}. `);

    logger.debug('🔥 Debug Log: Attempting to schedule the node-schedule job...');
    const billingJob = schedule.scheduleJob(NODE_SCHEDULE_TRIGGER_SCHEDULE, { timezone: APP_TIMEZONE }, () => {
        generateMonthlyInvoices();
    });
    logger.debug('🔥 Debug Log: node-schedule job scheduled successfully.');

    // const nextInvocation = billingJob.nextInvocation();
    // if (nextInvocation) {
    //     logger.info(`📅 Next node-schedule trigger invocation: ${nextInvocation.toISOString()}`);
    // } else {
    //     logger.warn('📅 No next node-schedule trigger invocation found.');
    // }
    // logger.info('🔥 Simple scheduled billing task started.');
};

// Export the function to start the task
module.exports = {
    startBillingTask,
    // generateMonthlyInvoices // Exported for manual testing if needed
};

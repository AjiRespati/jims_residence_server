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

const moment = require('moment-timezone');

const { Tenant, Invoice, Charge, Room, Price, AdditionalPrice, OtherCost } = require('../models'); // Import all necessary models

// Define how many days before the period end to issue the next invoice
const DAYS_BEFORE_PERIOD_Start_TO_ISSUE_INVOICE = 7;

// Define the INTENDED schedule for the billing logic (2:00 AM)
const INTENDED_BILLING_SCHEDULE_HOUR = 1; // 2 AM
const INTENDED_BILLING_SCHEDULE_MINUTE = 0; // 0 minutes

// Define the SIMPLE, RELIABLE cron schedule for node-schedule to trigger the task frequently.
// The task logic will check if it's the intended time to actually run the billing process.
const NODE_SCHEDULE_TRIGGER_SCHEDULE = '* * * * *'; // Run every minute

// Define the timezone for date comparisons and scheduling startup
const APP_TIMEZONE = "Asia/Jakarta"; // Use the timezone you intend for the task to run in

// 🔥 CRITICAL: Enhanced global unhandled error handlers to get full stack trace
process.on('uncaughtException', (err) => {
    logger.error('❌ Uncaught Exception:');
    logger.error(err.message);
    logger.error(err.stack); // Log the full stack trace
    // It's often recommended to exit the process after an uncaught exception
    // to prevent the application from being in an unstable state.
    // process.exit(1); // Consider adding this in production
});

process.on('unhandledRejection', (reason, promise) => {
    // Log the reason as an error object, which should include the stack trace
    logger.error('❌ Unhandled Rejection at Promise:');
    logger.error(promise);
    logger.error('Reason:');
    logger.error(reason); // This will attempt to log the full object

    if (reason instanceof Error) {
        logger.error('Reason (Error message):', reason.message);
        logger.error('Reason (Error stack):', reason.stack); // This is what we need!
        logger.error(reason.stack); // This is what we need!
    } else {
        // Fallback for non-Error rejections (e.g., a string or number)
        logger.error('Reason (Non-Error):'); // Stringify for better readability
        logger.error(JSON.stringify(reason, null, 2)); // Stringify for better readability
    }
    // Handle the rejection, e.g., log it and decide whether to exit
});


// Function to calculate the next billing period end date
// Based on the rule: currentPeriodEnd + 1 month, adjust to last day if currentPeriodEnd was last day of month
const calculateNextPeriodEnd = (currentPeriodEnd) => {
    // This function now correctly calculates the end date for the *next* period
    // given the *end date of the previous period*.

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
        logger.error(error.message);
        // If an error occurs checking the time, better not to run the billing task
        return false;
    }
};


// The main scheduled task function to generate monthly invoices
// This function is triggered frequently by node-schedule, but the logic
// only runs at the intended time based on the internal check.
const generateMonthlyInvoices = async () => {
    // logger.debug('🔥 Debug Log: generateMonthlyInvoices function started.');

    // Add the time check back here
    if (!isTimeToRunBilling()) {
        // logger.debug('🔥 Debug Log: Skipping main billing logic as it is not the scheduled time.');
        return; // Exit if it's not the intended time to run the main logic
    }

    logger.info('📅 Running scheduled monthly invoice generation task...');

    const today = startOfDay(new Date()); // Get the start of today for comparisons

    try {
        // --- Step 1: Fetch ALL Active Tenants with their Room and current active costs ---
        const allActiveTenants = await Tenant.findAll({
            where: {
                tenancyStatus: 'Active'
            },
            include: [
                {
                    model: Room,
                    attributes: ['id', 'roomNumber'],
                    required: true,
                    include: [
                        {
                            model: Price,
                            attributes: ['id', 'name', 'amount', 'description'],
                            where: { status: 'active' },
                            required: true
                        },
                        {
                            model: AdditionalPrice,
                            attributes: ['id', 'name', 'amount', 'description'],
                            where: { status: 'active' },
                            required: false
                        },
                        {
                            model: OtherCost,
                            attributes: ['id', 'name', 'amount', 'description'],
                            where: {
                                status: 'active', // Only include 'active' OtherCosts
                                isOneTime: false // >>> IMPORTANT: Exclude one-time costs <<<
                            },
                            required: false // Don't require other costs
                        }
                    ]
                }
            ],
            raw: true, // Get raw data for easier processing
            nest: true // Nest included models
        });

        if (allActiveTenants.length === 0) {
            logger.info('📅 No active tenants found for billing processing.');
            return;
        }

        logger.info(`📅 Found ${allActiveTenants.length} active tenants for billing processing.`);


        // --- Step 2: Iterate through each active tenant and generate missing invoices ---
        for (const tenant of allActiveTenants) {
            logger.info(`Processing invoices for Tenant ${tenant.id} (${tenant.name})`);

            // This will be the `periodStart` for the invoice we are attempting to create in each loop iteration
            let currentPeriodStartForInvoice;
            // This will be the `periodEnd` of the *previous* invoice, used by `calculateNextPeriodEnd`
            let previousPeriodEndForCalculation;

            // Fetch the very latest existing invoice for this tenant (any non-Void status)
            const latestExistingInvoice = await Invoice.findOne({
                where: {
                    tenantId: tenant.id,
                    status: { [Op.not]: 'Void' }
                },
                order: [['periodEnd', 'DESC']], // Get the absolute latest by periodEnd
            });

            if (latestExistingInvoice) {
                // If invoices already exist, start from the day after the latest one
                const latestPeriodEnd = startOfDay(latestExistingInvoice.periodEnd);
                currentPeriodStartForInvoice = addDays(latestPeriodEnd, 1);
                previousPeriodEndForCalculation = latestPeriodEnd;
                logger.info(`Starting billing for Tenant ${tenant.id} from day after latest invoice period end: ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')}`);
            } else {
                // If no invoices exist for this tenant, start from their original startDate
                currentPeriodStartForInvoice = startOfDay(tenant.startDate);
                // For the very first invoice calculation, previousPeriodEnd is conceptually the day before startDate
                previousPeriodEndForCalculation = subDays(currentPeriodStartForInvoice, 1);
                logger.info(`Starting billing for Tenant ${tenant.id} from tenant's start date (no existing invoice): ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')}`);
            }

            // Define the cutoff for generating invoices:
            // We want to generate invoices for all periods whose *calculated issue date*
            // is on or before `today` (the date the task is running).
            const targetIssueDateCutoff = today;

            // Loop to generate all necessary invoices (past due and the next one due today)
            while (true) { // Loop indefinitely until a `break` condition is met internally
                // Calculate the end date for the current billing period
                const currentPeriodEnd = calculateNextPeriodEnd(previousPeriodEndForCalculation);

                // Calculate the potential issue date if an invoice were generated for this period
                // This is based on the new rule: 7 days before period start
                const potentialIssueDate = subDays(currentPeriodStartForInvoice, DAYS_BEFORE_PERIOD_Start_TO_ISSUE_INVOICE);

                // BREAK CONDITION: If the potential issue date for this period is AFTER our `targetIssueDateCutoff` (today),
                // it means we have generated all necessary past/current invoices and should stop.
                if (isAfter(potentialIssueDate, targetIssueDateCutoff)) {
                    logger.debug(`Stopping generation for Tenant ${tenant.id}. Next invoice period starting ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')} would have an issue date of ${format(potentialIssueDate, 'yyyy-MM-dd')}, which is after today's cutoff (${format(targetIssueDateCutoff, 'yyyy-MM-dd')}).`);
                    break; // Exit the inner while loop for this tenant
                }

                // Additional Safeguard: Prevent generating invoices excessively far into the future.
                // This is a safety net in case of misconfigured dates or unexpected logic.
                if (isAfter(currentPeriodStartForInvoice, addMonths(today, 3))) {
                    logger.warn(`⚠️ Safeguard activated: Stopping generation for Tenant ${tenant.id} as current period start (${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')}) is too far into the future (beyond 3 months from today).`);
                    break;
                }

                // Check if an invoice for this specific period already exists (to prevent duplicates)
                const existingInvoiceForPeriod = await Invoice.findOne({
                    where: {
                        tenantId: tenant.id,
                        periodStart: currentPeriodStartForInvoice,
                        periodEnd: currentPeriodEnd, // Check both start and end for higher precision
                        status: { [Op.not]: 'Void' } // Exclude void invoices from this check
                    }
                });

                if (existingInvoiceForPeriod) {
                    logger.info(`ℹ️ Invoice for Tenant ${tenant.id} (Period: ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')} to ${format(currentPeriodEnd, 'yyyy-MM-dd')}) already exists. Skipping.`);
                    // Move to the next period for the next iteration of the while loop
                    previousPeriodEndForCalculation = currentPeriodEnd;
                    currentPeriodStartForInvoice = addDays(currentPeriodEnd, 1);
                    continue; // Skip to the next iteration
                }

                // --- Proceed with creating the new invoice for this period ---
                const t = await sequelize.transaction();

                try {
                    const tenantRoom = tenant.Room; // The tenant's room with current costs (fetched initially)

                    // >>> ADJUSTMENT HERE: issueDate is now 7 days before periodStart <<<
                    const invoiceIssueDate = subDays(currentPeriodStartForInvoice, 7);
                    const dueDate = addDays(currentPeriodStartForInvoice, 7);
                    const banishDate = addDays(currentPeriodStartForInvoice, 14);

                    logger.info(`Generating invoice for Tenant ${tenant.id} (Room ${tenantRoom.roomNumber}) for period: ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')} to ${format(currentPeriodEnd, 'yyyy-MM-dd')}`);

                    // 3. Create the New Invoice header
                    const newInvoice = await Invoice.create({
                        tenantId: tenant.id,
                        roomId: tenantRoom.id,
                        periodStart: currentPeriodStartForInvoice,
                        periodEnd: currentPeriodEnd,
                        issueDate: invoiceIssueDate, // Use the newly calculated issueDate
                        dueDate: dueDate,
                        banishDate: banishDate,
                        totalAmountDue: 0, // Calculate below
                        totalAmountPaid: 0, // Initially 0
                        status: 'Issued', // Newly generated invoice status
                        description: `Tagihan untuk kamar ${tenantRoom.roomNumber}\nPeriode: ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')} to ${format(currentPeriodEnd, 'yyyy-MM-dd')}`,
                        createBy: 'Automated Billing Task', // Indicate creation source
                        updateBy: 'Automated Billing Task',
                    }, { transaction: t });

                    // 4. Prepare and create Charge records based on current active costs
                    const chargesToCreate = [];
                    let calculatedTotalAmountDue = 0;

                    // Charge for the current Active Price
                    if (tenantRoom.Price) { // Price is required in the query, so this should exist
                        const priceCharge = {
                            invoiceId: newInvoice.id,
                            name: tenantRoom.Price.name,
                            amount: tenantRoom.Price.amount,
                            description: tenantRoom.Price.description || `Sewa kamar ${tenantRoom.roomNumber}`,
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

                    // 5. Update the totalAmountDue on the New Invoice record
                    await newInvoice.update({ totalAmountDue: calculatedTotalAmountDue }, { transaction: t });

                    // --- NEW ADJUSTMENT STARTS HERE ---
                    // Update the tenant's startDate and endDate to reflect the period of the newly created invoice
                    await tenant.update({
                        startDate: newInvoice.periodStart,
                        endDate: newInvoice.periodEnd,
                        updateBy: 'System/Automated Billing' // Or req.user.username if this task can be manually triggered
                    }, { transaction: t });

                    logger.info(`Tenant ${tenant.name} (${tenant.id})'s startDate and endDate updated to reflect new invoice period (${format(newInvoice.periodStart, 'yyyy-MM-dd')} to ${format(newInvoice.periodEnd, 'yyyy-MM-dd')}).`);
                    // --- NEW ADJUSTMENT ENDS HERE ---

                    // Commit the transaction for this tenant's invoice
                    await t.commit();
                    logger.info(`✅ Successfully generated invoice ${newInvoice.id} for Tenant ${tenant.id} for period ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')} to ${format(currentPeriodEnd, 'yyyy-MM-dd')}.`);

                } catch (innerError) {
                    // If an error occurs for a single tenant, rollback their transaction
                    if (t && !t.finished) { // Check if transaction is still active
                        try {
                            await t.rollback();
                        } catch (rollbackError) {
                            logger.error(`Rollback failed for Tenant ${tenant.id} and period ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')}: ${rollbackError.message}`);
                        }
                    }
                    logger.error(`❌ Error generating invoice for Tenant ${tenant.id} for period ${format(currentPeriodStartForInvoice, 'yyyy-MM-dd')} to ${format(currentPeriodEnd, 'yyyy-MM-dd')}: ${innerError.message}`);
                    logger.error(innerError.stack);
                    // It's usually fine to continue to the next period/tenant even if one fails
                }
                // Important: Move to the next period for the next iteration of the while loop
                previousPeriodEndForCalculation = currentPeriodEnd;
                currentPeriodStartForInvoice = addDays(currentPeriodEnd, 1);
            } // End of while loop
        } // End of for loop
        logger.info('📅 Monthly invoice generation task completed for all active tenants.');

    } catch (error) {
        // Handle errors in the main query or overall task setup
        logger.error(`❌ Critical Error in monthly invoice generation task: ${error.message}`);
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

    const nextInvocation = billingJob.nextInvocation();
    if (nextInvocation) {
        logger.info(`📅 Next node-schedule trigger invocation: ${nextInvocation.toISOString()}`);
    } else {
        logger.warn('📅 No next node-schedule trigger invocation found.');
    }
    logger.info('🔥 Simple scheduled billing task started.');
};

// Export the function to start the task
module.exports = {
    startBillingTask,
    // generateMonthlyInvoices // You can export this for manual testing if needed
};
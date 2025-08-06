// models/charge.js (Renamed and Modified from Payment)
module.exports = (sequelize, DataTypes) => {
    // This model represents a single charge or line item on an Invoice
    const Charge = sequelize.define("Charge", { // 🔥 Model renamed from "Payment" to "Charge"
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        priceId: { type: DataTypes.UUID, allowNull: true }, // Context: which price this invoice covers
        invoiceId: { type: DataTypes.UUID, allowNull: false }, // 🔥 New FK linking THIS charge to an Invoice

        // tenantId, totalAmount, transactionName, transactionType, transactionImagePath,
        // description, createBy, updateBy, timelimit, paymentDate, paymentStatus
        // Reviewing fields from your last Payment model:

        // amount: Renamed from totalAmount for a line item
        amount: { type: DataTypes.FLOAT, allowNull: false },

        // name: Can use transactionName from your last model or name from Price/AP/OC
        name: { type: DataTypes.STRING, allowNull: false }, // e.g., "Base Rent", "Internet Fee", "Repair Cost"

        // description: Description for THIS specific charge
        description: { type: DataTypes.TEXT },

        // transactionType: 'debit'/'credit'. If it classifies the charge type, keep.
        // If 'credit' represents a payment received, this field is misplaced here.
        // Assuming 'debit' means charge, 'credit' might be an adjustment line item. Keep for now.
        transactionType: { type: DataTypes.ENUM('debit', 'credit'), allowNull: false, defaultValue: 'debit' },

        // 🔥 transactionImagePath: This belongs on a TRANSACTION model (payment received)
        // Removed from Charge.

        // 🔥 timelimit: Belongs on the Invoice (dueDate)
        // Removed from Charge.

        // 🔥 paymentDate: Belongs on a TRANSACTION model (when payment was received)
        // Removed from Charge.

        // 🔥 paymentStatus: Belongs on the Invoice (status of the whole bill)
        // Removed from Charge.

        createBy: { type: DataTypes.STRING }, // Creator of this charge line item
        updateBy: { type: DataTypes.STRING }, // Updater of this charge line item

        // Optional: Add fields to trace origin if needed for reporting/logic
        // costOriginType: { type: DataTypes.ENUM('price', 'additionalPrice', 'otherCost') },
        // costOriginId: { type: DataTypes.UUID },
    }, { timestamps: true });

    Charge.associate = (models) => {
        // 🔥 Remove belongsTo(models.Tenant) association
        Charge.belongsTo(models.Invoice, { foreignKey: "invoiceId" }); // 🔥 New association to Invoice
    };

    return Charge;
};
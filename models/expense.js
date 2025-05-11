// models/expense.js
module.exports = (sequelize, DataTypes) => {
    const Expense = sequelize.define("Expense", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        boardingHouseId: { type: DataTypes.UUID, allowNull: false }, // Link to the boarding house the expense is for
        category: { type: DataTypes.STRING }, // e.g., 'Utilities', 'Maintenance', 'Supplies', 'Taxes'
        name: { type: DataTypes.STRING, allowNull: false }, // e.g., 'Water Bill', 'Electricity Bill', 'Plumber Service', 'Property Tax'
        amount: { type: DataTypes.FLOAT, allowNull: false }, // The expense amount
        expenseDate: { type: DataTypes.DATE, allowNull: false }, // The date the expense was incurred or paid
        paymentMethod: { type: DataTypes.ENUM('Cash', 'Bank Transfer', 'Online Payment', 'Other'), allowNull: false }, // How it was paid
        proofPath: { type: DataTypes.STRING }, // Path to receipt or invoice proof image/document
        description: { type: DataTypes.TEXT }, // Optional detailed description
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
    }, { timestamps: true });

    Expense.associate = (models) => {
        // An Expense belongs to one BoardingHouse
        Expense.belongsTo(models.BoardingHouse, { foreignKey: "boardingHouseId" });
        // You might add other associations here if expenses relate to rooms, etc.
    };

    return Expense;
};

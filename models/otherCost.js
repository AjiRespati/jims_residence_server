module.exports = (sequelize, DataTypes) => {
    const OtherCost = sequelize.define("OtherCost", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        roomId: { type: DataTypes.UUID, allowNull: false },
        invoiceId: { type: DataTypes.UUID, allowNull: true },
        amount: { type: DataTypes.FLOAT, allowNull: false },
        name: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
        isOneTime: { // New field: true for ad-hoc, one-time charges
            type: DataTypes.BOOLEAN,
            defaultValue: true,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM("active", "inactive", "billed"),
            allowNull: false,
            defaultValue: "active"
        },
    }, { timestamps: true });

    OtherCost.associate = (models) => {
        OtherCost.belongsTo(models.Room, { foreignKey: 'roomId' });
        // New association: an OtherCost can belong to an Invoice (if it's a one-time charge)
        OtherCost.belongsTo(models.Invoice, { foreignKey: 'invoiceId' });
    };

    return OtherCost;
};

module.exports = (sequelize, DataTypes) => {
    const OtherCost = sequelize.define("OtherCost", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        paymentId: { type: DataTypes.UUID, allowNull: false },
        amount: { type: DataTypes.FLOAT, allowNull: false },
        name: { type: DataTypes.STRING },
        description: { type: DataTypes.TEXT },
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
        status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
    }, { timestamps: true });

    OtherCost.associate = (models) => {
        OtherCost.belongsTo(models.Payment, { foreignKey: "paymentId" });
    };

    return OtherCost;
};

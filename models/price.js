module.exports = (sequelize, DataTypes) => {
    const Price = sequelize.define("Price", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        boardingHouseId: { type: DataTypes.UUID, allowNull: false },
        roomSize: { type: DataTypes.ENUM('Small', 'Standard', 'Big'), allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false  },
        amount: { type: DataTypes.FLOAT, allowNull: false },
        description: { type: DataTypes.TEXT },
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING },
        status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
    }, { timestamps: true });

    Price.associate = (models) => {
        // Price.hasMany(models.Room, { foreignKey: "priceId" });
        Price.belongsTo(models.BoardingHouse, { foreignKey: 'boardingHouseId' });
    };

    return Price;
};

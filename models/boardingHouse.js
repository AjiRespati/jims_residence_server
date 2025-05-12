
module.exports = (sequelize, DataTypes) => {
    const BoardingHouse = sequelize.define("BoardingHouse", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        name: { type: DataTypes.STRING, allowNull: false },
        address: { type: DataTypes.STRING, allowNull: false },
        description: { type: DataTypes.STRING, allowNull: false },
    }, { timestamps: true });

    BoardingHouse.associate = (models) => {
        BoardingHouse.hasMany(models.Room, { foreignKey: "boardingHouseId" });
        BoardingHouse.hasMany(models.Price, { foreignKey: "boardingHouseId" });
        // Add the association to the new Expense model:
        BoardingHouse.hasMany(models.Expense, { foreignKey: "boardingHouseId", as: 'Expenses', onDelete: 'SET NULL' }); // Use SET NULL or CASCADE
    };

    return BoardingHouse;
};

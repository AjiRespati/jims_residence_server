
module.exports = (sequelize, DataTypes) => {
    const BoardingHouse = sequelize.define("BoardingHouse", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        name: { type: DataTypes.STRING, allowNull: false },
        address: { type: DataTypes.STRING, allowNull: false },
        description: { type: DataTypes.STRING, allowNull: false },
    }, { timestamps: true });

    BoardingHouse.associate = (models) => {
        BoardingHouse.hasMany(models.Room, { foreignKey: "boardingHouseId" });
    };

    return BoardingHouse;
};

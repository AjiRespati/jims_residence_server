module.exports = (sequelize, DataTypes) => {
    const Tenant = sequelize.define("Tenant", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        roomId: { type: DataTypes.INTEGER, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        phone: { type: DataTypes.STRING, allowNull: false, unique: true },
        idNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
        idImagePath: { type: DataTypes.STRING, allowNull: false },
        isIdCopyDone: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
        tenancyStatus: { type: DataTypes.ENUM('Active', 'Inactive'), allowNull: false },
        updateBy: { type: DataTypes.STRING }
    }, { timestamps: true });

    Tenant.associate = (models) => {
        Tenant.belongsTo(models.Room, { foreignKey: "roomId" });
    };

    return Tenant;
};

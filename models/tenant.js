module.exports = (sequelize, DataTypes) => {
    const Tenant = sequelize.define("Tenant", {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        roomId: { type: DataTypes.UUID, allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        phone: { type: DataTypes.STRING, allowNull: false, unique: true },
        NIKNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
        NIKImagePath: { type: DataTypes.STRING, allowNull: true },
        isNIKCopyDone: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
        tenancyStatus: { type: DataTypes.ENUM('Waiting','Active', 'Inactive'), allowNull: false, defaultValue: 'Active' },
        startDate: { type: DataTypes.DATE },
        dueDate: { type: DataTypes.DATE },
        banishDate: { type: DataTypes.DATE },
        endDate: { type: DataTypes.DATE },
        createBy: { type: DataTypes.STRING },
        updateBy: { type: DataTypes.STRING }
    }, { timestamps: true });

    Tenant.associate = (models) => {
        Tenant.belongsTo(models.Room, { foreignKey: "roomId" });
        // Tenant.hasMany(models.Payment, { foreignKey: "tenantId" });
        Tenant.hasMany(models.Invoice, { foreignKey: "tenantId" });
    };

    return Tenant;
};
const { Op } = require('sequelize');

// req.accessibleBoardingHouseIds:
//   null  -> Admin, access to everything
//   []    -> no access (no owned/assigned kos)
//   [ids] -> restricted set
const isAdmin = (req) => req.accessibleBoardingHouseIds === null;

const canAccessBoardingHouse = (req, boardingHouseId) => {
    if (isAdmin(req)) return true;
    return boardingHouseId != null && req.accessibleBoardingHouseIds.includes(boardingHouseId);
};

// Sequelize `where` fragment to restrict BoardingHouse.id for list queries.
const boardingHouseScopeWhere = (req) => {
    if (isAdmin(req)) return {};
    const ids = req.accessibleBoardingHouseIds || [];
    if (ids.length === 0) return { id: { [Op.eq]: null } };
    return { id: { [Op.in]: ids } };
};

// Sequelize `where` fragment for models that carry `boardingHouseId` directly.
const boardingHouseIdScopeWhere = (req) => {
    if (isAdmin(req)) return {};
    const ids = req.accessibleBoardingHouseIds || [];
    if (ids.length === 0) return { boardingHouseId: { [Op.eq]: null } };
    return { boardingHouseId: { [Op.in]: ids } };
};

module.exports = { isAdmin, canAccessBoardingHouse, boardingHouseScopeWhere, boardingHouseIdScopeWhere };

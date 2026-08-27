const { verifyToken } = require('../utils/jwt');
const { User, Staff } = require('../models');

/**
 * Verifies the JWT on the Authorization header (Bearer <token>).
 * On success attaches req.user = { id, role } and, if the user is staff,
 * req.user.staffId — controllers rely on this for ownership checks.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = header.split(' ')[1];
    const decoded = verifyToken(token); // throws if invalid/expired

    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or deactivated' });
    }

    req.user = { id: user.id, role: user.role };

    if (user.role === 'staff') {
      const staffProfile = await Staff.findOne({ where: { userId: user.id } });
      if (staffProfile) req.user.staffId = staffProfile.id;
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Usage: requireRole('admin') or requireRole('admin', 'staff')
 * Must run AFTER authenticate.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };

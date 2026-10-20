
const verifyUser = (...allowedRoles) => {
  return (req, res, next) => {
    // verifyToken must run before this middleware.
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    const userRole =
      typeof req.user.role === "string"
        ? req.user.role.trim().toLowerCase()
        : "";

    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: "User role is not available.",
      });
    }

    const normalizedRoles = allowedRoles.map((role) =>
      String(role).trim().toLowerCase()
    );

    if (
      normalizedRoles.length > 0 &&
      !normalizedRoles.includes(userRole)
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action.",
      });
    }

    return next();
  };
};

export default verifyUser;

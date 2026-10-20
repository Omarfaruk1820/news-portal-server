import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

export default function verifyUser(...allowedRoles) {
  return async function authorizeUser(req, res, next) {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: "Authentication is required.",
        });
      }

      const user = await getDB()
        .collection("users")
        .findOne(
          {
            _id: new ObjectId(req.user.id),
          },
          {
            projection: {
              name: 1,
              email: 1,
              role: 1,
            },
          },
        );

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User account was not found.",
        });
      }

      req.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      };

      if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to access this resource.",
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

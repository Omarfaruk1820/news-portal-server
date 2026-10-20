
import jwt from "jsonwebtoken";

const verifyToken = (req, res, next) => {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret === "REPLACE_WITH_A_LONG_RANDOM_SECRET") {
    console.error("JWT_SECRET is missing or not configured.");

    return res.status(500).json({
      success: false,
      message: "Authentication service is not configured.",
    });
  }

  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required.",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required.",
    });
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    if (!decoded || typeof decoded !== "object" || !decoded.sub && !decoded.userId && !decoded.id && !decoded.email) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    // Make the verified token payload available to subsequent middleware.
    req.user = decoded;

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};

export default verifyToken;

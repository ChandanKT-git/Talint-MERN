import { clerkClient, getAuth } from "@clerk/express";
import User from "../models/User.js";
import { upsertStreamUser } from "../lib/stream.js";

export const protectRoute = [
  async (req, res, next) => {
    try {
      const auth = getAuth(req);

      if (!auth.userId) {
        return res.status(401).json({ message: "Unauthorized - Please sign in" });
      }

      const clerkId = auth.userId;

      if (!clerkId) return res.status(401).json({ message: "Unauthorized - invalid token" });

      // find user in db by clerk ID
      let user = await User.findOne({ clerkId });

      if (!user) {
        try {
          // If user doesn't exist in DB, fetch from Clerk and create
          const clerkUser = await clerkClient.users.getUser(clerkId);

          const newUser = {
            clerkId: clerkId,
            email: clerkUser.emailAddresses[0]?.emailAddress,
            name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`,
            profileImage: clerkUser.imageUrl,
          };

          user = await User.create(newUser);

          // Also sync with Stream
          await upsertStreamUser({
            id: newUser.clerkId.toString(),
            name: newUser.name,
            image: newUser.profileImage,
          });
        } catch (error) {
          console.error("Error syncing user from Clerk:", error);
          return res.status(404).json({ message: "User not found" });
        }
      }

      // attach user to req
      req.user = user;

      next();
    } catch (error) {
      console.error("Error in protectRoute middleware", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  },
];

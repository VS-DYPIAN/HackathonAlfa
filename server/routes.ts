import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { setupAuth, hashPassword } from "./auth";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import passport from "passport";
import { z } from "zod";

const updateWalletSchema = z.object({
  amount: z.number()
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Auth routes
  app.post("/api/register", async (req, res) => {
    try {
      console.log('Registration attempt with payload:', req.body);
      const userData = insertUserSchema.parse(req.body);
      console.log('Validation passed, parsed data:', userData);

      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({ 
          message: "Username already exists" 
        });
      }

      const hashedPassword = await hashPassword(userData.password);
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword
      });

      req.login(user, (err) => {
        if (err) {
          console.error('Login error after registration:', err);
          return res.status(500).json({ 
            message: "Registration successful but login failed" 
          });
        }
        res.status(201).json(user);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', error.errors);
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      console.error('Registration error:', error);
      res.status(400).json({ 
        message: "Registration failed", 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.json(req.user);
  });

  app.post("/api/logout", (req, res) => {
    req.logout(() => {
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.user) return res.sendStatus(401);
    res.json(req.user);
  });

  // Admin routes
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update individual wallet balance
  app.patch("/api/admin/wallet/:userId", async (req, res) => {
    try {
      const { amount } = updateWalletSchema.parse(req.body);
      const userId = parseInt(req.params.userId);
      const updatedUser = await storage.updateUserWalletBalance(userId, amount);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating wallet balance:', error);
      res.status(400).json({ 
        message: "Failed to update wallet balance",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update all employee wallet balances
  app.post("/api/admin/wallet/update-all", async (req, res) => {
    try {
      const { amount } = updateWalletSchema.parse(req.body);
      await storage.updateAllEmployeeWalletBalances(amount);
      res.json({ message: "Successfully updated all employee wallet balances" });
    } catch (error) {
      console.error('Error updating all wallet balances:', error);
      res.status(400).json({ 
        message: "Failed to update wallet balances",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return httpServer;
}
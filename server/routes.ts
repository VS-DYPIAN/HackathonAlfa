import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { setupAuth, hashPassword } from "./auth";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import passport from "passport";
import { z } from "zod";

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

      // Hash the password before storing
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

  app.get("/api/vendors", async (req, res) => {
    try {
      const result = await storage.pool.request()
        .query("SELECT id, username FROM users WHERE role = 'vendor'");
      res.json(result.recordset);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  return httpServer;
}
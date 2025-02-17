import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { setupAuth, hashPassword } from "./auth";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import passport from "passport";
import { z } from "zod";
import sql from "mssql"; // Assuming mssql library is used

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Auth routes
  app.post("/api/register", async (req, res) => {
    try {
      console.log("Registration attempt with payload:", req.body);
      const userData = insertUserSchema.parse(req.body);
      console.log("Validation passed, parsed data:", userData);

      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(400).json({
          message: "Username already exists",
        });
      }

      // Hash the password before storing
      const hashedPassword = await hashPassword(userData.password);
      const user = await storage.createUser({
        ...userData,
        password: hashedPassword,
      });

      req.login(user, (err) => {
        if (err) {
          console.error("Login error after registration:", err);
          return res.status(500).json({
            message: "Registration successful but login failed",
          });
        }
        res.status(201).json(user);
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({
          message: "Validation error",
          errors: error.errors,
        });
      }
      console.error("Registration error:", error);
      res.status(400).json({
        message: "Registration failed",
        error: error instanceof Error ? error.message : String(error),
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
      // Create default Acai vendor if not exists
      await storage.pool.request().query(`
          IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'Acai' AND role = 'vendor')
          INSERT INTO users (username, password, role)
          VALUES ('Acai', '${await hashPassword("acai123")}', 'vendor')
        `);

      const result = await storage.pool
        .request()
        .query(
          "SELECT id, username FROM users WHERE role = 'vendor' ORDER BY CASE WHEN username = 'Acai' THEN 0 ELSE 1 END, username",
        );
      res.json(result.recordset);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  app.post("/api/employee/pay", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "employee") {
      return res.sendStatus(403);
    }

    try {
      const { vendorId, amount } = req.body;
      if (!vendorId || !amount) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Create transaction first
      const transaction = new sql.Transaction(storage.pool);
      await transaction.begin();
      try {
        const result = await transaction
          .request()
          .input("employeeId", sql.Int, req.user.id)
          .input("vendorId", sql.Int, vendorId)
          .input("amount", sql.Decimal(10, 2), amount)
          .input("status", sql.VarChar(20), "completed") // Initialize as pending
          .query(`
            INSERT INTO transactions (employeeId, vendorId, amount, timestamp, status)
            VALUES (@employeeId, @vendorId, @amount, GETDATE(), @status);
            SELECT SCOPE_IDENTITY() as transactionId;
          `);
        const transactionId = result.recordset[0].transactionId;

        // Update employee wallet balance
        await transaction
          .request()
          .input("userId", sql.Int, req.user.id)
          .input("amount", sql.Decimal(10, 2), amount)
          .query(
            "UPDATE users SET walletBalance = walletBalance - @amount WHERE id = @userId",
          );

        // Update vendor wallet balance
        await transaction
          .request()
          .input("vendorId", sql.Int, vendorId)
          .input("amount", sql.Decimal(10, 2), amount)
          .query(
            "UPDATE users SET walletBalance = walletBalance + @amount WHERE id = @vendorId",
          );

        await transaction.commit();
        res.json({ transactionId, ...result.recordset[0] });
      } catch (error) {
        await transaction.rollback();
        console.error("Payment error (transaction rollback):", error);
        res
          .status(500)
          .json({ message: "Payment failed", error: error.message });
      }
    } catch (error) {
      console.error("Payment error:", error);
      res.status(500).json({ message: "Payment failed", error: error.message });
    }
  });

  // Transaction history endpoints
  app.get("/api/employee/transactions", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "employee") {
      return res.sendStatus(403);
    }

    try {
      const result = await storage.pool
        .request()
        .input("employeeId", sql.Int, req.user.id).query(`
          SELECT 
            t.*,
            v.username as vendorName
          FROM transactions t
          JOIN users v ON t.vendorId = v.id
          WHERE t.employeeId = @employeeId
          ORDER BY t.timestamp DESC
        `);
      res.json(result.recordset);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get("/api/vendor/transactions", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "vendor") {
      return res.sendStatus(403);
    }

    try {
      const result = await storage.pool
        .request()
        .input("vendorId", sql.Int, req.user.id).query(`
          SELECT 
            t.*,
            e.username as employeeName
          FROM transactions t
          JOIN users e ON t.employeeId = e.id
          WHERE t.vendorId = @vendorId
          ORDER BY t.timestamp DESC
        `);
      res.json(result.recordset);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Report generation endpoints
  app.get("/api/vendor/reports", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "vendor") {
      return res.sendStatus(403);
    }

    const format = req.query.format as string;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(0);
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    try {
      const result = await storage.pool
        .request()
        .input("vendorId", sql.Int, req.user.id)
        .input("startDate", sql.DateTime, startDate)
        .input("endDate", sql.DateTime, endDate).query(`
          SELECT 
            t.*,
            e.username as employeeName
          FROM transactions t
          JOIN users e ON t.employeeId = e.id
          WHERE t.vendorId = @vendorId 
          AND t.timestamp BETWEEN @startDate AND @endDate
          ORDER BY t.timestamp DESC
        `);

      const transactions = result.recordset;

      if (format === "excel") {
        const XLSX = require("xlsx");
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(transactions);
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=transactions.xlsx",
        );
        return res.send(buffer);
      }

      if (format === "pdf") {
        const PDFDocument = require("pdfkit");
        const doc = new PDFDocument();

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=transactions.pdf",
        );
        doc.pipe(res);

        doc.fontSize(16).text("Transaction Report", { align: "center" });
        doc.moveDown();

        transactions.forEach((t) => {
          doc
            .fontSize(12)
            .text(`Date: ${new Date(t.timestamp).toLocaleString()}`);
          doc.text(`Employee: ${t.employeeName}`);
          doc.text(`Amount: ₹${t.amount}`);
          doc.text(`Status: ${t.status}`);
          doc.moveDown();
        });

        doc.end();
        return;
      }

      res.json(transactions);
    } catch (error) {
      console.error("Report generation error:", error);
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  return httpServer;
}

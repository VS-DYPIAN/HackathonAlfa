import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertUserSchema } from "@shared/schema";
import passport from "passport";
import { z } from "zod";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // WebSocket handling for real-time notifications
  wss.on("connection", (ws) => {
    ws.on("message", (message) => {
      // Broadcast transaction notifications
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });
  });

  // Auth routes
  app.post("/api/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByUsername(userData.username);

      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser(userData);
      req.login(user, (err) => {
        if (err) throw err;
        res.status(201).json(user);
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid input" });
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

  // Get all users for admin panel
  app.get("/api/users", async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const result = await storage.pool
      .request()
      .query("SELECT * FROM users");
    res.json(result.recordset);
  });

  // Get vendors for employee transaction
  app.get("/api/users/vendors", async (req, res) => {
    const result = await storage.pool
      .request()
      .query("SELECT * FROM users WHERE role = 'vendor'");
    res.json(result.recordset);
  });

  // Protected routes
  app.use((req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });

  // Admin routes
  app.patch("/api/wallet/:userId", async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const amount = z.number().parse(req.body.amount);
    const userId = z.number().parse(parseInt(req.params.userId));

    await storage.updateWalletBalance(userId, amount);
    res.sendStatus(200);
  });

  // Transaction routes
  app.post("/api/transactions", async (req, res) => {
    if (req.user?.role !== "employee") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const transaction = await storage.createTransaction({
      employeeId: req.user.id,
      vendorId: req.body.vendorId,
      amount: req.body.amount,
      createdAt: new Date(),
    });

    await storage.updateWalletBalance(req.user.id, -transaction.amount);
    await storage.updateWalletBalance(req.body.vendorId, transaction.amount);

    // Notify connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(transaction));
      }
    });

    res.status(201).json(transaction);
  });

  app.get("/api/transactions", async (req, res) => {
    const filters = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      employeeId: req.user?.role === "employee" ? req.user.id : undefined,
      vendorId: req.user?.role === "vendor" ? req.user.id : undefined,
    };

    const transactions = await storage.getTransactions(filters);
    res.json(transactions);
  });

  // Report generation route
  app.get("/api/reports", async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        employeeId: req.user?.role === "employee" ? req.user.id : undefined,
        vendorId: req.user?.role === "vendor" ? req.user.id : undefined,
      };

      const transactions = await storage.getTransactions(filters);
      const format = req.query.format as string;

      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Transactions');

        worksheet.columns = [
          { header: 'Transaction ID', key: 'id', width: 15 },
          { header: 'Employee ID', key: 'employeeId', width: 15 },
          { header: 'Vendor ID', key: 'vendorId', width: 15 },
          { header: 'Amount', key: 'amount', width: 15 },
          { header: 'Date', key: 'createdAt', width: 20 },
        ];

        worksheet.addRows(transactions);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.xlsx');
        await workbook.xlsx.write(res);
        return;
      } 

      if (format === 'pdf') {
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.pdf');
        doc.pipe(res);

        doc.fontSize(16).text('Transaction Report', { align: 'center' });
        doc.moveDown();

        const tableTop = 150;
        const colWidth = 100;

        // Draw headers
        doc.fontSize(12);
        doc.text('ID', 50, tableTop);
        doc.text('Employee', 150, tableTop);
        doc.text('Vendor', 250, tableTop);
        doc.text('Amount', 350, tableTop);
        doc.text('Date', 450, tableTop);

        let y = tableTop + 20;
        transactions.forEach((t) => {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }
          doc.fontSize(10);
          doc.text(t.id.toString(), 50, y);
          doc.text(t.employeeId.toString(), 150, y);
          doc.text(t.vendorId.toString(), 250, y);
          doc.text(`$${t.amount.toFixed(2)}`, 350, y);
          doc.text(new Date(t.createdAt).toLocaleDateString(), 450, y);
          y += 20;
        });

        doc.end();
        return;
      }

      res.status(400).json({ message: "Invalid format specified" });
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({ message: "Error generating report" });
    }
  });

  return httpServer;
}
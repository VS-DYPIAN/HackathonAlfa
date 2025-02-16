import { User, InsertUser, Transaction, InsertTransaction } from "@shared/schema";
import sql from "mssql";
import createMemoryStore from "memorystore";
import session from "express-session";

const MemoryStore = createMemoryStore(session);

const dbConfig = {
  user: "vaibhavsawant",
  password: "Gamechanger@14",
  server: "al-techies.database.windows.net",
  port: 1433,
  database: "foodcoupon",
  options: {
    encrypt: true,
    trustServerCertificate: true,
    connectionTimeout: 30000,
    requestTimeout: 30000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  },
};

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateWalletBalance(userId: number, amount: number): Promise<void>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getTransactions(filters: { 
    startDate?: Date; 
    endDate?: Date;
    employeeId?: number;
    vendorId?: number;
  }): Promise<Transaction[]>;
  sessionStore: session.Store;
  pool: sql.ConnectionPool;
  connect(): Promise<void>;
}

export class SqlServerStorage implements IStorage {
  pool: sql.ConnectionPool;
  sessionStore: session.Store;
  private connectionRetries: number = 3;
  private retryDelayMs: number = 5000;

  constructor() {
    this.pool = new sql.ConnectionPool(dbConfig);
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async connect(): Promise<void> {
    for (let attempt = 1; attempt <= this.connectionRetries; attempt++) {
      try {
        if (!this.pool.connected) {
          await this.pool.connect();
        }
        console.log('Connected to SQL Server successfully');

        // Create tables if they don't exist
        await this.pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' and xtype='U')
          CREATE TABLE users (
            id INT IDENTITY(1,1) PRIMARY KEY,
            username NVARCHAR(255) NOT NULL UNIQUE,
            password NVARCHAR(255) NOT NULL,
            email NVARCHAR(255) NOT NULL,
            role NVARCHAR(50) NOT NULL,
            walletBalance DECIMAL(10,2) DEFAULT 0
          )
        `);

        await this.pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='transactions' and xtype='U')
          CREATE TABLE transactions (
            id INT IDENTITY(1,1) PRIMARY KEY,
            employeeId INT NOT NULL,
            vendorId INT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            createdAt DATETIME DEFAULT GETDATE(),
            FOREIGN KEY (employeeId) REFERENCES users(id),
            FOREIGN KEY (vendorId) REFERENCES users(id)
          )
        `);

        return;
      } catch (err) {
        console.error(`Database connection attempt ${attempt} failed:`, err);
        if (attempt === this.connectionRetries) {
          throw new Error(`Failed to connect to database after ${this.connectionRetries} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }

  private async ensureConnection() {
    if (!this.pool.connected) {
      await this.connect();
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    await this.ensureConnection();
    const result = await this.pool
      .request()
      .input("id", sql.Int, id)
      .query("SELECT * FROM users WHERE id = @id");
    return result.recordset[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureConnection();
    const result = await this.pool
      .request()
      .input("username", sql.NVarChar, username)
      .query("SELECT * FROM users WHERE username = @username");
    return result.recordset[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    await this.ensureConnection();
    const result = await this.pool
      .request()
      .input("username", sql.NVarChar, user.username)
      .input("password", sql.NVarChar, user.password)
      .input("email", sql.NVarChar, user.email)
      .input("role", sql.NVarChar, user.role)
      .query(`
        INSERT INTO users (username, password, email, role)
        OUTPUT INSERTED.*
        VALUES (@username, @password, @email, @role)
      `);
    return result.recordset[0];
  }

  async updateWalletBalance(userId: number, amount: number): Promise<void> {
    await this.ensureConnection();
    await this.pool
      .request()
      .input("userId", sql.Int, userId)
      .input("amount", sql.Decimal(10, 2), amount)
      .query(`
        UPDATE users 
        SET walletBalance = walletBalance + @amount 
        WHERE id = @userId
      `);
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    await this.ensureConnection();
    const result = await this.pool
      .request()
      .input("employeeId", sql.Int, transaction.employeeId)
      .input("vendorId", sql.Int, transaction.vendorId)
      .input("amount", sql.Decimal(10, 2), transaction.amount)
      .input("createdAt", sql.DateTime, transaction.createdAt)
      .query(`
        INSERT INTO transactions (employeeId, vendorId, amount, createdAt)
        OUTPUT INSERTED.*
        VALUES (@employeeId, @vendorId, @amount, @createdAt)
      `);
    return result.recordset[0];
  }

  async getTransactions(filters: {
    startDate?: Date;
    endDate?: Date;
    employeeId?: number;
    vendorId?: number;
  }): Promise<Transaction[]> {
    await this.ensureConnection();
    let query = "SELECT * FROM transactions WHERE 1=1";
    const request = this.pool.request();

    if (filters.startDate) {
      query += " AND createdAt >= @startDate";
      request.input("startDate", sql.DateTime, filters.startDate);
    }
    if (filters.endDate) {
      query += " AND createdAt <= @endDate";
      request.input("endDate", sql.DateTime, filters.endDate);
    }
    if (filters.employeeId) {
      query += " AND employeeId = @employeeId";
      request.input("employeeId", sql.Int, filters.employeeId);
    }
    if (filters.vendorId) {
      query += " AND vendorId = @vendorId";
      request.input("vendorId", sql.Int, filters.vendorId);
    }

    query += " ORDER BY createdAt DESC";
    const result = await request.query(query);
    return result.recordset;
  }
}

export const storage = new SqlServerStorage();
// Initialize database connection
storage.connect().catch(console.error);
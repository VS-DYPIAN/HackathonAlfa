import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Transaction, User, Role } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FaFilePdf, FaFileCsv } from "react-icons/fa";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Date formatting helper
const formatDate = (date: Date) => date.toLocaleDateString();

export default function AdminDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined
  });

  // Fetch users with proper error handling
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to fetch users");
      }
      return res.json();
    },
  });

  // Fetch transactions with proper date handling
  const { data: transactions, isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.from) params.append("startDate", dateRange.from.toISOString());
      if (dateRange.to) params.append("endDate", dateRange.to.toISOString());
      const res = await fetch(`/api/transactions?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to fetch transactions");
      }
      return res.json();
    }
  });

  // Update single user wallet balance
  const updateWalletMutation = useMutation({
    mutationFn: async ({ userId, amount }: { userId: number; amount: string }) => {
      if (!userId || !amount) {
        throw new Error("User ID and amount are required");
      }
      const res = await apiRequest("PATCH", `/api/admin/wallet/${userId}`, {
        amount: parseFloat(amount)
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update wallet balance");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Wallet balance updated successfully",
      });
      setAmount("");
      setSelectedUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update all employee wallet balances
  const updateAllWalletsMutation = useMutation({
    mutationFn: async ({ amount }: { amount: string }) => {
      if (!amount) {
        throw new Error("Amount is required");
      }
      const res = await apiRequest("POST", "/api/admin/wallet/update-all", { 
        amount: parseFloat(amount) 
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update wallet balances");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Wallet balance updated for all employees",
      });
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Download report function
  const downloadReport = async (format: 'pdf' | 'csv') => {
    try {
      const params = new URLSearchParams({
        format,
        ...(dateRange.from && { startDate: dateRange.from.toISOString() }),
        ...(dateRange.to && { endDate: dateRange.to.toISOString() })
      });

      const response = await fetch(`/api/admin/reports?${params}`);
      if (!response.ok) throw new Error('Failed to download report');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transactions.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download report",
        variant: "destructive",
      });
    }
  };

  // Filter employees
  const filteredEmployees = users?.filter(u => 
    u.role === Role.EMPLOYEE && 
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <div className="flex items-center gap-4">
            <span>Welcome, {user?.username}</span>
            <Button 
              variant="outline" 
              onClick={() => logoutMutation.mutate()} 
              disabled={logoutMutation.isPending}
            >
              Logout
            </Button>
          </div>
        </div>

        <div className="flex justify-between items-center mb-4 p-4 bg-muted rounded-lg shadow-sm">
          <h2 className="text-lg font-semibold">Employee Wallet Management</h2>
          <div className="flex items-center gap-4">
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="w-32"
            />
            <Button 
              variant="default" 
              onClick={() => updateAllWalletsMutation.mutate({ amount })}
              disabled={updateAllWalletsMutation.isPending || !amount}
              className="w-full md:w-auto"
            >
              {updateAllWalletsMutation.isPending ? "Updating..." : "Update All Balances"}
            </Button>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Employee List</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <Label htmlFor="employeeSearch">Search Employee</Label>
                <Input
                  id="employeeSearch"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Enter employee name"
                />
              </div>
              {usersLoading ? (
                <p className="text-center">Loading employees...</p>
              ) : filteredEmployees.length > 0 ? (
                filteredEmployees.map((employee) => (
                  <div key={employee.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{employee.username}</p>
                      <p className="text-sm text-muted-foreground">
                        Balance: ₹{employee.walletBalance.toFixed(2)}
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => setSelectedUserId(employee.id)}
                    >
                      Update Balance
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground">No employees found</p>
              )}
            </CardContent>
          </Card>

          {selectedUserId && (
            <Card>
              <CardHeader>
                <CardTitle>Update Wallet Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateWalletMutation.mutate({ userId: selectedUserId, amount });
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={updateWalletMutation.isPending || !amount}
                  >
                    {updateWalletMutation.isPending ? "Updating..." : "Update Balance"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Transaction Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="grid gap-2 w-full md:w-auto">
                  <Label>Date Range</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="date"
                      value={dateRange.from?.toISOString().split('T')[0] || ''}
                      onChange={(e) => setDateRange(prev => ({
                        ...prev,
                        from: e.target.value ? new Date(e.target.value) : undefined
                      }))}
                      className="w-full md:w-auto"
                    />
                    <Input
                      type="date"
                      value={dateRange.to?.toISOString().split('T')[0] || ''}
                      onChange={(e) => setDateRange(prev => ({
                        ...prev,
                        to: e.target.value ? new Date(e.target.value) : undefined
                      }))}
                      className="w-full md:w-auto"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 w-full md:w-auto justify-center md:justify-end">
                  <Button 
                    onClick={() => downloadReport('csv')} 
                    className="w-full md:w-auto flex items-center gap-2"
                  >
                    <FaFileCsv className="text-green-600" /> Download CSV
                  </Button>
                  <Button 
                    onClick={() => downloadReport('pdf')} 
                    className="w-full md:w-auto flex items-center gap-2"
                  >
                    <FaFilePdf className="text-red-600" /> Download PDF
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions?.length ? (
                      transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            {formatDate(new Date(transaction.createdAt))}
                          </TableCell>
                          <TableCell>
                            {users?.find(u => u.id === transaction.employeeId)?.username ?? "Unknown"}
                          </TableCell>
                          <TableCell>
                            {users?.find(u => u.id === transaction.vendorId)?.username ?? "Unknown"}
                          </TableCell>
                          <TableCell>₹{transaction.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center">
                          {transactionsLoading ? "Loading..." : "No transactions found"}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
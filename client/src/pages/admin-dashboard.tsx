import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Role, User, Transaction } from "@shared/schema";
import { Download } from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [dateRange, setDateRange] = useState({ 
    startDate: "", 
    endDate: "" 
  });

  if (user?.role !== Role.ADMIN) {
    return <div>Access denied</div>;
  }

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    }
  });

  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      const res = await fetch(`/api/transactions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    }
  });

  const updateBalanceMutation = useMutation({
    mutationFn: async ({ userId, amount }: { userId: number; amount: number }) => {
      await apiRequest("PATCH", `/api/wallet/${userId}`, { amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "Wallet balance updated successfully",
      });
    }
  });

  const handleUpdateBalance = () => {
    if (!selectedUserId || !amount) return;
    updateBalanceMutation.mutate({
      userId: selectedUserId,
      amount: parseFloat(amount)
    });
  };

  const downloadReport = async (format: 'pdf' | 'excel') => {
    const params = new URLSearchParams();
    if (dateRange.startDate) params.append("startDate", dateRange.startDate);
    if (dateRange.endDate) params.append("endDate", dateRange.endDate);
    params.append("format", format);

    const res = await fetch(`/api/reports?${params}`);
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-report.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Update Wallet Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <select
                className="w-full h-10 px-3 rounded-md border"
                onChange={(e) => setSelectedUserId(Number(e.target.value))}
              >
                <option value="">Select Employee</option>
                {users?.filter((u: User) => u.role === Role.EMPLOYEE).map((user: User) => (
                  <option key={user.id} value={user.id}>
                    {user.username}
                  </option>
                ))}
              </select>

              <Input
                type="number"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />

              <Button onClick={handleUpdateBalance}>Update Balance</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generate Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ 
                  ...prev, 
                  startDate: e.target.value 
                }))}
              />
              <Input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ 
                  ...prev, 
                  endDate: e.target.value 
                }))}
              />
              <div className="flex gap-4">
                <Button onClick={() => downloadReport('pdf')}>
                  <Download className="mr-2 h-4 w-4" />
                  PDF
                </Button>
                <Button onClick={() => downloadReport('excel')}>
                  <Download className="mr-2 h-4 w-4" />
                  Excel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left p-2">ID</th>
                  <th className="text-left p-2">Employee</th>
                  <th className="text-left p-2">Vendor</th>
                  <th className="text-left p-2">Amount</th>
                  <th className="text-left p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions?.map((transaction: Transaction) => (
                  <tr key={transaction.id}>
                    <td className="p-2">{transaction.id}</td>
                    <td className="p-2">{transaction.employeeId}</td>
                    <td className="p-2">{transaction.vendorId}</td>
                    <td className="p-2">${transaction.amount}</td>
                    <td className="p-2">
                      {new Date(transaction.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
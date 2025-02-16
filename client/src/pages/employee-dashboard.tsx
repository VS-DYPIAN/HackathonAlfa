import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Role, User, Transaction } from "@shared/schema";

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onmessage = (event) => {
      const transaction = JSON.parse(event.data);
      if (transaction.employeeId === user?.id) {
        toast({
          title: "Transaction Completed",
          description: `Amount: $${transaction.amount}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
    };

    setWs(socket);
    return () => socket.close();
  }, [user?.id]);

  if (user?.role !== Role.EMPLOYEE) {
    return <div>Access denied</div>;
  }

  const { data: vendors } = useQuery<User[]>({
    queryKey: ["/api/users/vendors"],
    queryFn: async () => {
      const res = await fetch("/api/users/vendors");
      if (!res.ok) throw new Error("Failed to fetch vendors");
      return res.json();
    }
  });

  const { data: transactions } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", user.id],
    queryFn: async () => {
      const res = await fetch(`/api/transactions?employeeId=${user.id}`);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    }
  });

  const transactionMutation = useMutation({
    mutationFn: async (data: { vendorId: number; amount: number }) => {
      await apiRequest("POST", "/api/transactions", data);
    },
    onSuccess: () => {
      setAmount("");
      setSelectedVendor("");
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    }
  });

  const handleTransaction = () => {
    if (!selectedVendor || !amount || !user) return;

    if (parseFloat(amount) > user.walletBalance) {
      toast({
        title: "Error",
        description: "Insufficient balance",
        variant: "destructive",
      });
      return;
    }

    transactionMutation.mutate({
      vendorId: parseInt(selectedVendor),
      amount: parseFloat(amount),
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-6">Employee Dashboard</h1>

      <Card>
        <CardHeader>
          <CardTitle>Wallet Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <h2 className="text-2xl font-bold">
            ${user?.walletBalance.toFixed(2)}
          </h2>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New Transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <select
              className="w-full h-10 px-3 rounded-md border"
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
            >
              <option value="">Select Vendor</option>
              {vendors?.map((vendor: User) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.username}
                </option>
              ))}
            </select>

            <Input
              type="number"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <Button 
              onClick={handleTransaction}
              disabled={transactionMutation.isPending}
            >
              Complete Transaction
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  <th className="text-left p-2">Vendor</th>
                  <th className="text-left p-2">Amount</th>
                  <th className="text-left p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions?.map((transaction: Transaction) => (
                  <tr key={transaction.id}>
                    <td className="p-2">{transaction.id}</td>
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
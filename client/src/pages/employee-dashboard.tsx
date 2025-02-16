import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User, Transaction } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { WalletCards } from "lucide-react";

export default function EmployeeDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [amount, setAmount] = useState("");

  const { data: vendors } = useQuery<User[]>({
    queryKey: ["/api/vendors"],
    queryFn: async () => {
      const res = await fetch("/api/vendors");
      if (!res.ok) throw new Error("Failed to fetch vendors");
      return res.json();
    },
  });

  const { data: transactions, refetch } = useQuery<Transaction[]>({
    queryKey: ["/api/employee/transactions"],
    queryFn: async () => {
      const res = await fetch("/api/employee/transactions");
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    refetchOnWindowFocus: true,
  });

  const payVendorMutation = useMutation({
    mutationFn: async ({ vendorId, amount }: { vendorId: number; amount: number }) => {
      const res = await apiRequest("POST", "/api/employee/pay", {
        vendorId,
        amount,
      });
      return res.json();
    },
    onSuccess: () => {
      setAmount("");
      setSelectedVendorId("");

      queryClient.invalidateQueries({ queryKey: ["/api/employee/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      // Redirect using window.location
      window.location.href = "/payment";
    },
  });

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Employee Dashboard</h1>
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

        {/* Payment Form */}
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <WalletCards className="h-6 w-6" />
                Wallet Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">₹{user?.walletBalance}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Make Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!selectedVendorId || !amount) return;

                  // Confirmation before payment
                  const isConfirmed = window.confirm(
                    `Are you sure you want to proceed with a payment of ₹${amount}?`
                  );

                  if (!isConfirmed) return;

                  payVendorMutation.mutate({
                    vendorId: parseInt(selectedVendorId),
                    amount: parseFloat(amount),
                  });
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="vendor">Select Vendor</Label>
                  <Select
                    value={selectedVendorId}
                    onValueChange={setSelectedVendorId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors
                        ?.filter((v) => v.role === "vendor")
                        .map((vendor) => (
                          <SelectItem
                            key={vendor.id}
                            value={vendor.id.toString()}
                          >
                            {vendor.username}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

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
                  disabled={
                    payVendorMutation.isPending ||
                    !selectedVendorId ||
                    !amount ||
                    parseFloat(amount) <= 0
                  }
                >
                  {payVendorMutation.isPending ? "Processing..." : "Pay"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {transactions?.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">Amount: ₹{transaction.amount}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(
                        new Date(transaction.createdAt),
                        "MMM d, yyyy h:mm a"
                      )}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-sm ${
                      transaction.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {transaction.status}
                  </span>
                </div>
              ))}
              {(!transactions || transactions.length === 0) && (
                <p className="text-center text-muted-foreground">
                  No transactions yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
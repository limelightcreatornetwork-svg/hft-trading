"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import StrategyCard, {
  type StrategyData,
} from "@/components/strategy/StrategyCard";
import StrategyStats from "@/components/strategy/StrategyStats";
import StrategyForm, {
  type StrategyFormData,
} from "@/components/strategy/StrategyForm";

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StrategyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStrategies = useCallback(async () => {
    try {
      const res = await fetch("/api/strategies");
      const json = await res.json();
      if (json.success) {
        setStrategies(json.data.strategies);
        setError(null);
      }
    } catch {
      setError("Failed to load strategies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
    const interval = setInterval(fetchStrategies, 10000);
    return () => clearInterval(interval);
  }, [fetchStrategies]);

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/strategies/${id}`, { method: "PATCH" });
      const json = await res.json();
      if (json.success) {
        setStrategies((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, enabled: json.data.enabled } : s
          )
        );
      }
    } catch {
      setError("Failed to toggle strategy");
    }
  };

  const handleCreate = async (data: StrategyFormData) => {
    try {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setStrategies((prev) => [json.data, ...prev]);
        setShowForm(false);
        setError(null);
      } else {
        setError(json.error || "Failed to create strategy");
      }
    } catch {
      setError("Failed to create strategy");
    }
  };

  const handleUpdate = async (data: StrategyFormData) => {
    if (!editing) return;
    try {
      const res = await fetch(`/api/strategies/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setStrategies((prev) =>
          prev.map((s) => (s.id === editing.id ? json.data : s))
        );
        setEditing(null);
        setError(null);
      } else {
        setError(json.error || "Failed to update strategy");
      }
    } catch {
      setError("Failed to update strategy");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this strategy?")) return;
    try {
      const res = await fetch(`/api/strategies/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setStrategies((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      setError("Failed to delete strategy");
    }
  };

  const handleEdit = (strategy: StrategyData) => {
    setEditing(strategy);
    setShowForm(false);
  };

  const handleExecute = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/strategies/${id}/execute`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        const { summary } = json.data;
        setError(null);
        alert(
          `Executed: ${summary.executed} trades, ${summary.skipped} skipped out of ${summary.total} signals`
        );
        fetchStrategies();
      } else {
        setError(json.error || "Execution failed");
      }
    } catch {
      setError("Failed to execute strategy");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading strategies...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Strategies</h1>
        <Button
          onClick={() => {
            setShowForm(!showForm);
            setEditing(null);
          }}
        >
          {showForm ? "Cancel" : "+ New Strategy"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <StrategyStats strategies={strategies} />

      {showForm && (
        <StrategyForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {editing && (
        <StrategyForm
          initial={editing}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      )}

      {strategies.length === 0 && !showForm ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg mb-2">No strategies yet</p>
          <p className="text-sm">
            Create your first strategy to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strategies.map((strategy) => (
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onExecute={handleExecute}
            />
          ))}
        </div>
      )}
    </div>
  );
}

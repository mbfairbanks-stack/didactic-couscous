export default function StatCard({ label, value, sub, color = "yellow" }) {
  const accent = {
    yellow: "border-t-yellow-400 text-yellow-400",
    green:  "border-t-green-400 text-green-400",
    red:    "border-t-red-400 text-red-400",
    purple: "border-t-purple-400 text-purple-400",
    blue:   "border-t-blue-400 text-blue-400",
  };
  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-800 border-t-2 p-5 shadow-sm ${accent[color] ?? accent.yellow}`}>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 text-zinc-600">{sub}</p>}
    </div>
  );
}

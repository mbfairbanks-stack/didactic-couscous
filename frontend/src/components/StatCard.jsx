export default function StatCard({ label, value, sub, color = "yellow" }) {
  const colors = {
    yellow: "border-yellow-400/30 text-yellow-400",
    green:  "border-green-500/30 text-green-400",
    red:    "border-red-500/30 text-red-400",
    purple: "border-purple-500/30 text-purple-400",
    blue:   "border-yellow-400/30 text-yellow-400",
  };
  return (
    <div className={`bg-zinc-900 rounded-xl border p-5 ${colors[color] ?? colors.yellow}`}>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 text-zinc-600">{sub}</p>}
    </div>
  );
}

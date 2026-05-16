import { useState, useEffect } from "react";
import { getTaxSummary } from "../api";

const fmt = (n) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n ?? 0);

export default function TaxSummary() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear - 1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (y) => {
    setLoading(true);
    setError("");
    try {
      const result = await getTaxSummary(y);
      setData(result);
    } catch (e) {
      setError(e.message || "Failed to load tax summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(year); }, [year]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const SEL = "bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-yellow-400";

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yellow-400">Tax Summary</h1>
        <select className={SEL} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading && <p className="text-zinc-400 text-sm">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {data && (
        <div className="space-y-4">
          {/* Income by person */}
          {Object.entries(data.by_person).map(([person, info]) => (
            <div key={person} className="bg-zinc-800 rounded-xl p-4">
              <h2 className="text-yellow-400 font-semibold mb-3">{person}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-zinc-400">Gross Employment Income</p>
                  <p className="text-zinc-100 font-mono text-lg">{fmt(info.gross_income)}</p>
                </div>
                <div>
                  <p className="text-zinc-400">Other Income</p>
                  <p className="text-zinc-100 font-mono text-lg">{fmt(info.other_income)}</p>
                </div>
                <div>
                  <p className="text-zinc-400">RRSP Contributions (Employee)</p>
                  <p className="text-green-400 font-mono">{fmt(info.rrsp_employee)}</p>
                </div>
                <div>
                  <p className="text-zinc-400">RRSP Contributions (Employer Match)</p>
                  <p className="text-green-400 font-mono">{fmt(info.rrsp_employer)}</p>
                </div>
                <div>
                  <p className="text-zinc-400">ESPP Deductions</p>
                  <p className="text-zinc-100 font-mono">{fmt(info.espp_deduction)}</p>
                </div>
              </div>
            </div>
          ))}

          {/* Totals */}
          <div className="bg-zinc-800 rounded-xl p-4">
            <h2 className="text-yellow-400 font-semibold mb-3">Totals</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-400">Total RRSP (Employee)</p>
                <p className="text-green-400 font-mono text-lg">{fmt(data.total_rrsp_employee)}</p>
              </div>
              <div>
                <p className="text-zinc-400">Total RRSP (Employer)</p>
                <p className="text-green-400 font-mono text-lg">{fmt(data.total_rrsp_employer)}</p>
              </div>
              <div>
                <p className="text-zinc-400">Total RRSP (Combined)</p>
                <p className="text-green-400 font-mono text-lg">{fmt(data.total_rrsp_employee + data.total_rrsp_employer)}</p>
              </div>
              <div>
                <p className="text-zinc-400">Charitable Donations</p>
                <p className="text-yellow-400 font-mono text-lg">{fmt(data.total_donations)}</p>
              </div>
            </div>
          </div>

          {/* ESPP Purchases */}
          {data.espp_purchases.length > 0 && (
            <div className="bg-zinc-800 rounded-xl p-4">
              <h2 className="text-yellow-400 font-semibold mb-3">ESPP Purchases</h2>
              <div className="space-y-3">
                {data.espp_purchases.map((e, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 text-sm border-t border-zinc-700 pt-3 first:border-0 first:pt-0">
                    <div>
                      <p className="text-zinc-400">Purchase Date</p>
                      <p className="text-zinc-100">{e.purchase_date}</p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Total Deducted</p>
                      <p className="text-zinc-100 font-mono">{fmt(e.total_deducted)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-400">Discount Benefit</p>
                      <p className="text-green-400 font-mono">{fmt(e.discount_benefit)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

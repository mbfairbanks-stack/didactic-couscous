import { useState, useEffect, useRef } from "react";
import { getPrepTasks, createPrepTask, updatePrepTask, deletePrepTask, streamGeneratePrepList } from "../api";
import { format, addWeeks, subWeeks } from "date-fns";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", null];

function getMonday(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function toYMD(d) {
  return format(d, "yyyy-MM-dd");
}

export default function PrepList() {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTask, setNewTask] = useState("");
  const [newDay, setNewDay] = useState("");

  // AI
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiError, setAiError] = useState(null);
  const rawRef = useRef("");

  const weekKey = toYMD(weekStart);

  const load = () => {
    setLoading(true);
    getPrepTasks(weekKey)
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [weekKey]);

  const handleToggle = async (task) => {
    await updatePrepTask(task.id, { is_done: !task.is_done });
    load();
  };

  const handleDelete = async (id) => {
    await deletePrepTask(id);
    load();
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    await createPrepTask({
      week_start: weekKey,
      description: newTask.trim(),
      scheduled_day: newDay || null,
      source: "manual",
    });
    setNewTask("");
    setNewDay("");
    load();
  };

  const handleGenerateAI = () => {
    setAiStreaming(true);
    setAiError(null);
    rawRef.current = "";

    streamGeneratePrepList(
      { week_start: weekKey },
      (chunk) => { rawRef.current += chunk; },
      async () => {
        setAiStreaming(false);
        try {
          const parsed = JSON.parse(rawRef.current);
          for (const task of parsed) {
            await createPrepTask({
              week_start: weekKey,
              description: task.description,
              scheduled_day: task.scheduled_day || null,
              source: "ai",
            });
          }
          load();
        } catch {
          setAiError("Could not parse AI response. Make sure there's a meal plan for this week.");
        }
      },
      (err) => {
        setAiStreaming(false);
        setAiError(err);
      }
    );
  };

  // Group tasks by day
  const grouped = {};
  for (const task of tasks) {
    const key = task.scheduled_day || "Anytime";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(task);
  }

  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Anytime"];
  const sortedGroups = dayOrder.filter((d) => grouped[d]);

  const done = tasks.filter((t) => t.is_done).length;
  const total = tasks.length;

  const prevWeek = () => setWeekStart(subWeeks(weekStart, 1));
  const nextWeek = () => setWeekStart(addWeeks(weekStart, 1));
  const thisWeek = () => setWeekStart(getMonday(new Date()));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-stone-100">Prep List</h1>
          <div className="flex items-center gap-1">
            <button onClick={prevWeek} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-stone-800 text-gray-500 dark:text-stone-400">‹</button>
            <span className="text-sm font-medium text-gray-600 dark:text-stone-300 min-w-max">
              Week of {format(weekStart, "MMM d, yyyy")}
            </span>
            <button onClick={nextWeek} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-stone-800 text-gray-500 dark:text-stone-400">›</button>
          </div>
          <button onClick={thisWeek} className="text-xs text-green-600 hover:underline">This week</button>
        </div>
        <button
          onClick={handleGenerateAI}
          disabled={aiStreaming}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
        >
          {aiStreaming ? "Generating..." : "AI Generate from Meal Plan"}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {aiError && <p className="text-red-500 text-sm mb-4">{aiError}</p>}

      {/* Progress */}
      {total > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-sm text-gray-500 mb-1">
            <span>{done} of {total} tasks done</span>
            <span>{Math.round((done / total) * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Add Task */}
      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 mb-6">
        <input
          type="text"
          placeholder="Add a prep task..."
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
        />
        <select
          value={newDay}
          onChange={(e) => setNewDay(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Any day</option>
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
        >
          Add
        </button>
      </form>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No prep tasks yet.</p>
          <p className="text-sm mt-1">Add tasks manually or use AI Generate from your meal plan.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {sortedGroups.map((dayLabel) => (
            <div key={dayLabel}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{dayLabel}</h3>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm">
                {grouped[dayLabel].map((task) => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={task.is_done}
                      onChange={() => handleToggle(task)}
                      className="w-4 h-4 rounded accent-green-600 cursor-pointer"
                    />
                    <span className={`flex-1 text-sm ${task.is_done ? "line-through text-gray-400" : "text-gray-700"}`}>
                      {task.description}
                    </span>
                    {task.source === "ai" && (
                      <span className="text-xs text-purple-400 border border-purple-200 px-1.5 py-0.5 rounded-full">AI</span>
                    )}
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

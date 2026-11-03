import { useEffect, useState } from "react";
import { api } from "../api";

type Cat = { id: string; name: string; type: "INCOME" | "EXPENSE"; archived: boolean };

export function CategoriesPage() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [error, setError] = useState<string | null>(null);

  const load = async () => setCats((await api().categories.list()) as Cat[]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api().categories.create(name, type);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      <h1 className="page-title">Категории</h1>
      <p className="page-sub">Доходные и расходные категории</p>
      {error && <div className="error">{error}</div>}

      <div className="panel">
        <form className="row" onSubmit={create}>
          <label className="field">
            Название
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            Тип
            <select value={type} onChange={(e) => setType(e.target.value as "INCOME" | "EXPENSE")}>
              <option value="EXPENSE">Расход</option>
              <option value="INCOME">Доход</option>
            </select>
          </label>
          <button className="btn primary" type="submit">
            Создать
          </button>
        </form>
      </div>

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id} style={{ opacity: c.archived ? 0.55 : 1 }}>
                <td>
                  <input
                    defaultValue={c.name}
                    onBlur={(e) => {
                      if (e.target.value !== c.name) {
                        api()
                          .categories.rename(c.id, e.target.value)
                          .then(load)
                          .catch((err) => setError(err.message));
                      }
                    }}
                  />
                </td>
                <td>{c.type === "INCOME" ? "Доход" : "Расход"}</td>
                <td>
                  {c.archived ? (
                    <button className="btn" type="button" onClick={() => api().categories.restore(c.id).then(load)}>
                      Вернуть
                    </button>
                  ) : (
                    <button className="btn" type="button" onClick={() => api().categories.archive(c.id).then(load)}>
                      В архив
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
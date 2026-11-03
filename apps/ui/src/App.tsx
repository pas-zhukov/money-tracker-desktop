import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api } from "./api";
import { AuthPage } from "./screens/AuthPage";
import { JournalPage } from "./screens/JournalPage";
import { ChartsPage } from "./screens/ChartsPage";
import { PlanPage } from "./screens/PlanPage";
import { AccountsPage } from "./screens/AccountsPage";
import { CategoriesPage } from "./screens/CategoriesPage";
import { SettingsPage } from "./screens/SettingsPage";
import { BackupPage } from "./screens/BackupPage";

export function App() {
  const [user, setUser] = useState<{ id: string; username: string } | null | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    api()
      .users.current()
      .then((u) => setUser(u as { id: string; username: string } | null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const off = api().onNavigate((path) => navigate(path));
    return () => {
      off();
    };
  }, [navigate]);

  if (user === undefined) {
    return <div className="auth"><div className="muted">Загрузка…</div></div>;
  }

  if (!user) {
    return <AuthPage onLoggedIn={(u) => setUser(u)} />;
  }

  const logout = async () => {
    await api().users.logout();
    setUser(null);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Money Tracker</div>
        <nav className="nav">
          <NavLink to="/" end>
            Журнал
          </NavLink>
          <NavLink to="/charts">Графики</NavLink>
          <NavLink to="/plan">План</NavLink>
          <NavLink to="/accounts">Состояние счетов</NavLink>
          <NavLink to="/categories">Категории</NavLink>
          <NavLink to="/settings">Настройки</NavLink>
          <NavLink to="/backup">Бекап</NavLink>
        </nav>
        <div className="sidebar-foot">
          <div>{user.username}</div>
          <button className="btn ghost" type="button" onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<JournalPage />} />
          <Route path="/charts" element={<ChartsPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
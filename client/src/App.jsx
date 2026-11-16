import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { AddProjectPage } from './pages/AddProjectPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { UsersPage } from './pages/UsersPage';

function App() {
    const { user } = useAuth();

    if (user === undefined) return <PageLoader />;
    // Logged-out visitors see the login screen at whatever URL they opened,
    // and land on that page once they sign in.
    if (!user) return <LoginPage />;

    return (
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="projects/new" element={<AddProjectPage />} />
                <Route path="projects/:id" element={<ProjectDetailPage />} />
                <Route path="tasks/:id" element={<TaskDetailPage />} />
                {user.isSuper && <Route path="users" element={<UsersPage />} />}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}

export default App;

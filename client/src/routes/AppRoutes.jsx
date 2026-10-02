import { Navigate, Route, Routes } from 'react-router-dom';
import StatusMessage from '../components/common/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';
import EmployeeLayout from '../layouts/EmployeeLayout.jsx';
import ManagerLayout from '../layouts/ManagerLayout.jsx';
import AdminDashboard from '../pages/admin/AdminDashboard.jsx';
import EmployeesPage from '../pages/admin/EmployeesPage.jsx';
import LoginPage from '../pages/auth/LoginPage.jsx';
import DownloadPage from '../pages/download/DownloadPage.jsx';
import HomePage from '../pages/home/HomePage.jsx';
import EmployeeDashboard from '../pages/employee/EmployeeDashboard.jsx';
import MyActivityPage from '../pages/employee/MyActivityPage.jsx';
import MyScreenshotsPage from '../pages/employee/MyScreenshotsPage.jsx';
import MyTasksPage from '../pages/employee/MyTasksPage.jsx';
import DailyAnalysisPage from '../pages/manager/DailyAnalysisPage.jsx';
import ManagerDashboard from '../pages/manager/ManagerDashboard.jsx';
import ReportsPage from '../pages/manager/ReportsPage.jsx';
import TasksPage from '../pages/manager/TasksPage.jsx';
import TeamPage from '../pages/manager/TeamPage.jsx';
import { ROLE_HOME } from '../utils/constants.js';
import ProtectedRoute from './ProtectedRoute.jsx';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <StatusMessage loading />;
  return <Navigate to={user ? ROLE_HOME[user.role] : '/'} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/download" element={<DownloadPage />} />

      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="analysis" element={<DailyAnalysisPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['manager']} />}>
        <Route path="/manager" element={<ManagerLayout />}>
          <Route index element={<ManagerDashboard />} />
          <Route path="employees" element={<TeamPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="analysis" element={<DailyAnalysisPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['employee']} />}>
        <Route path="/employee" element={<EmployeeLayout />}>
          <Route index element={<EmployeeDashboard />} />
          <Route path="tasks" element={<MyTasksPage />} />
          <Route path="activity" element={<MyActivityPage />} />
          <Route path="analysis" element={<DailyAnalysisPage personal />} />
          <Route path="screenshots" element={<MyScreenshotsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

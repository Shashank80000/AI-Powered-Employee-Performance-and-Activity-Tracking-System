import { Navigate, Outlet, useLocation } from 'react-router-dom';
import StatusMessage from '../components/common/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from '../utils/constants.js';

/** Renders child routes only for signed-in users whose role is in `roles`. */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <StatusMessage loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <Outlet />;
}

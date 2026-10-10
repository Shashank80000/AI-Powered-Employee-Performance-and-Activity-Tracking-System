import { Navigate, Outlet, useLocation } from 'react-router-dom';
import StatusMessage from '../components/common/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from '../utils/constants.js';

/**
 * Renders child routes only for signed-in users whose role is in `roles`.
 * Someone still on a temporary password is kept on their account page until they choose their own.
 */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <StatusMessage loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  const accountPath = `${ROLE_HOME[user.role]}/account`;
  if (user.mustChangePassword && location.pathname !== accountPath) return <Navigate to={accountPath} replace />;
  return <Outlet />;
}
